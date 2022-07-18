import React from "react";
import { Card, Placeholder } from "semantic-ui-react";

interface PlaceholderCardProps {
  description?: string;
}

export const PlaceholderCard = ({ description }: PlaceholderCardProps) => (
  <Card key="Placeholder Card">
    <Placeholder>
      <Placeholder.Image square />
    </Placeholder>
    <Card.Content>
      <Card.Meta>
        {description ? description : "There's nothing here yet"}
      </Card.Meta>
      <Card.Description>
        <Placeholder>
          <Placeholder.Header>
            <Placeholder.Line length="very short" />
            <Placeholder.Line length="medium" />
          </Placeholder.Header>
          <Placeholder.Paragraph>
            <Placeholder.Line length="short" />
          </Placeholder.Paragraph>
        </Placeholder>
      </Card.Description>
    </Card.Content>
  </Card>
);
