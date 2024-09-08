import inspect
import logging
import re

import graphene
from django.conf import settings
from django.db.models import Q
from graphene import relay
from graphene.types.generic import GenericScalar
from graphene_django.fields import DjangoConnectionField
from graphene_django.filter import DjangoFilterConnectionField
from graphql_jwt.decorators import login_required
from graphql_relay import from_global_id

from config.graphql.base import OpenContractsNode
from config.graphql.filters import (
    AnalysisFilter,
    AnalyzerFilter,
    AnnotationFilter,
    AssignmentFilter,
    ColumnFilter,
    CorpusFilter,
    CorpusQueryFilter,
    DatacellFilter,
    DocumentFilter,
    ExportFilter,
    ExtractFilter,
    FieldsetFilter,
    GremlinEngineFilter,
    LabelFilter,
    LabelsetFilter,
    RelationshipFilter,
)
from config.graphql.graphene_types import (
    AnalysisType,
    AnalyzerType,
    AnnotationLabelType,
    AnnotationType,
    AssignmentType,
    ColumnType,
    CorpusQueryType,
    CorpusType,
    DatacellType,
    DocumentCorpusActionsType,
    DocumentType,
    ExtractType,
    FieldsetType,
    GremlinEngineType_READ,
    LabelSetType,
    PageAwareAnnotationType,
    PdfPageInfoType,
    RelationshipType,
    UserExportType,
    UserImportType,
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
from opencontractserver.shared.resolvers import resolve_oc_model_queryset
from opencontractserver.types.enums import LabelType
from opencontractserver.users.models import Assignment, UserExport, UserImport

logger = logging.getLogger(__name__)


class Query(graphene.ObjectType):
    # ANNOTATION RESOLVERS #####################################
    annotations = DjangoFilterConnectionField(
        AnnotationType, filterset_class=AnnotationFilter
    )

    def resolve_annotations(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Annotation.objects.all().order_by("page")
        elif info.context.user.is_anonymous:
            return Annotation.objects.filter(Q(is_public=True))
        else:
            return Annotation.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    label_type_enum = graphene.Enum.from_enum(LabelType)

    #############################################################################################
    # For some annotations, it's not clear exactly how to paginate them and, mostl likely       #
    # the total # of such annotations will be pretty minimal (specifically relationships and    #
    # doc types). The bulk_doc_annotations_in_corpus field is allows you to request             #
    # full complement of annotations for a given doc in a given corpus as a list                #
    # rather than a Relay-style connection.                                                     #
    #############################################################################################

    bulk_doc_relationships_in_corpus = graphene.Field(
        graphene.List(RelationshipType),
        corpus_id=graphene.ID(required=True),
        document_id=graphene.ID(required=True),
    )

    def resolve_bulk_doc_relationships_in_corpus(self, info, corpus_id, document_id):
        # Get the base queryset first (only stuff given user CAN see)
        if info.context.user.is_superuser:
            queryset = Relationship.objects.all().order_by("created")
        # Otherwise, if user is anonymous, try easy query
        elif info.context.user.is_anonymous:
            queryset = Relationship.objects.filter(Q(is_public=True))
        # Finally, in all other cases, actually do the hard work
        else:
            queryset = Relationship.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

        doc_django_pk = from_global_id(document_id)[1]
        corpus_django_pk = from_global_id(corpus_id)[1]

        return queryset.filter(corpus_id=corpus_django_pk, document_id=doc_django_pk)

    bulk_doc_annotations_in_corpus = graphene.Field(
        graphene.List(AnnotationType),
        corpus_id=graphene.ID(required=True),
        document_id=graphene.ID(required=False),
        for_analysis_ids=graphene.String(required=False),
        label_type=graphene.Argument(label_type_enum),
    )

    def resolve_bulk_doc_annotations_in_corpus(self, info, corpus_id, **kwargs):

        corpus_django_pk = from_global_id(corpus_id)[1]

        # Get the base queryset first (only stuff given user CAN see)
        if info.context.user.is_superuser:
            queryset = Annotation.objects.all().order_by("page")
        elif info.context.user.is_anonymous:
            queryset = Annotation.objects.filter(Q(is_public=True))
        else:
            queryset = Annotation.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

        # Now build query to stuff they want to see (filter to annotations in this corpus or with NO corpus FK, which
        # travel with document.
        q_objects = Q(corpus_id=corpus_django_pk) | Q(corpus_id__isnull=True)

        # If for_analysis_ids is passed in, only show annotations from those analyses, otherwise only show human
        # annotations.
        for_analysis_ids = kwargs.get("for_analysis_ids", None)
        if for_analysis_ids is not None and len(for_analysis_ids) > 0:
            logger.info(
                f"resolve_bulk_doc_annotations - Split ids: {for_analysis_ids.split(',')}"
            )
            analysis_pks = [
                int(from_global_id(value)[1])
                for value in list(
                    filter(lambda raw_id: len(raw_id) > 0, for_analysis_ids.split(","))
                )
            ]
            logger.info(f"resolve_bulk_doc_annotations - Analysis pks: {analysis_pks}")
            q_objects.add(Q(analysis_id__in=analysis_pks), Q.AND)
        # else:
        #     q_objects.add(Q(analysis__isnull=True), Q.AND)

        label_type = kwargs.get("label_type", None)
        if label_type is not None:
            q_objects.add(Q(annotation_label__label_type=label_type), Q.AND)

        document_id = kwargs.get("document_id", None)
        if document_id is not None:
            doc_pk = from_global_id(document_id)[1]
            q_objects.add(Q(document_id=doc_pk), Q.AND)

        logger.info(f"Filter queryset {queryset} bulk annotations: {q_objects}")

        return queryset.filter(q_objects).order_by("created", "page")

    page_annotations = graphene.Field(
        PageAwareAnnotationType,
        current_page=graphene.Int(required=False),
        page_number_list=graphene.String(required=False),
        page_containing_annotation_with_id=graphene.ID(required=False),
        corpus_id=graphene.ID(required=False),
        document_id=graphene.ID(required=True),
        for_analysis_ids=graphene.String(required=False),
        label_type=graphene.Argument(label_type_enum),
    )

    def resolve_page_annotations(self, info, document_id, corpus_id=None, **kwargs):

        doc_django_pk = from_global_id(document_id)[1]

        document = Document.objects.get(id=doc_django_pk)

        # Get the base queryset first (only stuff given user CAN see)
        if info.context.user.is_superuser:
            queryset = Annotation.objects.all().order_by("page")
        elif info.context.user.is_anonymous:
            queryset = Annotation.objects.filter(Q(is_public=True))
        else:
            queryset = Annotation.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

        # Now build query to stuff they want to see
        q_objects = Q(document_id=doc_django_pk)
        if corpus_id is not None:
            q_objects.add(Q(corpus_id=from_global_id(corpus_id)[1]), Q.AND)

        # If for_analysis_ids is passed in, only show annotations from those analyses, otherwise only show human
        # annotations.
        for_analysis_ids = kwargs.get("for_analysis_ids", None)
        if for_analysis_ids is not None:
            logger.info(
                f"resolve_page_annotations - for_analysis_ids is not none and split ids:"
                f" {for_analysis_ids.split(',')}"
            )
            analysis_pks = [
                int(from_global_id(value)[1])
                for value in list(
                    filter(lambda raw_id: len(raw_id) > 0, for_analysis_ids.split(","))
                )
            ]
            logger.info(
                f"resolve_page_annotations - for_analysis_ids is not none and Analysis pks: {analysis_pks}"
            )
            q_objects.add(Q(analysis_id__in=analysis_pks), Q.AND)
        else:
            logger.info("resolve_page_annotations - for_analysis_ids is None")
            q_objects.add(Q(analysis__isnull=True), Q.AND)

        label_type = kwargs.get("label_type", None)
        if label_type is not None:
            logger.info(
                f"resolve_page_annotations - label_type is not none: {label_type}"
            )
            q_objects.add(Q(annotation_label__label_type=label_type), Q.AND)

        # Get total page count before filtering by page.
        all_pages_annotations = queryset.filter(q_objects).order_by("page")

        # Now filter down to page we want to view / request values for
        page_containing_annotation_with_id = kwargs.get(
            "page_containing_annotation_with_id", None
        )
        page_number_list = kwargs.get("page_number_list", None)
        if kwargs.get("current_page", None) is not None:
            logger.info(
                f"resolve_page_annotations - current_page is not None: {page_containing_annotation_with_id}"
            )
            current_page = kwargs.get("current_page")  # 1 -indexed
            logger.info(f"resolve_page_annotations- q_objects: {q_objects}")
        elif page_number_list is not None:
            if re.search(r"((\d,{0,1})*)", page_number_list) is not None:
                logger.info(
                    f"resolve_page_annotations - page_number_list is not none: {page_number_list}"
                )
                pages = [eval(page) for page in page_number_list.split(",")]
                logger.info(f"resolve_page_annotations - pages is: {pages}")
                current_page = pages[-1]
            else:
                raise ValueError(
                    f"Value provided is not a comma-seprated list of page numbers: {page_number_list}"
                )
        elif page_containing_annotation_with_id:
            logger.info(
                "resolve_page_annotations - page_containing_annotation_with_id is not None"
            )
            annotation_pk = int(from_global_id(page_containing_annotation_with_id)[1])
            logger.info(f"resolve_page_annotations - Annotation pk {annotation_pk}")
            current_page = (
                Annotation.objects.get(id=annotation_pk).page + 1
            )  # DB is 0-indexed, but make 1-indexed
            logger.info(
                f"resolve_page_annotations - Current page: {current_page} ({type(current_page)})"
            )
        else:
            logger.info("Current page and resolve_page_annotation are NOT set")
            current_page = 1  # Don't forget, we're using 0 index in gremlin. This is not cleanly followed on frontend
            # and backend. Need to fix. For now, everything coming IN from frontend is treated as 1-indexed

        # Convert 1-indexed inputs to 0-indexed page values for DB / backend
        current_page = current_page - 1

        if page_number_list is not None:
            page_annotations = all_pages_annotations.filter(
                page__in=[page - 1 for page in pages]
            ).order_by("page", "created")
        else:
            page_annotations = all_pages_annotations.filter(page=current_page).order_by(
                "page", "created"
            )
        logger.info(f"resolve_page_annotations - page annotations: {page_annotations}")

        pdf_page_info = PdfPageInfoType(
            page_count=document.page_count,
            current_page=current_page,  # convert to DB 0-index
            has_next_page=current_page < document.page_count - 1,
            has_previous_page=current_page > 0,
            corpus_id=corpus_id,
            document_id=document_id,
            for_analysis_ids=for_analysis_ids,
            label_type=label_type,
        )

        return PageAwareAnnotationType(
            page_annotations=page_annotations, pdf_page_info=pdf_page_info
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
        # if info.context.user.is_superuser:
        #     return Corpus.objects.all()
        # elif info.context.user.is_anonymous:
        #     return Corpus.objects.filter(Q(is_public=True))
        # else:
        #     return Corpus.objects.filter(
        #         Q(creator=info.context.user) | Q(is_public=True)
        #     )
        return resolve_oc_model_queryset(
            django_obj_model_type=Corpus, user=info.context.user
        )

    corpus = OpenContractsNode.Field(CorpusType)  # relay.Node.Field(CorpusType)

    # DOCUMENT RESOLVERS #####################################

    documents = DjangoFilterConnectionField(
        DocumentType, filterset_class=DocumentFilter
    )

    def resolve_documents(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Document.objects.all()
        elif info.context.user.is_anonymous:
            return Document.objects.filter(Q(is_public=True)).order_by("modified")
        else:
            return Document.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            ).order_by("modified")

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

    if settings.USE_ANALYZER:

        # GREMLIN ENGINE RESOLVERS #####################################
        gremlin_engine = relay.Node.Field(GremlinEngineType_READ)

        def resolve_gremlin_engine(self, info, **kwargs):
            django_pk = from_global_id(kwargs.get("id", None))[1]
            if info.context.user.is_superuser:
                return GremlinEngine.objects.get(id=django_pk)
            elif info.context.user.is_anonymous:
                return GremlinEngine.objects.get(Q(id=django_pk) & Q(is_public=True))
            else:
                return GremlinEngine.objects.get(
                    Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
                )

        gremlin_engines = DjangoFilterConnectionField(
            GremlinEngineType_READ, filterset_class=GremlinEngineFilter
        )

        def resolve_gremlin_engines(self, info, **kwargs):
            if info.context.user.is_superuser:
                return GremlinEngine.objects.all()
            elif info.context.user.is_anonymous:
                return GremlinEngine.objects.filter(Q(is_public=True))
            else:
                return GremlinEngine.objects.filter(
                    Q(creator=info.context.user) | Q(is_public=True)
                )

        # ANALYZER RESOLVERS #####################################
        analyzer = relay.Node.Field(AnalyzerType)

        def resolve_analyzer(self, info, **kwargs):

            if kwargs.get("id", None) is not None:
                django_pk = from_global_id(kwargs.get("id", None))[1]
            elif kwargs.get("analyzerId", None) is not None:
                django_pk = kwargs.get("analyzerId", None)
            else:
                return None

            if info.context.user.is_superuser:
                return Analyzer.objects.get(id=django_pk)
            elif info.context.user.is_anonymous:
                return Analyzer.objects.get(Q(id=django_pk) & Q(is_public=True))
            else:
                return Analyzer.objects.get(
                    Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
                )

        analyzers = DjangoFilterConnectionField(
            AnalyzerType, filterset_class=AnalyzerFilter
        )

        def resolve_analyzers(self, info, **kwargs):
            if info.context.user.is_superuser:
                return Analyzer.objects.all()
            elif info.context.user.is_anonymous:
                return Analyzer.objects.filter(Q(is_public=True))
            else:
                return Analyzer.objects.filter(
                    Q(creator=info.context.user) | Q(is_public=True)
                )

        # ANALYSIS RESOLVERS #####################################
        analysis = relay.Node.Field(AnalysisType)

        def resolve_analysis(self, info, **kwargs):
            django_pk = from_global_id(kwargs.get("id", None))[1]
            if info.context.user.is_superuser:
                return Analysis.objects.get(id=django_pk)
            elif info.context.user.is_anonymous:
                return Analysis.objects.get(Q(id=django_pk) & Q(is_public=True))
            else:
                return Analysis.objects.get(
                    Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
                )

        analyses = DjangoFilterConnectionField(
            AnalysisType, filterset_class=AnalysisFilter
        )

        def resolve_analyses(self, info, **kwargs):
            if info.context.user.is_superuser:
                return Analysis.objects.all()
            elif info.context.user.is_anonymous:
                return Analysis.objects.filter(Q(is_public=True))
            else:
                return Analysis.objects.filter(
                    Q(creator=info.context.user) | Q(is_public=True)
                )

    fieldset = relay.Node.Field(FieldsetType)

    @login_required
    def resolve_fieldset(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Fieldset.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Fieldset.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Fieldset.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    fieldsets = DjangoFilterConnectionField(
        FieldsetType, filterset_class=FieldsetFilter
    )

    @login_required
    def resolve_fieldsets(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Fieldset.objects.all()
        elif info.context.user.is_anonymous:
            return Fieldset.objects.filter(Q(is_public=True))
        else:
            return Fieldset.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            )

    column = relay.Node.Field(ColumnType)

    @login_required
    def resolve_column(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Column.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Column.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Column.objects.get(
                Q(id=django_pk)
                & (Q(fieldset__creator=info.context.user) | Q(is_public=True))
            )

    columns = DjangoFilterConnectionField(ColumnType, filterset_class=ColumnFilter)

    @login_required
    def resolve_columns(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Column.objects.all()
        elif info.context.user.is_anonymous:
            return Column.objects.filter(Q(is_public=True))
        else:
            return Column.objects.filter(
                Q(fieldset__creator=info.context.user) | Q(is_public=True)
            )

    extract = relay.Node.Field(ExtractType)

    @login_required
    def resolve_extract(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Extract.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Extract.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Extract.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    extracts = DjangoFilterConnectionField(
        ExtractType, filterset_class=ExtractFilter, max_limit=15
    )

    @login_required
    def resolve_extracts(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Extract.objects.all().order_by("-created")
        elif info.context.user.is_anonymous:
            return Extract.objects.filter(Q(is_public=True)).order_by("-created")
        else:
            return Extract.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            ).order_by("-created")

    corpus_query = relay.Node.Field(CorpusQueryType)

    @login_required
    def resolve_corpus_query(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return CorpusQuery.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return CorpusQuery.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return CorpusQuery.objects.get(
                Q(id=django_pk) & (Q(creator=info.context.user) | Q(is_public=True))
            )

    corpus_queries = DjangoFilterConnectionField(
        CorpusQueryType, filterset_class=CorpusQueryFilter
    )

    @login_required
    def resolve_corpus_queries(self, info, **kwargs):
        if info.context.user.is_superuser:
            return CorpusQuery.objects.all().order_by("-created")
        elif info.context.user.is_anonymous:
            return CorpusQuery.objects.filter(Q(is_public=True)).order_by("-created")
        else:
            return CorpusQuery.objects.filter(
                Q(creator=info.context.user) | Q(is_public=True)
            ).order_by("-created")

    datacell = relay.Node.Field(DatacellType)

    @login_required
    def resolve_datacell(self, info, **kwargs):
        django_pk = from_global_id(kwargs.get("id", None))[1]
        if info.context.user.is_superuser:
            return Datacell.objects.get(id=django_pk)
        elif info.context.user.is_anonymous:
            return Datacell.objects.get(Q(id=django_pk) & Q(is_public=True))
        else:
            return Datacell.objects.get(
                Q(id=django_pk)
                & (Q(extract__creator=info.context.user) | Q(is_public=True))
            )

    datacells = DjangoFilterConnectionField(
        DatacellType, filterset_class=DatacellFilter
    )

    @login_required
    def resolve_datacells(self, info, **kwargs):
        if info.context.user.is_superuser:
            return Datacell.objects.all()
        elif info.context.user.is_anonymous:
            return Datacell.objects.filter(Q(is_public=True))
        else:
            return Datacell.objects.filter(
                Q(extract__creator=info.context.user) | Q(is_public=True)
            )

    registered_extract_tasks = graphene.Field(GenericScalar)

    @login_required
    def resolve_registered_extract_tasks(self, info, **kwargs):
        from config import celery_app

        tasks = {}

        # Try to get tasks from the app instance
        # Get tasks from the app instance
        try:
            for task_name, task in celery_app.tasks.items():
                if not task_name.startswith("celery."):
                    docstring = inspect.getdoc(task.run) or "No docstring available"
                    tasks[task_name] = docstring

        except AttributeError as e:
            logger.warning(f"Couldn't get tasks from app instance: {str(e)}")

        # Saving for reference... but I don't think it's necessary ATM and it's much higher latency.
        # Try to get tasks from workers
        # try:
        #     i = celery_app.control.inspect(timeout=5.0, connect_timeout=5.0)
        #     registered_tasks = i.registered()
        #     if registered_tasks:
        #         for worker_tasks in registered_tasks.values():
        #             for task_name in worker_tasks:
        #                 if not task_name.startswith('celery.') and task_name not in tasks:
        #                     # For tasks only found on workers, we can't easily get the docstring
        #                     tasks[task_name] = "Docstring not available for worker-only task"
        # except CeleryError as e:
        #     logger.warning(f"Celery error while inspecting workers: {str(e)}")
        # except Exception as e:
        #     logger.warning(f"Unexpected error while inspecting workers: {str(e)}")

        # Filter out Celery's internal tasks
        return {
            task: description
            for task, description in tasks.items()
            if task.startswith("opencontractserver.tasks.data_extract_tasks")
        }

    document_corpus_actions = graphene.Field(
        DocumentCorpusActionsType,
        document_id=graphene.ID(required=True),
        corpus_id=graphene.ID(required=False),
    )

    def resolve_document_corpus_actions(self, info, document_id, corpus_id=None):

        user = info.context.user
        if user.is_anonymous:
            user = None

        doc_id = from_global_id(document_id)[1]

        if corpus_id is not None:
            corpus_id = from_global_id(corpus_id)[1]
            corpus = Corpus.objects.get(id=corpus_id)
            print(f"Corpus id wasn't none. Retrieved corpus {corpus}")
            corpus_actions = CorpusAction.objects.filter(Q(corpus=corpus) & (Q(creator=user) | Q(is_public=True)))
            print(f"Corpus action retrieved: {corpus_actions}")

        else:
            corpus = None
            corpus_actions = []

        try:
            document = Document.objects.get(Q(id=doc_id) & (Q(creator=user) | Q(is_public=True)))
            print(f"Document: {document}")
            extracts = Extract.objects.filter(Q(corpus=corpus) & Q(documents=document) & (Q(creator=user) | Q(is_public=True)))
            print(f"Extracts:{extracts}")
            analysis_rows = DocumentAnalysisRow.objects.filter(
                Q(document=document) & Q(analysis__analyzed_corpus=corpus) & (Q(creator=user) | Q(is_public=True))
            )
            print(f"analysis_rows rows:{analysis_rows}")

        except Document.DoesNotExist:
            extracts = []
            analysis_rows = []

        return DocumentCorpusActionsType(
            corpus_actions=corpus_actions,
            extracts=extracts,
            analysis_rows=analysis_rows,
        )
