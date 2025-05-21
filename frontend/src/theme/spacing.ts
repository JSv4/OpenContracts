export class Spacing {
  // eslint-disable-next-line no-useless-constructor, no-empty-function
  constructor(public px: string) {}

  static fromPixels(px: number) {
    return new Spacing(`${px}px`);
  }

  toString() {
    return this.px;
  }

  getValue() {
    return parseFloat(this.px);
  }
}

export interface SpacingMap {
  [foo: string]: Spacing;
}

export const spacing: Record<string, string> = {
  xxs: "4px",
  xs2: "4px",
  xs: "8px",
  sm: "12px",
  md: "16px",
  lg: "24px",
  xl: "36px",
  xl2: "48px",
  xl3: "64px",
  xl4: "96px",
  xl5: "128px",
};
