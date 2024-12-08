import logging
import json
import graphene.types.json
from graphql_relay import from_global_id, to_global_id

import graphene
from django.contrib.auth import get_user_model
from django.db.models import QuerySet
from graphene import relay
from graphene.types.generic import GenericScalar
from graphene_django import DjangoObjectType
from graphene_django.filter import DjangoFilterConnectionField
from graphql_relay import from_global_id

from config.graphql.base import CountableConnection
from config.graphql.filters import AnnotationFilter, LabelFilter
from config.graphql.permissioning.permission_annotator.mixins import (
    AnnotatePermissionsForReadMixin,
)
from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus, CorpusAction, CorpusQuery
from opencontractserver.documents.models import Document, DocumentAnalysisRow
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.feedback.models import UserFeedback
from opencontractserver.users.models import Assignment, UserExport, UserImport

User = get_user_model()
logger = logging.getLogger(__name__)


def build_tree(nodes: list, parent_id: int = None) -> list:
    """
    Builds a nested tree representation from a list of annotation nodes.

    Args:
        nodes (list): List of annotation dictionaries with keys 'id', 'parent_id', and 'raw_text'.
        parent_id (int, optional): The parent ID to build the tree from.

    Returns:
        list: A list of dictionaries representing the tree structure.
    """
    tree = []
    for node in nodes:
        node_parent_id = node['parent_id']
        if node_parent_id == parent_id:
            # Convert IDs to global IDs
            node_id_global = to_global_id('AnnotationType', node['id'])
            # Recursively build the tree
            children = build_tree(nodes, parent_id=node['id'])
            node_dict = {
                'id': node_id_global,
                'raw_text': node['raw_text'],
                'children': children
            }
            tree.append(node_dict)
    return tree


class UserType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = User
        interfaces = [relay.Node]
        connection_class = CountableConnection


class AssignmentType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = Assignment
        interfaces = [relay.Node]
        connection_class = CountableConnection


class RelationshipType(AnnotatePermissionsForReadMixin, DjangoObjectType):
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


class AnnotationType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    json = GenericScalar()

    all_source_node_in_relationship = graphene.List(lambda: RelationshipType)

    def resolve_all_source_node_in_relationship(self, info):
        return self.source_node_in_relationships.all()

    all_target_node_in_relationship = graphene.List(lambda: RelationshipType)

    def resolve_all_target_node_in_relationship(self, info):
        return self.target_node_in_relationships.all()

    # Updated fields for tree representations
    descendants_tree = graphene.Field(
        GenericScalar,
        description="Descendants of the annotation in a tree structure."
    )
    full_tree = graphene.Field(
        GenericScalar,
        description="Entire tree from the root ancestor of the annotation."
    )

    # Resolver for descendants_tree
    def resolve_descendants_tree(self, info):
        """
        Resolver for the descendants_tree field.
        Returns a JSON string representing the subtree starting from this annotation.
        """
        from django_cte import With

        def get_descendants(cte):
            # Base case: direct children of the current annotation
            base_qs = Annotation.objects.filter(parent_id=self.id).values('id', 'parent_id', 'raw_text')
            # Recursive case: descendants of the children
            recursive_qs = cte.join(Annotation, parent_id=cte.col.id).values('id', 'parent_id', 'raw_text')
            return base_qs.union(recursive_qs, all=True)

        cte = With.recursive(get_descendants)
        descendants_qs = cte.queryset().with_cte(cte).order_by('id')

        descendants_list = list(descendants_qs)
        descendants_tree = build_tree(descendants_list, parent_id=self.id)
        return descendants_tree

    # Resolver for full_tree
    def resolve_full_tree(self, info):
        """
        Resolver for the full_tree field.
        Returns a JSON string representing the entire tree from the root ancestor of the annotation.
        """
        from django_cte import With

        # Find the root ancestor
        root = self
        while root.parent_id is not None:
            root = root.parent

        def get_full_tree(cte):
            # Base case: root node
            base_qs = Annotation.objects.filter(id=root.id).values('id', 'parent_id', 'raw_text')
            # Recursive case: descendants
            recursive_qs = cte.join(Annotation, parent_id=cte.col.id).values('id', 'parent_id', 'raw_text')
            return base_qs.union(recursive_qs, all=True)

        cte = With.recursive(get_full_tree)
        full_tree_qs = cte.queryset().with_cte(cte).order_by('id')
        nodes = list(full_tree_qs)
        full_tree = build_tree(nodes, parent_id=None)
        return full_tree

    class Meta:
        model = Annotation
        interfaces = [relay.Node]
        exclude = ("embedding",)
        connection_class = CountableConnection

        # In order for filter options to show up in nested resolvers, you need to specify them
        # in the Graphene type
        filterset_class = AnnotationFilter

    @classmethod
    def get_queryset(cls, queryset, info):
        if issubclass(type(queryset), QuerySet):
            return queryset.visible_to_user(info.context.user)
        elif "RelatedManager" in str(type(queryset)):
            # https://stackoverflow.com/questions/11320702/import-relatedmanager-from-django-db-models-fields-related
            return queryset.all().visible_to_user(info.context.user)
        else:
            return queryset


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
    SPAN_LABEL = "SPAN_LABEL"


