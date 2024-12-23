import logging
import json
from typing import Any

from django.conf import settings
from opencontractserver.types.dicts import (
    OpenContractsAnnotationPythonType,
)

logger = logging.getLogger(__name__)

def reassign_annotation_hierarchy(
    annotations: list[OpenContractsAnnotationPythonType],
    look_behind: int = 16
) -> list[OpenContractsAnnotationPythonType]:
    """
    Assigns a hierarchical structure to annotations in two main steps:

    1) Determine indent levels for each annotation (excluding 'page_header' or 'page_footer'
        items) by calling _call_gpt_for_indent. We store the calculated indent level
        in an intermediate data structure. Any annotations with label == 'page_header'
        or 'page_footer' remain with indent_level=None and are NOT considered in the
        indentation logic (treated as top-level).

    2) Once all indent levels are assigned for the relevant items, we traverse the
        complete set (including page_header/page_footer) in the order they appear
        (assuming the input is already in proper reading order) and set parent-child
        relationships. The parent is decided by the usual indentation stack approach.
        Any annotation with page_header/page_footer keeps parent_id=None and is excluded
        from indentation stack usage.

    Args:
        annotations (list[OpenContractsAnnotationPythonType]): The list of annotations.

    Returns:
        list[OpenContractsAnnotationPythonType]: The updated list of annotations,
        now enriched with parent_id fields and arranged in a hierarchy based on indent levels.
    """
    logger.info("=== Starting Hierarchy Assignment ===")
    logger.info(f"Processing {len(annotations)} annotations")

    # -------------------------------------------------------------------------
    # STEP A: Build an enriched list with basic page/coords info.
    #         We'll set indent_level to None initially.
    # -------------------------------------------------------------------------
    annotations_enriched: list[dict[str, Any]] = []
    for ann in annotations:
        page_no = ann["page"]
        label = ann.get("annotationLabel") or "UNLABELED"

        top_coord = 0.0
        left_coord = 0.0

        ann_json = ann["annotation_json"]
        if isinstance(ann_json, dict) and len(ann_json) > 0:
            first_page_key = list(ann_json.keys())[0]
            single_page_data = ann_json[first_page_key]
            bounds = single_page_data.get("bounds", {})
            top_coord = float(bounds.get("top", 0.0))
            left_coord = float(bounds.get("left", 0.0))

        text_snip = (ann["rawText"] or "")[:256].replace("\n", " ")

        annotations_enriched.append({
            "original": ann,
            "page": page_no,
            "top": top_coord,
            "left": left_coord,
            "text_snip": text_snip,
            "label": label,
            "indent_level": None,  # will be set for non-header/footer items
        })

    logger.info("Not sorting by page/top; assuming reading order is already correct.")

    # -------------------------------------------------------------------------
    # STEP B: Identify items that should get an indent_level (non-header/footer).
    # -------------------------------------------------------------------------
    hierarchy_candidates = [
        itm for itm in annotations_enriched
        if itm["label"].lower() not in ["page_header", "pagefooter", "page_footer"]
    ]
    if hierarchy_candidates:
        hierarchy_candidates[0]["indent_level"] = 0

    # We'll guess indent level for each item based on context of previous ~10
    for i, data in enumerate(hierarchy_candidates):
        text_snip = data["text_snip"]
        label = data["label"]
        x_indent = data["left"]

        previous_items = hierarchy_candidates[max(0, i - look_behind): i]
        gpt_stack = []
        for prev_it in previous_items:
            gpt_stack.append({
                "indent_level": prev_it["indent_level"],
                "text_snip": prev_it["text_snip"],
                "label": prev_it["label"],
                "x_indent": prev_it["left"],
            })

        indent_level = call_gpt_for_indent(
            stack=gpt_stack,
            text_snip=text_snip,
            label=label,
            x_indent=x_indent,
        )
        data["indent_level"] = indent_level

    # -------------------------------------------------------------------------
    # STEP C: Assign parent-child relationships using an indentation stack.
    #         Skip page_header/page_footer items in the stack logic.
    # -------------------------------------------------------------------------
    updated_annotations_map: dict[int, OpenContractsAnnotationPythonType] = {}
    indent_stack: list[int] = []

    for idx, data in enumerate(annotations_enriched):
        ann = data["original"]
        label_lower = data["label"].lower()
        indent_level = data["indent_level"]

        if label_lower in ["page_header", "pagefooter", "page_footer"]:
            ann["parent_id"] = None
            updated_annotations_map[idx] = ann
            continue

        # If for any reason it's still None here, set to 0.
        if indent_level is None:
            indent_level = 0

        while len(indent_stack) > indent_level:
            indent_stack.pop()

        while len(indent_stack) < indent_level:
            if indent_stack:
                indent_stack.append(idx)
            else:
                indent_level = 0
                break

        if indent_level == 0:
            parent_id = None
        else:
            parent_idx = indent_stack[indent_level - 1]
            parent_id = annotations_enriched[parent_idx]["original"]["id"]

        ann["parent_id"] = parent_id

        if len(indent_stack) == indent_level:
            indent_stack.append(idx)
        else:
            indent_stack[indent_level] = idx

        updated_annotations_map[idx] = ann

    updated_annotations: list[OpenContractsAnnotationPythonType] = [
        updated_annotations_map[i]
        for i in sorted(updated_annotations_map.keys())
    ]

    logger.info("=== Hierarchy Assignment Complete ===")
    logger.info(f"Processed {len(updated_annotations)} annotations")
    return updated_annotations

