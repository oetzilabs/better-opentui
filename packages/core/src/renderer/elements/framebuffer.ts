import { Effect, Ref } from "effect";
import { OptimizedBuffer } from "../../buffer/optimized";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions } from "./utils";
import { RendererFailedToResizeBuffer } from "../../errors";

export interface FrameBufferElement extends BaseElement<"group", FrameBufferElement> {}

export interface FrameBufferOptions extends ElementOptions<"group", FrameBufferElement> {
  width: number;
  height: number;
  onMouseEvent?: BaseElement<"framebuffer", FrameBufferElement>["onMouseEvent"];
  onKeyboardEvent?: BaseElement<"framebuffer", FrameBufferElement>["onKeyboardEvent"];
  respectAlpha?: boolean;
}

export const framebuffer = Effect.fn(function* (binds: Binds, options: FrameBufferOptions) {
  const b = yield* base("framebuffer", {
    ...options,
    width: options.width,
    height: options.height,
  });

  const framebuffer_buffer = yield* OptimizedBuffer.create(options.width, options.height, {
    respectAlpha: options.respectAlpha,
  });

  b.onResize = (width: number, height: number) => Effect.gen(function*(){
    if (width <= 0 || height <= 0) {
      return yield* Effect.fail(new RendererFailedToResizeBuffer());
    }

    yield* framebuffer_buffer.resize(width, height)
  })

  b.render = Effect.fn("framebuffer.render")(function* (buffer: OptimizedBuffer) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;
    const { x, y } = yield* Ref.get(b.location);
    yield* buffer.drawFrameBuffer(x, y, framebuffer_buffer);
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* b.destroy();
  });

  return {
    ...b,
    destroy,
  };
});
