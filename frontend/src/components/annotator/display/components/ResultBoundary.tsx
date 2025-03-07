import React, { useRef, useEffect } from "react";
import _ from "lodash";
import { BoundingBox } from "../../../types";
import {
  getBorderWidthFromBounds,
  hexToRgb,
} from "../../../../utils/transform";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";

interface ResultBoundaryProps {
  id?: number | string;
  hidden: boolean;
  showBoundingBox?: boolean;
  scrollIntoView?: boolean;
  color: string;
  bounds: BoundingBox;
  selected: boolean;
  children?: React.ReactNode;
  annotationId?: string;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
}

/**
 * ResultBoundary Component
 *
 * A boundary box component used to highlight search results or annotations.
 * It manages its ref internally and registers it with the annotation refs atom.
 */
export const ResultBoundary = ({
  id,
  hidden,
  showBoundingBox = true,
  scrollIntoView = false,
  color,
  bounds,
  children,
  onHover,
  onClick,
  selected,
}: ResultBoundaryProps) => {
  const { registerRef, unregisterRef } = useAnnotationRefs();

  const boundaryRef = useRef<HTMLSpanElement | null>(null);

  // Register and unregister the ref using useEffect
  useEffect(() => {
    if (id !== undefined) {
      registerRef("search", boundaryRef, id);
      return () => {
        unregisterRef("search", id);
      };
    }
  }, [id, registerRef, unregisterRef]);

  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  // console.log("ResultBoundary: Rendering with bounds", {
  //   width,
  //   height,
  //   bounds,
  //   id,
  // });
  const rotateY = width < 0 ? -180 : 0;
  const rotateX = height < 0 ? -180 : 0;
  let rgbColor = hexToRgb(color);
  let opacity = 0.1;
  const border = getBorderWidthFromBounds(bounds);

  if (!showBoundingBox || hidden) {
    rgbColor = { r: 255, g: 255, b: 255 };
    opacity = 0.0;
  } else if (selected) {
    opacity = 0.4;
  }

  // Handle scrolling into view if needed
  useEffect(() => {
    if (scrollIntoView && boundaryRef.current) {
      boundaryRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [scrollIntoView]);

  // Some guidance on refs here: https://stackoverflow.com/questions/61489857/why-i-cant-call-useref-inside-callback
  return (
    <span
      ref={boundaryRef}
      id={id ? id.toString() : undefined}
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
          ? () => {
              onHover(true);
            }
          : undefined
      }
      onMouseLeave={
        onHover && !hidden
          ? () => {
              onHover(false);
            }
          : undefined
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
