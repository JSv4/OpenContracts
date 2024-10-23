import { Card, Image } from "semantic-ui-react";
import { AnalysisType } from "../../../types/graphql-api";

export const SelectedAnalysisCard = () => {
  return (
    <Card
      style={{
        margin: "auto",
        width: "75%",
        height: "6vh",
      }}
    >
      <Card.Content>
        <Image
          floated="right"
          size="mini"
          src="https://react.semantic-ui.com/images/avatar/large/steve.jpg"
        />
        <Card.Header>Steve Sanders</Card.Header>
        <Card.Meta>Friends of Elliot</Card.Meta>
      </Card.Content>
    </Card>
  );
};
