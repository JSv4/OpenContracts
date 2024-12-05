import styled from "styled-components";

export interface HideableHasWidth {
  width: string | number;
  display?: string;
}

export const WithSidebar = styled.div<HideableHasWidth>(({ width }) => {
  console.log("WithSidebar rendering with width:", width);
  return `
      display: grid;
      grid-template-columns: ${width} 1fr;
      grid-template-areas: "sidebar main";
      height: 90vh;
      width: 100%;
      position: relative;
    `;
});

export const sidebarWidth = "400px";
