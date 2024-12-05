import React from "react";
import { Popup } from "semantic-ui-react";

interface TruncatedTextProps {
  text: string;
  limit: number;
}

export const TruncatedText: React.FC<TruncatedTextProps> = ({
  text,
  limit,
}) => {
  const shouldTruncate = text.length > limit;

  const truncatedText = shouldTruncate
    ? `${text.slice(0, limit).trim()}…`
    : text;

  return shouldTruncate ? (
    <Popup
      content={
        <div
          style={{
            maxWidth: "400px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </div>
      }
      trigger={
        <div
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            cursor: "pointer",
          }}
        >
          {truncatedText}
        </div>
      }
      position="top center"
      hoverable
    />
  ) : (
    <div
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {text}
    </div>
  );
};
