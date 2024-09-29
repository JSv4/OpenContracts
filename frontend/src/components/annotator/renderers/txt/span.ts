export interface Span {
  start: number;
  end: number;
}

export interface Annotation extends Span {
  tag: string;
  color?: string;
}
