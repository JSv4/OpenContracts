import React from "react";
import _ from "lodash";

import { BoundingBox } from "../types";
import { getBorderWidthFromBounds } from "../../utils/transform";
import { hexToRgb } from "../../utils/transform";

interface ResultBoundaryProps {
  id?: number;
  hidden: boolean;
  showBoundingBox?: boolean;
  scrollIntoView?: boolean;
  selectionRef?:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
  color: string;
  bounds: BoundingBox;
  selected: boolean;
  children?: React.ReactNode;
  annotationId?: string;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
}

export const ResultBoundary = ({
  id,
  hidden,
  showBoundingBox,
  scrollIntoView,
  selectionRef,
  color,
  bounds,
  children,
  onHover,
  onClick,
  selected,
}: ResultBoundaryProps) => {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const rotateY = width < 0 ? -180 : 0;
  const rotateX = height < 0 ? -180 : 0;
  let rgbColor = hexToRgb(color);
  let opacity = 0.1;
  const border = getBorderWidthFromBounds(bounds);

  if (!showBoundingBox || hidden) {
    rgbColor = {
      r: 255,
      g: 255,
      b: 255,
    };
    opacity = 0.0;
  } else {
    if (selected) {
      opacity = 0.4;
    }
  }

  const createRefAndScrollIfPreSelected = (element: HTMLSpanElement | null) => {
    if (element && selectionRef && id) {
      // Link this annotation boundary to the annotation id in our mutatable ref that holds our annotation refs.
      selectionRef.current[id] = element;

      // if requested, scroll to Selection on render
      if (scrollIntoView) {
        element.scrollIntoView();
      }
    }
  };

  // Some guidance on refs here: https://stackoverflow.com/questions/61489857/why-i-cant-call-useref-inside-callback
  return (
    <span
      ref={createRefAndScrollIfPreSelected}
      onClick={(e) => {
        // Here we are preventing the default PdfAnnotationsContainer
        // behaviour of drawing a new bounding box if the shift key
        // is pressed in order to allow users to select multiple
        // annotations and associate them together with a relation.
        if (e.shiftKey && onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      onMouseDown={(e) => {
        if (e.shiftKey && onClick) {
          e.stopPropagation();
        }
      }}
      onMouseEnter={
        onHover && !hidden
          ? (e) => {
              // Don't show on hover if component is set to hidden
              onHover(true);
            }
          : () => {}
      }
      onMouseLeave={
        onHover && !hidden
          ? (e) => {
              // Don't show on hover if component is set to hidden
              onHover(false);
            }
          : () => {}
      }
      style={{
        position: "absolute",
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${Math.abs(width)}px`,
        height: `${Math.abs(height)}px`,
        transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
        transformOrigin: "top left",
        border: `${showBoundingBox && !hidden ? border : 0}px solid ${color}`,
        background: `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})`,
      }}
    >
      {children || null}
    </span>
  );
};
