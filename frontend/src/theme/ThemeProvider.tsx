import React, { useLayoutEffect, useMemo, useState } from "react";
import { ThemeProvider as SCThemeProvider } from "styled-components";

import { Theme } from "./theme";
import type { DefaultTheme } from "styled-components";

interface Props {
  /** If omitted the library default is used. */
  theme?: DefaultTheme;
  children: React.ReactNode | React.ReactNodeArray;
}

export const ThemeProvider = ({ theme, children }: Props): JSX.Element => {
  /* 1 ▸ Design-time tokens */
  const baseTheme = theme ?? Theme.default;

  /* 2 ▸ Runtime token – viewport width */
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 0
  );

  useLayoutEffect(() => {
    const handleResize = (): void => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* 3 ▸ Merge run-time + design tokens once per change */
  const mergedTheme: DefaultTheme = useMemo(
    () => ({ ...baseTheme, width: viewportWidth }),
    [baseTheme, viewportWidth]
  );

  return <SCThemeProvider theme={mergedTheme}>{children}</SCThemeProvider>;
};
