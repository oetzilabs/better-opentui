import { Effect } from "effect";
import type { BorderSides } from "./renderer/utils/border";
import * as TextAttributes from "./textattributes";

export const createTextAttributes = Effect.fn(function* ({
  bold = false,
  italic = false,
  underline = false,
  dim = false,
  blink = false,
  inverse = false,
  hidden = false,
  strikethrough = false,
}: {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
  blink?: boolean;
  inverse?: boolean;
  hidden?: boolean;
  strikethrough?: boolean;
} = {}) {
  let attributes: number = TextAttributes.None.make(0);

  if (bold) attributes |= TextAttributes.Bold.make(1);
  if (italic) attributes |= TextAttributes.Italic.make(4);
  if (underline) attributes |= TextAttributes.Underline.make(8);
  if (dim) attributes |= TextAttributes.Dim.make(2);
  if (blink) attributes |= TextAttributes.Blink.make(16);
  if (inverse) attributes |= TextAttributes.Inverse.make(32);
  if (hidden) attributes |= TextAttributes.Hidden.make(64);
  if (strikethrough) attributes |= TextAttributes.Strikethrough.make(128);

  return attributes;
});

// Pack drawing options into a single u32
// bits 0-3: borderSides, bit 4: shouldFill, bits 5-6: titleAlignment
export const packDrawOptions = Effect.fn(function* (
  border: boolean | BorderSides[],
  shouldFill: boolean,
  titleAlignment: "left" | "center" | "right",
) {
  let packed = 0;

  if (border === true) {
    packed |= 0b1111; // All sides
  } else if (Array.isArray(border)) {
    if (border.includes("top")) packed |= 0b1000;
    if (border.includes("right")) packed |= 0b0100;
    if (border.includes("bottom")) packed |= 0b0010;
    if (border.includes("left")) packed |= 0b0001;
  }

  if (shouldFill) {
    packed |= 1 << 4;
  }

  const alignmentMap: Record<string, number> = {
    left: 0,
    center: 1,
    right: 2,
  };
  const alignment = alignmentMap[titleAlignment];
  packed |= alignment << 5;

  return packed;
});
