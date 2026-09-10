"""Worker-local parser selection, settings and export validation (no ORM calls)."""

from __future__ import annotations

import json
import logging
import math
import os
from copy import deepcopy
from dataclasses import asdict, fields
from io import BytesIO, TextIOWrapper
from pathlib import Path
from typing import Any

from django.conf import settings
from plasmapdf.models.PdfDataLayer import build_translation_layer

from opencontractserver.document_imports.services import detect_mime_type
from opencontractserver.pipeline.base.base_component import PipelineComponentBase
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.settings_schema import (
    create_settings_instance,
    get_pipeline_setting,
    get_settings_schema,
)
from opencontractserver.pipeline.utils import get_component_by_name
from opencontractserver.utils.compact_pawls import expand_pawls_pages
from scripts.remote_ingest.checkpoints import implementation_digest

logger = logging.getLogger(__name__)

DOCLING = "opencontractserver.pipeline.parsers.docling_parser_rest.DoclingParser"
WARP = "opencontractserver.pipeline.parsers.warp_ingest_parser.WarpIngestParser"
DOCXODUS = "opencontractserver.pipeline.parsers.docxodus_parser.DocxodusServiceParser"
TXT = "opencontractserver.pipeline.parsers.oc_text_parser.TxtParser"
# Only adapters with an audited database-independent entry point are supported.
ENTRY_POINTS = {
    DOCLING: "parse_pdf_bytes",
    WARP: "parse_pdf_bytes",
    DOCXODUS: "parse_docx_bytes",
    TXT: "parse_text",
}
DEFAULT_EMBEDDER = "opencontractserver.pipeline.embedders.sent_transformer_microservice.MicroserviceEmbedder"


def canonical_mime(mime: str | None) -> str:
    file_type = FileTypeEnum.from_mimetype(
        (mime or "").split(";", 1)[0].strip().lower()
    )
    if file_type not in (FileTypeEnum.PDF, FileTypeEnum.TXT, FileTypeEnum.DOCX):
        raise ValueError(
            f"Unsupported source MIME type: {mime!r}; expected PDF, DOCX or TXT"
        )
    return file_type.mimetype


def local_settings(
    component: type[PipelineComponentBase], overrides: dict, environ=None
) -> dict:
    """Defaults < schema-declared environment < explicit JSON settings.

    Reuse component coercion, then validate *typed* values, including secrets.
    Diagnostics contain field names only, never values or validator exceptions.
    """
    environ = os.environ if environ is None else environ
    schema = get_settings_schema(component)
    if not isinstance(overrides, dict) or overrides.keys() - schema.keys():
        raise ValueError(
            f"{component.__name__}: settings must use declared schema fields"
        )
    values = {}
    for name, info in schema.items():
        value = deepcopy(info.get("default"))
        if info.get("env_var") and info["env_var"] in environ:
            value = environ[info["env_var"]]
        value = overrides.get(name, value)
        hint = info["python_type"]
        try:
            # Guard coercion failures before the shared coercer can log raw input.
            if hint == "bool" and not (
                isinstance(value, bool)
                or isinstance(value, str)
                and value.lower()
                in ("true", "false", "1", "0", "yes", "no", "on", "off")
                or type(value) in (int, float)
                and value in (0, 1)
            ):
                raise ValueError
            if hint in ("int", "float"):
                if value is None or isinstance(value, bool):
                    raise ValueError
                number = float(value)
                if not math.isfinite(number):
                    raise ValueError
                if hint == "int":
                    int(value)
            if hint.startswith("list") and not isinstance(value, list):
                raise ValueError
            if hint == "str" and not isinstance(value, str):
                raise ValueError
        except (TypeError, ValueError, OverflowError):
            raise ValueError(
                f"{component.__name__}.{name} ({info.get('env_var', 'JSON config')}): "
                f"expected {hint}"
            ) from None
        values[name] = value

    effective = asdict(create_settings_instance(component, values, strict=False))
    assert component.Settings is not None
    for field in fields(component.Settings):
        field_info = get_pipeline_setting(field)
        value = effective[field.name]
        if (
            field_info
            and field_info.required
            and (value is None or isinstance(value, str) and not value.strip())
        ):
            raise ValueError(
                f"{component.__name__}.{field.name} is required "
                f"(set {field_info.env_var or 'JSON config'})"
            )
        if field_info and field_info.validation and value is not None:
            try:
                valid = field_info.validation(value)
            except Exception:
                valid = False
            if not valid:
                raise ValueError(f"{component.__name__}.{field.name} failed validation")
    return effective


