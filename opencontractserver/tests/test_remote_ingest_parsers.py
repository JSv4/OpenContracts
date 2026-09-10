"""Remote parsing parity and wire contracts; all these tests forbid database access."""

import json
import os
from copy import deepcopy
from dataclasses import dataclass, field
from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from plasmapdf.models.PdfDataLayer import build_translation_layer
from pypdf import PdfWriter

from opencontractserver.pipeline.base.base_component import PipelineComponentBase
from opencontractserver.pipeline.base.file_types import FileTypeEnum
from opencontractserver.pipeline.base.settings_schema import (
    PipelineSetting,
    SettingType,
)
from opencontractserver.pipeline.utils import get_component_by_name
from opencontractserver.tests.test_doc_parser_docxodus import make_minimal_docx
from opencontractserver.tests.test_doc_parser_warp_ingest import _sample_export
from scripts.remote_ingest import oc_remote_ingest as cli
from scripts.remote_ingest.parsers import (
    DOCLING,
    DOCXODUS,
    TXT,
    WARP,
    LocalParsers,
    canonical_mime,
    local_settings,
    normalize_and_validate_export,
)

PDF = FileTypeEnum.PDF.mimetype
DOCX = FileTypeEnum.DOCX.mimetype
TEXT = FileTypeEnum.TXT.mimetype


def worker_config(**overrides) -> cli.Config:
    values: dict[str, Any] = dict(
        target_url="https://target",
        worker_token="secret",
        corpus_id=None,
        root_dir="/tmp",
        ledger_path="/tmp/ledger",
        extensions=(".pdf",),
        max_workers=1,
        max_attempts=1,
        queue_high=0,
        queue_low=0,
        embeddings=False,
        target_folder_from_tree=True,
        verify_tls=True,
        limit=0,
        enrichers=[],
    )
    values.update(overrides)
    return cli.Config(**values)


def span_export():
    return {
        "content": "Heading\nBody paragraph.",
        "page_count": 1,
        "pawls_file_content": [],
        "file_type": DOCX,
        "labelled_text": [
            {
                "id": "heading",
                "annotationLabel": "Heading",
                "rawText": "Heading",
                "annotation_json": {"start": 0, "end": 7},
                "structural": True,
            },
            {
                "id": "body",
                "parent_id": "heading",
                "annotationLabel": "Paragraph",
                "rawText": "Body paragraph.",
                "annotation_json": {"start": 8, "end": 23},
                "structural": True,
            },
        ],
        "relationships": [
            {
                "relationshipLabel": "contains",
                "source_annotation_ids": ["heading"],
                "target_annotation_ids": ["body"],
            }
        ],
    }


def pdf_bytes():
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    stream = BytesIO()
    writer.write(stream)
    return stream.getvalue()


