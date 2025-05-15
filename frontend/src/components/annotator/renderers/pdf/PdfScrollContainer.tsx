import React, { useRef, useEffect } from "react";
import { useScrollContainerRef } from "../../context/DocumentAtom";

/**
 * Provides a scrollable container and publishes its ref to
 * `scrollContainerRefAtom`, so the virtual-window in PDF.tsx
 * can use the correct element.
 *
 * Wrap the <PDF /> component (or whatever renders the pages) with this.
 */
export const PdfScrollContainer: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const localRef = useRef<HTMLDivElement>(null);
  const { setScrollContainerRef } = useScrollContainerRef();

  /* Register once on mount, clear on unmount */
  useEffect(() => {
    setScrollContainerRef(localRef);
    return () => setScrollContainerRef(null);
  }, [setScrollContainerRef]);

  return (
    <div
      id="pdf-container"
      ref={localRef}
      style={{ overflowY: "auto", height: "100%" }}
    >
      {children}
    </div>
  );
};
