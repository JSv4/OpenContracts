import base64
import json
import logging
import uuid

import graphene
import graphql_jwt
from celery import chain, chord, group
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from graphene.types.generic import GenericScalar
from graphql import GraphQLError
from graphql_jwt.decorators import login_required, user_passes_test
from graphql_relay import from_global_id, to_global_id

from config.graphql.base import DRFDeletion, DRFMutation
from config.graphql.graphene_types import (
    AnalysisType,
    AnnotationLabelType,
    AnnotationType,
    ColumnType,
    CorpusType,
    DocumentType,
    ExtractType,
    FieldsetType,
    LabelSetType,
    LanguageModelType,
    RelationInputType,
    RelationshipType,
    UserExportType,
    UserType,
)
from config.graphql.serializers import (
    AnnotationLabelSerializer,
    AnnotationSerializer,
    CorpusSerializer,
    DocumentSerializer,
    LabelsetSerializer, ExtractSerializer, ColumnSerializer,
)
from opencontractserver.analyzer.models import Analysis
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus, TemporaryFileHandle
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Column, Extract, Fieldset, LanguageModel
from opencontractserver.tasks import (
    build_label_lookups_task,
    burn_doc_annotations,
    delete_analysis_and_annotations_task,
    fork_corpus,
    import_corpus,
    import_document_to_corpus,
    package_annotated_docs,
)
from opencontractserver.tasks.analyzer_tasks import start_analysis
from opencontractserver.tasks.doc_tasks import (
    convert_doc_to_funsd,
    convert_doc_to_langchain_task,
)
from opencontractserver.tasks.export_tasks import (
    package_funsd_exports,
    package_langchain_exports,
)
from opencontractserver.tasks.extract_tasks import run_extract
from opencontractserver.tasks.permissioning_tasks import (
    make_analysis_public_task,
    make_corpus_public_task,
)
from opencontractserver.types.dicts import OpenContractsAnnotatedDocumentImportType
from opencontractserver.types.enums import ExportType, PermissionTypes
from opencontractserver.users.models import UserExport
from opencontractserver.utils.etl import is_dict_instance_of_typed_dict
from opencontractserver.utils.permissioning import (
    set_permissions_for_obj_to_user,
    user_has_permission_for_obj,
)

logger = logging.getLogger(__name__)


class MakeAnalysisPublic(graphene.Mutation):
    class Arguments:
        analysis_id = graphene.String(
            required=True, description="Analysis id to make public (superuser only)"
        )

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(AnalysisType)

    @user_passes_test(lambda user: user.is_superuser)
    def mutate(root, info, analysis_id):

        try:
            analysis_pk = from_global_id(analysis_id)[1]
            make_analysis_public_task.si(analysis_id=analysis_pk).apply_async()

            message = (
                "Starting an OpenContracts worker to make your analysis public! Underlying corpus must be made "
                "public too!"
            )
            ok = True

        except Exception as e:
            ok = False
            message = (
                f"ERROR - Could not make analysis public due to unexpected error: {e}"
            )

        return MakeAnalysisPublic(ok=ok, message=message)


