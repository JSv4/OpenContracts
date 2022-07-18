import styled from "styled-components";
import { hexToRgb } from "../../../theme/colors";

export const VerticallyCenteredDiv = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0px;
`;

export const VerticallyJustifiedEndFluidDiv = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  margin: 0px;
  flex: 1;
`;

export const VerticallyJustifiedStartFluidDiv = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  margin: 0px;
  flex: 1;
`;

export const VerticallyJustifiedEndDiv = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  margin: 0px;
`;

export const HorizontallyCenteredDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  margin: 0px;
`;

export const HorizontallyJustifiedDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  margin: 0px;
`;

interface HorizontallyJustifiedEndDivProps {
  color?: string;
  hidden?: boolean;
}

export const HorizontallyJustifiedEndDiv =
  styled.div<HorizontallyJustifiedEndDivProps>(({ color, hidden }) => {
    if (hidden) {
      return `
      display: none;
      flex-direction: row;
      justify-content: flex-end;
      margin: 0px;
    `;
    } else {
      if (color) {
        return `
          display: flex;
          flex-direction: row;
          justify-content: flex-end;
          margin: 0px;
          background: ${color}
        `;
      }
      return `
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
        margin: 0px;
      `;
    }
  });

export const HorizontallyJustifiedStartDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  margin: 0px;
`;

export const HorizontallyJustifiedStartFluidDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  flex: 1;
  margin: 0px;
`;

export const FullWidthHorizontallyCenteredDiv = styled.div`
  display: flex;
  width: 100%;
  flex-direction: row;
  justify-content: center;
  margin: 0px;
`;
