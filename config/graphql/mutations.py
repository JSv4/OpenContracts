import base64
import logging

import graphene
import graphql_jwt
from celery import chain, chord, group
from django.conf import settings
from django.core.files.base import ContentFile
from django.db.models import Q
from django.utils import timezone
from graphene.types.generic import GenericScalar
from graphql_jwt.decorators import login_required, user_passes_test
from graphql_relay import from_global_id

from config.graphql.base import DRFDeletion, DRFMutation
from config.graphql.graphene_types import (
    AnnotationLabelType,
    AnnotationType,
    CorpusType,
    DocumentType,
    LabelSetType,
    RelationInputType,
    RelationshipType,
    UserExportType,
    UserType,
)
from config.graphql.permission_annotator.utils import (
    grant_all_permissions_for_obj_to_user,
)
from config.graphql.serializers import (
    AnnotationLabelSerializer,
    AnnotationSerializer,
    CorpusSerializer,
    DocumentSerializer,
    LabelsetSerializer,
)
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.tasks import (
    build_label_lookups_task,
    burn_doc_annotations,
    package_annotated_docs,
)
from opencontractserver.users.models import UserExport
from opencontractserver.utils.fork_utils import build_fork_corpus_task
from opencontractserver.utils.import_utils import build_import_corpus_task

logger = logging.getLogger(__name__)


class MakeCorpusPublic(graphene.Mutation):
    class Arguments:
        corpus_id = graphene.String(
            required=True, description="Corpus id to make public (superuser only)"
        )

    ok = graphene.Boolean()
    message = graphene.String()
    obj = graphene.Field(CorpusType)

    @user_passes_test(lambda user: user.is_superuser)
    def mutate(root, info, corpus_id):

        ok = False

        try:
            corpus_pk = from_global_id(corpus_id)[1]
            corpus = Corpus.objects.get(id=corpus_pk)
            corpus.is_public = True
            corpus.save()

            # Bulk update documents to public
            docs = corpus.documents.all()
            for doc in docs:
                doc.is_public = True
            Document.objects.bulk_update(docs, ["is_public"])

            # Update labelset to public
            corpus.label_set.is_public = True
            corpus.label_set.save()

            # Bulk update labels to public
            labels = corpus.label_set.annotation_labels.all()
            for label in labels:
                logger.info(f"Make this annotation label public: {label.id}")
                logger.info(f"Make this annotation label public: {label}")
                label.is_public = True
            Annotation.objects.bulk_update(labels, ["is_public"])

            # Bulk update actual annotations
            annotations = corpus.annotation_set.all()
            for annotation in annotations:
                logger.info(f"Make annotation public: {annotation}")
                annotation.is_public = True
            Annotation.objects.bulk_update(annotations, ["is_public"])

            corpus.refresh_from_db()

            obj = corpus
            message = "SUCCESS - Corpus is Public"
            ok = True

        except Exception as e:
            obj = None
            message = f"ERROR - Could not make public due to unexpected error: {e}"

        return MakeCorpusPublic(ok=ok, message=message, obj=obj)


class UpdateLabelset(DRFMutation):
    class IOSettings:
        lookup_field = "id"
        serializer = LabelsetSerializer
        model = LabelSet

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
            grant_all_permissions_for_obj_to_user(user, obj)

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
            original_corpus_pk = from_global_id(corpus_id)[1]
            fork_task = build_fork_corpus_task(
                corpus_pk_to_fork=original_corpus_pk, user=info.context.user
            )
            new_corpus_pk = fork_task.apply_async()
            new_corpus = Corpus.objects.get(id=new_corpus_pk)

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

    ok = graphene.Boolean()
    message = graphene.String()
    export = graphene.Field(UserExportType)

    @login_required
    def mutate(root, info, corpus_id):

        try:
            started = timezone.now()
            date_str = started.strftime("%m/%d/%Y, %H:%M:%S")
            corpus_pk = from_global_id(corpus_id)[1]
            export = UserExport.objects.create(
                creator=info.context.user,
                name=f"Export Corpus PK {corpus_pk} on {date_str}",
                started=started,
                backend_lock=True,
            )
            grant_all_permissions_for_obj_to_user(info.context.user, export)

            # TODO - make sure this is correct lookup
            doc_ids = Document.objects.filter(corpus=corpus_pk).values_list(
                "id", flat=True
            )

            # Build celery workflow for export and start async task
            chain(
                build_label_lookups_task.si(corpus_pk),
                chord(
                    group(
                        burn_doc_annotations.s(doc_id, corpus_pk) for doc_id in doc_ids
                    ),
                    package_annotated_docs.s(export.id, corpus_pk),
                ),
            ).apply_async()

            ok = True
            message = "SUCCESS"

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
            grant_all_permissions_for_obj_to_user(info.context.user, export)

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

        try:

            logger.info(
                "UploadCorpusImportZip.mutate() - Received corpus import base64 encoded..."
            )
            corpus_obj = Corpus.objects.create(
                title="New Import", creator=info.context.user, backend_lock=False
            )
            logger.info("UploadCorpusImportZip.mutate() - placeholder created...")

            import_task = build_import_corpus_task(
                seed_corpus_id=corpus_obj.id,
                base_64_file_string=base_64_file_string,
                user=info.context.user,
            )

            import_task.apply_async()
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

        try:
            # format, imgstr = base64_file_string.split(';base64,')
            # ext = format.split('/')[-1]
            user = info.context.user
            pdf_file = ContentFile(base64.b64decode(base64_file_string), name=filename)
            document = Document(
                creator=user,
                title=title,
                description=description,
                custom_meta=custom_meta,
                pdf_file=pdf_file,
                backend_lock=True,
            )
            document.save()
            grant_all_permissions_for_obj_to_user(user, document)
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
        grant_all_permissions_for_obj_to_user(user, annotation)
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
        grant_all_permissions_for_obj_to_user(user, annotation)
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
        grant_all_permissions_for_obj_to_user(info.context.user, relationship)
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

    @login_required
    def mutate(root, info, labelset_id, text, description, color, icon, label_type):

        ok = False
        obj = None

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
            logger.debug("CreateLabelForLabelsetMutation - mutate / Created label", obj)

            grant_all_permissions_for_obj_to_user(info.context.user, obj)
            logger.debug(
                "CreateLabelForLabelsetMutation - permissioned for creating user"
            )

            labelset.annotation_labels.add(obj)
            ok = True
            message = "SUCCESS"
            logger.debug("Done")

        except Exception as e:
            message = f"Failed to create label for labelset due to error: {e}"

        return CreateLabelForLabelsetMutation(obj=obj, message=message, ok=ok)


class ObtainJSONWebTokenWithUser(graphql_jwt.ObtainJSONWebToken):

    user = graphene.Field(UserType)

    @classmethod
    def resolve(cls, root, info, **kwargs):
        return cls(user=info.context.user)


class Mutation(graphene.ObjectType):

    # TOKEN MUTATIONS (IF WE'RE NOT OUTSOURCING JWT CREATION TO AUTH0) #######
    if not settings.USE_AUTH0:
        token_auth = ObtainJSONWebTokenWithUser.Field()
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
    upload_document = UploadDocument.Field()
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

    # EXPORT MUTATIONS #########################################################
    export_corpus = StartCorpusExport.Field()
    delete_export = DeleteExport.Field()
