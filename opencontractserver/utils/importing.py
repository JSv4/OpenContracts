import logging
from typing import Union

from config.graphql.serializers import AnnotationLabelSerializer
from opencontractserver.annotations.models import (
    TOKEN_LABEL,
    Annotation,
    AnnotationLabel,
    Relationship,
)
from opencontractserver.types.dicts import (
    OpenContractsAnnotationPythonType,
    OpenContractsRelationshipPythonType,
)
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

logger = logging.getLogger(__name__)


def load_or_create_labels(
    user_id: int,
    labelset_obj,
    label_data_dict: dict[str, dict],
    existing_labels: dict[str, AnnotationLabel] = {},
) -> dict[str, AnnotationLabel]:
    """
    Load existing labels or create new ones if they don't exist.

    Args:
        user_id (int): The ID of the user.
        labelset_obj: The LabelSet object to which labels should be added.
        label_data_dict (Dict[str, Dict]): Label data mapped by label name.
        existing_labels (Dict[str, AnnotationLabel]): Existing labels.

    Returns:
        Dict[str, AnnotationLabel]: Updated existing labels.
    """
    for label_name, label_data in label_data_dict.items():
        if label_name not in existing_labels:
            logger.info(f"Creating new label: {label_name}")
            label_data = label_data.copy()
            label_data.pop("id", None)
            label_data["creator_id"] = user_id

            label_serializer = AnnotationLabelSerializer(data=label_data)
            label_serializer.is_valid(raise_exception=True)
            label_obj = label_serializer.save()
            set_permissions_for_obj_to_user(user_id, label_obj, [PermissionTypes.ALL])

            if labelset_obj:
                labelset_obj.annotation_labels.add(label_obj)

            existing_labels[label_name] = label_obj
    return existing_labels


def import_annotations(
    user_id: int,
    doc_obj,
    corpus_obj,
    annotations_data: list[OpenContractsAnnotationPythonType],
    label_lookup: dict[str, AnnotationLabel],
    label_type: str = TOKEN_LABEL,
) -> dict[Union[str, int], int]:
    """
    Import annotations, handling parent relationships, and return a mapping of old IDs
    to newly created Annotation database primary keys.

    Args:
        user_id (int): The ID of the user.
        doc_obj: The Document object to which annotations belong.
        corpus_obj: The Corpus object, if any.
        annotations_data (List[OpenContractsAnnotationPythonType]): List of annotation data.
        label_lookup (Dict[str, AnnotationLabel]): Mapping of label names to AnnotationLabel objects.
        label_type (str): The type of the annotations if not specified in data.

    Returns:
        Dict[Union[str, int], int]: A dictionary mapping the "id" field from each incoming annotation
        (which may be string or int) to the newly created Annotation's DB primary key.
    """
    logger.info(f"Importing annotations with label type: {label_type}")

    old_id_to_new_pk: dict[Union[str, int], int] = {}

    # First pass: Create annotations without parents
    for annotation_data in annotations_data:
        label_name: str = annotation_data["annotationLabel"]
        label_obj = label_lookup[label_name]

        # Ensure annotation_type is never None by falling back to label_type
        # if the field is missing or explicitly None
        final_annotation_type = annotation_data.get("annotation_type") or label_type

        annot_obj = Annotation.objects.create(
            raw_text=annotation_data["rawText"],
            page=annotation_data.get("page", 1),
            json=annotation_data["annotation_json"],
            annotation_label=label_obj,
            document=doc_obj,
            corpus=corpus_obj,
            creator_id=user_id,
            annotation_type=final_annotation_type,
            structural=annotation_data.get("structural", False),
        )

        set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

        old_id = annotation_data.get("id")
        if old_id is not None:
            old_id_to_new_pk[old_id] = annot_obj.pk

    # Second pass: Set parent relationships
    for annotation_data in annotations_data:
        old_id = annotation_data.get("id")
        parent_old_id = annotation_data.get("parent_id")
        if parent_old_id is not None and old_id is not None:
            annot_pk = old_id_to_new_pk.get(old_id)
            parent_pk = old_id_to_new_pk.get(parent_old_id)
            if annot_pk and parent_pk:
                annot_obj = Annotation.objects.get(pk=annot_pk)
                parent_annot_obj = Annotation.objects.get(pk=parent_pk)
                annot_obj.parent = parent_annot_obj
                annot_obj.save()

    return old_id_to_new_pk


def import_relationships(
    user_id: int,
    doc_obj,
    corpus_obj,
    relationships_data: list["OpenContractsRelationshipPythonType"],
    label_lookup: dict[str, AnnotationLabel],
    annotation_id_map: dict[Union[str, int], int],
) -> dict[Union[str, int], Relationship]:
    """
    Import relationships for the given document and corpus, referencing the
    appropriate Annotation objects using the annotation_id_map (returned from import_annotations),
    and labeling them with the appropriate label from label_lookup.

    Args:
        user_id (int): The ID of the user performing the import.
        doc_obj: The Document to which the relationships belong.
        corpus_obj: The Corpus object, if any.
        relationships_data (List[OpenContractsRelationshipPythonType]): The relationship data to import.
        label_lookup (Dict[str, AnnotationLabel]): Mapping from relationship label names to AnnotationLabel objects.
        annotation_id_map (Dict[Union[str, int], int]): Mapping of 'old' annotation IDs (strings or ints) to
            new DB annotation IDs, as returned from import_annotations.

    Returns:
        Dict[Union[str, int], Relationship]: A dictionary mapping of old relationship IDs to the newly created
                                             Relationship objects.
    """
    logger.info("Importing relationships...")
    old_id_to_new_relationship: dict[Union[str, int], Relationship] = {}

    for relationship_data in relationships_data:
        label_name = relationship_data["relationshipLabel"]
        label_obj = label_lookup[label_name]

        new_relationship = Relationship.objects.create(
            relationship_label=label_obj,
            document=doc_obj,
            corpus=corpus_obj,
            creator_id=user_id,
        )
        set_permissions_for_obj_to_user(
            user_id, new_relationship, [PermissionTypes.ALL]
        )

        # Map source annotations
        for old_source_id in relationship_data.get("source_annotation_ids", []):
            if old_source_id in annotation_id_map:
                source_annot_obj = Annotation.objects.get(
                    id=annotation_id_map[old_source_id]
                )
                new_relationship.source_annotations.add(source_annot_obj)

        # Map target annotations
        for old_target_id in relationship_data.get("target_annotation_ids", []):
            if old_target_id in annotation_id_map:
                target_annot_obj = Annotation.objects.get(
                    id=annotation_id_map[old_target_id]
                )
                new_relationship.target_annotations.add(target_annot_obj)

        old_rel_id = relationship_data.get("id")
        if old_rel_id is not None:
            old_id_to_new_relationship[old_rel_id] = new_relationship

    logger.info("Finished importing relationships.")
    return old_id_to_new_relationship
