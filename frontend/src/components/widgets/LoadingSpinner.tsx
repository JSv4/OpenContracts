import React from "react";
import { Loader } from "semantic-ui-react";
import styled from "styled-components";

interface LoadingSpinnerProps {
  message?: string;
  size?:
    | "mini"
    | "tiny"
    | "small"
    | "medium"
    | "large"
    | "big"
    | "huge"
    | "massive";
  inline?: boolean;
  fullScreen?: boolean;
}

const FullScreenContainer = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.9);
  z-index: 1000;
`;

const InlineContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  min-height: 200px;
`;

/**
 * Reusable loading spinner component with consistent styling
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = "Loading...",
  size = "large",
  inline = true,
  fullScreen = false,
}) => {
  const content = (
    <Loader active inline={inline} size={size}>
      {message}
    </Loader>
  );

  if (fullScreen) {
    return <FullScreenContainer>{content}</FullScreenContainer>;
  }

  if (!inline) {
    return <InlineContainer>{content}</InlineContainer>;
  }

  return content;
};
