import { Schema } from "effect";

export const JustifyFlexStart = Schema.Literal(0).pipe(Schema.brand("JustifyFlexStart"));
export type JustifyFlexStart = typeof JustifyFlexStart.Type;

export const JustifyCenter = Schema.Literal(1).pipe(Schema.brand("JustifyCenter"));
export type JustifyCenter = typeof JustifyCenter.Type;

export const JustifyFlexEnd = Schema.Literal(2).pipe(Schema.brand("JustifyFlexEnd"));
export type JustifyFlexEnd = typeof JustifyFlexEnd.Type;

export const JustifySpaceBetween = Schema.Literal(3).pipe(Schema.brand("JustifySpaceBetween"));
export type JustifySpaceBetween = typeof JustifySpaceBetween.Type;

export const JustifySpaceAround = Schema.Literal(4).pipe(Schema.brand("JustifySpaceAround"));
export type JustifySpaceAround = typeof JustifySpaceAround.Type;

export const JustifySpaceEvenly = Schema.Literal(5).pipe(Schema.brand("JustifySpaceEvenly"));
export type JustifySpaceEvenly = typeof JustifySpaceEvenly.Type;

export const Justify = Schema.Union(
  JustifyFlexStart,
  JustifyCenter,
  JustifyFlexEnd,
  JustifySpaceBetween,
  JustifySpaceAround,
  JustifySpaceEvenly,
);
export type Justify = typeof Justify.Type;
