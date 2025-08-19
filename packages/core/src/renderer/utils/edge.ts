// export declare enum Edge {
//   Left = 0,
//   Top = 1,
//   Right = 2,
//   Bottom = 3,
//   Start = 4,
//   End = 5,
//   Horizontal = 6,
//   Vertical = 7,
//   All = 8,
// }

import { Schema } from "effect";

export const Left = Schema.Literal(0).pipe(Schema.brand("Left"));
export type Left = typeof Left.Type;
export const Top = Schema.Literal(1).pipe(Schema.brand("Top"));
export type Top = typeof Top.Type;
export const Right = Schema.Literal(2).pipe(Schema.brand("Right"));
export type Right = typeof Right.Type;
export const Bottom = Schema.Literal(3).pipe(Schema.brand("Bottom"));
export type Bottom = typeof Bottom.Type;
export const Start = Schema.Literal(4).pipe(Schema.brand("Start"));
export type Start = typeof Start.Type;
export const End = Schema.Literal(5).pipe(Schema.brand("End"));
export type End = typeof End.Type;
export const Horizontal = Schema.Literal(6).pipe(Schema.brand("Horizontal"));
export type Horizontal = typeof Horizontal.Type;
export const Vertical = Schema.Literal(7).pipe(Schema.brand("Vertical"));
export type Vertical = typeof Vertical.Type;
export const All = Schema.Literal(8).pipe(Schema.brand("All"));
export type All = typeof All.Type;

export const Edge = Schema.Union(Left, Top, Right, Bottom, Start, End, Horizontal, Vertical, All);
export type Edge = typeof Edge.Type;
