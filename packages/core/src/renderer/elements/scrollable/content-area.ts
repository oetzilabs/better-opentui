import { Effect, Ref } from "effect";
import { OptimizedBuffer } from "../../../buffer/optimized";
import { Colors, Input } from "../../../colors";
import type { Collection } from "../../../errors";
import type { MouseEvent } from "../../../events/mouse";
import { parseColor } from "../../../utils";
import { Library } from "../../../zig";
import { PositionRelative } from "../../utils/position";
import { base, type BaseElement } from "../base";
import type { Binds, ElementOptions } from "../utils";

export interface ContentAreaElement extends BaseElement<"content-area", ContentAreaElement> {
  setScrollOffset: (verticalOffset: number, horizontalOffset: number) => Effect.Effect<void, Collection, Library>;
}

export type ContentAreaOptions = ElementOptions<"content-area", ContentAreaElement> & {
  colors?: {
    bg?: Input;
  };
};

const DEFAULTS = {
  colors: {
    bg: Colors.Transparent,
  },
} satisfies ContentAreaOptions;

export const contentArea = Effect.fn(function* <T extends any>(
  binds: Binds,
  options: ContentAreaOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  // State
  const verticalOffset = yield* Ref.make(0);
  const horizontalOffset = yield* Ref.make(0);

  const contentAreaElement = yield* base<"content-area", ContentAreaElement>(
    "content-area",
    binds,
    {
      ...options,
      position: PositionRelative.make(1),
      visible: true,
      selectable: true,
      width: "100%",
      height: "100%",
      top: 0,
      left: 0,
      focused: options.focused ?? false,
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: Colors.White,
      },
    },
    parentElement,
  );

  const frameBuffer = yield* contentAreaElement.createFrameBuffer();

  const setScrollOffset = Effect.fn(function* (vOffset: number, hOffset: number) {
    yield* Ref.set(verticalOffset, Math.max(0, vOffset));
    yield* Ref.set(horizontalOffset, Math.max(0, hOffset));
    // console.debug(`ContentArea (${contentAreaElement.id}): Scrolling to (${-hOffset}, ${-vOffset})`);
    yield* Ref.update(contentAreaElement.location, (loc) => ({ ...loc, x: -hOffset, y: -vOffset }));
  });

  const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const visible = yield* Ref.get(contentAreaElement.visible);
    if (!visible) return;

    const [loc, dims, colors] = yield* Effect.all([
      Ref.get(contentAreaElement.location),
      Ref.get(contentAreaElement.dimensions),
      Ref.get(contentAreaElement.colors),
    ]);
    const bgColor = yield* parseColor(colors.bg);
    yield* frameBuffer.clear(bgColor);
    const children = yield* Ref.get(contentAreaElement.renderables);
    yield* Effect.all(
      children.map((child) => Effect.suspend(() => child.render(frameBuffer, deltaTime))),
      { concurrency: 10, concurrentFinalizers: true },
    );
    yield* buffer.drawFrameBuffer(loc.x, loc.y, frameBuffer);
  });

  return {
    ...contentAreaElement,
    render,
    setScrollOffset,
    onMouseEvent,
  };
});
