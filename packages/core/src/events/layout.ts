import { Schema } from "effect";

// export enum LayoutEvents {
//   LAYOUT_CHANGED = "layout-changed",
//   ELEMENT_ADDED = "element-added",
//   ELEMENT_REMOVED = "element-removed",
//   RESIZED = "resized",
// }

export const LayoutChanged = Schema.Literal("layout-changed").pipe(Schema.brand("layout-changed"));
export type LayoutChanged = typeof LayoutChanged.Type;
export const ElementAdded = Schema.Literal("element-added").pipe(Schema.brand("element-added"));
export type ElementAdded = typeof ElementAdded.Type;
export const ElementRemoved = Schema.Literal("element-removed").pipe(Schema.brand("element-removed"));
export type ElementRemoved = typeof ElementRemoved.Type;
export const Resized = Schema.Literal("resized").pipe(Schema.brand("resized"));
export type Resized = typeof Resized.Type;

export const LayoutEvents = Schema.Union(LayoutChanged, ElementAdded, ElementRemoved, Resized);
export type LayoutEvents = typeof LayoutEvents.Type;
