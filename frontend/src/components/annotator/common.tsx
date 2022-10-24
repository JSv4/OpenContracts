import styled from "styled-components";

export interface HideableHasWidth {
  width: string | number;
  display?: string;
}

export const WithSidebar = styled.div<HideableHasWidth>(
  ({ width }) => `
      display: grid;
      height: 90vh;
      padding-left: ${width};
  `
);

export const sidebarWidth = "400px";
