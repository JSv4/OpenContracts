import { FC, useEffect, useRef } from "react";
import styled from "styled-components";
import { ChatSourceSpanResult } from "../../context/ChatSourceAtom";

interface ChatSourceSpanProps {
  source: ChatSourceSpanResult;
  hidden: boolean;
  scrollIntoView?: boolean;
}

const SpanHighlight = styled.span<{ hidden: boolean }>`
  background-color: ${({ hidden }) =>
    hidden ? "transparent" : "rgba(92,124,157,0.3)"};
  transition: background-color 0.2s ease;
`;

export const ChatSourceSpan: FC<ChatSourceSpanProps> = ({
  source,
  hidden,
  scrollIntoView = false,
}) => {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (scrollIntoView && spanRef.current) {
      spanRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [scrollIntoView]);

  return (
    <SpanHighlight ref={spanRef} id={source.id} hidden={hidden}>
      {source.text}
    </SpanHighlight>
  );
};
