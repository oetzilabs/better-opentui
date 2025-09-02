import type { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Ref } from "effect";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { KeyboardEvent } from "../../events/keyboard";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { group } from "./group";
import type { Binds, ElementOptions } from "./utils";

export interface ListItem {
  id: string;
  display: string;
}

export interface RenderItemContext {
  item: ListItem;
  index: number;
  isFocused: boolean;
  isSelected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ListElement<FBT extends string = "list"> extends BaseElement<"list", ListElement<FBT>> {
  setItems: (items: ListItem[]) => Effect.Effect<void, Collection, Library>;
  getItems: () => Effect.Effect<ListItem[], Collection, Library>;
  setFocusedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getFocusedIndex: () => Effect.Effect<number, Collection, Library>;
  setSelectedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getSelectedIndex: () => Effect.Effect<number, Collection, Library>;
  setShowScrollIndicator: (show: boolean) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onSelect: (item: ListItem | null) => Effect.Effect<void, Collection, Library>;
  onKeyboardEvent: (
    event: KeyboardEvent,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
}

export type ListOptions<FBT extends string = "list"> = ElementOptions<FBT, ListElement<FBT>> & {
  colors?: {
    bg?: Input;
    fg?: Input;
    focusedBg?: Input;
    focusedFg?: Input;
    selectedBg?: Input;
    selectedFg?: Input;
    scrollIndicator?: Input;
  };
  items?: ListItem[];
  maxVisibleItems?: number;
  showScrollIndicator?: boolean;
  onSelect?: (item: ListItem | null) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  renderItem?: (
    buffer: OptimizedBuffer,
    framebuffer_buffer: OptimizedBuffer,
    context: RenderItemContext,
  ) => Effect.Effect<void, Collection, Library>;
};

const DEFAULTS = {
  colors: {
    bg: Colors.Transparent,
    fg: Colors.White,
    focusedBg: Colors.Custom("#1a1a1a"),
    focusedFg: Colors.White,
    selectedBg: Colors.Custom("#334455"),
    selectedFg: Colors.Yellow,
    scrollIndicator: Colors.Gray,
  },
  items: [],
  maxVisibleItems: 10,
  showScrollIndicator: false,
} satisfies ListOptions;

export const list = Effect.fn(function* <FBT extends string = "list">(
  binds: Binds,
  options: ListOptions<FBT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  const items = yield* Ref.make(options.items ?? DEFAULTS.items);
  const focusedIndex = yield* Ref.make(0);
  const selectedIndex = yield* Ref.make(-1);
  const scrollOffset = yield* Ref.make(0);
  const wrapSelection = yield* Ref.make(true);
  const showScrollIndicator = yield* Ref.make(options.showScrollIndicator ?? DEFAULTS.showScrollIndicator);
  const scrollIndicatorColor = yield* Ref.make(options.colors?.scrollIndicator ?? DEFAULTS.colors.scrollIndicator);

  const wrapper = yield* group(
    binds,
    {
      position: PositionRelative.make(1),
      width: "100%",
      height: "auto",
      left: 0,
      top: 0,
      visible: true,
    },
    parentElement,
  );

  const framebuffer_buffer = yield* wrapper.createFrameBuffer();

  const listElement = yield* base<"list", ListElement<FBT>>(
    "list",
    binds,
    {
      ...options,
      position: PositionRelative.make(1),
      selectable: true,
      left: 0,
      top: 0,
      focused: options.focused ?? true,
      height: options.height
        ? options.height === "auto"
          ? Math.min(
              options.maxVisibleItems ?? DEFAULTS.maxVisibleItems,
              (yield* Ref.get(parentElement.dimensions)).heightValue,
            )
          : options.height
        : Math.min(
            options.maxVisibleItems ?? DEFAULTS.maxVisibleItems,
            (yield* Ref.get(parentElement.dimensions)).heightValue,
          ),
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
        focusedBg: options.colors?.focusedBg ?? DEFAULTS.colors.focusedBg,
        focusedFg: options.colors?.focusedFg ?? DEFAULTS.colors.focusedFg,
      },
    },
    wrapper,
  );

  listElement.onResize = Effect.fn(function* (width: number, height: number) {
    yield* Ref.update(listElement.dimensions, (d) => ({ ...d, widthValue: width, heightValue: height }));
    yield* framebuffer_buffer.resize(width, height);
    yield* updateScrollOffset();
  });

  // Rendering
  listElement.render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const v = yield* Ref.get(listElement.visible);
    if (!v) return;

    const loc = yield* Ref.get(listElement.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(listElement.dimensions);
    const focused = yield* Ref.get(listElement.focused);
    const colors = yield* Ref.get(listElement.colors);
    const bgColor = yield* parseColor(colors.bg);

    yield* framebuffer_buffer.clear(bgColor);

    const itemList = yield* Ref.get(items);
    const focIdx = yield* Ref.get(focusedIndex);
    const selIdx = yield* Ref.get(selectedIndex);
    const scroll = yield* Ref.get(scrollOffset);

    // Render item list
    const visibleItems = itemList.slice(scroll, scroll + h);
    const baseFg = yield* parseColor(colors.fg);
    const focusedBg = yield* parseColor(colors.focusedBg);
    const focusedFg = yield* parseColor(colors.focusedFg);
    const selBg = yield* parseColor(options.colors?.selectedBg ?? DEFAULTS.colors.selectedBg);
    const selFg = yield* parseColor(options.colors?.selectedFg ?? DEFAULTS.colors.selectedFg);

    for (let i = 0; i < visibleItems.length; i++) {
      const actualIndex = scroll + i;
      const item = visibleItems[i];
      const isSelected = actualIndex === selIdx;
      const isFocused = actualIndex === focIdx;
      const itemY = i;

      if (itemY >= h) break;

      // Use custom renderItem function if provided
      if (options.renderItem) {
        yield* options.renderItem(buffer, framebuffer_buffer, {
          item,
          index: actualIndex,
          isFocused,
          isSelected,
          x: 0,
          y: itemY,
          width: w,
          height: 1,
        });
      } else {
        // Default rendering logic
        if (isFocused) {
          yield* framebuffer_buffer.fillRect(0, itemY, w, 1, focusedBg);
        }
        if (isSelected) {
          yield* framebuffer_buffer.fillRect(0, itemY, w, 1, selBg);
        }

        const textColor = isSelected ? selFg : isFocused ? focusedFg : baseFg;
        yield* framebuffer_buffer.drawText(item.display, 0, itemY, textColor);
      }
    }

    const showScroll = yield* Ref.get(showScrollIndicator);

    // Scroll indicator
    if (showScroll && itemList.length > h) {
      const scrollPercent = focIdx / Math.max(1, itemList.length - 1);
      const indicatorY = Math.floor(scrollPercent * h);
      const indicatorX = w - 1;
      const sic = yield* Ref.get(scrollIndicatorColor);
      const parsedSIC = yield* parseColor(sic);
      yield* framebuffer_buffer.drawText("█", indicatorX, indicatorY, parsedSIC);
    }

    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
  });

  // Helper to update scroll offset
  const updateScrollOffset = Effect.fn(function* () {
    const idx = yield* Ref.get(focusedIndex);
    const itemList = yield* Ref.get(items);
    const { heightValue: height } = yield* Ref.get(listElement.dimensions);
    const maxVisibleItems = Math.max(1, height);
    const halfVisible = Math.floor(maxVisibleItems / 2);
    const newScrollOffset = Math.max(0, Math.min(idx - halfVisible, itemList.length - maxVisibleItems));
    yield* Ref.set(scrollOffset, newScrollOffset);
  });

  // Setters/getters
  const setItems = Effect.fn(function* (newItems: ListItem[]) {
    yield* Ref.set(items, newItems);
    yield* Ref.set(focusedIndex, 0);
    yield* Ref.set(selectedIndex, -1);
    yield* updateScrollOffset();
  });

  const getItems = Effect.fn(function* () {
    return yield* Ref.get(items);
  });

  const setFocusedIndex = Effect.fn(function* (index: number) {
    const itemList = yield* Ref.get(items);
    if (index >= 0 && index < itemList.length) {
      yield* Ref.set(focusedIndex, index);
      yield* updateScrollOffset();
    }
  });

  const getFocusedIndex = Effect.fn(function* () {
    return yield* Ref.get(focusedIndex);
  });

  const setSelectedIndex = Effect.fn(function* (index: number) {
    const itemList = yield* Ref.get(items);
    if (index >= -1 && index < itemList.length) {
      yield* Ref.set(selectedIndex, index);
    }
  });

  const getSelectedIndex = Effect.fn(function* () {
    return yield* Ref.get(selectedIndex);
  });

  const setShowScrollIndicator = Effect.fn(function* (show: boolean) {
    yield* Ref.set(showScrollIndicator, show);
  });

  // Keyboard navigation
  const moveUp = Effect.fn(function* (steps: number = 1) {
    const idx = yield* Ref.get(focusedIndex);
    const fileList = yield* Ref.get(items);
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx - steps;
    if (newIndex >= 0) {
      yield* Ref.set(focusedIndex, newIndex);
    } else if (wrap && fileList.length > 0) {
      yield* Ref.set(focusedIndex, fileList.length - 1);
    } else {
      yield* Ref.set(focusedIndex, 0);
    }
    yield* updateScrollOffset();
  });

  const moveDown = Effect.fn(function* (steps: number = 1) {
    const idx = yield* Ref.get(focusedIndex);
    const fileList = yield* Ref.get(items);
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx + steps;
    if (newIndex < fileList.length) {
      yield* Ref.set(focusedIndex, newIndex);
    } else if (wrap && fileList.length > 0) {
      yield* Ref.set(focusedIndex, 0);
    } else {
      yield* Ref.set(focusedIndex, fileList.length - 1);
    }
    yield* updateScrollOffset();
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const keyName = key.name;

    return yield* Match.value(keyName).pipe(
      Match.when(
        "tab",
        Effect.fn(function* () {
          const f = yield* Ref.updateAndGet(listElement.focused, (f) => !f);
          return true;
        }),
      ),
      Match.whenOr(
        "up",
        "j",
        Effect.fn(function* () {
          yield* moveUp();
          return true;
        }),
      ),
      Match.whenOr(
        "down",
        "k",
        Effect.fn(function* () {
          yield* moveDown();
          return true;
        }),
      ),
      Match.when(
        "return",
        Effect.fn(function* () {
          const focIdx = yield* Ref.get(focusedIndex);
          const itemList = yield* Ref.get(items);
          if (focIdx >= 0 && focIdx < itemList.length) {
            const item = itemList[focIdx];
            yield* Ref.set(selectedIndex, focIdx);
            yield* onSelect(item);
          }
          return true;
        }),
      ),
      Match.when(
        "enter",
        Effect.fn(function* () {
          const focIdx = yield* Ref.get(focusedIndex);
          const itemList = yield* Ref.get(items);
          if (focIdx >= 0 && focIdx < itemList.length) {
            const item = itemList[focIdx];
            yield* Ref.set(selectedIndex, focIdx);
            yield* onSelect(item);
          }
          return true;
        }),
      ),
      Match.when(
        "space",
        Effect.fn(function* () {
          const focIdx = yield* Ref.get(focusedIndex);
          const itemList = yield* Ref.get(items);
          if (focIdx >= 0 && focIdx < itemList.length) {
            const item = itemList[focIdx];
            yield* Ref.set(selectedIndex, focIdx);
            yield* onSelect(item);
          }
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

  const onKeyboardEvent: ListElement<FBT>["onKeyboardEvent"] = Effect.fn(function* (event) {
    const fn = options.onKeyboardEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (!event.defaultPrevented) {
      yield* handleKeyPress(event.parsedKey);
    }
  });

  const onSelect = Effect.fn(function* (item: ListItem | null) {
    const fn = options.onSelect ?? Effect.fn(function* (item: ListItem | null) {});
    yield* fn(item);
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* listElement.destroy();
  });

  // Initialize
  yield* wrapper.add(listElement);

  return {
    ...wrapper,
    onKeyboardEvent,
    onSelect,
    setItems,
    getItems,
    setFocusedIndex,
    getFocusedIndex,
    setSelectedIndex,
    getSelectedIndex,
    setShowScrollIndicator,
    handleKeyPress,
    destroy,
  };
});
