import { Context, type Effect } from "effect";
import type { RendererFailedToAddToHitGrid } from "./errors";
import type { RenderLib } from "./zig";

export interface RenderContextInterface {
  addToHitGrid: (
    x: number,
    y: number,
    width: number,
    height: number,
    id: number,
  ) => Effect.Effect<void, RendererFailedToAddToHitGrid, RenderLib>;
  width: Effect.Effect<number>;
  height: Effect.Effect<number>;
  needsUpdate: () => Effect.Effect<void>;
}

export class RenderContext extends Context.Tag("RenderContext")<RenderContext, RenderContextInterface>() {}