class AnnotationSummaryType(graphene.ObjectType):
    id: graphene.String()
    label = graphene.String()
    type = LabelTypeEnum()
    raw_text = graphene.String()


class PageAwareAnnotationType(graphene.ObjectType):
    pdf_page_info = graphene.Field(PdfPageInfoType)
    page_annotations = graphene.List(AnnotationType)


class AnnotationLabelType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = AnnotationLabel
        interfaces = [relay.Node]
        connection_class = CountableConnection


class LabelSetType(AnnotatePermissionsForReadMixin, DjangoObjectType):
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


class DocumentType(AnnotatePermissionsForReadMixin, DjangoObjectType):
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

    all_structural_annotations = graphene.List(AnnotationType)

    def resolve_all_structural_annotations(self, info):
        return self.doc_annotations.filter(structural=True).distinct()

    # Updated field and resolver for all annotations with enhanced filtering
    all_annotations = graphene.List(
        AnnotationType,
        corpus_id=graphene.ID(required=True),
        analysis_id=graphene.ID(),
        is_structural=graphene.Boolean(),
    )

    def resolve_all_annotations(
        self, info, corpus_id, analysis_id=None, is_structural=None
    ):
        try:
            corpus_pk = from_global_id(corpus_id)[1]
            annotations = self.doc_annotations.filter(corpus_id=corpus_pk)

            if analysis_id is not None:
                if analysis_id == "__none__":
                    annotations = annotations.filter(analysis__isnull=True)
                else:
                    analysis_pk = from_global_id(analysis_id)[1]
                    annotations = annotations.filter(analysis_id=analysis_pk)

            if is_structural is not None:
                annotations = annotations.filter(structural=is_structural)

            return annotations.distinct()
        except Exception as e:
            logger.warning(
                f"Failed resolving query for document {self.id} with input: corpus_id={corpus_id}, "
                f"analysis_id={analysis_id}, is_structural={is_structural}. Error: {e}"
            )
            return []

    # New field and resolver for all relationships
    all_relationships = graphene.List(
        RelationshipType,
        corpus_id=graphene.ID(required=True),
        analysis_id=graphene.ID(),
    )

    def resolve_all_relationships(self, info, corpus_id, analysis_id=None):
        try:
            corpus_pk = from_global_id(corpus_id)[1]
            relationships = self.relationships.filter(corpus_id=corpus_pk)

            if analysis_id == "__none__":
                relationships = relationships.filter(analysis__isnull=True)
            elif analysis_id is not None:
                analysis_pk = from_global_id(analysis_id)[1]
                relationships = relationships.filter(analysis_id=analysis_pk)

            return relationships.distinct()
        except Exception as e:
            logger.warning(
                f"Failed resolving relationships query for document {self.id} with input: corpus_id={corpus_id}, "
                f"analysis_id={analysis_id}. Error: {e}"
            )
            return []

    class Meta:
        model = Document
        interfaces = [relay.Node]
        exclude = ("embedding",)
        connection_class = CountableConnection

    @classmethod
    def get_queryset(cls, queryset, info):
        if issubclass(type(queryset), QuerySet):
            return queryset.visible_to_user(info.context.user)
        elif "RelatedManager" in str(type(queryset)):
            # https://stackoverflow.com/questions/11320702/import-relatedmanager-from-django-db-models-fields-related
            return queryset.all().visible_to_user(info.context.user)
        else:
            return queryset


class CorpusType(AnnotatePermissionsForReadMixin, DjangoObjectType):
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

    @classmethod
    def get_queryset(cls, queryset, info):
        if issubclass(type(queryset), QuerySet):
            return queryset.visible_to_user(info.context.user)
        elif "RelatedManager" in str(type(queryset)):
            # https://stackoverflow.com/questions/11320702/import-relatedmanager-from-django-db-models-fields-related
            return queryset.all().visible_to_user(info.context.user)
        else:
            return queryset


