import type { RenderContext } from "@opentuee/core/src/context";
import type { RenderLib } from "@opentuee/core/src/zig";
import { Effect } from "effect";
import Yoga, { Direction, type Config } from "yoga-layout";
import {
  FailedToFreeYogaNode,
  type RendererFailedToDestroyOptimizedBuffer,
  type RendererFailedToDestroyTextBuffer,
} from "../errors";
import { EventEmitter } from "../event-emitter";
import { LayoutChanged, Resized } from "../events/layout";
import { Renderable } from "./renderable-3";
import { createTrackedNode } from "./tracknode";
import { FlexColumn } from "./utils/flex";

export class Root extends Renderable {
  private yogaConfig: Config;
  private _opts: {
    width: number;
    height: number;
  };

  constructor(width: number, height: number) {
    super("__root__", { zIndex: 0, visible: true, width, height, enableLayout: true });

    this.yogaConfig = Yoga.Config.create();
    this.yogaConfig.setUseWebDefaults(false);
    this.yogaConfig.setPointScaleFactor(1);

    this.layoutNode = createTrackedNode({}, this.yogaConfig);
    this._opts = {
      width,
      height,
    };
  }

  public override initialize() {
    const baseInitialize = super.initialize();
    return Effect.gen(this, function* () {
      yield* baseInitialize;

      // if (this.layoutNode) {
      //   yield* this.layoutNode.destroy();
      // }

      yield* this.layoutNode.setWidth(this._opts.width);
      yield* this.layoutNode.setHeight(this._opts.height);
      this.layoutNode.yogaNode.setFlexDirection(FlexColumn.make(0));

      yield* this.calculateLayout();
    });
  }

  public override requestLayout = () =>
    Effect.gen(this, function* () {
      yield* this.needsUpdate;
    });

  public calculateLayout = () =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      const w = yield* this.getWidth();
      const h = yield* this.getHeight();
      this.layoutNode.yogaNode.calculateLayout(w, h, Direction.LTR);
      ee.emit(LayoutChanged.make("layout-changed"));
    });

  public resize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      yield* this.layoutNode.setWidth(width);
      yield* this.layoutNode.setHeight(height);

      ee.emit(Resized.make("resized"), { width, height });
    });

  protected override beforeRender = () =>
    Effect.gen(this, function* () {
      if (this.layoutNode.yogaNode.isDirty()) {
        yield* this.calculateLayout();
      }
    });

  public override destroy() {
    const baseDestroy = super.destroy;
    const fn: Effect.Effect<
      void,
      RendererFailedToDestroyOptimizedBuffer | RendererFailedToDestroyTextBuffer | FailedToFreeYogaNode,
      RenderLib | EventEmitter | RenderContext
    > = Effect.gen(this, function* () {
      if (this.layoutNode) {
        yield* this.layoutNode.destroy();
      }
      yield* Effect.try({
        try: () => this.yogaConfig.free(),
        catch: (e) => new FailedToFreeYogaNode({ cause: e }),
      });
      yield* baseDestroy();
    });
    return fn;
  }
}