class LocalParsers:
    """Eagerly validate all selected parsers before any document is processed."""

    default_embedder_path = DEFAULT_EMBEDDER

    def __init__(self, config_path: str | None = None, *, identity: str | None = None):
        config: dict[str, Any] = {"parsers": {FileTypeEnum.PDF.mimetype: DOCLING}}
        if config_path:
            try:
                config = json.loads(Path(config_path).read_text())
            except (ValueError, OSError):
                raise ValueError(
                    "Cannot read parser config: expected a readable JSON file"
                ) from None
        if not isinstance(config, dict) or config.keys() - {
            "parsers",
            "settings",
            "identities",
        }:
            raise ValueError(
                "Parser config supports only 'parsers', 'settings' and 'identities' objects"
            )
        mapping = config.get("parsers")
        overrides = config.get("settings", {})
        identities = config.get("identities", {})
        if (
            not isinstance(mapping, dict)
            or not mapping
            or not isinstance(overrides, dict)
            or not isinstance(identities, dict)
            or any(not isinstance(v, str) or not v.strip() for v in identities.values())
        ):
            raise ValueError(
                "Parser config requires a non-empty MIME-to-parser 'parsers' object"
            )
        self.parsers: dict[str, tuple[PipelineComponentBase, str]] = {}
        self.identities = {}
        selected_paths = set()
        for mime, name in mapping.items():
            mime = canonical_mime(mime)
            if mime in self.parsers:
                raise ValueError(
                    f"Duplicate parser mapping for {mime} (including MIME aliases)"
                )
            if not isinstance(name, str):
                raise ValueError(
                    f"Parser for {mime} must be a component name or class path"
                )
            component = get_component_by_name(name)
            path = f"{component.__module__}.{component.__name__}"
            if FileTypeEnum.from_mimetype(mime) not in getattr(
                component, "supported_file_types", []
            ):
                raise ValueError(
                    f"{path} does not support {mime}; check supported_file_types"
                )
            if path not in ENTRY_POINTS:
                raise ValueError(f"{path} has no supported remote parse entry point")
            selected_paths.add(path)
            effective = local_settings(component, overrides.get(path, {}))
            positive = {
                "request_timeout",
                "max_file_size_mb",
                "max_pages_per_chunk",
                "min_pages_for_chunking",
                "max_concurrent_chunks",
            }
            for field_name in positive & effective.keys():
                if effective[field_name] <= 0:
                    raise ValueError(
                        f"{component.__name__}.{field_name} must be positive"
                    )
            if (
                path == DOCLING
                and not 0
                <= effective["chunk_overlap"]
                < effective["max_pages_per_chunk"]
            ):
                raise ValueError(
                    "DoclingParser.chunk_overlap must be nonnegative and smaller than max_pages_per_chunk"
                )
            if path == WARP:
                if not effective["api_key"].strip():
                    raise ValueError(
                        "WarpIngestParser.api_key is required (set WARP_INGEST_API_KEY)"
                    )
                if effective["apply_ocr"] and effective["disable_ocr"]:
                    raise ValueError(
                        "WarpIngestParser: apply_ocr and disable_ocr are mutually exclusive"
                    )
            parser = component(component_settings=effective)
            if path == TXT:
                # Resolve recipes now so unknown strategies/invalid kwargs fail at startup.
                from opencontractserver.pipeline.parsers.oc_text_parser import TxtParser

                assert isinstance(parser, TxtParser)
                parser._resolve_chunkers()
            self.parsers[mime] = (parser, ENTRY_POINTS[path])
            # Caller may use this in memory for #2318. Never log/persist secrets.
            self.identities[mime] = {
                "class_path": path,
                "settings": deepcopy(effective),
                "parser_name": parser.title,
                "parser_version": "1.0",
                "operator_identity": identities.get(path) or identity,
                "implementation": [
                    implementation_digest(component),
                    implementation_digest(normalize_and_validate_export),
                    implementation_digest(build_translation_layer),
                    implementation_digest(expand_pawls_pages),
                ],
            }
            logger.info("%s ready for %s", parser.title, mime)
        if (overrides.keys() | identities.keys()) - selected_paths:
            raise ValueError(
                "Settings/identities keys must be full class paths of selected parsers"
            )

    def identity(self, mime: str) -> dict:
        return deepcopy(self.identities[canonical_mime(mime)])

    def require_checkpoint_identities(self) -> None:
        for identity in self.identities.values():
            if identity["class_path"] != TXT and not identity["operator_identity"]:
                raise ValueError(
                    "Parser service revision is unknown: set --parser-identity "
                    "or per-parser 'identities' in the parser config"
                )

    def source_mime(self, source_bytes: bytes, *, filename: str) -> str:
        mime = canonical_mime(detect_mime_type(source_bytes, filename))
        if mime not in self.parsers:
            raise ValueError(
                f"No local parser selected for {mime}; add it to the parser config"
            )
        return mime

    def parse(self, source_bytes: bytes, *, filename: str) -> dict:
        mime = self.source_mime(source_bytes, filename=filename)
        parser, method = self.parsers[mime]
        kwargs = {}
        source: bytes | str = source_bytes
        if method == "parse_text":
            # Match text-mode storage reads, including universal newline handling.
            with TextIOWrapper(BytesIO(source_bytes), encoding="utf-8") as stream:
                source = stream.read()
        if self.identities[mime]["class_path"] != DOCLING:
            kwargs["title"] = filename
        export = getattr(parser, method)(source, **kwargs)
        if not isinstance(export, dict):
            raise ValueError(f"{parser.title} returned no export object")
        export["file_type"] = (
            mime  # source detection wins over short/omitted export types
        )
        pawls = expand_pawls_pages(export.get("pawls_file_content") or [])
        export["pawls_file_content"] = pawls
        if mime == FileTypeEnum.PDF.mimetype and pawls:
            export["content"] = build_translation_layer(pawls).doc_text
            export["page_count"] = len(pawls)
        normalize_and_validate_export(export)
        return export


