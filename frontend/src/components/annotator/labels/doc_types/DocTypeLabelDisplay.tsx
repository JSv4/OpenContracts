import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Divider,
  Header,
  Button,
  Segment,
  Popup,
  Icon,
} from "semantic-ui-react";

import styled from "styled-components";
import { FileText, Plus, X, Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { DocTypeLabel, BlankDocTypeLabel } from "./DocTypeLabels";
import { DocTypePopup } from "./DocTypePopup";

import _ from "lodash";

import "./DocTypeLabelDisplayStyles.css";
import { AnnotationLabelType, LabelType } from "../../../../types/graphql-api";
import { PermissionTypes } from "../../../types";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";
import { HideableHasWidth } from "../../common";
import { DocTypeAnnotation } from "../../types/annotations";
import {
  useAddDocTypeAnnotation,
  useDeleteDocTypeAnnotation,
  usePdfAnnotations,
} from "../../hooks/AnnotationHooks";
import { useCorpusState } from "../../context/CorpusAtom";
import { useReactiveVar } from "@apollo/client";
import { selectedAnalysis, selectedExtract } from "../../../../graphql/cache";

const StyledPopup = styled(Popup)`
  &.ui.popup {
    z-index: 100000 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }
`;

export const DocTypeLabelDisplay: React.FC = () => {
  const { width } = useWindowDimensions();

  const selected_extract = useReactiveVar(selectedExtract);
  const selected_analysis = useReactiveVar(selectedAnalysis);
  const { permissions: corpus_permissions } = useCorpusState();
  const read_only =
    Boolean(selected_analysis) ||
    Boolean(selected_extract) ||
    !corpus_permissions.includes(PermissionTypes.CAN_UPDATE);

  const { pdfAnnotations } = usePdfAnnotations();
  const { docTypeLabels } = useCorpusState();
  const deleteDocTypeAnnotation = useDeleteDocTypeAnnotation();
  const createDocTypeAnnotation = useAddDocTypeAnnotation();

  const doc_label_choices = docTypeLabels;
  const doc_annotations = pdfAnnotations.docTypes;

  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setHover = (hover: boolean | ((prevState: boolean) => boolean)) => {
    if (!hover) {
      if (open) setOpen(false);
    }
    setHovered(hover);
  };

  const onAdd = (label: AnnotationLabelType) => {
    // console.log("onAddDocToLabel", label);

    createDocTypeAnnotation(label);
    setHover(false);
  };

  const onDelete = (doc_type_annotation: DocTypeAnnotation) => {
    // console.log("Delete annotation_id", doc_type_annotation.id);
    deleteDocTypeAnnotation(doc_type_annotation.id);
  };

  let annotation_elements: any[] = [];
  if (doc_annotations.length === 0) {
    annotation_elements = [<BlankDocTypeLabel key="Blank_LABEL" />];
  } else {
    for (var annotation of doc_annotations) {
      try {
        annotation_elements.push(
          <DocTypeLabel
            key={annotation.id}
            onRemove={
              !read_only &&
              annotation.myPermissions.includes(PermissionTypes.CAN_REMOVE)
                ? () => onDelete(annotation)
                : null
            }
            label={annotation.annotationLabel}
          />
        );
      } catch {}
    }
  }

  // Fix the existing labels array construction
  const existing_labels: string[] = doc_annotations.map(
    (annotation) => annotation.annotationLabel.id
  );

  // Filter out already applied labels from the label options
  const filtered_doc_label_choices = doc_label_choices.filter(
    (label) => !existing_labels.includes(label.id)
  );

  // Early return if conditions are met
  if (
    selected_extract &&
    pdfAnnotations.annotations.filter(
      (annot) => annot.annotationLabel.labelType === LabelType.DocTypeLabel
    ).length === 0
  ) {
    return <></>;
  }

  const handleMouseEnter = (): void => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsExpanded(true);
  };

  const handleMouseLeave = (): void => {
    timeoutRef.current = setTimeout(() => setIsExpanded(false), 300);
  };

  return (
    <StyledDocTypeSelector
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <motion.div className="selector-button">
        <div className="composite-icon">
          <FileText className="doc-icon primary" size={24} />
          <Tag className="tag-icon secondary" size={14} />
        </div>
        {doc_annotations.length > 0 && (
          <motion.div className="label-count">
            {doc_annotations.length}
          </motion.div>
        )}
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="labels-panel"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
          >
            <div className="active-labels">
              <h6>Document Labels</h6>
              {doc_annotations.length === 0 ? (
                <div className="empty-state">No labels assigned</div>
              ) : (
                <div className="labels-grid">
                  {doc_annotations.map((annotation) => (
                    <motion.div
                      key={annotation.id}
                      className="label-chip"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <span
                        className="color-dot"
                        style={{
                          backgroundColor:
                            annotation.annotationLabel.color || "#1a75bc",
                        }}
                      />
                      <span>{annotation.annotationLabel.text}</span>
                      {!read_only &&
                        annotation.myPermissions.includes(
                          PermissionTypes.CAN_REMOVE
                        ) && (
                          <button
                            className="remove-button"
                            onClick={() => onDelete(annotation)}
                          >
                            <X size={14} />
                          </button>
                        )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {!read_only && filtered_doc_label_choices.length > 0 && (
              <>
                <div className="divider" />
                <div className="available-labels">
                  <h6>Available Labels</h6>
                  <div className="labels-grid">
                    {filtered_doc_label_choices.map((label) => (
                      <motion.button
                        key={label.id}
                        className="label-option"
                        onClick={() => onAdd(label)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Plus size={14} />
                        <span
                          className="color-dot"
                          style={{ backgroundColor: label.color || "#1a75bc" }}
                        />
                        <span>{label.text}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </StyledDocTypeSelector>
  );
};

const StyledDocTypeSelector = styled.div`
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 100000;

  .selector-button {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(200, 200, 200, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);

    .composite-icon {
      position: relative;
      width: 24px;
      height: 24px;

      .primary {
        color: #1a75bc;
        stroke-width: 2;
        position: relative;
        z-index: 1;
      }

      .secondary {
        position: absolute;
        bottom: -4px;
        right: -4px;
        color: #1a75bc;
        stroke-width: 2.2;
        background: white;
        border-radius: 4px;
        padding: 2px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        z-index: 2;
      }
    }

    &:hover {
      transform: translateY(-2px);
      
      .composite-icon {
        .secondary {
          transform: scale(1.1);
        }
      }
    }

    .label-count {
      position: absolute;
      top: -6px;
      right: -6px;
      background: #1a75bc;
      color: white;
      font-size: 12px;
      font-weight: 600;
      min-width: 20px;
      height: 20px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
      z-index: 1;
    }
  }

  .labels-panel {
    position: absolute;
    top: 0;
    right: calc(100% + 12px);
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border-radius: 14px;
    min-width: 280px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    border: 1px solid rgba(200, 200, 200, 0.8);
    overflow: hidden;
    z-index: 100001;

    &::after {
      content: '';
      position: absolute;
      top: 16px;
      right: -6px;
      width: 12px;
      height: 12px;
      background: rgba(255, 255, 255, 0.98);
      transform: rotate(45deg);
      border-top: 1px solid rgba(200, 200, 200, 0.8);
      border-right: 1px solid rgba(200, 200, 200, 0.8);
    }

    &.motion-div {
      initial: { opacity: 0, x: 10 };
      animate: { opacity: 1, x: 0 };
      exit: { opacity: 0, x: 10 };
    }

    h6 {
      margin: 0;
      padding: 12px 16px;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .divider {
      height: 1px;
      background: rgba(200, 200, 200, 0.3);
      margin: 4px 0;
    }

    .empty-state {
      padding: 12px 16px;
      color: #64748b;
      font-size: 0.875rem;
      font-style: italic;
    }

    .labels-grid {
      padding: 8px;
      display: grid;
      gap: 6px;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }

    .label-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 8px;
      font-size: 0.875rem;
      color: #475569;

      .color-dot {
        width: 8px;
        height: 8px;
        border-radius: 4px;
      }

      .remove-button {
        margin-left: auto;
        background: none;
        border: none;
        padding: 4px;
        color: #64748b;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: rgba(0, 0, 0, 0.05);
          color: #ef4444;
        }
      }
    }

    .label-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: none;
      border: none;
      width: 100%;
      text-align: left;
      cursor: pointer;
      border-radius: 8px;
      font-size: 0.875rem;
      color: #475569;

      &:hover {
        background: rgba(0, 0, 0, 0.03);
        color: #1e293b;
      }

      .color-dot {
        width: 8px;
        height: 8px;
        border-radius: 4px;
      }
    }
  }
`;

export default DocTypeLabelDisplay;
