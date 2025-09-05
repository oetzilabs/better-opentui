import { Effect, Match, Ref } from "effect";
import { OptimizedBuffer } from "../../../buffer/optimized";
import { Colors, Input } from "../../../colors";
import type { Collection } from "../../../errors";
import type { MouseEvent } from "../../../events/mouse";
import type { ParsedKey } from "../../../inputs/keyboard";
import { parseColor } from "../../../utils";
import { Library } from "../../../zig";
import { base, type BaseElement } from "../base";
import type { Binds, ElementOptions } from "../utils";

export interface HorizontalScrollbarElement extends BaseElement<"horizontal-scrollbar", HorizontalScrollbarElement> {
  setScrollInfo: (
    contentWidth: number,
    visibleWidth: number,
    offset: number,
  ) => Effect.Effect<void, Collection, Library>;
  getScrollOffset: () => Effect.Effect<number, Collection, Library>;
  setScrollOffset: (offset: number) => Effect.Effect<void, Collection, Library>;
}

export type HorizontalScrollbarOptions = ElementOptions<"horizontal-scrollbar", HorizontalScrollbarElement> & {
  colors?: {
    bg?: Input;
    track?: Input;
    indicator?: Input;
    focusedIndicator?: Input;
  };
  icons?: {
    left?: string;
    right?: string;
    track?: string;
    indicator?: string;
  };
};

const DEFAULTS = {
  colors: {
    bg: Colors.Custom("#1a1a1a"),
    track: Colors.Custom("#333333"),
    indicator: Colors.Custom("#666666"),
    focusedIndicator: Colors.White,
  },
  icons: {
    left: "◀",
    right: "▶",
    track: "█",
    indicator: "█",
  },
} satisfies HorizontalScrollbarOptions;