class RemoteParserTests(SimpleTestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.config_path = Path(self.tmp.name) / "parsers.json"
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.db_settings = patch(
            "opencontractserver.documents.models.PipelineSettings.get_instance"
        )
        self.get_settings = self.db_settings.start()
        self.addCleanup(self.db_settings.stop)

    def tearDown(self):
        # Merely catching an ORM failure and falling back is not database independence.
        self.get_settings.assert_not_called()

    def router(self, mapping, settings=None):
        self.config_path.write_text(
            json.dumps({"parsers": mapping, "settings": settings or {}})
        )
        return LocalParsers(str(self.config_path))

    def test_canonical_mimes(self):
        for raw, expected in [
            (PDF, PDF),
            (DOCX, DOCX),
            (TEXT, TEXT),
            ("application/txt", TEXT),
            ("TEXT/PLAIN; charset=utf-8", TEXT),
        ]:
            self.assertEqual(canonical_mime(raw), expected)
        for unsupported in [None, "pdf", "application/zip", "text/markdown"]:
            with self.assertRaisesRegex(ValueError, "Unsupported source MIME"):
                canonical_mime(unsupported)

    def test_routing_errors_fail_at_startup(self):
        cases = [
            ({PDF: "missing_parser"}, "not found"),
            ({PDF: TXT}, "does not support"),
            ({PDF: DOCLING}, "service_url is required"),
            ({PDF: WARP}, "api_key is required"),
            ({TEXT: TXT, "application/txt": TXT}, "Duplicate parser mapping"),
        ]
        for mapping, message in cases:
            with self.subTest(mapping=mapping), self.assertRaisesRegex(
                ValueError, message
            ):
                self.router(mapping)

    def test_settings_coercion_precedence_and_snapshot(self):
        with patch.dict(
            os.environ,
            {
                "WARP_INGEST_API_KEY": "private-key",
                "WARP_INGEST_PARSER_TIMEOUT": "70",
                "WARP_INGEST_DISABLE_OCR": "yes",
            },
        ):
            router = self.router({PDF: WARP}, {WARP: {"request_timeout": "90"}})
        identity = router.identity(PDF)
        self.assertEqual(identity["settings"]["request_timeout"], 90)
        self.assertIs(identity["settings"]["disable_ocr"], True)
        self.assertEqual(identity["parser_name"], "Warp-Ingest Parser (REST)")
        self.assertEqual(identity["parser_version"], "1.0")
        identity["settings"]["api_key"] = "changed"
        self.assertEqual(router.identity(PDF)["settings"]["api_key"], "private-key")
        parser, _ = router.parsers[PDF]
        parser.reload_settings()
        self.assertEqual(parser.settings.api_key, "private-key")

    def test_checkpoint_service_identities_and_effective_fingerprints(self):
        from scripts.remote_ingest.checkpoints import fingerprint

        router = self.router({PDF: WARP}, {WARP: {"api_key": "private-key"}})
        with self.assertRaisesRegex(ValueError, "Parser service revision is unknown"):
            router.require_checkpoint_identities()
        self.config_path.write_text(
            json.dumps(
                {
                    "parsers": {PDF: WARP},
                    "settings": {
                        WARP: {"api_key": "private-key", "request_timeout": "90"}
                    },
                    "identities": {WARP: "warp-model-v1"},
                }
            )
        )
        router = LocalParsers(str(self.config_path), identity="deployment-fallback")
        router.require_checkpoint_identities()
        first = router.identity(PDF)
        self.assertEqual(first["operator_identity"], "warp-model-v1")
        self.assertTrue(first["implementation"])
        self.assertNotIn("private-key", fingerprint(first))
        config = json.loads(self.config_path.read_text())
        config["settings"][WARP]["request_timeout"] = 90
        self.config_path.write_text(json.dumps(config))
        self.assertEqual(first, LocalParsers(str(self.config_path)).identity(PDF))
        config["identities"][WARP] = "warp-model-v2"
        self.config_path.write_text(json.dumps(config))
        self.assertNotEqual(
            fingerprint(first),
            fingerprint(LocalParsers(str(self.config_path)).identity(PDF)),
        )
        self.router(
            {TEXT: TXT}, {TXT: {"chunkers": ["paragraph"]}}
        ).require_checkpoint_identities()

    def test_invalid_settings_do_not_echo_values(self):
        for setting, value in [
            ("request_timeout", "secret-value"),
            ("disable_ocr", "secret-value"),
            ("request_timeout", -1),
        ]:
            with self.subTest(setting=setting), self.assertRaises(ValueError) as caught:
                self.router(
                    {PDF: WARP}, {WARP: {"api_key": "private-key", setting: value}}
                )
            self.assertNotIn("secret-value", str(caught.exception))
            self.assertNotIn("private-key", str(caught.exception))
        with self.assertRaisesRegex(ValueError, "declared schema"):
            self.router({TEXT: TXT}, {TXT: {"typo": "secret-value"}})
        with self.assertRaisesRegex(ValueError, "mutually exclusive"):
            self.router(
                {PDF: WARP},
                {
                    WARP: {
                        "api_key": "private-key",
                        "apply_ocr": True,
                        "disable_ocr": True,
                    }
                },
            )
        with self.assertRaisesRegex(ValueError, "chunkers"):
            self.router({TEXT: TXT}, {TXT: {"chunkers": "paragraph"}})

    def test_secret_and_custom_validation_after_coercion(self):
        @dataclass
        class Settings:
            credential: str = field(
                default="",
                metadata={
                    "pipeline_setting": PipelineSetting(
                        setting_type=SettingType.SECRET, required=True
                    )
                },
            )
            count: int = field(
                default=1,
                metadata={
                    "pipeline_setting": PipelineSetting(
                        setting_type=SettingType.OPTIONAL,
                        validation=lambda value: value > 0,
                    )
                },
            )

        component = type(
            "LocalComponent", (PipelineComponentBase,), {"Settings": Settings}
        )
        with self.assertRaisesRegex(ValueError, "credential is required"):
            local_settings(component, {})
        self.assertEqual(
            local_settings(component, {"credential": "secret", "count": "2"})["count"],
            2,
        )
        with self.assertRaisesRegex(ValueError, "count failed validation"):
            local_settings(component, {"credential": "secret", "count": "-2"})

    def test_txt_server_and_remote_share_offsets_and_ids(self):
        text = "Heading\n\nBody paragraph with café.\n\nFinal paragraph."
        router = self.router(
            {"application/txt": TXT},
            {
                TXT: {
                    "chunkers": [
                        "paragraph",
                        {"name": "sliding_window", "window_size": 35, "overlap": 5},
                    ]
                }
            },
        )
        parser, _ = router.parsers[TEXT]
        doc = SimpleNamespace(
            title="source.txt",
            description="",
            txt_extract_file=SimpleNamespace(name="source.txt"),
        )
        with patch(
            "opencontractserver.pipeline.parsers.oc_text_parser.Document.objects.get",
            return_value=doc,
        ), patch(
            "opencontractserver.pipeline.parsers.oc_text_parser.default_storage.open",
            return_value=StringIO(text),
        ):
            server = parser.parse_document(1, 2)
        with patch(
            "opencontractserver.documents.models.Document.objects.get",
            side_effect=AssertionError("ORM read"),
        ):
            remote = router.parse(text.encode(), filename="misleading.pdf")
        for key in ("content", "pawls_file_content", "page_count", "labelled_text"):
            self.assertEqual(remote[key], server[key])
        self.assertEqual(remote["file_type"], TEXT)
        self.assertEqual(
            len({ann["id"] for ann in remote["labelled_text"]}),
            len(remote["labelled_text"]),
        )
        for ann in remote["labelled_text"]:
            span = ann["annotation_json"]
            self.assertEqual(text[span["start"] : span["end"]], ann["rawText"])
            self.assertEqual(ann["annotation_type"], "SPAN_LABEL")

    def test_docx_server_and_remote_share_normalization_and_links(self):
        router = self.router({DOCX: DOCXODUS})
        parser, _ = router.parsers[DOCX]
        payload = span_export()
        payload["labelledText"] = payload.pop("labelled_text")
        for ann in payload["labelledText"]:
            ann["annotationJson"] = ann.pop("annotation_json")
            ann["annotationType"] = "UnrecognizedDocxodusType"
            if "parent_id" in ann:
                ann["parentId"] = ann.pop("parent_id")
        source = make_minimal_docx()
        doc = SimpleNamespace(
            title="source.docx", pdf_file=SimpleNamespace(name="source.docx")
        )
        with patch(
            "requests.post", return_value=Mock(json=lambda: deepcopy(payload))
        ) as post:
            with patch(
                "opencontractserver.documents.models.Document.objects.get",
                return_value=doc,
            ), patch(
                "opencontractserver.pipeline.parsers.docxodus_parser.default_storage.open",
                return_value=BytesIO(source),
            ):
                server = parser.parse_document(1, 2)
            with patch(
                "opencontractserver.documents.models.Document.objects.get",
                side_effect=AssertionError("ORM read"),
            ):
                remote = router.parse(source, filename="source.docx")
            self.assertEqual(post.call_args.kwargs["json"]["filename"], doc.title)
        # Worker envelope canonicalizes MIME and materializes the same fallback
        # that BaseParser.save_parsed_data applies to the server export.
        normalize_and_validate_export(server)
        for key in (
            "content",
            "pawls_file_content",
            "page_count",
            "labelled_text",
            "relationships",
        ):
            self.assertEqual(remote[key], server[key])

    def test_pdf_server_bytes_and_remote_parity(self):
        source = pdf_bytes()
        for path in (DOCLING, WARP):
            with self.subTest(parser=path):
                overrides: dict[str, Any] = {"service_url": "http://parser/parse"}
                if path == DOCLING:
                    overrides["extract_images"] = False
                    overrides["max_chord_tasks"] = (
                        0  # Valid: disable server chord fan-out.
                    )
                else:
                    overrides["api_key"] = "private-key"
                router = self.router({PDF: path}, {path: overrides})
                parser, _ = router.parsers[PDF]
                payload = _sample_export()
                body = {"result": payload} if path == WARP else payload
                module = get_component_by_name(path).__module__
                storage_module = (
                    module
                    if path == WARP
                    else "opencontractserver.pipeline.base.chunked_parser"
                )
                doc = SimpleNamespace(
                    title="source.pdf", pdf_file=SimpleNamespace(name="source.pdf")
                )
                with patch(
                    "requests.post", return_value=Mock(json=lambda: deepcopy(body))
                ):
                    with patch(
                        "opencontractserver.documents.models.Document.objects.get",
                        return_value=doc,
                    ), patch(
                        storage_module + ".default_storage.open",
                        return_value=BytesIO(source),
                    ), patch(
                        storage_module + ".default_storage.size",
                        return_value=len(source),
                    ):
                        server = parser.parse_document(1, 2)
                    with patch(
                        "opencontractserver.documents.models.Document.objects.get",
                        side_effect=AssertionError("ORM read"),
                    ):
                        raw = parser.parse_pdf_bytes(source)
                        remote = router.parse(source, filename="misleading.txt")
                for key in (
                    "content",
                    "pawls_file_content",
                    "page_count",
                    "labelled_text",
                    "relationships",
                ):
                    self.assertEqual(server[key], raw[key])
                self.assertEqual(
                    remote["content"],
                    build_translation_layer(server["pawls_file_content"]).doc_text,
                )
                for key in (
                    "pawls_file_content",
                    "page_count",
                    "labelled_text",
                    "relationships",
                ):
                    self.assertEqual(remote[key], server[key])
                self.assertEqual(remote["file_type"], PDF)

    def test_unsupported_or_unmapped_input(self):
        router = self.router({TEXT: TXT}, {TXT: {"chunkers": ["paragraph"]}})
        for source, name, error in [
            (b"\x89PNG\r\n\x1a\n" + bytes(100), "fake.txt", "Unsupported"),
            (pdf_bytes(), "fake.txt", "No local parser"),
            (b"# Markdown", "file.md", "Unsupported"),
        ]:
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, error):
                router.parse(source, filename=name)

    def test_prepare_and_multipart_use_source_mime_and_selected_provenance(self):
        router = self.router({TEXT: TXT}, {TXT: {"chunkers": ["paragraph"]}})
        source = Path(self.tmp.name) / "source.pdf"
        source.write_text("Plain text paragraph.")
        cfg = worker_config(
            embeddings=False,
            ledger_path=str(Path(self.tmp.name) / "ledger.sqlite3"),
            target_folder_from_tree=True,
            target_url="https://target",
            worker_token="secret",
            verify_tls=True,
        )
        client = cli.TargetClient(cfg)
        captured = []

        def post(url, *, files, data, **kwargs):
            captured.append(
                (
                    files["file"][2],
                    files["file"][1].read(),
                    json.loads(data["metadata"]),
                )
            )
            return Mock(status_code=202, json=lambda: {"upload_id": "receipt"})

        cli.Ledger(cfg.ledger_path).upsert_doc(
            "folder/source.pdf",
            str(source),
            source.stat().st_size,
            cli._sha256(str(source)),
            1,
        )
        with patch.object(client.session, "post", side_effect=post):
            result = cli._process_one(
                cfg,
                router,
                None,
                client,
                {"rel_path": "folder/source.pdf", "abs_path": str(source)},
            )
        self.assertTrue(result[1], result[2])
        mime, uploaded, metadata = captured[0]
        self.assertEqual(mime, TEXT)
        self.assertEqual(uploaded, source.read_bytes())
        self.assertEqual(metadata["file_type"], TEXT)
        self.assertEqual(metadata["parser_name"], "Text Parser")
        self.assertEqual(metadata["parser_version"], "1.0")
        self.assertEqual(metadata["target_folder_path"], "folder")
        self.assertTrue(
            all(
                label["label_type"] == "SPAN_LABEL"
                for label in metadata["text_labels"].values()
            )
        )

    def test_metadata_mime_fallback_and_multipart_for_each_parser(self):
        cfg = worker_config(
            target_url="https://target", worker_token="secret", verify_tls=True
        )
        source = Path(self.tmp.name) / "source"
        source.write_bytes(b"source bytes")
        for mime, name in [
            (PDF, "Docling Parser (REST)"),
            (PDF, "Warp-Ingest Parser (REST)"),
            (DOCX, "Docxodus Parser (REST)"),
            (TEXT, "Text Parser"),
        ]:
            with self.subTest(mime=mime, name=name):
                export = _sample_export() if mime == PDF else span_export()
                export["file_type"] = mime
                metadata = cli._build_metadata(
                    title="source",
                    export=export,
                    content=export["content"],
                    embedder_path="unused",
                    embeddings=None,
                    target_folder_path=None,
                    parser_name=name,
                )
                self.assertEqual(metadata["file_type"], mime)
                self.assertEqual(metadata["parser_name"], name)
                fallback = "TOKEN_LABEL" if mime == PDF else "SPAN_LABEL"
                for ann in export["labelled_text"]:
                    self.assertEqual(
                        metadata["text_labels"][ann["annotationLabel"]]["label_type"],
                        fallback,
                    )
                client = cli.TargetClient(cfg)
                with patch.object(
                    client.session,
                    "post",
                    return_value=Mock(
                        status_code=202, json=lambda: {"upload_id": "receipt"}
                    ),
                ) as post:
                    client.upload(source.read_bytes(), metadata, filename=source.name)
                self.assertEqual(post.call_args.kwargs["files"]["file"][2], mime)

    def test_malformed_export_never_reaches_embedder_or_upload(self):
        export = span_export()
        export["labelled_text"][1]["parent_id"] = "missing"
        source = Path(self.tmp.name) / "source.docx"
        source.write_bytes(make_minimal_docx())
        parser = Mock(
            parse=Mock(return_value=export),
            source_mime=Mock(return_value=DOCX),
            identity=Mock(return_value={"class_path": DOCXODUS}),
        )
        embedder, client = Mock(), Mock()
        cfg = worker_config(
            embeddings=True, ledger_path=str(Path(self.tmp.name) / "ledger.sqlite3")
        )
        cli.Ledger(cfg.ledger_path).upsert_doc(
            source.name, str(source), source.stat().st_size, cli._sha256(str(source)), 1
        )
        result = cli._process_one(
            cfg,
            parser,
            embedder,
            client,
            {"rel_path": source.name, "abs_path": str(source)},
        )
        self.assertFalse(result[1])
        self.assertIn("parent_id", result[2])
        embedder.embed_text.assert_not_called()
        client.upload.assert_not_called()

    def test_config_errors_redact_json_and_secret_values_from_logs(self):
        self.config_path.write_text('{"credential": "secret-value", invalid')
        with self.assertRaisesRegex(ValueError, "readable JSON") as caught:
            LocalParsers(str(self.config_path))
        self.assertNotIn("secret-value", str(caught.exception))
        with self.assertLogs(level="INFO") as logs:
            self.router({PDF: WARP}, {WARP: {"api_key": "secret-value"}})
        self.assertNotIn("secret-value", "\n".join(logs.output))


