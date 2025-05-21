/**
 * Global module augmentation for styled-components.
 *
 * ALWAYS keep this interface in sync with the object returned from
 * ThemeProvider (src/theme/ThemeProvider.tsx).
 */
import "styled-components";
import type { OsLegalTheme } from "./theme";

declare module "styled-components" {
  /**
   * Design/runtime tokens made available through our ThemeProvider.
   *
   * Keep in sync with `src/theme/ThemeProvider.tsx`.
   */
  export interface DefaultTheme extends OsLegalTheme {
    /**
     * Spacing scale – every key ultimately resolves to a CSS-safe value (string).
     */
    spacing: Record<string, string>;

    /** Runtime viewport width (px) injected by ThemeProvider */
    width: number;

    /* add further design-tokens here as you extend the theme */
  }
}
