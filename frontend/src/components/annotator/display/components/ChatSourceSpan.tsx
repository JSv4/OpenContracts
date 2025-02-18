import { FC, useEffect, useRef } from "react";
import styled from "styled-components";

/**
 * If you need text-based highlighting, ensure your
 * ChatMessageSource includes a `text` prop.
 * For brevity, we'll just pass in an object with `id` and `text` below.
 */
interface ChatSourceSpanProps {
  source: {
    id: string;
    text: string;
  };
  hidden: boolean;
  scrollIntoView?: boolean;
}

const SpanHighlight = styled.span<{ hidden: boolean }>`
  background-color: ${(props) => (props.hidden ? "transparent" : "#ffed99")};
  border-radius: 4px;
  padding: 0 2px;
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