class MakeCorpusPublic(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True, description="Corpus id to make public (superuser only)"
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @user_passes_test(lambda user: user.is_superuser)
    def mutate(root, info, corpus_id):

        try:
            corpus_pk = from_global_id(corpus_id)[1]

            make_corpus_public_task.si(corpus_id=corpus_pk).apply_async()
            message = "Starting an OpenContracts worker to make your corpus public!"
            ok = True

        except Exception as e:
            message = f"Failed to start task to make your corpus public due to unexpected error: {e}"
            ok = False

        return MakeCorpusPublic(
            ok=ok,
            message=message,
        )


class UpdateLabelset(DRFMutation):
    class IOSettings:
        lookup_field = "id"
        serializer = LabelsetSerializer
        model = LabelSet
        graphene_model = LabelSetType

    class Arguments:
        id = graphene.String(required=True)
        icon = graphene.String(
            required=False,
            description="Base64-encoded file string for the Labelset icon (optional).",
        )
        title = graphene.String(required=True, description="Title of the Labelset.")
        description = graphene.String(
            required=False, description="Description of the Labelset."
        )


class CreateLabelset(graphene.Mutation):
    class Arguments:
        base64_icon_string = graphene.String(
            required=False,
            description="Base64-encoded file string for the Labelset icon (optional).",
        )
        filename = graphene.String(
            required=True, description="Filename of the document."
        )
        title = graphene.String(required=True, description="Title of the Labelset.")
        description = graphene.String(
            required=False, description="Description of the Labelset."
        )

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(LabelSetType)

    @login_required
    def mutate(root, info, base64_icon_string, title, description, filename):

        ok = False
        obj = None

        try:
            user = info.context.user
            icon = ContentFile(
                base64.b64decode(
                    base64_icon_string.split(",")[1]
                    if "," in base64_icon_string[:32]
                    else base64_icon_string
                ),
                name=filename,
            )
            obj = LabelSet(
                creator=user, title=title, description=description, icon=icon
            )
            obj.save()

            # Assign permissions for user to obj so it can be retrieved
            set_permissions_for_obj_to_user(user, obj, [PermissionTypes.CRUD])

            ok = True
            message = "Success"

        except Exception as e:
            message = f"Error creating labelset: {e}"

        return CreateLabelset(message=message, ok=ok, obj=obj)


class DeleteLabelset(DRFDeletion):
    class IOSettings:
        model = LabelSet
        lookup_field = "id"

    class Arguments:
        id = graphene.String(required=True)


class DeleteExport(DRFDeletion):
    class IOSettings:
        model = UserExport
        lookup_field = "id"

    class Arguments:
        id = graphene.String(required=True)


class AddDocumentsToCorpus(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True, description="ID of corpus to add documents to."
        )
        document_ids = graphene.List(
            graphene.String,
            required=True,
            description="List of ids of the docs to add to corpus.",
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(root, info, corpus_id, document_ids):

        ok = False

        try:
            user = info.context.user
            doc_pks = list(
                map(lambda graphene_id: from_global_id(graphene_id)[1], document_ids)
            )
            doc_objs = Document.objects.filter(
                Q(pk__in=doc_pks) & (Q(creator=user) | Q(is_public=True))
            )
            corpus = Corpus.objects.get(
                Q(pk=from_global_id(corpus_id)[1])
                & (Q(creator=user) | Q(is_public=True))
            )
            corpus.documents.add(*doc_objs)

            ok = True
            message = "Success"

        except Exception as e:
            message = f"Error on upload: {e}"

        return AddDocumentsToCorpus(message=message, ok=ok)


class RemoveDocumentsFromCorpus(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True, description="ID of corpus to remove documents from."
        )
        document_ids_to_remove = graphene.List(
            graphene.String,
            required=True,
            description="List of ids of the docs to remove from corpus.",
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(root, info, corpus_id, document_ids_to_remove):

        ok = False

        try:
            user = info.context.user
            doc_pks = list(
                map(
                    lambda graphene_id: from_global_id(graphene_id)[1],
                    document_ids_to_remove,
                )
            )
            corpus = Corpus.objects.get(
                Q(pk=from_global_id(corpus_id)[1])
                & (Q(creator=user) | Q(is_public=True))
            )
            corpus_docs = corpus.documents.filter(pk__in=doc_pks)
            corpus.documents.remove(*corpus_docs)
            ok = True
            message = "Success"

        except Exception as e:
            message = f"Error on upload: {e}"

        return RemoveDocumentsFromCorpus(message=message, ok=ok)


class UpdateDocument(DRFMutation):
    class IOSettings:
        lookup_field = "id"
        serializer = DocumentSerializer
        model = Document
        graphene_model = DocumentType

    class Arguments:
        id = graphene.String(required=True)
        title = graphene.String(required=False)
        description = graphene.String(required=False)
        pdf_file = graphene.String(required=False)
        custom_meta = GenericScalar(required=False)


class StartCorpusFork(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True,
            description="Graphene id of the corpus you want to package for export",
        )

    ok = graphene.Boolean()
    message = graphene.String()
    new_corpus = graphene.Field(CorpusType)

    @login_required
    def mutate(root, info, corpus_id):

        ok = False
        message = ""
        new_corpus = None

        try:

            # Get annotation ids for the old corpus - these refer to a corpus, doc and label by id, so easaiest way to
            # copy these is to first filter by annotations for our corpus. Then, later, we'll use a dict to map old ids
            # for labels and docs to new obj ids
            corpus_pk = from_global_id(corpus_id)[1]
            annotation_ids = list(
                Annotation.objects.filter(
                    corpus_id=corpus_pk,
                    analysis__isnull=True,
                ).values_list("id", flat=True)
            )

            # Get corpus obj
            corpus = Corpus.objects.get(pk=corpus_pk)

            # Get ids to related objects that need copyin'
            doc_ids = list(corpus.documents.all().values_list("id", flat=True))
            label_set_id = corpus.label_set.pk if corpus.label_set else None

            # Clone the corpus: https://docs.djangoproject.com/en/3.1/topics/db/queries/copying-model-instances
            corpus.pk = None

            # Adjust the title to indicate it's a fork
            corpus.title = f"{corpus.title}"

            # lock the corpus which will tell frontend to show this as loading and disable selection
            corpus.backend_lock = True
            corpus.creator = info.context.user  # switch the creator to the current user
            corpus.parent_id = corpus_pk
            corpus.save()

            set_permissions_for_obj_to_user(
                info.context.user, corpus, [PermissionTypes.CRUD]
            )

            # Now remove references to related objects on our new object, as these point to original docs and labels
            corpus.documents.clear()
            corpus.label_set = None

            # Copy docs and annotations using async task to avoid massive lag if we have large dataset or lots of
            # users requesting copies.
            fork_corpus.si(
                corpus.id, doc_ids, label_set_id, annotation_ids, info.context.user.id
            ).apply_async()

        except Exception as e:
            message = f"Error trying to fork corpus with id {corpus_id}: {e}"
            logger.error(message)

        return StartCorpusFork(ok=ok, message=message, new_corpus=new_corpus)


class StartCorpusExport(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True,
            description="Graphene id of the corpus you want to package for export",
        )
        export_format = graphene.Argument(graphene.Enum.from_enum(ExportType))

    ok = graphene.Boolean()
    message = graphene.String()
    export = graphene.Field(UserExportType)

    @login_required
    def mutate(root, info, corpus_id, export_format):

        if (
            info.context.user.is_usage_capped
            and not settings.USAGE_CAPPED_USER_CAN_EXPORT_CORPUS
        ):
            raise PermissionError(
                "By default, new users cannot create exports. Please contact the admin to "
                "authorize your account."
            )

        try:
            started = timezone.now()
            date_str = started.strftime("%m/%d/%Y, %H:%M:%S")
            corpus_pk = from_global_id(corpus_id)[1]
            export = UserExport.objects.create(
                creator=info.context.user,
                name=f"Export Corpus PK {corpus_pk} on {date_str}",
                started=started,
                format=export_format,
                backend_lock=True,
            )
            set_permissions_for_obj_to_user(
                info.context.user, export, [PermissionTypes.CRUD]
            )

            # TODO - make sure this is correct lookup
            doc_ids = Document.objects.filter(corpus=corpus_pk).values_list(
                "id", flat=True
            )

            if export_format == ExportType.OPEN_CONTRACTS.value:
                # Build celery workflow for export and start async task
                chain(
                    build_label_lookups_task.si(corpus_pk),
                    chord(
                        group(
                            burn_doc_annotations.s(doc_id, corpus_pk)
                            for doc_id in doc_ids
                        ),
                        package_annotated_docs.s(export.id, corpus_pk),
                    ),
                ).apply_async()

                ok = True
                message = "SUCCESS"
            elif export_format == ExportType.LANGCHAIN.value:
                chord(
                    group(
                        convert_doc_to_langchain_task.s(doc_id, corpus_pk)
                        for doc_id in doc_ids
                    ),
                    package_langchain_exports.s(export.id, corpus_pk),
                ).apply_async()
                ok = True
                message = "SUCCESS"
            elif export_format == ExportType.FUNSD:
                chord(
                    group(
                        convert_doc_to_funsd.s(info.context.user.id, doc_id, corpus_pk)
                        for doc_id in doc_ids
                    ),
                    package_funsd_exports.s(export.id, corpus_pk),
                ).apply_async()
                ok = True
                message = "SUCCESS"
            else:
                ok = False
                message = "Unknown Format"

        except Exception as e:
            message = f"StartCorpusExport() - Unable to create export due to error: {e}"
            logger.error(message)
            ok = False
            export = None

        return StartCorpusExport(ok=ok, message=message, export=export)


class StartDocumentExport(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True, description="Id of the document to package?"
        )
        document_id = graphene.String(
            required=True, description="Id of the document to package?"
        )

    ok = graphene.Boolean()
    message = graphene.String()
    export = graphene.Field(UserExportType)

    @login_required
    def mutate(root, info, document_id, corpus_id):

        try:

            corpus_pk = from_global_id(corpus_id)[1]
            document_pk = from_global_id(document_id)[1]

            export = UserExport.objects.create(
                creator=info.context.user, backend_lock=True
            )
            set_permissions_for_obj_to_user(
                info.context.user, export, [PermissionTypes.CRUD]
            )

            chain(
                build_label_lookups_task.si(corpus_pk),
                chord(
                    group(
                        burn_doc_annotations.s(pk, corpus_pk) for pk in [document_pk]
                    ),
                    package_annotated_docs.s(export.id, corpus_pk),
                ),
            ).apply_async()

            ok = True
            message = "SUCCESS"

        except Exception as e:
            message = (
                f"StartDocumentExport() - Unable to create export due to error: {e}"
            )
            logger.error(message)
            ok = False
            export = None

        return StartDocumentExport(ok=ok, message=message, export=export)


class UploadAnnotatedDocument(graphene.Mutation):
    class Arguments:
        target_corpus_id = graphene.String(required=True)
        document_import_data = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(root, info, target_corpus_id, document_import_data):

        try:
            ok = True
            message = "SUCCESS"

            received_json = json.loads(document_import_data)
            if not is_dict_instance_of_typed_dict(
                received_json, OpenContractsAnnotatedDocumentImportType
            ):
                raise GraphQLError("document_import_data is invalid...")

            import_document_to_corpus.s(
                target_corpus_id=target_corpus_id,
                user_id=info.context.user.id,
                document_import_data=received_json,
            ).apply_async()

        except Exception as e:
            ok = False
            message = f"UploadAnnotatedDocument() - could not start load job due to error: {e}"
            logger.error(message)

        return UploadAnnotatedDocument(message=message, ok=ok)


class UploadCorpusImportZip(graphene.Mutation):
    class Arguments:
        base_64_file_string = graphene.String(
            required=True,
            description="Base-64 encoded string for zip of corpus file you want to import",
        )

    ok = graphene.Boolean()
    message = graphene.String()
    corpus = graphene.Field(CorpusType)

    @login_required
    def mutate(root, info, base_64_file_string):

        if (
            info.context.user.is_usage_capped
            and not settings.USAGE_CAPPED_USER_CAN_IMPORT_CORPUS
        ):
            raise PermissionError(
                "By default, new users import corpuses. Please contact the admin to "
                "authorize your account."
            )

        try:
            logger.info(
                "UploadCorpusImportZip.mutate() - Received corpus import base64 encoded..."
            )
            corpus_obj = Corpus.objects.create(
                title="New Import", creator=info.context.user, backend_lock=False
            )
            logger.info("UploadCorpusImportZip.mutate() - placeholder created...")

            set_permissions_for_obj_to_user(
                info.context.user, corpus_obj, [PermissionTypes.CRUD]
            )
            logger.info("UploadCorpusImportZip.mutate() - permissions assigned...")

            # Store our corpus in a temporary file handler which lets us rely on
            # django-wide selection of S3 or local storage in django container
            base64_img_bytes = base_64_file_string.encode("utf-8")
            decoded_file_data = base64.decodebytes(base64_img_bytes)

            with transaction.atomic():
                temporary_file = TemporaryFileHandle.objects.create()
                temporary_file.file = ContentFile(
                    decoded_file_data,
                    name=f"corpus_import_{uuid.uuid4()}.pdf",
                )
                temporary_file.save()
                logger.info("UploadCorpusImportZip.mutate() - temporary file created.")

            transaction.on_commit(
                lambda: chain(
                    import_corpus.s(
                        temporary_file.id, info.context.user.id, corpus_obj.id
                    )
                ).apply_async()
            )
            logger.info("UploadCorpusImportZip.mutate() - Async task launched...")

            ok = True
            message = "Started"
            logger.info("UploadCorpusImportZip() - Imported started")

        except Exception as e:
            ok = False
            message = (
                f"UploadCorpusImportZip() - could not start load job due to error: {e}"
            )
            corpus_obj = None
            logger.error(message)

        return UploadCorpusImportZip(message=message, ok=ok, corpus=corpus_obj)


class UploadDocument(graphene.Mutation):
    class Arguments:
        base64_file_string = graphene.String(
            required=True, description="Base64-encoded file string for the file."
        )
        # base64_file_string = graphene.Base64(required=True, description="Base64-encoded file string for the file.")
        filename = graphene.String(
            required=True, description="Filename of the document."
        )
        title = graphene.String(required=True, description="Title of the document.")
        description = graphene.String(
            required=True, description="Description of the document."
        )
        custom_meta = GenericScalar(required=False, description="")

    ok = graphene.Boolean()
    message = graphene.String()
    document = graphene.Field(DocumentType)

    @login_required
    def mutate(
        root, info, base64_file_string, filename, title, description, custom_meta
    ):

        ok = False
        document = None

        # Was going to user a user_passes_test decorator, but I wanted a custom error message
        # that could be easily reflected to user in the GUI.
        if (
            info.context.user.is_usage_capped
            and info.context.user.document_set.count()
            > settings.USAGE_CAPPED_USER_DOC_CAP_COUNT - 1
        ):
            raise PermissionError(
                f"Your usage is capped at {settings.USAGE_CAPPED_USER_DOC_CAP_COUNT} documents. "
                f"Try deleting an existing document first or contact the admin for a higher limit."
            )

        try:
            user = info.context.user
            pdf_file = ContentFile(base64.b64decode(base64_file_string), name=filename)
            document = Document.objects.create(
                creator=user,
                title=title,
                description=description,
                custom_meta=custom_meta,
                pdf_file=pdf_file,
                backend_lock=True,
            )
            set_permissions_for_obj_to_user(user, document, [PermissionTypes.CRUD])
            ok = True
            message = "Success"

        except Exception as e:
            message = f"Error on upload: {e}"

        return UploadDocument(message=message, ok=ok, document=document)


class DeleteDocument(DRFDeletion):
    class IOSettings:
        model = Document
        lookup_field = "id"

    class Arguments:
        id = graphene.String(required=True)


class DeleteMultipleDocuments(graphene.Mutation):
    class Arguments:
        document_ids_to_delete = graphene.List(
            graphene.String,
            required=True,
            description="List of ids of the documents to delete",
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(root, info, document_ids_to_delete):
        try:
            document_pks = list(
                map(
                    lambda label_id: from_global_id(label_id)[1], document_ids_to_delete
                )
            )
            documents = Document.objects.filter(
                pk__in=document_pks, creator=info.context.user
            )
            documents.delete()
            ok = True
            message = "Success"

        except Exception as e:
            ok = False
            message = f"Delete failed due to error: {e}"

        return DeleteMultipleDocuments(ok=ok, message=message)


class RemoveAnnotation(graphene.Mutation):
    class Arguments:
        annotation_id = graphene.String(
            required=True, description="Id of the annotation that is to be deleted."
        )

    ok = graphene.Boolean()

    @login_required
    def mutate(root, info, annotation_id):
        annotation_pk = from_global_id(annotation_id)[1]
        annotation_obj = Annotation.objects.get(pk=annotation_pk)
        annotation_obj.delete()

        return RemoveAnnotation(ok=True)


class AddAnnotation(graphene.Mutation):
    class Arguments:
        json = GenericScalar(
            required=True, description="New-style JSON for multipage annotations"
        )
        page = graphene.Int(
            required=True, description="What page is this annotation on (0-indexed)"
        )
        raw_text = graphene.String(
            required=True, description="What is the raw text of the annotation?"
        )
        corpus_id = graphene.String(
            required=True, description="ID of the corpus this annotation is for."
        )
        document_id = graphene.String(
            required=True, description="Id of the document this annotation is on."
        )
        annotation_label_id = graphene.String(
            required=True,
            description="Id of the label that is applied via this annotation.",
        )

    ok = graphene.Boolean()
    annotation = graphene.Field(AnnotationType)

    @login_required
    def mutate(
        root, info, json, page, raw_text, corpus_id, document_id, annotation_label_id
    ):
        corpus_pk = from_global_id(corpus_id)[1]
        document_pk = from_global_id(document_id)[1]
        label_pk = from_global_id(annotation_label_id)[1]

        user = info.context.user

        annotation = Annotation(
            page=page,
            raw_text=raw_text,
            corpus_id=corpus_pk,
            document_id=document_pk,
            annotation_label_id=label_pk,
            creator=user,
            json=json,
        )
        annotation.save()
        set_permissions_for_obj_to_user(user, annotation, [PermissionTypes.CRUD])
        ok = True

        return AddAnnotation(ok=ok, annotation=annotation)


class AddDocTypeAnnotation(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True, description="ID of the corpus this annotation is for."
        )
        document_id = graphene.String(
            required=True, description="Id of the document this annotation is on."
        )
        annotation_label_id = graphene.String(
            required=True,
            description="Id of the label that is applied via this annotation.",
        )

    ok = graphene.Boolean()
    annotation = graphene.Field(AnnotationType)

    @login_required
    def mutate(root, info, corpus_id, document_id, annotation_label_id):
        annotation = None
        ok = False

        corpus_pk = from_global_id(corpus_id)[1]
        document_pk = from_global_id(document_id)[1]
        annotation_label_pk = from_global_id(annotation_label_id)[1]

        user = info.context.user

        annotation = Annotation.objects.create(
            corpus_id=corpus_pk,
            document_id=document_pk,
            annotation_label_id=annotation_label_pk,
            creator=user,
        )
        set_permissions_for_obj_to_user(user, annotation, [PermissionTypes.CRUD])
        ok = True

        return AddDocTypeAnnotation(ok=ok, annotation=annotation)


class RemoveRelationship(graphene.Mutation):
    class Arguments:
        relationship_id = graphene.String(
            required=True, description="Id of the relationship that is to be deleted."
        )

    ok = graphene.Boolean()

    @login_required
    def mutate(root, info, relationship_id):
        relationship_pk = from_global_id(relationship_id)[1]
        relationship_obj = Relationship.objects.get(pk=relationship_pk)
        relationship_obj.delete()

        return RemoveRelationship(ok=True)


class AddRelationship(graphene.Mutation):
    class Arguments:
        source_ids = graphene.List(
            graphene.String,
            required=True,
            description="List of ids of the tokens in the source annotation",
        )
        target_ids = graphene.List(
            graphene.String,
            required=True,
            description="List of ids of the target tokens in the label",
        )
        relationship_label_id = graphene.String(
            required=True, description="ID of the label for this relationship."
        )
        corpus_id = graphene.String(
            required=True, description="ID of the corpus for this relationship."
        )
        document_id = graphene.String(
            required=True, description="ID of the document for this relationship."
        )

    ok = graphene.Boolean()
    relationship = graphene.Field(RelationshipType)

    @login_required
    def mutate(
        root,
        info,
        source_ids,
        target_ids,
        relationship_label_id,
        corpus_id,
        document_id,
    ):
        source_pks = list(
            map(lambda graphene_id: from_global_id(graphene_id)[1], source_ids)
        )
        target_pks = list(
            map(lambda graphene_id: from_global_id(graphene_id)[1], target_ids)
        )
        relationship_label_pk = from_global_id(relationship_label_id)[1]
        corpus_pk = from_global_id(corpus_id)[1]
        document_pk = from_global_id(document_id)[1]
        source_annotations = Annotation.objects.filter(id__in=source_pks)
        target_annotations = Annotation.objects.filter(id__in=target_pks)
        relationship = Relationship.objects.create(
            creator=info.context.user,
            relationship_label_id=relationship_label_pk,
            corpus_id=corpus_pk,
            document_id=document_pk,
        )
        set_permissions_for_obj_to_user(
            info.context.user, relationship, [PermissionTypes.CRUD]
        )
        relationship.target_annotations.set(target_annotations)
        relationship.source_annotations.set(source_annotations)

        return AddRelationship(ok=True, relationship=relationship)


class RemoveRelationships(graphene.Mutation):
    class Arguments:
        relationship_ids = graphene.List(graphene.String)

    ok = graphene.Boolean()

    @login_required
    def mutate(root, info, relationship_ids):
        relation_pks = list(
            map(lambda graphene_id: from_global_id(graphene_id)[1], relationship_ids)
        )
        Relationship.objects.filter(id__in=relation_pks).delete()
        return RemoveRelationships(ok=True)


class UpdateAnnotation(DRFMutation):
    class IOSettings:
        pk_fields = ["annotation_label"]
        lookup_field = "id"
        serializer = AnnotationSerializer
        model = Annotation
        graphene_model = AnnotationType

    class Arguments:
        id = graphene.String(required=True)
        page = graphene.Int()
        raw_text = graphene.String()
        json = GenericScalar()
        annotation_label = graphene.String()


class UpdateRelations(graphene.Mutation):
    class Arguments:
        relationships = graphene.List(RelationInputType)

    ok = graphene.Boolean()

    @login_required
    def mutate(root, info, relationships):
        for relationship in relationships:
            pk = from_global_id(relationship["id"])[1]
            source_pks = list(
                map(
                    lambda graphene_id: from_global_id(graphene_id)[1],
                    relationship["source_ids"],
                )
            )
            target_pks = list(
                map(
                    lambda graphene_id: from_global_id(graphene_id)[1],
                    relationship["target_ids"],
                )
            )
            relationship_label_pk = from_global_id(
                relationship["relationship_label_id"]
            )[1]
            corpus_pk = from_global_id(relationship["corpus_id"])[1]
            document_pk = from_global_id(relationship["document_id"])[1]

            relationship = Relationship.objects.get(id=pk)
            relationship.relationship_label_id = relationship_label_pk
            relationship.document_id = document_pk
            relationship.corpus_id = corpus_pk
            relationship.save()

            relationship.target_annotations.set(target_pks)
            relationship.source_annotations.set(source_pks)

        return UpdateRelations(ok=True)


class DeleteLabelMutation(DRFDeletion):
    class IOSettings:
        model = AnnotationLabel
        lookup_field = "id"

    class Arguments:
        id = graphene.String(required=True)


class DeleteMultipleLabelMutation(graphene.Mutation):
    class Arguments:
        annotation_label_ids_to_delete = graphene.List(
            graphene.String,
            required=True,
            description="List of ids of the labels to delete",
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(root, info, annotation_label_ids_to_delete):
        try:
            label_pks = list(
                map(
                    lambda label_id: from_global_id(label_id)[1],
                    annotation_label_ids_to_delete,
                )
            )
            labels = AnnotationLabel.objects.filter(pk__in=label_pks)
            labels.delete()
            ok = True
            message = "Success"

        except Exception as e:
            ok = False
            message = f"Delete failed due to error: {e}"

        return DeleteMultipleLabelMutation(ok=ok, message=message)


class CreateCorpusMutation(DRFMutation):
    class IOSettings:
        lookup_field = "id"
        pk_fields = ["label_set"]
        serializer = CorpusSerializer
        model = Corpus
        graphene_model = CorpusType

    class Arguments:
        title = graphene.String(required=False)
        description = graphene.String(required=False)
        icon = graphene.String(required=False)
        label_set = graphene.String(required=False)


class UpdateCorpusMutation(DRFMutation):
    class IOSettings:
        lookup_field = "id"
        pk_fields = ["label_set"]
        serializer = CorpusSerializer
        model = Corpus
        graphene_model = CorpusType

    class Arguments:
        id = graphene.String(required=True)
        title = graphene.String(required=False)
        description = graphene.String(required=False)
        icon = graphene.String(required=False)
        label_set = graphene.String(required=False)


class DeleteCorpusMutation(DRFDeletion):
    class IOSettings:
        model = Corpus
        lookup_field = "id"

    class Arguments:
        id = graphene.String(required=True)


class CreateLabelMutation(DRFMutation):
    class IOSettings:
        pk_fields = []
        serializer = AnnotationLabelSerializer
        model = AnnotationLabel
        graphene_model = AnnotationLabelType

    class Arguments:
        text = graphene.String(required=False)
        description = graphene.String(required=False)
        color = graphene.String(required=False)
        icon = graphene.String(required=False)
        type = graphene.String(required=False)


class UpdateLabelMutation(DRFMutation):
    class IOSettings:
        pk_fields = []
        serializer = AnnotationLabelSerializer
        lookup_field = "id"
        model = AnnotationLabel
        graphene_model = AnnotationLabelType

    class Arguments:
        id = graphene.String(required=True)
        text = graphene.String(required=False)
        description = graphene.String(required=False)
        color = graphene.String(required=False)
        icon = graphene.String(required=False)
        label_type = graphene.String(required=False)


class RemoveLabelsFromLabelsetMutation(graphene.Mutation):
    class Arguments:
        label_ids = graphene.List(
            graphene.String,
            required=True,
            description="List of Ids of the labels to be deleted.",
        )
        labelset_id = graphene.String(
            "Id of the labelset to delete the labels from", required=True
        )

    ok = graphene.Boolean()
    message = graphene.String()

    @login_required
    def mutate(root, info, label_ids, labelset_id):

        ok = False

        try:
            user = info.context.user
            label_pks = list(
                map(lambda graphene_id: from_global_id(graphene_id)[1], label_ids)
            )
            labelset = LabelSet.objects.get(
                Q(pk=from_global_id(labelset_id)[1])
                & (Q(creator=user) | Q(is_public=True))
            )
            labelset_labels = labelset.documents.filter(pk__in=label_pks)
            labelset.annotation_labels.remove(*labelset_labels)
            ok = True
            message = "Success"

        except Exception as e:
            message = f"Error removing label(s) from labelset: {e}"

        return RemoveLabelsFromLabelsetMutation(message=message, ok=ok)


class CreateLabelForLabelsetMutation(graphene.Mutation):
    class Arguments:
        labelset_id = graphene.String(
            required=True, description="Id of the label that is to be updated."
        )
        text = graphene.String(required=False)
        description = graphene.String(required=False)
        color = graphene.String(required=False)
        icon = graphene.String(required=False)
        label_type = graphene.String(required=False)

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(AnnotationLabelType)
    obj_id = graphene.ID()

    @login_required
    def mutate(root, info, labelset_id, text, description, color, icon, label_type):

        ok = False
        obj = None
        obj_id = None

        try:
            labelset = LabelSet.objects.get(
                pk=from_global_id(labelset_id)[1], creator=info.context.user
            )
            logger.debug("CreateLabelForLabelsetMutation - mutate / Labelset", labelset)
            obj = AnnotationLabel.objects.create(
                text=text,
                description=description,
                color=color,
                icon=icon,
                label_type=label_type,
                creator=info.context.user,
            )
            obj_id = to_global_id("AnnotationLabelType", obj.id)
            logger.debug("CreateLabelForLabelsetMutation - mutate / Created label", obj)

            set_permissions_for_obj_to_user(
                info.context.user, obj, [PermissionTypes.CRUD]
            )
            logger.debug(
                "CreateLabelForLabelsetMutation - permissioned for creating user"
            )

            labelset.annotation_labels.add(obj)
            ok = True
            message = "SUCCESS"
            logger.debug("Done")

        except Exception as e:
            message = f"Failed to create label for labelset due to error: {e}"

        return CreateLabelForLabelsetMutation(
            obj=obj, obj_id=obj_id, message=message, ok=ok
        )


class StartCorpusAnalysisMutation(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.ID(
            required=True, description="Id of the corpus that is to be analyzed."
        )
        analyzer_id = graphene.ID(
            required=True, description="Id of the analyzer to use."
        )

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(AnalysisType)

    @login_required
    def mutate(root, info, corpus_id, analyzer_id):

        obj = None
        message = "SUCCESS"
        ok = True

        if (
            info.context.user.is_usage_capped
            and not settings.USAGE_CAPPED_USER_CAN_USE_ANALYZERS
        ):
            raise PermissionError(
                "By default, new users cannot run analyzers. Please contact the admin to "
                "authorize your account."
            )

        try:

            corpus_pk = from_global_id(corpus_id)[1]

            obj = Analysis.objects.create(
                analyzer_id=analyzer_id,
                analyzed_corpus_id=corpus_pk,
                creator=info.context.user,
            )

            transaction.on_commit(
                lambda: start_analysis.s(
                    analysis_id=obj.id,
                    user_id=info.context.user.id,
                ).apply_async()
            )

        except Exception as e:
            ok = False
            message = f"Starting analysis failed due to unxpected error: {e}"
            logger.error(message)

        return StartCorpusAnalysisMutation(obj=obj, message=message, ok=ok)


class DeleteAnalysisMutation(graphene.Mutation):
    ok = graphene.Boolean()
    message = graphene.String()

    class Arguments:
        id = graphene.String(required=True)

    @login_required
    def mutate(root, info, id):

        # ok = False
        # message = "Could not complete"

        analysis_pk = from_global_id(id)[1]
        analysis = Analysis.objects.get(id=analysis_pk)

        # Check the object isn't locked by another user
        if analysis.user_lock is not None:
            if info.context.user.id == analysis.user_lock_id:
                raise PermissionError(
                    f"Specified object is locked by {info.context.user.username}. Cannot be "
                    f"updated / edited by another user."
                )

        # We ARE OK with deleting something that's been locked by the backend, however, as sh@t happens, and we want
        # frontend users to be able to delete things that are hanging or taking too long and start over / abandon them.

        if not user_has_permission_for_obj(
            user_val=info.context.user,
            instance=analysis,
            permission=PermissionTypes.DELETE,
            include_group_permissions=True,
        ):
            PermissionError("You don't have permission to delete this analysis.")

        # Kick off an async task to delete the analysis (as it can be very large)
        delete_analysis_and_annotations_task.si(analysis_pk=analysis_pk).apply_async()


class ObtainJSONWebTokenWithUser(graphql_jwt.ObtainJSONWebToken):
    user = graphene.Field(UserType)

    @classmethod
    def resolve(cls, root, info, **kwargs):
        return cls(user=info.context.user)


class CreateLanguageModel(graphene.Mutation):
    class Arguments:
        model = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(LanguageModelType)

    @staticmethod
    @login_required
    def mutate(root, info, model):
        language_model = LanguageModel(model=model, creator=info.context.user)
        language_model.save()
        set_permissions_for_obj_to_user(
            info.context.user, language_model, [PermissionTypes.CRUD]
        )
        return CreateLanguageModel(ok=True, message="SUCCESS!", obj=language_model)

class CreateFieldset(graphene.Mutation):
    class Arguments:
        name = graphene.String(required=True)
        description = graphene.String(required=True)

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(FieldsetType)

    @staticmethod
    @login_required
    def mutate(root, info, name, description):
        fieldset = Fieldset(
            owner=info.context.user,
            name=name,
            description=description,
            creator=info.context.user,
        )
        fieldset.save()
        set_permissions_for_obj_to_user(
            info.context.user, fieldset, [PermissionTypes.CRUD]
        )
        return CreateFieldset(ok=True, message="SUCCESS!", obj=fieldset)


class UpdateColumnMutation(DRFMutation):

    class IOSettings:
        lookup_field = "id"
        pk_fields = ["fieldset", "language_model"]
        serializer = ColumnSerializer
        model = Column
        graphene_model = ColumnType

    class Arguments:
        id = graphene.ID(required=True)
        fieldset_id = graphene.ID(required=False)
        creator_id = graphene.ID(required=False)
        query = graphene.String(required=False)
        match_text = graphene.String(required=False)
        output_type = graphene.String(required=False)
        limit_to_label = graphene.String(required=False)
        instructions = graphene.String(required=False)
        language_model_id = graphene.ID(required=False)
        agentic = graphene.Boolean(required=False)


class CreateColumn(graphene.Mutation):
    class Arguments:
        fieldset_id = graphene.ID(required=True)
        query = graphene.String(required=True)
        match_text = graphene.String()
        output_type = graphene.String(required=True)
        limit_to_label = graphene.String()
        instructions = graphene.String()
        language_model_id = graphene.ID(required=True)
        agentic = graphene.Boolean(required=True)

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(ColumnType)

    @staticmethod
    @login_required
    def mutate(
        root,
        info,
        fieldset_id,
        query,
        output_type,
        language_model_id,
        agentic,
        match_text=None,
        limit_to_label=None,
        instructions=None,
    ):
        fieldset = Fieldset.objects.get(pk=from_global_id(fieldset_id)[1])
        language_model = LanguageModel.objects.get(
            pk=from_global_id(language_model_id)[1]
        )
        column = Column(
            fieldset=fieldset,
            query=query,
            match_text=match_text,
            output_type=output_type,
            limit_to_label=limit_to_label,
            instructions=instructions,
            language_model=language_model,
            agentic=agentic,
            creator=info.context.user,
        )
        column.save()
        set_permissions_for_obj_to_user(
            info.context.user, column, [PermissionTypes.CRUD]
        )
        return CreateColumn(ok=True, message="SUCCESS!", obj=column)

class DeleteColumn(DRFDeletion):
    class IOSettings:
        model = Column
        lookup_field = "id"

    class Arguments:
        id = graphene.String(required=True)


class StartExtract(graphene.Mutation):
    class Arguments:
        extract_global_id = graphene.ID(required=True)

    ok = graphene.Boolean()
    message = graphene.String()

    @staticmethod
    @login_required
    def mutate(root, info, extract_global_id):

        extract_id = from_global_id(extract_global_id)[1]

        # Start celery task to process extract
        run_extract.s(extract_id, info.context.user.id).apply_async()

        return StartExtract(ok=True, message="STARTED!")


class CreateExtract(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.ID(required=True)
        name = graphene.String(required=True)
        fieldset_id = graphene.ID(required=True)

    ok = graphene.Boolean()
    msg = graphene.String()
    obj = graphene.Field(ExtractType)

    @staticmethod
    @login_required
    def mutate(root, info, corpus_id, name, fieldset_id):
        corpus = Corpus.objects.get(pk=from_global_id(corpus_id)[1])
        fieldset = Fieldset.objects.get(pk=from_global_id(fieldset_id)[1])

        extract = Extract(
            corpus=corpus,
            name=name,
            fieldset=fieldset,
            owner=info.context.user,
            creator=info.context.user,
        )
        extract.save()
        set_permissions_for_obj_to_user(
            info.context.user, extract, [PermissionTypes.CRUD]
        )

        return CreateExtract(ok=True, msg="SUCCESS!", obj=extract)


class UpdateExtractMutation(DRFMutation):

    class IOSettings:
        lookup_field = "id"
        pk_fields = ["corpus", "fieldset", "owner"]
        serializer = ExtractSerializer
        model = Extract
        graphene_model = ExtractType

    class Arguments:
        id = graphene.String(required=True)
        title = graphene.String(required=False)
        description = graphene.String(required=False)
        icon = graphene.String(required=False)
        label_set = graphene.String(required=False)

class DeleteExtract(DRFDeletion):
    class IOSettings:
        model = Extract
        lookup_field = "id"

    class Arguments:
        id = graphene.String(required=True)



class Mutation(graphene.ObjectType):
    # TOKEN MUTATIONS (IF WE'RE NOT OUTSOURCING JWT CREATION TO AUTH0) #######
    if not settings.USE_AUTH0:
        token_auth = ObtainJSONWebTokenWithUser.Field()
    else:
        token_auth = graphql_jwt.ObtainJSONWebToken.Field()

    verify_token = graphql_jwt.Verify.Field()
    refresh_token = graphql_jwt.Refresh.Field()

    # ANNOTATION MUTATIONS ######################################################
    add_annotation = AddAnnotation.Field()
    remove_annotation = RemoveAnnotation.Field()
    update_annotation = UpdateAnnotation.Field()
    add_doc_type_annotation = AddDocTypeAnnotation.Field()
    remove_doc_type_annotation = RemoveAnnotation.Field()

    # RELATIONSHIP MUTATIONS #####################################################
    add_relationship = AddRelationship.Field()
    remove_relationship = RemoveRelationship.Field()
    remove_relationships = RemoveRelationships.Field()
    update_relationships = UpdateRelations.Field()

    # LABELSET MUTATIONS #######################################################
    create_labelset = CreateLabelset.Field()
    update_labelset = UpdateLabelset.Field()
    delete_labelset = DeleteLabelset.Field()

    # LABEL MUTATIONS ##########################################################
    create_annotation_label = CreateLabelMutation.Field()
    update_annotation_label = UpdateLabelMutation.Field()
    delete_annotation_label = DeleteLabelMutation.Field()
    delete_multiple_annotation_labels = DeleteMultipleLabelMutation.Field()
    create_annotation_label_for_labelset = CreateLabelForLabelsetMutation.Field()
    remove_annotation_labels_from_labelset = RemoveLabelsFromLabelsetMutation.Field()

    # DOCUMENT MUTATIONS #######################################################
    upload_document = UploadDocument.Field()  # Limited by user.is_usage_capped
    update_document = UpdateDocument.Field()
    delete_document = DeleteDocument.Field()
    export_document = StartDocumentExport.Field()
    delete_multiple_documents = DeleteMultipleDocuments.Field()

    # CORPUS MUTATIONS #########################################################
    fork_corpus = StartCorpusFork.Field()
    make_corpus_public = MakeCorpusPublic.Field()
    create_corpus = CreateCorpusMutation.Field()
    update_corpus = UpdateCorpusMutation.Field()
    delete_corpus = DeleteCorpusMutation.Field()
    link_documents_to_corpus = AddDocumentsToCorpus.Field()
    remove_documents_from_corpus = RemoveDocumentsFromCorpus.Field()

    # IMPORT MUTATIONS #########################################################
    import_open_contracts_zip = UploadCorpusImportZip.Field()
    import_annotated_doc_to_corpus = UploadAnnotatedDocument.Field()

    # EXPORT MUTATIONS #########################################################
    export_corpus = StartCorpusExport.Field()  # Limited by user.is_usage_capped
    delete_export = DeleteExport.Field()

    # ANALYSIS MUTATIONS #########################################################
    start_analysis_on_corpus = (
        StartCorpusAnalysisMutation.Field()
    )  # Limited by user.is_usage_capped
    delete_analysis = DeleteAnalysisMutation.Field()
    make_analysis_public = MakeAnalysisPublic.Field()

    # EXTRACT MUTATIONS ##########################################################
    create_language_model = CreateLanguageModel.Field()
    create_fieldset = CreateFieldset.Field()

    create_column = CreateColumn.Field()
    update_column = UpdateColumnMutation.Field()
    delete_column = DeleteColumn.Field()

    create_extract = CreateExtract.Field()
    start_extract = StartExtract.Field()
    delete_extract = DeleteExtract.Field()  # TODO - test
    update_extract = UpdateExtractMutation.Field()
