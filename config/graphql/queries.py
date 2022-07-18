import graphene
from django.db.models import Q
from graphene import relay
from graphene_django.fields import DjangoConnectionField
from graphene_django.filter import DjangoFilterConnectionField
from graphql_jwt.decorators import login_required
from graphql_relay import from_global_id

from config.graphql.filters import (
    AnnotationFilter,
    AssignmentFilter,
    CorpusFilter,
    DocumentFilter,
    ExportFilter,
    LabelFilter,
    LabelsetFilter,
    RelationshipFilter,
)
from config.graphql.graphene_types import (
    AnnotationLabelType,
    AnnotationType,
    AssignmentType,
    CorpusType,
    DocumentType,
    LabelSetType,
    RelationshipType,
    UserExportType,
    UserImportType,
)
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.users.models import Assignment, UserExport, UserImport


class Query(graphene.ObjectType):

    # ANNOTATION RESOLVERS #####################################
    annotations = DjangoFilterConnectionField(
        AnnotationType, filterset_class=AnnotationFilter
    )

    def resolve_annotations(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Annotation.objects.all()
        elif info.context.user.is_anonymous:
            return Annotation.objects.filter(Q(is_public=True))
        else:
            return Annotation.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    annotation = relay.Node.Field(AnnotationType)

    def resolve_annotation(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Annotation.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Annotation.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Annotation.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    # RELATIONSHIP RESOLVERS #####################################
    relationships = DjangoFilterConnectionField(
        RelationshipType, filterset_class=RelationshipFilter
    )

    def resolve_relationships(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Relationship.objects.all()
        elif info.context.user.is_anonymous:
            return Relationship.objects.filter(Q(is_public=True))
        else:
            return Relationship.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    relationship = relay.Node.Field(RelationshipType)

    def resolve_relationship(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Relationship.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Relationship.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Relationship.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    # LABEL RESOLVERS #####################################

    annotation_labels = DjangoFilterConnectionField(
        AnnotationLabelType, filterset_class=LabelFilter
    )

    def resolve_annotation_labels(self, info, **kwargs):
        if info.context.user.is_superuser:
            return AnnotationLabel.objects.all()
        elif info.context.user.is_anonymous:
            return AnnotationLabel.objects.filter(Q(is_public=True))
        else:
            return AnnotationLabel.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    annotation_label = relay.Node.Field(AnnotationLabelType)

    def resolve_annotation_label(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return AnnotationLabel.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return AnnotationLabel.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return AnnotationLabel.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    # LABEL SET RESOLVERS #####################################

    labelsets = DjangoFilterConnectionField(
        LabelSetType, filterset_class=LabelsetFilter
    )

    def resolve_labelsets(self, info, **kwargs):
        if info.context.user.is_superuser:
            return LabelSet.objects.all()
        elif info.context.user.is_anonymous:
            return LabelSet.objects.filter(Q(is_public=True))
        else:
            return LabelSet.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    labelset = relay.Node.Field(LabelSetType)

    def resolve_labelset(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return LabelSet.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return LabelSet.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return LabelSet.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    # CORPUS RESOLVERS #####################################
    corpuses = DjangoFilterConnectionField(CorpusType, filterset_class=CorpusFilter)

    def resolve_corpuses(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Corpus.objects.all()
        elif info.context.user.is_anonymous:
            return Corpus.objects.filter(Q(is_public=True))
        else:
            return Corpus.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    corpus = relay.Node.Field(CorpusType)

    def resolve_corpus(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Corpus.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Corpus.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Corpus.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    # DOCUMENT RESOLVERS #####################################

    documents = DjangoFilterConnectionField(
        DocumentType, filterset_class=DocumentFilter
    )

    def resolve_documents(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Document.objects.all()
        elif info.context.user.is_anonymous:
            return Document.objects.filter(Q(is_public=True))
        else:
            return Document.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    document = graphene.Field(DocumentType, id=graphene.String())

    def resolve_document(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Document.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Document.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Document.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    # IMPORT RESOLVERS #####################################
    userimports = DjangoConnectionField(UserImportType)

    @login_required
    def resolve_userimports(self, info, **kwargs):
        if info.context.user.is_superuser:
            return UserImport.objects.all()
        else:
            return UserImport.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    userimport = relay.Node.Field(UserImportType)

    @login_required
    def resolve_userimport(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        return UserImport.objects.get(
            Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
        )

    # EXPORT RESOLVERS #####################################
    userexports = DjangoFilterConnectionField(
        UserExportType, filterset_class=ExportFilter
    )

    @login_required
    def resolve_userexports(self, info, **kwargs):
        if info.context.user.is_superuser:
            return UserExport.objects.all()
        else:
            return UserExport.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    userexport = relay.Node.Field(UserExportType)

    @login_required
    def resolve_userexport(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        return UserExport.objects.get(
            Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
        )

    # ASSIGNMENT RESOLVERS #####################################
    assignments = DjangoFilterConnectionField(
        AssignmentType, filterset_class=AssignmentFilter
    )

    @login_required
    def resolve_assignments(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Assignment.objects.all()
        else:
            return Assignment.objects.filter(assignor=info.context.user)

    assignment = relay.Node.Field(AssignmentType)

    @login_required
    def resolve_assignment(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        return Assignment.objects.get(
            Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
        )
