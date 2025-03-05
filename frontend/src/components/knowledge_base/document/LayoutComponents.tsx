import { Modal } from "semantic-ui-react";
import styled from "styled-components";

// Enhanced styled components
export const FullScreenModal = styled(Modal)`
  &&& {
    position: fixed !important;
    margin: 1rem 1rem 1.5rem 1rem !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: calc(100% - 2rem) !important;
    height: calc(100% - 2.5rem) !important;
    max-width: none !important;
    max-height: none !important;
    border-radius: 0.5rem !important;
    background: #f8f9fa;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;

    /* Ensure the close button remains visible and properly positioned */
    > .close.icon {
      top: 1rem !important;
      right: 1rem !important;
      color: rgba(0, 0, 0, 0.7) !important;
      z-index: 1000;
    }

    /* Ensure modal content fills available space */
    .content {
      flex: 1 1 auto !important;
      overflow: hidden !important;
      padding: 0 !important;
      margin: 0 !important;
    }
  }
`;

export const SourceIndicator = styled.div`
  padding: 0.5rem;
  background: #eef2ff;
  border-left: 3px solid #818cf8;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  color: #4338ca;
`;
