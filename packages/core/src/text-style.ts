import { type Input } from "./colors";

export interface StyleAttrs {
  fg?: Input;
  bg?: Input;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  reverse?: boolean;
  blink?: boolean;
}

export interface StyledChar {
  char: string;
  style: StyleAttrs;
}

export type StyledText = StyledChar[];
