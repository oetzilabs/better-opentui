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
import type { HorizontalScrollbarElement } from "./horizontal-scrollbar";

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
  onChange: (offset: number) => Effect.Effect<void, Collection, Library>;
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
  onChange: Effect.fn(function* (offset) {}),
} satisfies VerticalScrollbarOptions;

export const verticalScrollbar = Effect.fn(function* (
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
    yield* options.onChange(clampedOffset);
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

    // check if mouse is within bounds x,y,w,h
    if (event.x < loc.x || event.x > loc.x + dims.widthValue || event.y < loc.y || event.y > loc.y + dims.heightValue) {
      return false;
    }

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
      const trackHeight = dims.heightValue - 2;
      const thumbHeight = Math.max(1, Math.floor((vHeight / cHeight) * trackHeight));
      const scrollRatio = currentOffset / Math.max(1, cHeight - vHeight);
      const thumbStart = loc.y + 1 + Math.floor(scrollRatio * Math.max(0, trackHeight - thumbHeight));
      for (let i = 0; i < thumbHeight; i++) {
        yield* buffer.drawText(DEFAULTS.icons.indicator, loc.x, thumbStart + i, indicatorColor);
      }
    }
  });

  scrollbarElement.onUpdate = Effect.fn(function* (self: VerticalScrollbarElement) {
    const [cHeight, vHeight] = yield* Effect.all([Ref.get(contentHeight), Ref.get(visibleHeight)]);
    const offset = yield* Ref.get(scrollOffset);
    yield* setScrollInfo(cHeight, vHeight, offset);

    //add to hit grid
    const [loc, dims] = yield* Effect.all([Ref.get(self.location), Ref.get(self.dimensions)]);
    const ctx = yield* Ref.get(binds.context);
    yield* ctx.addToHitGrid(loc.x, loc.y, dims.widthValue, dims.heightValue, self.num);
  });

  scrollbarElement.onResize = Effect.fn(function* (width: number, height: number) {
    // update the position of the scrollbar
    yield* Ref.update(scrollbarElement.dimensions, (dims) => ({
      ...dims,
      width,
      height,
      widthValue: width,
      heightValue: height,
    }));
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
