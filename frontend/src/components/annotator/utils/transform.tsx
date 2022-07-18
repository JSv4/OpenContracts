import { BoundingBox } from "../../types";

export function getBorderWidthFromBounds(bounds: BoundingBox): number {
  //
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width < 100 || height < 100) {
    return 1;
  } else {
    return 3;
  }
}

export function hexToRgb(hex: string) {
  // For shortsighted reasons, the color stored is missing #. Check first to see if number is missing hex, if so
  // add it and THEN run the
  try {
    let color_str = hex.substring(0, 1) !== "#" ? "#" + hex : hex;

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color_str);
    if (!result) {
      throw new Error("Unable to parse color.");
    }
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  } catch {
    return {
      r: 255,
      g: 255,
      b: 0,
    };
  }
}
