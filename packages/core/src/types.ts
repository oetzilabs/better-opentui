import { Effect, Ref, Schema } from "effect";

export const DebugTopLeft = Schema.Literal(0).pipe(Schema.brand("DebugTopLeft"));
export const DebugTopRight = Schema.Literal(1).pipe(Schema.brand("DebugTopRight"));
export const DebugBottomLeft = Schema.Literal(2).pipe(Schema.brand("DebugBottomLeft"));
export const DebugBottomRight = Schema.Literal(3).pipe(Schema.brand("DebugBottomRight"));

export type DebugTopLeft = typeof DebugTopLeft.Type;
export type DebugTopRight = typeof DebugTopRight.Type;
export type DebugBottomLeft = typeof DebugBottomLeft.Type;
export type DebugBottomRight = typeof DebugBottomRight.Type;

export const DebugOverlayCorner = Schema.Union(DebugTopLeft, DebugTopRight, DebugBottomLeft, DebugBottomRight);

export type DebugOverlayCorner = typeof DebugOverlayCorner.Type;

export interface SelectionState {
  anchor: { x: number; y: number };
  focus: { x: number; y: number };
  isActive: boolean;
  isSelecting: boolean;
}

export type WidthMethod = "wcwidth" | "unicode";