def normalize_and_validate_export(export: dict) -> None:
    """Validate anchors and correlation IDs before embedding/upload; preserve IDs."""
    mime = canonical_mime(export.get("file_type"))
    fallback = settings.ANNOTATION_LABELS.get(mime, "SPAN_LABEL")
    content = export.get("content")
    if not isinstance(content, str) or not content.strip():
        raise ValueError("Parser output has empty or invalid content")
    if type(export.get("page_count")) is not int or export["page_count"] < 1:
        raise ValueError("Parser output needs a positive integer page_count")
    pages = export.get("pawls_file_content", [])
    annotations = export.get("labelled_text", [])
    relationships = export.get("relationships", [])
    if not all(isinstance(v, list) for v in (pages, annotations, relationships)):
        raise ValueError(
            "Parser output pages, annotations and relationships must be lists"
        )
    if mime == FileTypeEnum.PDF.mimetype and len(pages) != export["page_count"]:
        raise ValueError("PDF page_count does not match PAWLS pages")
    for i, page in enumerate(pages):
        if (
            not isinstance(page, dict)
            or not isinstance(page.get("page"), dict)
            or type(page["page"].get("index")) is not int
            or page["page"]["index"] < 0
            or not isinstance(page.get("tokens"), list)
        ):
            raise ValueError(f"Invalid PAWLS page {i}")

    ids = set()
    label_types: dict[str, str] = {}
    for i, ann in enumerate(annotations):
        if not isinstance(ann, dict):
            raise ValueError(f"annotation[{i}] must be an object")
        aid = ann.get("id")
        if type(aid) not in (str, int) or aid == "" or str(aid) in ids:
            raise ValueError(
                f"annotation[{i}] needs a unique string/integer id (including JSON keys)"
            )
        ids.add(str(aid))
        atype = ann.get("annotation_type") or fallback
        ann["annotation_type"] = atype
        label = ann.get("annotationLabel")
        if (
            not isinstance(label, str)
            or not label
            or not isinstance(ann.get("rawText"), str)
        ):
            raise ValueError(
                f"annotation[{i}] needs annotationLabel and rawText strings"
            )
        if (
            atype not in ("SPAN_LABEL", "TOKEN_LABEL")
            or mime != FileTypeEnum.PDF.mimetype
            and atype != "SPAN_LABEL"
        ):
            raise ValueError(
                f"annotation[{i}] has an incompatible annotation_type for {mime}"
            )
        if label in label_types and label_types[label] != atype:
            raise ValueError(f"annotation[{i}] reuses a label with a different type")
        label_types[label] = atype
        aj = ann.get("annotation_json")
        if not isinstance(aj, dict) or not aj:
            raise ValueError(f"annotation[{i}] needs non-empty annotation_json")
        if atype == "SPAN_LABEL":
            start, end = aj.get("start"), aj.get("end")
            if (
                type(start) is not int
                or type(end) is not int
                or not 0 <= start <= end <= len(content)
            ):
                raise ValueError(f"annotation[{i}] span is out of range")
            # Docxodus containers carry heading-only rawText; their normalized
            # span.text describes the whole covered section, including children.
            span_text = (
                aj.get("text", ann["rawText"])
                if mime == FileTypeEnum.DOCX.mimetype
                else ann["rawText"]
            )
            if content[start:end] != span_text:
                raise ValueError(
                    f"annotation[{i}] rawText does not match its content span"
                )
        else:
            for key, data in aj.items():
                try:
                    page_index = int(key)
                except (TypeError, ValueError):
                    raise ValueError(
                        f"annotation[{i}] has an invalid page key"
                    ) from None
                if not 0 <= page_index < len(pages) or not isinstance(data, dict):
                    raise ValueError(f"annotation[{i}] page is out of range")
                bounds = data.get("bounds")
                if not isinstance(bounds, dict) or not all(
                    k in bounds for k in ("top", "bottom", "left", "right")
                ):
                    raise ValueError(f"annotation[{i}] needs page bounds")
                refs = data.get("tokensJsons", [])
                if not isinstance(refs, list):
                    raise ValueError(f"annotation[{i}] tokensJsons must be a list")
                for ref in refs:
                    if (
                        not isinstance(ref, dict)
                        or ref.get("pageIndex") != page_index
                        or type(ref.get("tokenIndex")) is not int
                        or not 0 <= ref["tokenIndex"] < len(pages[page_index]["tokens"])
                    ):
                        raise ValueError(
                            f"annotation[{i}] has an invalid PAWLS token reference"
                        )

    def resolves(value):
        return type(value) in (str, int) and str(value) in ids

    for i, ann in enumerate(annotations):
        if ann.get("parent_id") is not None and not resolves(ann["parent_id"]):
            raise ValueError(f"annotation[{i}] parent_id does not resolve")
    for i, rel in enumerate(relationships):
        if not isinstance(rel, dict) or not rel.get("relationshipLabel"):
            raise ValueError(f"relationship[{i}] needs a relationshipLabel")
        if rel["relationshipLabel"] in label_types:
            raise ValueError(
                f"relationship[{i}] label conflicts with an annotation label"
            )
        for endpoint in ("source_annotation_ids", "target_annotation_ids"):
            refs = rel.get(endpoint)
            if (
                not isinstance(refs, list)
                or not refs
                or not all(resolves(ref) for ref in refs)
            ):
                raise ValueError(
                    f"relationship[{i}] {endpoint} must resolve to emitted annotations"
                )
