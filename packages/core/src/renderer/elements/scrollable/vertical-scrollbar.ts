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

export interface VerticalScrollbarElement extends BaseElement<"vertical-scrollbar", VerticalScrollbarElement> {
  setScrollInfo: (
    contentHeight: number,
    visibleHeight: number,
    offset: number,
  ) => Effect.Effect<void, Collection, Library>;
  getScrollOffset: () => Effect.Effect<number, Collection, Library>;
  setScrollOffset: (offset: number) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library>;
}

export type VerticalScrollbarOptions = ElementOptions<"vertical-scrollbar", VerticalScrollbarElement> & {
  colors?: {
    bg?: Input;
    track?: Input;
    indicator?: Input;
    focusedIndicator?: Input;
  };
  icons?: {
    up?: string;
    down?: string;
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
    up: "▲",
    down: "▼",
    track: "█",
    indicator: "█",
  },
} satisfies VerticalScrollbarOptions;

export const verticalScrollbar = Effect.fn(function* <T extends any>(
  binds: Binds,
  options: VerticalScrollbarOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  // State
  const contentHeight = yield* Ref.make(0);
  const visibleHeight = yield* Ref.make(0);
  const scrollOffset = yield* Ref.make(0);
  const isDragging = yield* Ref.make(false);
  const dragStartY = yield* Ref.make(0);
  const dragStartOffset = yield* Ref.make(0);

  const scrollbarElement = yield* base<"vertical-scrollbar", VerticalScrollbarElement>(
    "vertical-scrollbar",
    binds,
    {
      ...options,
      width: 1,
      selectable: true,
      focused: options.focused ?? false,
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: Colors.White,
      },
    },
    parentElement,
  );

  const setScrollInfo = Effect.fn(function* (cHeight: number, vHeight: number, offset: number) {
    yield* Ref.set(contentHeight, cHeight);
    yield* Ref.set(visibleHeight, vHeight);
    yield* Ref.set(scrollOffset, Math.max(0, Math.min(offset, Math.max(0, cHeight - vHeight))));
  });

  const getScrollOffset = Effect.fn(function* () {
    return yield* Ref.get(scrollOffset);
  });

  const setScrollOffset = Effect.fn(function* (offset: number) {
    const [cHeight, vHeight] = yield* Effect.all([Ref.get(contentHeight), Ref.get(visibleHeight)]);
    const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, cHeight - vHeight)));
    yield* Ref.set(scrollOffset, clampedOffset);
  });

  const onMouseEvent = Effect.fn(function* (event: MouseEvent) {
    const [dims, loc, cHeight, vHeight, currentOffset] = yield* Effect.all([
      Ref.get(scrollbarElement.dimensions),
      Ref.get(scrollbarElement.location),
      Ref.get(contentHeight),
      Ref.get(visibleHeight),
      Ref.get(scrollOffset),
    ]);

    const localY = event.y - loc.y;

    return yield* Match.value(event.type).pipe(
      Match.when(
        "down",
        Effect.fn(function* () {
          if (localY === 0) {
            // Up arrow
            yield* setScrollOffset(currentOffset - 1);
            event.preventDefault();
            return true;
          } else if (dims.heightValue >= 3 && localY === dims.heightValue - 1) {
            // Down arrow
            yield* setScrollOffset(currentOffset + 1);
            event.preventDefault();
            return true;
          } else if (localY >= 1 && localY < dims.heightValue - 1) {
            // Track click
            if (cHeight > vHeight) {
              const clickRatio = (localY - 1) / Math.max(1, dims.heightValue - 3);
              const newOffset = Math.floor(clickRatio * (cHeight - vHeight));
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
            const startY = yield* Ref.get(dragStartY);
            const startOffset = yield* Ref.get(dragStartOffset);
            const deltaY = event.y - startY;

            if (cHeight > vHeight) {
              const pixelPerUnit = dims.heightValue / cHeight;
              const deltaOffset = Math.floor(deltaY / pixelPerUnit);
              const newOffset = Math.max(0, Math.min(startOffset + deltaOffset, cHeight - vHeight));
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
          return false;
        }),
      ),
    );
  });

  const onKeyboardEvent = Effect.fn(function* (event) {
    const currentOffset = yield* Ref.get(scrollOffset);

    return yield* Match.value(event.parsedKey.name).pipe(
      Match.whenOr(
        "up",
        "k",
        Effect.fn(function* () {
          yield* setScrollOffset(currentOffset - 1);
          event.preventDefault();
          return true;
        }),
      ),
      Match.whenOr(
        "down",
        "j",
        Effect.fn(function* () {
          yield* setScrollOffset(currentOffset + 1);
          event.preventDefault();
          return true;
        }),
      ),
      Match.when(
        "pageup",
        Effect.fn(function* () {
          const vHeight = yield* Ref.get(visibleHeight);
          yield* setScrollOffset(currentOffset - vHeight);
          event.preventDefault();
          return true;
        }),
      ),
      Match.when(
        "pagedown",
        Effect.fn(function* () {
          const vHeight = yield* Ref.get(visibleHeight);
          yield* setScrollOffset(currentOffset + vHeight);
          event.preventDefault();
          return true;
        }),
      ),
      Match.when(
        "home",
        Effect.fn(function* () {
          yield* setScrollOffset(0);
          event.preventDefault();
          return true;
        }),
      ),
      Match.when(
        "end",
        Effect.fn(function* () {
          const [cHeight, vHeight] = yield* Effect.all([Ref.get(contentHeight), Ref.get(visibleHeight)]);
          yield* setScrollOffset(cHeight - vHeight);
          event.preventDefault();
          return true;
        }),
      ),
      Match.orElse(
        Effect.fn(function* () {
          return false;
        }),
      ),
    );
  });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const visible = yield* Ref.get(scrollbarElement.visible);
    if (!visible) return;

    const [loc, dims, cHeight, vHeight, currentOffset, focused] = yield* Effect.all([
      Ref.get(scrollbarElement.location),
      Ref.get(scrollbarElement.dimensions),
      Ref.get(contentHeight),
      Ref.get(visibleHeight),
      Ref.get(scrollOffset),
      Ref.get(scrollbarElement.focused),
    ]);

    const trackColor = yield* parseColor(options.colors?.track ?? DEFAULTS.colors.track);
    const indicatorColor = yield* parseColor(
      (focused ? options.colors?.focusedIndicator : options.colors?.indicator) ??
        (focused ? DEFAULTS.colors.focusedIndicator : DEFAULTS.colors.indicator),
    );

    // Render track
    for (let y = 0; y < dims.heightValue; y++) {
      yield* buffer.drawText(DEFAULTS.icons.track, loc.x, loc.y + y, trackColor);
    }

    // Render arrows
    yield* buffer.drawText(DEFAULTS.icons.up, loc.x, loc.y, indicatorColor);
    if (dims.heightValue >= 3) {
      yield* buffer.drawText(DEFAULTS.icons.down, loc.x, loc.y + dims.heightValue - 1, indicatorColor);
    }

    // Render indicator
    if (cHeight > vHeight && dims.heightValue >= 3) {
      const scrollRatio = currentOffset / Math.max(1, cHeight - vHeight);
      const indicatorY = loc.y + 1 + Math.floor(scrollRatio * Math.max(0, dims.heightValue - 3));
      yield* buffer.drawText(DEFAULTS.icons.indicator, loc.x, indicatorY, indicatorColor);
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