class CorpusActionType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = CorpusAction
        interfaces = [relay.Node]
        connection_class = CountableConnection
        filter_fields = {
            "id": ["exact"],
            "name": ["exact", "icontains", "istartswith"],
            "corpus__id": ["exact"],
            "fieldset__id": ["exact"],
            "analyzer__id": ["exact"],
            "trigger": ["exact"],
            "creator__id": ["exact"],
        }


class UserImportType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    def resolve_zip(self, info):
        return "" if not self.file else info.context.build_absolute_uri(self.zip.url)

    class Meta:
        model = UserImport
        interfaces = [relay.Node]
        connection_class = CountableConnection


class UserExportType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    def resolve_file(self, info):
        return "" if not self.file else info.context.build_absolute_uri(self.file.url)

    class Meta:
        model = UserExport
        interfaces = [relay.Node]
        connection_class = CountableConnection


class AnalyzerType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    analyzer_id = graphene.String()

    def resolve_analyzer_id(self, info):
        return self.id.__str__()

    manifest = GenericScalar()

    full_label_list = graphene.List(AnnotationLabelType)

    def resolve_full_label_list(self, info):
        return self.annotation_labels.all()

    def resolve_icon(self, info):
        return "" if not self.icon else info.context.build_absolute_uri(self.icon.url)

    class Meta:
        model = Analyzer
        interfaces = [relay.Node]
        connection_class = CountableConnection


class GremlinEngineType_READ(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = GremlinEngine
        exclude = ("api_key",)
        interfaces = [relay.Node]
        connection_class = CountableConnection


class GremlinEngineType_WRITE(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = GremlinEngine
        interfaces = [relay.Node]
        connection_class = CountableConnection


class AnalysisType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    full_annotation_list = graphene.List(
        AnnotationType,
        document_id=graphene.ID(),
    )

    def resolve_full_annotation_list(self, info, document_id=None):

        results = self.annotations.all()
        if document_id is not None:
            document_pk = from_global_id(document_id)[1]
            logger.info(
                f"Resolve full annotations for analysis {self.id} with doc {document_pk}"
            )
            results = results.filter(document_id=document_pk)

        return results

    class Meta:
        model = Analysis
        interfaces = [relay.Node]
        connection_class = CountableConnection


class ColumnType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = Column
        interfaces = [relay.Node]
        connection_class = CountableConnection


class FieldsetType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    full_column_list = graphene.List(ColumnType)

    class Meta:
        model = Fieldset
        interfaces = [relay.Node]
        connection_class = CountableConnection

    def resolve_full_column_list(self, info):
        return self.columns.all()


class DatacellType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    data = GenericScalar()
    full_source_list = graphene.List(AnnotationType)

    def resolve_full_source_list(self, info):
        return self.sources.all()

    class Meta:
        model = Datacell
        interfaces = [relay.Node]
        connection_class = CountableConnection


class ExtractType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    full_datacell_list = graphene.List(DatacellType)
    full_document_list = graphene.List(DocumentType)

    class Meta:
        model = Extract
        interfaces = [relay.Node]
        connection_class = CountableConnection

    def resolve_full_datacell_list(self, info):
        return self.extracted_datacells.all()

    def resolve_full_document_list(self, info):
        return self.documents.all()


class CorpusQueryType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    full_source_list = graphene.List(AnnotationType)

    def resolve_full_source_list(self, info):
        return self.sources.all()

    class Meta:
        model = CorpusQuery
        interfaces = [relay.Node]
        connection_class = CountableConnection


class DocumentAnalysisRowType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = DocumentAnalysisRow
        interfaces = [relay.Node]
        connection_class = CountableConnection


class DocumentCorpusActionsType(graphene.ObjectType):
    corpus_actions = graphene.List(CorpusActionType)
    extracts = graphene.List(ExtractType)
    analysis_rows = graphene.List(DocumentAnalysisRowType)


class CorpusStatsType(graphene.ObjectType):
    total_docs = graphene.Int()
    total_annotations = graphene.Int()
    total_comments = graphene.Int()
    total_analyses = graphene.Int()
    total_extracts = graphene.Int()


class UserFeedbackType(AnnotatePermissionsForReadMixin, DjangoObjectType):
    class Meta:
        model = UserFeedback
        interfaces = [relay.Node]
        connection_class = CountableConnection

    # https://docs.graphene-python.org/projects/django/en/latest/queries/#default-queryset
    @classmethod
    def get_queryset(cls, queryset, info):
        if issubclass(type(queryset), QuerySet):
            return queryset.visible_to_user(info.context.user)
        elif "RelatedManager" in str(type(queryset)):
            # https://stackoverflow.com/questions/11320702/import-relatedmanager-from-django-db-models-fields-related
            return queryset.all().visible_to_user(info.context.user)
        else:
            return queryset
