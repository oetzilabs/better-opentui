import { OptimizedBuffer } from "@opentuee/core/src/buffer/optimized";
import { Renderable, type RenderableOptions } from "@opentuee/core/src/renderer/renderable-3";
import { Effect } from "effect";

export interface FrameBufferOptions extends RenderableOptions {
  width: number;
  height: number;
  respectAlpha?: boolean;
}

export class FrameBuffer extends Renderable {
  // public frameBuffer: OptimizedBuffer | null;
  protected respectAlpha: boolean;
  private _opts: FrameBufferOptions;

  constructor(id: string, options: FrameBufferOptions) {
    super(id, options);
    this.respectAlpha = options.respectAlpha || false;
    this._opts = options;
  }

  public override initialize = () => {
    const baseInitialize = super.initialize();
    return Effect.gen(this, function* () {
      yield* baseInitialize;
      this.frameBuffer = yield* OptimizedBuffer.create(this._opts.width, this._opts.height, {
        respectAlpha: this.respectAlpha,
      });
    });
  };

  protected override onResize = (width: number, height: number) => {
    const baseOnResize = super.onResize;
    return Effect.gen(this, function* () {
      if (width <= 0 || height <= 0) {
        return yield* Effect.fail(new Error("Invalid width or height"));
      }

      yield* this.frameBuffer!.resize(width, height);
      yield* baseOnResize(width, height);
      yield* this.needsUpdate;
    });
  };

  protected override renderSelf = (buffer: OptimizedBuffer) =>
    Effect.gen(this, function* () {
      if (!this._visible) return;
      const x = yield* this.getX;
      const y = yield* this.getY;

      yield* buffer.drawFrameBuffer(x, y, this.frameBuffer!);
    });

  protected override destroySelf() {
    const baseDestroySelf = super.destroySelf;
    return Effect.gen(this, function* () {
      // TODO: framebuffer collides with buffered Renderable, which holds a framebuffer
      // and destroys it if it exists already. Maybe instead of extending FrameBufferRenderable,
      // subclasses can use the buffered option on the base renderable instead,
      // then this would become something that takes in an external framebuffer to bring it into layout.
      yield* this.frameBuffer!.destroy;
      yield* baseDestroySelf();
    });
  }
}
