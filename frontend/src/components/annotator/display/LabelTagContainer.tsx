import { LabelDisplayBehavior } from "../../../graphql/types";
import { HorizontallyJustifiedEndDiv } from "../sidebar/common";

export const LabelTagContainer = ({
  hovered,
  color,
  display_behavior,
  children,
}: {
  hovered: boolean;
  color?: string;
  display_behavior?: LabelDisplayBehavior;
  children: React.ReactNode;
}) => {
  let display = true;
  if (display_behavior === LabelDisplayBehavior.HIDE) {
    display = false;
  } else if (display_behavior === LabelDisplayBehavior.ON_HOVER) {
    display = hovered;
  }

  return (
    <HorizontallyJustifiedEndDiv color={color} hidden={!display}>
      {children}
    </HorizontallyJustifiedEndDiv>
  );
};
