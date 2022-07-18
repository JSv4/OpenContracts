import { Header, Icon, SemanticCOLORS } from "semantic-ui-react";
import styled from "styled-components";
import { SemanticICONS } from "semantic-ui-react/dist/commonjs/generic";

export const Result = ({
  status,
  title,
}: {
  status: "warning" | "success" | "unknown";
  title: string;
}) => {
  function convertStatusToIcon(status: string): {
    icon: SemanticICONS;
    color: SemanticCOLORS;
  } {
    switch (status) {
      case "success":
        return {
          icon: "thumbs up outline",
          color: "green",
        };
      case "warning":
        return {
          icon: "warning sign",
          color: "yellow",
        };
      case "unknown":
        return {
          icon: "question circle outline",
          color: "black",
        };
      default:
        return {
          icon: "question circle outline",
          color: "black",
        };
    }
  }

  const { icon, color } = convertStatusToIcon(status);

  return (
    <ResultIndicatorContainer>
      <InnerContainer>
        <div style={{ marginBottom: "2vh" }}>
          <Icon name={icon} color={color} size="massive" />
        </div>
        <div>
          <Header as="h1" textAlign="center">
            {status}
            <Header.Subheader>{title}</Header.Subheader>
          </Header>
        </div>
      </InnerContainer>
    </ResultIndicatorContainer>
  );
};

const ResultIndicatorContainer = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const InnerContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;
