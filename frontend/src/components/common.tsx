import styled from "styled-components";
import { HasWidth } from "./annotator";

export const OSLegalTheme = {
  main: "mediumseagreen",
};

export const VerticallyCenteredDiv = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
`;

export const FilterWrapper = styled.div`
    display: flex;
    flex-direction row;
    justify-content: flex-end;
    align-items: center;
    flex: 1;
`;

export const SidebarContainer = styled.div<HasWidth>(
  ({ width }) => `
      width: ${width};
      position: fixed;
      padding: .5rem;
      left: 0;
      background: gray;
      color: black;
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
          "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
          sans-serif;
      height: 90vh;
  `
);
