import styled from "styled-components";

export interface HasWidth {
  width: string;
}

export const WithSidebar = styled.div<HasWidth>(
  ({ width }) => `
      display: grid;
      height: 90vh;
      padding-left: ${width};
  `
);

export const sidebarWidth = "400px";
