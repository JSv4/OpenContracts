import React, { useEffect, useRef } from "react";
import styled, { css } from "styled-components";
import { BoundingBox } from "../../../types";
import {
  getBorderWidthFromBounds,
  hexToRgb,
} from "../../../../utils/transform";
import { pulseGreen, pulseMaroon } from "../effects";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";
import { useUISettings } from "../../hooks/useUISettings";

interface SelectionBoundaryProps {
  id: string;
  hidden: boolean;
  showBoundingBox?: boolean;
  color: string;
  bounds: BoundingBox;
  selected: boolean;
  children?: React.ReactNode;
  annotationId?: string;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
  approved?: boolean;
  rejected?: boolean;
}

const BoundarySpan = styled.span.attrs<{
  $width: number;
  $height: number;
  $rotateX: number;
  $rotateY: number;
  $bounds: BoundingBox;
  $backgroundColor: string;
  $border: number;
  $color: string;
  $hidden: boolean;
  $showBoundingBox: boolean;
  $approved?: boolean;
  $rejected?: boolean;
}>((props) => ({
  style: {
    position: "absolute",
    left: `${props.$bounds.left}px`,
    top: `${props.$bounds.top}px`,
    width: `${Math.abs(props.$width)}px`,
    height: `${Math.abs(props.$height)}px`,
    transform: `rotateY(${props.$rotateY}deg) rotateX(${props.$rotateX}deg)`,
    backgroundColor: props.$backgroundColor,
    zIndex: 2,
    border:
      props.$showBoundingBox && !props.$hidden
        ? `${props.$border}px solid ${props.$color}`
        : "none",
    transformOrigin: "top left",
    transition: "background-color 0.2s ease",
  },
}))`
  ${(props) =>
    props.$approved &&
    css`
      border: 2px solid green !important;
      animation: ${pulseGreen} 2s infinite;
    `}

  ${(props) =>
    props.$rejected &&
    css`
      border: 2px solid maroon !important;
      animation: ${pulseMaroon} 2s infinite;
    `}
`;

export const SelectionBoundary: React.FC<SelectionBoundaryProps> = ({
  id,
  hidden,
  showBoundingBox = false,
  color,
  bounds,
  children,
  onHover,
  onClick,
  selected,
  approved,
  rejected,
}) => {
  const { registerRef, unregisterRef } = useAnnotationRefs();
  const boundaryRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (id) {
      registerRef("annotation", boundaryRef, id);
      return () => {
        unregisterRef("annotation", id);
      };
    }
  }, [id, registerRef, unregisterRef]);

  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const rotateY = width < 0 ? -180 : 0;
  const rotateX = height < 0 ? -180 : 0;
  const rgbColor = hexToRgb(color);
  const opacity = !showBoundingBox || hidden ? 0 : selected ? 0.4 : 0.1;
  const border = getBorderWidthFromBounds(bounds);
  const backgroundColor = `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})`;

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey && onClick) {
      e.stopPropagation();
      onClick();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey && onClick) {
      e.stopPropagation();
    }
  };

  return (
    <BoundarySpan
      id={`SELECTION_${id}`}
      ref={boundaryRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseEnter={onHover && !hidden ? () => onHover(true) : undefined}
      onMouseLeave={onHover && !hidden ? () => onHover(false) : undefined}
      $width={width}
      $height={height}
      $rotateX={rotateX}
      $rotateY={rotateY}
      $showBoundingBox={showBoundingBox}
      $hidden={hidden}
      $border={border}
      $color={color}
      $backgroundColor={backgroundColor}
      $bounds={bounds}
      $approved={approved}
      $rejected={rejected}
    >
      {children || null}
    </BoundarySpan>
  );
};
