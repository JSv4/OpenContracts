import React from "react";
import { Segment } from "semantic-ui-react";
import styled from "styled-components";
import useWindowDimensions from "../hooks/WindowDimensionHook";

interface CardLayoutProps {
  children?: React.ReactChild | React.ReactChild[];
  Modals?: React.ReactChild | React.ReactChild[];
  BreadCrumbs?: React.ReactChild | null | undefined;
  SearchBar: React.ReactChild;
  style?: React.CSSProperties;
}

const StyledSegment = styled(Segment)`
  &.ui.segment {
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    margin-bottom: 1rem;
    border-radius: 12px !important;
    background: #ffffff !important;
    transition: all 0.2s ease;

    &:hover {
      background: #ffffff !important;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
    }

    /* Style for breadcrumb links */
    .breadcrumb {
      a {
        color: var(--text-primary, #1a2433);
        opacity: 0.85;
        transition: all 0.2s ease;

        &:hover {
          opacity: 1;
          transform: translateY(-1px);
        }
      }

      .active {
        color: var(--text-primary, #1a2433);
        font-weight: 500;
      }

      .divider {
        opacity: 0.5;
        margin: 0 0.5em;
      }
    }
  }
`;

const SearchBarWrapper = styled.div`
  width: 100%;
  margin-bottom: 1rem;
`;

const ScrollableSegment = styled(StyledSegment)`
  &.ui.segment {
    flex: 1;
    min-height: 70vh;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    height: 100%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #888 #f1f1f1;
    color: red;
    border-radius: 12px !important;
    background: #ffffff !important;

    &:hover {
      background: #ffffff !important;
    }

    &::-webkit-scrollbar {
      width: 8px;
    }

    &::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
  }
`;

export const CardLayout: React.FC<CardLayoutProps> = ({
  children,
  Modals,
  BreadCrumbs,
  SearchBar,
  style,
}) => {
  const { width } = useWindowDimensions();
  const use_mobile = width <= 400;
  const use_responsive = width <= 1000 && width > 400;

  return (
    <CardContainer
      width={width}
      className="CardLayoutContainer"
      style={{ maxHeight: "90vh", ...style }}
    >
      {Modals}
      <SearchBarWrapper>{SearchBar}</SearchBarWrapper>
      {BreadCrumbs && (
        <StyledSegment attached secondary>
          {BreadCrumbs}
        </StyledSegment>
      )}
      <ScrollableSegment
        id="ScrollableSegment"
        style={{
          padding: use_mobile ? "5px" : use_responsive ? "10px" : "1rem",
          ...(use_mobile ? { paddingLeft: "0px", paddingRight: "0px" } : {}),
        }}
        attached="bottom"
        raised
        className="CardHolder"
      >
        {children}
      </ScrollableSegment>
    </CardContainer>
  );
};

type CardContainerArgs = {
  width: number;
};

const CardContainer = styled.div<CardContainerArgs>(({ width }) => {
  const baseStyling = `
    display: flex;
    height: 100%;
    width: 100%;
    flex: 1;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    overflow: hidden;
    background-color: #f0f2f5;
  `;

  if (width <= 400) {
    return `
      ${baseStyling}
      padding: 8px;
    `;
  } else if (width <= 1000) {
    return `
      ${baseStyling}
      padding: 12px;
    `;
  } else {
    return `
      ${baseStyling}
      padding: 20px;
    `;
  }
});

export default CardLayout;
