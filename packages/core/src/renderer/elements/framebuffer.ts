import { Effect, Ref } from "effect";
import { measureText } from "../../ascii/ascii.font";
import { OptimizedBuffer } from "../../buffer/optimized";
import { RendererFailedToResizeBuffer } from "../../errors";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions } from "./utils";

export interface FrameBufferElement<T extends string = "framebuffer"> extends BaseElement<T, FrameBufferElement<T>> {
  framebuffer_buffer: OptimizedBuffer;
}

export interface FrameBufferOptions<E, T extends string = "framebuffer"> extends ElementOptions<T, E> {
  width: number;
  height: number;
  onMouseEvent?: BaseElement<T, FrameBufferElement<T>>["onMouseEvent"];
  onKeyboardEvent?: BaseElement<T, FrameBufferElement<T>>["onKeyboardEvent"];
  respectAlpha?: boolean;
}

export const framebuffer = Effect.fn(function* <E, FrameBufferType extends string = "framebuffer">(
  binds: Binds,
  type: FrameBufferType,
  options: FrameBufferOptions<E>,
  parentElement: BaseElement<any, any> | null = null,
) {
  const b = yield* base<FrameBufferType, E>(
    type,
    {
      ...options,
      width: options.width,
      height: options.height,
    },
    parentElement,
  );

  const framebuffer_buffer = yield* OptimizedBuffer.create(options.width, options.height, {
    respectAlpha: options.respectAlpha,
  });

  b.onResize = (width: number, height: number) =>
    Effect.gen(function* () {
      if (width <= 0 || height <= 0) {
        return yield* Effect.fail(new RendererFailedToResizeBuffer());
      }

      yield* framebuffer_buffer.resize(width, height);
    });

  const render = Effect.fn("framebuffer.render")(function* (buffer: OptimizedBuffer, dt: number) {
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
    render,
    framebuffer_buffer,
    destroy,
  };
});
