import { color, chartingColor, Color, RGB } from "./colors";
import { fontWeight } from "./fonts";
import { spacing } from "./spacing";

// when adding more, consider what material and ant have done:
// https://material-ui.com/customization/default-theme/
// https://github.com/ant-design/ant-design/blob/master/components/style/themes/default.less
const Default = {
  chartingColor,
  color,
  fontWeight,
  spacing,
};

export type OsLegalTheme = typeof Default;

export const Theme = {
  default: Default,
};

export { Color, RGB };
