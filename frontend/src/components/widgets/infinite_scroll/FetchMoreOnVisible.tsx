import { useEffect } from "react";
import { useInView } from "react-cool-inview";

interface FetchMoreOnVisibleProps {
  fetchNextPage?: () => void | any;
  fetchPreviousPage?: () => void | any;
  triggerOnce?: boolean;
  fetchWithoutMotion?: boolean;
  threshold?: number;
  style?: Record<any, any>;
}

// Suggest this library for directionality:
// https://github.com/wellyshen/react-cool-inview

export const FetchMoreOnVisible = ({
  fetchNextPage,
  fetchPreviousPage,
  triggerOnce,
  threshold = 0.25,
  fetchWithoutMotion,
  style,
}: FetchMoreOnVisibleProps) => {
  const {
    observe,
    unobserve,
    inView,
    scrollDirection: { vertical },
    entry,
  } = useInView({
    threshold, // Default is 0
    unobserveOnEnter: triggerOnce,
  });

  // NOTE - react-cool-inview's definition of vertical scroll direction - e.g. up or down -
  // is the opposite of what I'd use. When you're scrolling "up" the document - e.g. from higher
  // numbered pages to lower numbered pages, that is defined as "down". I guess that makes sense
  // because the canvas itself is moving from top to bottom of screen.

  useEffect(() => {
    if (inView && vertical === undefined && fetchWithoutMotion) {
      if (fetchNextPage !== undefined) {
        fetchNextPage();
      } else if (fetchPreviousPage !== undefined) {
        fetchPreviousPage();
      }
    } else if (inView && vertical !== undefined) {
      if (vertical === "up" && fetchNextPage !== undefined) {
        fetchNextPage();
      } else if (vertical === "down" && fetchPreviousPage !== undefined) {
        fetchPreviousPage();
      }
    }
  }, [entry, vertical, inView]);

  return (
    <div
      style={{
        height: "1px",
        ...(style ? style : {}),
      }}
      ref={observe}
      className="FetchMoreOnVisible"
    />
  );
};
