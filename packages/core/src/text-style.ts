import * as Colors from "./colors";

export interface StyleAttrs {
  fg?: Colors.Input;
  bg?: Colors.Input;
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
