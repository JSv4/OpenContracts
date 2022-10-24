import React from "react";
import { Card, Placeholder } from "semantic-ui-react";

interface PlaceholderCardProps {
  title?: string;
  description?: string;
  include_image?: boolean;
  style?: object;
  image_style?: object;
}

export const PlaceholderCard = ({
  title,
  include_image,
  description,
  style,
  image_style,
}: PlaceholderCardProps) => (
  <Card raised key="Placeholder Card" style={style ? style : {}}>
    {include_image ? (
      <Placeholder className="PlaceholderCardImageDiv" fluid>
        <Placeholder.Image style={image_style ? image_style : {}} />
      </Placeholder>
    ) : (
      <></>
    )}
    <Card.Content>
      <Card.Meta>
        {title ? (
          title
        ) : (
          <Placeholder>
            <Placeholder.Header>
              <Placeholder.Line length="very short" />
            </Placeholder.Header>
          </Placeholder>
        )}
      </Card.Meta>
      <Card.Description>
        {description ? (
          description
        ) : (
          <Placeholder>
            <Placeholder.Header>
              <Placeholder.Line length="very short" />
              <Placeholder.Line length="medium" />
            </Placeholder.Header>
            <Placeholder.Paragraph>
              <Placeholder.Line length="short" />
            </Placeholder.Paragraph>
          </Placeholder>
        )}
      </Card.Description>
    </Card.Content>
  </Card>
);
