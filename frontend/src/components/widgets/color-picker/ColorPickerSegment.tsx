import { Segment } from "semantic-ui-react";
import { Sketch } from "@uiw/react-color";

interface ColorPickerSegmentProps {
  color: string;
  setColor: (color: { hex: string }) => void;
  style?: Record<string, any>;
}

export const ColorPickerSegment = ({
  color,
  setColor,
  style,
}: ColorPickerSegmentProps) => {
  return (
    <Segment style={style ? style : { width: "20vw" }}>
      <Sketch color={color} onChange={setColor} />
    </Segment>
  );
};
