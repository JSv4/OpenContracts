import { Segment } from "semantic-ui-react";
import { SliderPicker } from "react-color";

interface ColorPickerSegmentProps {
  color: string;
  setColor: (args: any) => void | any;
  style?: Record<string, any>;
}

export const ColorPickerSegment = ({
  color,
  setColor,
  style,
}: ColorPickerSegmentProps) => {
  return (
    <Segment style={style ? style : { width: "20vw" }}>
      <SliderPicker color={color} onChangeComplete={setColor} />
    </Segment>
  );
};
