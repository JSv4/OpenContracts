import { Segment } from "semantic-ui-react";

import styled from "styled-components";

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
  return (
    <CardContainer>
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
      <Segment attached="bottom" raised className="CardHolder">
        {children}
      </Segment>
    </CardContainer>
  );
};

const CardContainer = styled.div`
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
