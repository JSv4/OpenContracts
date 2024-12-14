from typing import Dict, Tuple, List
import logging

from django.db.models import QuerySet

from config.graphql.serializers import AnnotationLabelSerializer
from opencontractserver.annotations.models import (
    AnnotationLabel,
    Annotation,
    DOC_TYPE_LABEL,
    TOKEN_LABEL,
    METADATA_LABEL,
)
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user
from opencontractserver.types.enums import PermissionTypes

logger = logging.getLogger(__name__)

def load_or_create_labels(
    user_id: int,
    labelset_obj,
    label_data_dict: Dict[str, Dict],
    existing_labels: Dict[str, AnnotationLabel] = {}
) -> Dict[str, AnnotationLabel]:
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
    annotations_data: List[Dict],
    existing_labels: Dict[str, AnnotationLabel],
    label_type: str = TOKEN_LABEL
):
    """
    Import annotations, handling parent relationships.

    Args:
        user_id (int): The ID of the user.
        doc_obj: The Document object to which annotations belong.
        corpus_obj: The Corpus object, if any.
        annotations_data (List[Dict]): List of annotation data.
        existing_labels (Dict[str, AnnotationLabel]): Mapping of label names to AnnotationLabel objects.
        label_type (str): The type of the annotations.
    """
    
    logger.info(f"Importing annotations with label type: {label_type}")
    
    # First pass: Create annotations without parents
    old_id_to_new_annotation = {}
    for annotation_data in annotations_data:
        label_name = annotation_data["annotationLabel"]
        logger.info(f"Label name: {label_name}")
        logger.info(f"Annotation data: {annotation_data}")
        label_obj = existing_labels[label_name]
        old_id = annotation_data.get("id")
        annot_obj = Annotation.objects.create(
            raw_text=annotation_data["rawText"],
            page=annotation_data.get("page", 1),
            json=annotation_data["annotation_json"],
            annotation_label=label_obj,
            document=doc_obj,
            corpus=corpus_obj,
            creator_id=user_id,
            annotation_type=annotation_data.get("label_type", label_type),
            structural=annotation_data.get("structural", False),
        )
        set_permissions_for_obj_to_user(user_id, annot_obj, [PermissionTypes.ALL])

        if old_id is not None:
            old_id_to_new_annotation[old_id] = annot_obj

    # Second pass: Set parent relationships
    for annotation_data in annotations_data:
        old_id = annotation_data.get("id")
        parent_old_id = annotation_data.get("parent_id")
        if parent_old_id is not None:
            annot_obj = old_id_to_new_annotation.get(old_id)
            parent_annot_obj = old_id_to_new_annotation.get(parent_old_id)
            if annot_obj and parent_annot_obj:
                annot_obj.parent = parent_annot_obj
                annot_obj.save()

def import_function_from_string(dotted_path):
    """
    Import a function from a dotted module path string.
    """
    from importlib import import_module

    module_path, function_name = dotted_path.rsplit(".", 1)
    module = import_module(module_path)
    func = getattr(module, function_name)
    return func