def call_gpt_for_indent(stack: list[dict], text_snip: str, label: str, x_indent: float, max_indent: int = 12) -> int:
    """
    Uses Marvin's extract function to predict a hierarchical indent level
    for an annotation based on a partial text snippet, the annotation label,
    and its left bounding box coordinate (x_indent).

    Args:
        text_snip (str): Up to 256 characters of the annotation text.
        label (str): The annotation label (e.g., "Heading", "Sub-Heading", etc.).
        x_indent (float): The left bounding box coordinate.
        max_indent (int): The maximum indent level we allow (defaults to 8).

    Returns:
        int: The predicted indent level in the range [0, max_indent].
    """
    logger.info("\n=== GPT Indent Level Request ===")
    logger.info(f"Text Snippet: {text_snip[:100]}...")  # First 100 chars
    logger.info(f"Label: {label}")
    logger.info(f"X-Indent: {x_indent}")
    logger.info(f"Max Indent: {max_indent}")
    logger.info(f"Previous Stack Size: {len(stack)}")
    
    import marvin
    marvin.settings.openai.api_key = settings.OPENAI_API_KEY
    marvin.settings.openai.chat.completions.model = 'gpt-4o'

    # Create a short prompt to guide Marvin
    query = (
        "We are traversing a document with nested sections, section-by-section, and are trying to guess indent levels of text blocks.\n" 
        "Based on preceding sections. For new blocks, We're using the first 256 characters, plus its x coordinate visual indent on page (not\n" 
        "dispositive, btw), its label, and preceding blocks' content and resolvedindent levels to guess new block's indentation \n"
        f"level. The following annotations have already been assigned indent levels:\n\n{json.dumps(stack)}\n\n"
        f"Now,based on previous blocks, please make your best guess appropriate indent level of block with\n"
        "Characteristics below. Text snippet of new block and preceding blocks should be most valuable for this\n" 
        "and use clues like numbering, context, references to previous sections (numbered or otherwose) to make your decision,\n"
        " but please use other information like x position on page, preceding blocks' indent levels, etc.\n\n"
        f"===NEW BLOCK===\nPartial text snippet:{text_snip}"
        f"Annotation label: {label}\n"
        f"x_indent value: {x_indent}\n===END NEW BLOCK===\n\n"
        "Provide an indent level (integer) in the range [0, "
        f"{max_indent}] that best represents the hierarchy depth of new block, with 0 being the parent (top-level) and {max_indent} being the leaf (lowest level)."
    )
    logger.info(f"Generated Query:\n{query}")

    instructions = (
        f"Return only an integer in the range [0, {max_indent}] that indicates "
        "the indent depth for the new annotation based on the depths that have already "
        "been assigned to preceding text blocks."
    )
    logger.info(f"Instructions:\n{instructions}")

    indent_candidates: list[int] = marvin.extract(
        query,
        target=int,
        instructions=instructions
    )
    logger.info(f"Received Candidates: {indent_candidates}")

    if indent_candidates:
        result = max(0, min(indent_candidates[0], max_indent))
        logger.info(f"Selected Indent Level: {result}")
        return result
    
    logger.info("No valid candidates received, defaulting to 0")
    return 0

