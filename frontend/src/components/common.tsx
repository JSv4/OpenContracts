import styled from "styled-components";
import { HideableHasWidth } from "./annotator";

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

export const MobileFilterWrapper = styled.div`
  display: flex;
  flex-direction column;
  justify-content: flex-start;
  align-items: center;
  flex: 1;
`;

export const SidebarContainer = styled.div<HideableHasWidth>(
  ({ width, display }) => ({
    width,
    padding: ".25rem",
    background: "gray",
    color: "black",
    margin: 0,
    fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
      "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue",
      sans-serif`,
    height: "90vh",
    ...(display ? { display } : {}),
  })
);
