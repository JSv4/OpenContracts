import { Item, Placeholder } from "semantic-ui-react";

interface PlaceholderItemProps {
  title?: string;
  subtitle?: string;
  description?: string;
  image_src?: string;
}

export const PlaceholderItem = ({
  title,
  subtitle,
  description,
  image_src,
}: PlaceholderItemProps) => {
  return (
    <Item>
      {image_src ? (
        <Item.Image size="tiny" src={image_src} />
      ) : (
        <Placeholder>
          <Placeholder.Image square />
        </Placeholder>
      )}

      <Item.Content>
        <Item.Header>{title ? title : <Placeholder.Line />}</Item.Header>
        <Item.Meta>
          {subtitle ? <span>{subtitle}</span> : <Placeholder.Line />}
        </Item.Meta>
        <Item.Description>
          {description ? (
            description
          ) : (
            <Placeholder.Paragraph>
              <Placeholder.Line />
              <Placeholder.Line />
              <Placeholder.Line />
            </Placeholder.Paragraph>
          )}
        </Item.Description>
      </Item.Content>
    </Item>
  );
};
