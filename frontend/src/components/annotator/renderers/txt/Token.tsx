import React from "react";

interface TokenProps {
  i: number;
  content: string;
}

const Token: React.FC<TokenProps> = ({ i, content }) => (
  <span data-i={i}>{content} </span>
);

export default Token;
