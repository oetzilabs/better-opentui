// https://github.com/sst/opentui/blob/main/src/types.ts
// converted to Effect
import { Brand, Schema } from "effect";

export const None = Schema.Literal(0).pipe(Schema.brand("None"));
export const Bold = Schema.Literal(1).pipe(Schema.brand("Bold"));
export const Dim = Schema.Literal(2).pipe(Schema.brand("Dim"));
export const Italic = Schema.Literal(4).pipe(Schema.brand("Italic"));
export const Underline = Schema.Literal(8).pipe(Schema.brand("Underline"));
export const Blink = Schema.Literal(16).pipe(Schema.brand("Blink"));
export const Inverse = Schema.Literal(32).pipe(Schema.brand("Inverse"));
export const Hidden = Schema.Literal(64).pipe(Schema.brand("Hidden"));
export const Strikethrough = Schema.Literal(128).pipe(
  Schema.brand("Strikethrough")
);

export type None = typeof None.Type;
export type Bold = typeof Bold.Type;
export type Dim = typeof Dim.Type;
export type Italic = typeof Italic.Type;
export type Underline = typeof Underline.Type;
export type Blink = typeof Blink.Type;
export type Inverse = typeof Inverse.Type;
export type Hidden = typeof Hidden.Type;
export type Strikethrough = typeof Strikethrough.Type;

export const Collection = {
  None,
  Bold,
  Dim,
  Italic,
  Underline,
  Blink,
  Inverse,
  Hidden,
  Strikethrough,
};

export const Input = Schema.Union(
  None,
  Bold,
  Dim,
  Italic,
  Underline,
  Blink,
  Inverse,
  Hidden,
  Strikethrough
);

export type Input = typeof Input.Type;

export const create = (attributes: Input) => Brand.nominal<Input>()(attributes);
