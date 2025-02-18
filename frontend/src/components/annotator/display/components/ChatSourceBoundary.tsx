/**
 * ChatSourceBoundary.tsx - A bounding-box overlay (similar to SelectionBoundary).
 */
import React, { useEffect, useRef } from "react";
import styled, { css } from "styled-components";
import { BoundingBox } from "../../types/annotations";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";

interface ChatSourceBoundaryProps {
  id: string;
  hidden: boolean;
  showBoundingBox?: boolean;
  scrollIntoView?: boolean;
  color: string;
  bounds: BoundingBox;
  selected: boolean;
  children?: React.ReactNode;
}

/** A styled span that is absolutely positioned based on bounding box coords. */
const BoundarySpan = styled.span<{
  $bounds: BoundingBox;
  $color: string;
  $hidden: boolean;
  $showBoundingBox?: boolean;
  $selected: boolean;
}>`
  position: absolute;
  border: ${(props) =>
    props.$showBoundingBox && !props.$hidden
      ? `2px solid ${props.$color}`
      : "none"};
  ${(props) =>
    !props.$hidden &&
    css`
      background-color: rgba(0, 0, 0, ${props.$selected ? 0.1 : 0});
    `}
  pointer-events: none; // Let PDF remain clickable behind
`;

export const ChatSourceBoundary: React.FC<ChatSourceBoundaryProps> = ({
  id,
  hidden,
  showBoundingBox = false,
  scrollIntoView = false,
  color,
  bounds,
  selected,
  children,
}) => {
  const { registerRef, unregisterRef } = useAnnotationRefs();
  const boundaryRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    registerRef("chatSourceBoundary", boundaryRef, id);
    return () => {
      unregisterRef("chatSourceBoundary", id);
    };
  }, [id, registerRef, unregisterRef]);

  useEffect(() => {
    if (scrollIntoView && boundaryRef.current) {
      boundaryRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [scrollIntoView]);

  const style = {
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.right - bounds.left}px`,
    height: `${bounds.bottom - bounds.top}px`,
  };

  return (
    <BoundarySpan
      id={`CHATSOURCE_BOUNDARY_${id}`}
      ref={boundaryRef}
      style={style}
      $bounds={bounds}
      $color={color}
      $hidden={hidden}
      $showBoundingBox={showBoundingBox}
      $selected={selected}
    >
      {children}
    </BoundarySpan>
  );
};
