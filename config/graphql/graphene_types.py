import graphene
from django.contrib.auth import get_user_model
from graphene import relay
from graphene.types.generic import GenericScalar
from graphene_django import DjangoObjectType as ModelType
from graphene_django.filter import DjangoFilterConnectionField

from config.graphql.base import CountableConnection
from config.graphql.filters import AnnotationFilter, LabelFilter
from config.graphql.permission_annotator.mixins import AnnotatePermissionsForReadMixin
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
    json = graphene.Scalar()
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


class AnnotationLabelType(AnnotatePermissionsForReadMixin, ModelType):
    class Meta:
        model = AnnotationLabel
        interfaces = [relay.Node]
        connection_class = CountableConnection


class LabelSetType(AnnotatePermissionsForReadMixin, ModelType):

    annotation_labels = DjangoFilterConnectionField(
        AnnotationLabelType, filterset_class=LabelFilter
    )

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
    def resolve_icon(self, info):
        return "" if not self.icon else info.context.build_absolute_uri(self.icon.url)

    class Meta:
        model = Corpus
        interfaces = [relay.Node]
        connection_class = CountableConnection


class UserImportType(AnnotatePermissionsForReadMixin, ModelType):
    def resolve_zip(self, info):
        return "" if not self.zip else info.context.build_absolute_uri(self.zip.url)

    class Meta:
        model = UserImport
        interfaces = [relay.Node]
        connection_class = CountableConnection


class UserExportType(AnnotatePermissionsForReadMixin, ModelType):
    def resolve_zip(self, info):
        return "" if not self.zip else info.context.build_absolute_uri(self.zip.url)

    class Meta:
        model = UserExport
        interfaces = [relay.Node]
        connection_class = CountableConnection
