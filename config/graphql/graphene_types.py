import logging

import graphene
from django.contrib.auth import get_user_model

from graphene import relay
from graphene.types.generic import GenericScalar
from graphene_django import DjangoObjectType as ModelType
from graphene_django.filter import DjangoFilterConnectionField
from graphql_relay import from_global_id

from config.graphql.base import CountableConnection
from config.graphql.filters import AnnotationFilter, LabelFilter
from config.graphql.permission_annotator.mixins import AnnotatePermissionsForReadMixin
from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.users.models import Assignment, UserExport, UserImport

User = get_user_model()
logger = logging.getLogger(__name__)


class UserType(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = User
        interfaces = [relay.Node]
        connection_class = CountableConnection


class AssignmentType(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = Assignment
        interfaces = [relay.Node]
        connection_class = CountableConnection


class RelationshipType(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = Relationship
        interfaces = [relay.Node]
        connection_class = CountableConnection


class RelationInputType(AnnotatePermissionsForReadMixin, graphene.InputObjectType):
    id = graphene.String()
    source_ids = graphene.List(graphene.String)
    target_ids = graphene.List(graphene.String)
    relationship_label_id = graphene.String()
    corpus_id = graphene.String()
    document_id = graphene.String()


class AnnotationInputType(AnnotatePermissionsForReadMixin, graphene.InputObjectType):
    id = graphene.String(required=True)
    page = graphene.Int()
    raw_text = graphene.String()
    json = GenericScalar()
    annotation_label = graphene.String()
    is_public = graphene.Boolean()


class AnnotationType(AnnotatePermissionsForReadMixin, ModelType):

    json = GenericScalar()

    class Meta:
        model = Annotation
        interfaces = [relay.Node]
        connection_class = CountableConnection

        # In order for filter options to show up in nested resolvers, you need to specify them
        # in the Graphene type
        filterset_class = AnnotationFilter


class PdfPageInfoType(graphene.ObjectType):
    page_count = graphene.Int()
    current_page = graphene.Int()
    has_next_page = graphene.Boolean()
    has_previous_page = graphene.Boolean()
    corpus_id = graphene.ID()
    document_id = graphene.ID()
    for_analysis_ids = graphene.String()
    label_type = graphene.String()


class LabelTypeEnum(graphene.Enum):
    RELATIONSHIP_LABEL = "RELATIONSHIP_LABEL"
    DOC_TYPE_LABEL = "DOC_TYPE_LABEL"
    TOKEN_LABEL = "TOKEN_LABEL"
    METADATA_LABEL = "METADATA_LABEL"


class AnnotationSummaryType(graphene.ObjectType):
    id: graphene.String()
    label = graphene.String()
    type = LabelTypeEnum()
    raw_text = graphene.String()


class PageAwareAnnotationType(graphene.ObjectType):
    pdf_page_info = graphene.Field(PdfPageInfoType)
    page_annotations = graphene.List(AnnotationType)


class AnnotationLabelType(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = AnnotationLabel
        interfaces = [relay.Node]
        connection_class = CountableConnection


class LabelSetType(AnnotatePermissionsForReadMixin, ModelType):

    annotation_labels = DjangoFilterConnectionField(
        AnnotationLabelType, filterset_class=LabelFilter
    )

    # To get ALL labels for a given labelset
    all_annotation_labels = graphene.Field(graphene.List(AnnotationLabelType))

    def resolve_all_annotation_labels(self, info):
        return self.annotation_labels.all()

    # Custom resolver for icon field
    def resolve_icon(self, info):
        return "" if not self.icon else info.context.build_absolute_uri(self.icon.url)

    class Meta:
        model = LabelSet
        interfaces = [relay.Node]
        connection_class = CountableConnection


class DocumentType(AnnotatePermissionsForReadMixin, ModelType):
    def resolve_pdf_file(self, info):
        return (
            ""
            if not self.pdf_file
            else info.context.build_absolute_uri(self.pdf_file.url)
        )

    def resolve_icon(self, info):
        return "" if not self.icon else info.context.build_absolute_uri(self.icon.url)

    def resolve_txt_extract_file(self, info):
        return (
            ""
            if not self.txt_extract_file
            else info.context.build_absolute_uri(self.txt_extract_file.url)
        )

    def resolve_pawls_parse_file(self, info):
        return (
            ""
            if not self.pawls_parse_file
            else info.context.build_absolute_uri(self.pawls_parse_file.url)
        )

    class Meta:
        model = Document
        interfaces = [relay.Node]
        connection_class = CountableConnection


class CorpusType(AnnotatePermissionsForReadMixin, ModelType):

    all_annotation_summaries = graphene.List(
        AnnotationType,
        analysis_id=graphene.ID(),
        label_types=graphene.List(LabelTypeEnum),
    )

    def resolve_all_annotation_summaries(self, info, **kwargs):

        analysis_id = kwargs.get("analysis_id", None)
        label_types = kwargs.get("label_types", None)

        annotation_set = self.annotations.all()

        if label_types and isinstance(label_types, list):
            logger.info(f"Filter to label_types: {label_types}")
            annotation_set = annotation_set.filter(
                annotation_label__label_type__in=[
                    label_type.value for label_type in label_types
                ]
            )

        if analysis_id:
            try:
                analysis_pk = from_global_id(analysis_id)[1]
                annotation_set = annotation_set.filter(analysis_id=analysis_pk)
            except Exception as e:
                logger.warning(
                    f"Failed resolving analysis pk for corpus {self.id} with input graphene id"
                    f" {analysis_id}: {e}"
                )

        return annotation_set

    applied_analyzer_ids = graphene.List(graphene.String)

    def resolve_applied_analyzer_ids(self, info):
        return list(
            self.analyses.all().values_list("analyzer_id", flat=True).distinct()
        )

    def resolve_icon(self, info):
        return "" if not self.icon else info.context.build_absolute_uri(self.icon.url)

    class Meta:
        model = Corpus
        interfaces = [relay.Node]
        connection_class = CountableConnection


class UserImportType(AnnotatePermissionsForReadMixin, ModelType):
    def resolve_zip(self, info):
        return "" if not self.file else info.context.build_absolute_uri(self.zip.url)

    class Meta:
        model = UserImport
        interfaces = [relay.Node]
        connection_class = CountableConnection


class UserExportType(AnnotatePermissionsForReadMixin, ModelType):
    def resolve_file(self, info):
        return "" if not self.file else info.context.build_absolute_uri(self.file.url)

    class Meta:
        model = UserExport
        interfaces = [relay.Node]
        connection_class = CountableConnection


class AnalyzerType(AnnotatePermissionsForReadMixin, ModelType):

    analyzer_id = graphene.String()

    def resolve_analyzer_id(self, info):
        return self.id.__str__()

    manifest = GenericScalar()

    full_label_list = graphene.List(AnnotationLabelType)

    def resolve_full_label_list(self, info):
        return self.annotationlabel_set.all()

    def resolve_icon(self, info):
        return "" if not self.icon else info.context.build_absolute_uri(self.icon.url)

    class Meta:
        model = Analyzer
        interfaces = [relay.Node]
        connection_class = CountableConnection


class GremlinEngineType_READ(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = GremlinEngine
        exclude = ("api_key",)
        interfaces = [relay.Node]
        connection_class = CountableConnection


class GremlinEngineType_WRITE(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = GremlinEngine
        interfaces = [relay.Node]
        connection_class = CountableConnection


class AnalysisType(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = Analysis
        interfaces = [relay.Node]
        connection_class = CountableConnection
