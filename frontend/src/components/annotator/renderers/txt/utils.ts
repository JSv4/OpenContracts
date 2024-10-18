// src/utils.ts
import { Annotation } from "./span";

export const mapTokensWithAnnotations = (
  tokens: string[],
  annotations: Annotation[],
  visibleTags?: string[]
): Array<{ i: number; content: string; annotations: Annotation[] }> => {
  const tokenAnnotations = tokens.map((token, i) => ({
    i,
    content: token,
    annotations: [] as Annotation[],
  }));

  for (const annotation of annotations) {
    if (visibleTags && !visibleTags.includes(annotation.tag)) continue;

    for (let i = annotation.start; i < annotation.end; i++) {
      if (tokenAnnotations[i]) {
        tokenAnnotations[i].annotations.push(annotation);
      }
    }
  }

  return tokenAnnotations;
};

export const blendColors = (colors: string[]): string => {
  if (colors.length === 1) return colors[0];

  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of colors) {
    const c = hexToRgb(color);
    r += c.r;
    g += c.g;
    b += c.b;
  }
  r = Math.round(r / colors.length);
  g = Math.round(g / colors.length);
  b = Math.round(b / colors.length);
  return `rgb(${r}, ${g}, ${b})`;
};

/**
 * Converts a hex color to an RGB object
 * @param hex - The hex color string (e.g., "#FF0000" or "#F00")
 * @returns An object with r, g, b number values
 */
const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  hex = hex.replace("#", "");
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
};

/**
 * Converts a hex color to an RGBA color string
 * @param hex - The hex color string (e.g., "#FF0000" or "#F00")
 * @param alpha - The opacity value (0 to 1)
 * @returns An RGBA color string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const selectionIsEmpty = (selection: Selection) => {
  let position =
    selection?.anchorNode && selection?.focusNode
      ? selection.anchorNode.compareDocumentPosition(selection.focusNode)
      : 0;
  return position === 0 && selection.focusOffset === selection.anchorOffset;
};

export const selectionIsBackwards = (selection: Selection) => {
  if (selectionIsEmpty(selection)) return false;

  let position =
    selection?.anchorNode && selection?.focusNode
      ? selection.anchorNode.compareDocumentPosition(selection.focusNode)
      : null;
  let backward = false;
  if (
    (!position && selection.anchorOffset > selection.focusOffset) ||
    position === Node.DOCUMENT_POSITION_PRECEDING
  )
    backward = true;

  return backward;
};
