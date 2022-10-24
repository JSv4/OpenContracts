import { Segment } from "semantic-ui-react";

import styled from "styled-components";
import useWindowDimensions from "../hooks/WindowDimensionHook";

interface CardLayoutProps {
  children?: React.ReactChild | React.ReactChild[];
  Modals?: React.ReactChild | React.ReactChild[];
  BreadCrumbs?: React.ReactChild | null | undefined;
  SearchBar: React.ReactChild;
}

export const CardLayout = ({
  children,
  Modals,
  BreadCrumbs,
  SearchBar,
}: CardLayoutProps) => {
  const { width } = useWindowDimensions();
  const use_mobile = width <= 400;
  const use_responsive = width <= 1000 && width > 400;

  return (
    <CardContainer width={width} className="CardLayoutContainer">
      {Modals ? Modals : <></>}
      <Segment attached="top" secondary className="SearchBar">
        {SearchBar}
      </Segment>
      {BreadCrumbs ? (
        <Segment attached secondary>
          {BreadCrumbs}
        </Segment>
      ) : (
        <></>
      )}
      <Segment
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          height: "100%",
          padding: use_mobile ? "5px" : use_responsive ? "10px" : "1rem",
          ...(use_mobile
            ? {
                paddingLeft: "0px",
                paddingRight: "0px",
              }
            : {}),
        }}
        attached="bottom"
        raised
        className="CardHolder"
      >
        {children}
      </Segment>
    </CardContainer>
  );
};

type CardContainerArgs = {
  width: number;
};

export const CardContainer = styled.div<CardContainerArgs>(({ width }) => {
  if (width <= 400) {
    return `
        display: flex;
        height: 100%;
        width: 100%;
        flex: 1;
        padding: 8px;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        overflow: hidden;
      `;
  } else if (width <= 1000) {
    return `
        display: flex;
        height: 100%;
        width: 100%;
        flex: 1;
        padding: 12px;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        overflow: hidden;
      `;
  } else {
    return `
        display: flex;
        height: 100%;
        width: 100%;
        flex: 1;
        padding: 20px;
        flex-direction: column;
        justify-content: flex-start;
        align-items: center;
        overflow: hidden;
      `;
  }
});
