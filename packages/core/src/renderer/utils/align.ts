import { Schema } from "effect";

export const AlignAuto = Schema.Literal(0).pipe(Schema.brand("AlignAuto"));
export type AlignAuto = typeof AlignAuto.Type;

export const AlignFlexStart = Schema.Literal(1).pipe(Schema.brand("AlignFlexStart"));
export type AlignFlexStart = typeof AlignFlexStart.Type;

export const AlignCenter = Schema.Literal(2).pipe(Schema.brand("AlignCenter"));
export type AlignCenter = typeof AlignCenter.Type;

export const AlignFlexEnd = Schema.Literal(3).pipe(Schema.brand("AlignFlexEnd"));
export type AlignFlexEnd = typeof AlignFlexEnd.Type;

export const AlignStretch = Schema.Literal(4).pipe(Schema.brand("AlignStretch"));
export type AlignStretch = typeof AlignStretch.Type;

export const AlignBaseline = Schema.Literal(5).pipe(Schema.brand("AlignBaseline"));
export type AlignBaseline = typeof AlignBaseline.Type;

export const AlignSpaceBetween = Schema.Literal(6).pipe(Schema.brand("AlignSpaceBetween"));
export type AlignSpaceBetween = typeof AlignSpaceBetween.Type;

export const AlignSpaceAround = Schema.Literal(7).pipe(Schema.brand("AlignSpaceAround"));
export type AlignSpaceAround = typeof AlignSpaceAround.Type;

export const AlignSpaceEvenly = Schema.Literal(8).pipe(Schema.brand("AlignSpaceEvenly"));
export type AlignSpaceEvenly = typeof AlignSpaceEvenly.Type;

export const Align = Schema.Union(
  AlignAuto,
  AlignFlexStart,
  AlignCenter,
  AlignFlexEnd,
  AlignStretch,
  AlignBaseline,
  AlignSpaceBetween,
  AlignSpaceAround,
  AlignSpaceEvenly,
);
export type Align = typeof Align.Type;
