import { Renderable, type RenderableService } from "@opentuee/ui/src/components/renderable";
import * as Renderables from "@opentuee/ui/src/components/renderables";
import { Context, Effect } from "effect";
import { Align, Edge, FlexDirection, Justify, PositionType } from "yoga-layout";
import { FailedToSetFlexDirection } from "./errors";
import { type TrackedNodeService } from "./lib/trackednode";
import type { ILayoutElement, Position } from "./types";

export { Align, Edge, FlexDirection, Justify, PositionType };

export type LayoutElementService = RenderableService & {
  id: string;
  layoutNode: TrackedNodeService<{
    renderable: RenderableService;
  }>;
  parentLayout: any | null;
  setParentLayout: (layout: any | null) => Effect.Effect<void>;
  setPosition: (position: Position) => Effect.Effect<void>;
  setFlex: (grow?: number, shrink?: number) => Effect.Effect<void>;
  setFlexDirection: (direction: FlexDirection) => Effect.Effect<void, FailedToSetFlexDirection>;
  setAlignment: (alignItems?: Align, justifyContent?: Justify) => Effect.Effect<void>;
  setFlexBasis: (basis: number | "auto") => Effect.Effect<void>;
  setWidth: (width: number | "auto" | `${number}%`) => Effect.Effect<void>;
  setHeight: (height: number | "auto" | `${number}%`) => Effect.Effect<void>;
  setMinWidth: (minWidth: number) => Effect.Effect<void>;
  setMaxWidth: (maxWidth: number) => Effect.Effect<void>;
  setMinHeight: (minHeight: number) => Effect.Effect<void>;
  setMaxHeight: (maxHeight: number) => Effect.Effect<void>;
  getLayoutNode: () => Effect.Effect<
    TrackedNodeService<{
      renderable: RenderableService;
    }>
  >;
  updateFromLayout: () => Effect.Effect<void>;
  add: (obj: ILayoutElement | Renderable) => Effect.Effect<void>;
  remove: (id: string) => Effect.Effect<void>;
  getComputedLayout: () => Effect.Effect<any>;
  getWidth: () => Effect.Effect<number>;
  getHeight: () => Effect.Effect<number>;
  destroySelf: () => Effect.Effect<void>;
  requestLayout: () => Effect.Effect<void>;
};

export class LayoutElement extends Context.Tag("Layoutelement")<LayoutElement, LayoutElementService>() {}

export interface LayoutOptions {
  type?: Renderables.Type;
  width?: number | "auto" | `${number}%`;
  height?: number | "auto" | `${number}%`;
  flexGrow?: number;
  flexShrink?: number;
  flexDirection?: FlexDirection;
  alignItems?: Align;
  justifyContent?: Justify;
  positionType?: "absolute" | "relative";
  position?: Position;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  margin?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
}
