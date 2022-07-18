from __future__ import annotations

import enum
import typing
from typing import TypedDict


class LabelType(str, enum.Enum):
    DOC_TYPE_LABEL: DOC_TYPE_LABEL
    TOKEN_LABEL: TOKEN_LABEL
    RELATIONSHIP_LABEL: RELATIONSHIP_LABEL


class AnnotationLabelPythonType(TypedDict):
    id: str
    color: str
    description: str
    icon: str
    text: str
    label_type: typing.Literal["DOC_TYPE_LABEL", "TOKEN_LABEL", "RELATIONSHIP_LABEL"]


class LabelLookupPythonType(TypedDict):
    """
    We need to inject these objs into our pipeline so tha tasks can
    look up text or doc label pks by their *name* without needing to
    hit the database across some unknown number N tasks later in the
    pipeline. We preload the lookups as this lets us look them up only
    once with only a very small memory cost.
    """

    text_labels: dict[str | int, AnnotationLabelPythonType]
    doc_labels: dict[str | int, AnnotationLabelPythonType]


class PawlsPageBoundaryPythonType(TypedDict):
    """
    This is what a PAWLS Page Boundary obj looks like
    """

    width: float
    height: float
    index: int


class PawlsTokenPythonType(TypedDict):
    """
    This is what an actual PAWLS token looks like.
    """

    x: float
    y: float
    width: float
    height: float
    text: str


class PawlsPagePythonType(TypedDict):
    """
    Pawls files are comprised of lists of jsons that correspond to the
    necessary tokens and page information for a given page. This describes
    the data shape for each of those page objs.
    """

    page: PawlsPageBoundaryPythonType
    tokens: list[PawlsTokenPythonType]


class BoundingBoxPythonType(TypedDict):
    """
    Bounding box for pdf box on a pdf page
    """

    top: int
    bottom: int
    left: int
    right: int


class TokenIdPythonType(TypedDict):
    """
    These are how tokens are referenced in annotation jsons.
    """

    pageIndex: int
    tokenIndex: int


class OpenContractsSinglePageAnnotationType(TypedDict):
    """
    This is the data shapee for our actual annotations on a given page of a pdf.
    In practice, annotations are always assumed to be multi-page, and this means
    our annotation jsons are stored as a dict map of page #s to the annotation data:

    Dict[int, OpenContractsSinglePageAnnotationType]

    """

    bounds: BoundingBoxPythonType
    tokensJsons: list[TokenIdPythonType]
    rawText: str


class OpenContractsAnnotationPythonType(TypedDict):
    """
    Data type for individual Open Contract annotation data type converted
    into JSON. Note the models have a number of additional fields that are not
    relevant for import/export purposes.
    """

    id: str | None
    annotationLabel: str
    rawText: str
    page: int
    json: dict[int, OpenContractsSinglePageAnnotationType]


class OpenContractDocAnnotationExport(TypedDict):
    """
    Eech individual documents annotations are exported and imported into
    and out of jsons with this form
    """

    # Can have multiple doc labels. Want array of doc label ids, which will be
    # mapped to proper objects after import.
    doc_labels: list[str]

    # The annotations are stored in a list of JSONS matching OpenContractsAnnotationPythonType
    labelled_text: list[OpenContractsAnnotationPythonType]

    # Document title
    title: str

    # Document text
    content: str

    # Documents PAWLS parse file contents (serialized)
    pawls_file_content: list[PawlsPagePythonType]


class OpenContractCorpusType(TypedDict):
    id: int
    title: str
    description: str
    icon_data: str
    icon_name: str
    label_set: str
    creator: str


class OpenContractsLabelSetType(TypedDict):
    id: int
    title: str
    description: str
    icon_data: str
    icon_name: str
    creator: str


class OpenContractsExportDataJsonPythonType(TypedDict):
    """
    This is the type of the data.json that goes into our export zips and
    carries the annotations and annotation information
    """

    # Lookup of pdf filename to the corresponding Annotation data
    annotated_docs: dict[str, OpenContractDocAnnotationExport]

    # Requisite labels, mapped from label name to label data
    doc_labels: dict[str, AnnotationLabelPythonType]

    # Requisite text labels, mapped from label name to label data
    text_labels: dict[str, AnnotationLabelPythonType]

    # Stores the corpus (todo - make sure the icon gets stored as base64)
    corpus: OpenContractCorpusType

    # Stores the label set (todo - make sure the icon gets stored as base64)
    label_set: OpenContractsLabelSetType