export const horizontalScrollbar = Effect.fn(function* <T extends any>(
  binds: Binds,
  options: HorizontalScrollbarOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  // State
  const contentWidth = yield* Ref.make(0);
  const visibleWidth = yield* Ref.make(0);
  const scrollOffset = yield* Ref.make(0);
  const isDragging = yield* Ref.make(false);
  const dragStartX = yield* Ref.make(0);
  const dragStartOffset = yield* Ref.make(0);

  const scrollbarElement = yield* base<"horizontal-scrollbar", HorizontalScrollbarElement>(
    "horizontal-scrollbar",
    binds,
    {
      ...options,
      height: 1,
      selectable: true,
      focused: options.focused ?? false,
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: Colors.White,
      },
    },
    parentElement,
  );

  const setScrollInfo = Effect.fn(function* (cWidth: number, vWidth: number, offset: number) {
    yield* Ref.set(contentWidth, cWidth);
    yield* Ref.set(visibleWidth, vWidth);
    yield* Ref.set(scrollOffset, Math.max(0, Math.min(offset, Math.max(0, cWidth - vWidth))));
  });

  const getScrollOffset = Effect.fn(function* () {
    return yield* Ref.get(scrollOffset);
  });

  const setScrollOffset = Effect.fn(function* (offset: number) {
    const [cWidth, vWidth] = yield* Effect.all([Ref.get(contentWidth), Ref.get(visibleWidth)]);
    const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, cWidth - vWidth)));
    yield* Ref.set(scrollOffset, clampedOffset);
  });

  const onMouseEvent = Effect.fn(function* (event: MouseEvent) {
    const [dims, loc, cWidth, vWidth, currentOffset] = yield* Effect.all([
      Ref.get(scrollbarElement.dimensions),
      Ref.get(scrollbarElement.location),
      Ref.get(contentWidth),
      Ref.get(visibleWidth),
      Ref.get(scrollOffset),
    ]);

    const localX = event.x - loc.x;

    return yield* Match.value(event.type).pipe(
      Match.when(
        "down",
        Effect.fn(function* () {
          if (localX === 0) {
            // Left arrow
            yield* setScrollOffset(currentOffset - 1);
            event.preventDefault();
            return true;
          } else if (dims.widthValue >= 3 && localX === dims.widthValue - 1) {
            // Right arrow
            yield* setScrollOffset(currentOffset + 1);
            event.preventDefault();
            return true;
          } else if (localX >= 1 && localX < dims.widthValue - 1) {
            // Track click
            if (cWidth > vWidth) {
              const clickRatio = (localX - 1) / Math.max(1, dims.widthValue - 3);
              const newOffset = Math.floor(clickRatio * (cWidth - vWidth));
              yield* setScrollOffset(newOffset);
              event.preventDefault();
              return true;
            }
            return false;
          }
          return false;
        }),
      ),
      Match.when(
        "move",
        Effect.fn(function* () {
          const dragging = yield* Ref.get(isDragging);
          if (dragging) {
            const startX = yield* Ref.get(dragStartX);
            const startOffset = yield* Ref.get(dragStartOffset);
            const deltaX = event.x - startX;

            if (cWidth > vWidth) {
              const pixelPerUnit = dims.widthValue / cWidth;
              const deltaOffset = Math.floor(deltaX / pixelPerUnit);
              const newOffset = Math.max(0, Math.min(startOffset + deltaOffset, cWidth - vWidth));
              yield* setScrollOffset(newOffset);
            }
            event.preventDefault();
            return true;
          }
          return false;
        }),
      ),
      Match.when(
        "up",
        Effect.fn(function* () {
          const dragging = yield* Ref.get(isDragging);
          if (dragging) {
            yield* Ref.set(isDragging, false);
            event.preventDefault();
            return true;
          }
          return false;
        }),
      ),
      Match.orElse(
        Effect.fn(function* () {
          return true;
        }),
      ),
    );
  });

  const onKeyboardEvent = Effect.fn(function* (event) {
    const currentOffset = yield* Ref.get(scrollOffset);

    return yield* Match.value(event.parsedKey.name).pipe(
      Match.whenOr(
        "left",
        "h",
        Effect.fn(function* () {
          yield* setScrollOffset(currentOffset - 1);
          event.preventDefault();
        }),
      ),
      Match.whenOr(
        "right",
        "l",
        Effect.fn(function* () {
          yield* setScrollOffset(currentOffset + 1);
          event.preventDefault();
        }),
      ),
      Match.when(
        "pageup",
        Effect.fn(function* () {
          const vWidth = yield* Ref.get(visibleWidth);
          yield* setScrollOffset(currentOffset - vWidth);
          event.preventDefault();
        }),
      ),
      Match.when(
        "pagedown",
        Effect.fn(function* () {
          const vWidth = yield* Ref.get(visibleWidth);
          yield* setScrollOffset(currentOffset + vWidth);
          event.preventDefault();
        }),
      ),
      Match.when(
        "home",
        Effect.fn(function* () {
          yield* setScrollOffset(0);
          event.preventDefault();
        }),
      ),
      Match.when(
        "end",
        Effect.fn(function* () {
          const [cWidth, vWidth] = yield* Effect.all([Ref.get(contentWidth), Ref.get(visibleWidth)]);
          yield* setScrollOffset(cWidth - vWidth);
          event.preventDefault();
        }),
      ),
      Match.orElse(Effect.succeed),
    );
  });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const visible = yield* Ref.get(scrollbarElement.visible);
    if (!visible) return;

    const [loc, dims, cWidth, vWidth, currentOffset, focused] = yield* Effect.all([
      Ref.get(scrollbarElement.location),
      Ref.get(scrollbarElement.dimensions),
      Ref.get(contentWidth),
      Ref.get(visibleWidth),
      Ref.get(scrollOffset),
      Ref.get(scrollbarElement.focused),
    ]);

    const trackColor = yield* parseColor(options.colors?.track ?? DEFAULTS.colors.track);
    const indicatorColor = yield* parseColor(
      (focused ? options.colors?.focusedIndicator : options.colors?.indicator) ??
        (focused ? DEFAULTS.colors.focusedIndicator : DEFAULTS.colors.indicator),
    );

    // Render track
    for (let x = 0; x < dims.widthValue; x++) {
      yield* buffer.drawText(DEFAULTS.icons.track, loc.x + x, loc.y, trackColor);
    }

    // Render arrows
    yield* buffer.drawText(DEFAULTS.icons.left, loc.x, loc.y, indicatorColor);
    if (dims.widthValue >= 3) {
      yield* buffer.drawText(DEFAULTS.icons.right, loc.x + dims.widthValue - 1, loc.y, indicatorColor);
    }

    // Render indicator
    if (dims.widthValue >= 3 && cWidth > vWidth) {
      const scrollRatio = currentOffset / Math.max(1, cWidth - vWidth);
      const indicatorX = loc.x + 1 + Math.floor(scrollRatio * Math.max(0, dims.widthValue - 3));
      yield* buffer.drawText(DEFAULTS.icons.indicator, indicatorX, loc.y, indicatorColor);
    }
  });

  return {
    ...scrollbarElement,
    render,
    onKeyboardEvent,
    onMouseEvent,
    setScrollInfo,
    getScrollOffset,
    setScrollOffset,
  };
});
