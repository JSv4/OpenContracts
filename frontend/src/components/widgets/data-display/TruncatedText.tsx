import React from "react";
import styled from "styled-components";
import { Popup } from "semantic-ui-react";

interface TruncatedTextProps {
  text: string;
  limit: number;
  style?: React.CSSProperties;
}

const StyledPopup = styled(Popup)`
  &.ui.popup {
    z-index: 100000 !important;
    padding: 8px !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
    border-radius: 8px !important;
    overflow: hidden !important;
  }
`;

const TextContainer = styled.div`
  white-space: pre-wrap;
  word-break: break-word;
`;

const TriggerContainer = styled(TextContainer)`
  cursor: pointer;
`;

export const TruncatedText: React.FC<TruncatedTextProps> = ({
  text,
  limit,
  style,
}) => {
  const shouldTruncate = text.length > limit;

  const truncatedText = shouldTruncate
    ? `${text.slice(0, limit).trim()}…`
    : text;

  return shouldTruncate ? (
    <StyledPopup
      content={
        <TextContainer style={{ maxWidth: "400px" }}>{text}</TextContainer>
      }
      trigger={
        <TriggerContainer style={style}>{truncatedText}</TriggerContainer>
      }
      position="top center"
      hoverable
    />
  ) : (
    <TextContainer style={style}>{text}</TextContainer>
  );
};
