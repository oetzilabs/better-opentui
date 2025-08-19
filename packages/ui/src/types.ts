import { Ref, Schema, type Effect } from "effect";
import type { Align, Config, FlexDirection, Justify } from "yoga-layout";
import type { RenderableProperties, RenderableService } from "./components/renderable";
import * as Renderables from "./components/renderables";
import type { TrackedNodeService } from "./lib/trackednode";

export type ILayoutElement = RenderableService & {
  getLayoutNode: () => Effect.Effect<
    TrackedNodeService<{
      renderable: Ref.Ref<RenderableProperties>;
    }>
  >;
  setParentLayout: (layout: ILayout | null) => Effect.Effect<void>;
  updateFromLayout: () => Effect.Effect<void>;
};

export interface Position {
  top?: number | "auto" | `${number}%`;
  right?: number | "auto" | `${number}%`;
  bottom?: number | "auto" | `${number}%`;
  left?: number | "auto" | `${number}%`;
}

export interface NodeMetadata {
  [key: string]: any;
}

export interface ILayout {
  add(obj: ILayoutElement): void;
  remove(id: string): void;
  requestLayout(): void;
  calculateLayout(): void;
  resize(width: number, height: number): void;
  getDimensions(): { width: number; height: number };
  getYogaConfig(): Config;
}

export const TitleAlignment = Schema.Union(
  Schema.Literal("left").pipe(Schema.brand("TitleAlignment:left")),
  Schema.Literal("center").pipe(Schema.brand("TitleAlignment:center")),
  Schema.Literal("right").pipe(Schema.brand("TitleAlignment:right")),
).pipe(Schema.brand("TitleAlignment"));
export type TitleAlignment = typeof TitleAlignment.Type;
