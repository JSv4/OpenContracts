import { SemanticWIDTHSNUMBER } from "semantic-ui-react";

export const determineCardColCount = (
  viewport_width: number
): SemanticWIDTHSNUMBER => {
  let card_col_count: SemanticWIDTHSNUMBER = Math.ceil(
    viewport_width / 400
  ) as SemanticWIDTHSNUMBER;

  if (card_col_count < 1) {
    return 1;
  } else if (card_col_count > 16) {
    return 16;
  } else if (
    card_col_count in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
  ) {
    return card_col_count;
  } else {
    return 4;
  }
};
