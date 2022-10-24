import { Popup } from "semantic-ui-react";

export const TruncatedText = ({
  text,
  limit,
}: {
  text: string;
  limit: number;
}) => {
  if (text.length > limit) {
    return (
      <Popup
        content={text}
        trigger={<p>{`${text.slice(0, limit).trim()}…`}</p>}
      />
    );
  }
  return <p>{text}</p>;
};
