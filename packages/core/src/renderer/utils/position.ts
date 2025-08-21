import { Schema } from "effect";

export const PositionStatic = Schema.Literal(0).pipe(Schema.brand("PositionStatic"));
export type PositionStatic = typeof PositionStatic.Type;
export const isPositionStatic = Schema.is(PositionStatic);
export const PositionRelative = Schema.Literal(1).pipe(Schema.brand("PositionRelative"));
export type PositionRelative = typeof PositionRelative.Type;
export const isPositionRelative = Schema.is(PositionRelative);
export const PositionAbsolute = Schema.Literal(2).pipe(Schema.brand("PositionAbsolute"));
export type PositionAbsolute = typeof PositionAbsolute.Type;
export const isPositionAbsolute = Schema.is(PositionAbsolute);

export const PositionTypeString = Schema.Union(PositionStatic, PositionRelative, PositionAbsolute);
export type PositionTypeString = typeof PositionTypeString.Type;
export const isPositionTypeString = Schema.is(PositionTypeString);

export const PositionType = Schema.Union(PositionStatic, PositionRelative, PositionAbsolute);
export type PositionType = typeof PositionType.Type;
export const isPositionType = Schema.is(PositionType);

export const Percentage = Schema.TemplateLiteral(Schema.Number, Schema.Literal("%"));
export type Percentage = typeof Percentage.Type;
export const isPercentage = Schema.is(Percentage);

export const PercentageNumberMixed = Schema.Union(Percentage, Schema.Number);
export type PercentageNumberMixed = typeof PercentageNumberMixed.Type;
export const isPercentageNumberMixed = Schema.is(PercentageNumberMixed);

export const PositionInput = Schema.Union(Schema.Number, Percentage, Schema.Literal("auto"));
export type PositionInput = typeof PositionInput.Type;
export const isPositionInput = Schema.is(PositionInput);

export const PositionRecord = Schema.Record({
  key: Schema.String,
  value: PositionInput,
});
export type PositionRecord = typeof PositionRecord.Type;
export const isPositionRecord = Schema.is(PositionRecord);

export const Position = Schema.Struct({
  left: Schema.optional(PositionInput),
  top: Schema.optional(PositionInput),
  bottom: Schema.optional(PositionInput),
  right: Schema.optional(PositionInput),
});
export type Position = typeof Position.Type;

export const FlexBasis = Schema.Union(Schema.Number, Schema.Literal("auto"));
export type FlexBasis = typeof FlexBasis.Type;
export const isFlexBasis = Schema.is(FlexBasis);

export const Dimension = PositionInput;
export type Dimension = typeof Dimension.Type;
export const isDimension = Schema.is(Dimension);

export const Size = Schema.Union(Schema.Number, Percentage);
export type Size = typeof Size.Type;
export const isSize = Schema.is(Size);

export const Margin = PositionInput;
export type Margin = typeof Margin.Type;
export const isMargin = Schema.is(Margin);

export const Padding = Schema.Union(Schema.Number, Percentage);
export type Padding = typeof Padding.Type;
export const isPadding = Schema.is(Padding);