class ExportValidationTests(SimpleTestCase):
    def test_span_defaults_and_links_preserved(self):
        export = span_export()
        normalize_and_validate_export(export)
        self.assertEqual(export["labelled_text"][1]["parent_id"], "heading")
        self.assertTrue(
            all(a["annotation_type"] == "SPAN_LABEL" for a in export["labelled_text"])
        )

    def test_enrichment_preserves_zero_id_and_its_relationship(self):
        from scripts.remote_ingest.enrichers import (
            Enrichment,
            apply_enrichment,
            label_def,
            validate_enrichment,
        )

        export = span_export()
        enrichment = Enrichment(
            annotations=[
                {
                    "id": 0,
                    "annotationLabel": "Extra",
                    "rawText": "Heading",
                    "annotation_type": "SPAN_LABEL",
                    "annotation_json": {"start": 0, "end": 7},
                }
            ],
            annotation_labels={"Extra": label_def("Extra", "SPAN_LABEL")},
            relationships=[
                {
                    "relationshipLabel": "contains",
                    "source_annotation_ids": [0],
                    "target_annotation_ids": ["body"],
                }
            ],
        )
        self.assertEqual(validate_enrichment(export, enrichment), [])
        apply_enrichment(export, enrichment)
        self.assertEqual(export["labelled_text"][-1]["id"], 0)
        normalize_and_validate_export(export)

    def test_malformed_spans_and_ids_rejected(self):
        cases = [
            lambda e: e["labelled_text"][0]["annotation_json"].update(start=-1),
            lambda e: e["labelled_text"][0]["annotation_json"].update(end=100),
            lambda e: e["labelled_text"][0].update(rawText="wrong"),
            lambda e: e["labelled_text"][0].update(id=None),
            lambda e: e["labelled_text"][1].update(id="heading"),
            lambda e: e["labelled_text"][1].update(parent_id="missing"),
            lambda e: e["relationships"][0].update(target_annotation_ids=["missing"]),
            lambda e: e["labelled_text"][0].update(annotation_type="TOKEN_LABEL"),
        ]
        for mutate in cases:
            export = span_export()
            mutate(export)
            with self.assertRaises(ValueError):
                normalize_and_validate_export(export)
        export = span_export()
        export["labelled_text"][0]["id"] = 1
        export["labelled_text"][1]["id"] = "1"
        with self.assertRaisesRegex(ValueError, "unique"):
            normalize_and_validate_export(export)

    def test_docling_one_based_page_metadata_keeps_zero_based_token_refs(self):
        export = _sample_export()
        export["pawls_file_content"][0]["page"]["index"] = 1
        normalize_and_validate_export(export)
        self.assertEqual(export["pawls_file_content"][0]["page"]["index"], 1)
        self.assertEqual(
            export["labelled_text"][0]["annotation_json"]["0"]["tokensJsons"][0][
                "pageIndex"
            ],
            0,
        )

    def test_docx_container_span_text_is_exact_without_changing_heading_text(self):
        from opencontractserver.pipeline.parsers.docxodus_parser import (
            DocxodusServiceParser,
        )

        export = span_export()
        export["labelled_text"][0]["rawText"] = ""
        export["labelled_text"][0]["annotation_json"] = {
            "start": 0,
            "end": len(export["content"]),
            "text": "",
        }
        normalized = DocxodusServiceParser._normalize_response(export)
        normalize_and_validate_export(normalized)
        parent = normalized["labelled_text"][0]
        self.assertEqual(parent["rawText"], "")
        self.assertEqual(parent["annotation_json"]["text"], export["content"])
        self.assertEqual(normalized["labelled_text"][1]["parent_id"], parent["id"])

    def test_bad_token_references_rejected(self):
        for reference in [
            {"pageIndex": 1, "tokenIndex": 0},
            {"pageIndex": 0, "tokenIndex": 9},
            {"pageIndex": 0, "tokenIndex": -1},
        ]:
            export = _sample_export()
            export["labelled_text"][0]["annotation_json"]["0"]["tokensJsons"] = [
                reference
            ]
            with self.assertRaisesRegex(ValueError, "token reference"):
                normalize_and_validate_export(export)
