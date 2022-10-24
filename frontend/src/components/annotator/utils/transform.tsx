import { AnalyzerManifestType } from "../../../graphql/types";
import { BoundingBox } from "../../types";

import default_analyzer_icon from "../../../assets/icons/noun-quill-31093.png";

export function extractIconSrcFromAnalyzerManifest(
  manifest: AnalyzerManifestType | null
): string {
  /**
   * Given a Gremlin Analyzer Manifest type, extract an icon src string we can drop into an image component
   * TODO - give the analyzer its own image field so we don't need to look into the labelsets optional image fields.
   */
  if (manifest?.label_set?.icon_data && manifest?.label_set?.icon_name) {
    let icon_extension = manifest.label_set.icon_name.split(",")[1];
    return `data:image/${icon_extension};base64,${manifest.label_set.icon_data}`;
  } else {
    return default_analyzer_icon;
  }
}

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
