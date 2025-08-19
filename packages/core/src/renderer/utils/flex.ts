import { Schema } from "effect";

export const FlexColumn = Schema.Literal(0).pipe(Schema.brand("FlexColumn"));
export type FlexColumn = typeof FlexColumn.Type;

export const FlexRow = Schema.Literal(2).pipe(Schema.brand("FlexRow"));
export type FlexRow = typeof FlexRow.Type;

export const FlexColumnReverse = Schema.Literal(1).pipe(Schema.brand("FlexColumnReverse"));
export type FlexColumnReverse = typeof FlexColumnReverse.Type;

export const FlexRowReverse = Schema.Literal(3).pipe(Schema.brand("FlexRowReverse"));
export type FlexRowReverse = typeof FlexRowReverse.Type;

export const FlexDirection = Schema.Union(FlexColumn, FlexRow, FlexColumnReverse, FlexRowReverse);
export type FlexDirection = typeof FlexDirection.Type;
