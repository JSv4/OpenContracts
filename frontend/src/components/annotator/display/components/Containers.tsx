import React, { useState, useContext } from "react";
import styled, { css } from "styled-components";
import { Icon, Image } from "semantic-ui-react";
import {
  AnnotationStore,
  ServerTokenAnnotation,
  PDFPageInfo,
} from "../../context";
import { BoundingBox, PermissionTypes } from "../../../types";
import { LabelDisplayBehavior } from "../../../../graphql/types";
import { SelectionBoundary } from "./SelectionBoundary";
import {
  annotationSelectedViaRelationship,
  getRelationImageHref,
} from "../../utils";
import { getContrastColor } from "../../../../utils/transform";
import { pulseGreen, pulseMaroon } from "../effects";

// ... (keep the existing interfaces)

export const SelectionContainer = styled.div<{
  color: string;
  showBoundingBox: boolean;
  selectionRef:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
}>`
  position: absolute;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  background-color: ${(props) =>
    props.showBoundingBox ? `${props.color}33` : "transparent"};
  transition: background-color 0.2s ease;

  &:hover {
    background-color: ${(props) =>
      props.showBoundingBox ? `${props.color}66` : "transparent"};
  }
`;

// We use transform here because we need to translate the label upward
// to sit on top of the bounds as a function of *its own* height,
// not the height of it's parent.
interface SelectionInfoProps {
  bounds: {
    left: number;
    right: number;
  };
  border: number;
  color: string;
  showBoundingBox: boolean;
  approved?: boolean;
  rejected?: boolean;
}

export const SelectionInfo = styled.div<SelectionInfoProps>`
  position: absolute;
  width: ${(props) => props.bounds.right - props.bounds.left}px;
  right: -${(props) => props.border + ((props?.approved ? 1 : props?.rejected) ? -1 : 0)}px;
  bottom: calc(100% - 2px);
  border-radius: 4px 4px 0 0;
  background: ${(props) =>
    props.showBoundingBox ? props.color : "rgba(255, 255, 255, 0.9)"};
  padding: 1px 8px;
  font-weight: bold;
  font-size: 12px;
  user-select: none;
  box-sizing: border-box;

  ${(props) =>
    props.approved &&
    css`
      border-top: 2px solid green;
      border-left: 2px solid green;
      border-right: 2px solid green;
      animation: ${pulseGreen} 2s infinite;
    `}

  ${(props) =>
    props.rejected &&
    css`
      border-top: 2px solid maroon;
      border-left: 2px solid maroon;
      border-right: 2px solid maroon;
      animation: ${pulseMaroon} 2s infinite;
    `}
  
  * {
    vertical-align: middle;
  }
`;

export const SelectionInfoContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

export const LabelTagContainer = styled.div<{
  hidden: boolean;
  hovered: boolean;
  color: string;
  display_behavior: LabelDisplayBehavior;
}>`
  display: ${(props) => {
    if (props.hidden) return "none";
    if (props.display_behavior === LabelDisplayBehavior.HIDE) return "none";
    if (props.display_behavior === LabelDisplayBehavior.ON_HOVER)
      return props.hovered ? "flex" : "none";
    return "flex";
  }};
  align-items: center;
  background-color: ${(props) => props.color};
  color: ${(props) => getContrastColor(props.color)};
  padding: 2px 6px;
  border-radius: 3px;
  position: relative;
`;

export const StyledIcon = styled(Icon)<{ color: string }>`
  color: ${(props) => getContrastColor(props.color)} !important;
  margin-left: 0.25rem !important;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s ease;

  &:hover {
    opacity: 1;
  }
`;
