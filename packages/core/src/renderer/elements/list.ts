import type { FileSystem, Path } from "@effect/platform";
import { Array, Effect, Match, Order, pipe, Ref } from "effect";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { KeyboardEvent } from "../../events/keyboard";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { type GenericCollection } from "../utils/collection";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { group } from "./group";
import type { Binds, ElementOptions } from "./utils";

export type ListItem<T> = T;

export interface RenderItemContext<T> {
  item: T;
  index: number;
  isFocused: boolean;
  isSelected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  colors: {
    bg: Input;
    fg: Input;
    focusedBg: Input;
    focusedFg: Input;
    selectedBg: Input;
    selectedFg: Input;
    scrollIndicator: Input;
  };
}

export interface ListElement<T, FBT extends string = "list"> extends BaseElement<"list", ListElement<T, FBT>> {
  setItems: (items: ListItem<T>[]) => Effect.Effect<void, Collection, Library>;
  getItems: () => Effect.Effect<ListItem<T>[], Collection, Library>;
  setFocusedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getFocusedIndex: () => Effect.Effect<number, Collection, Library>;
  setSelectedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getSelectedIndex: () => Effect.Effect<number, Collection, Library>;
  setShowScrollIndicator: (show: boolean) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onSelect: (item: ListItem<T> | null) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onKeyboardEvent: (
    event: KeyboardEvent,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  renderItem: (
    buffer: OptimizedBuffer,
    framebuffer_buffer: OptimizedBuffer,
    context: RenderItemContext<T>,
  ) => Effect.Effect<void, Collection, Library>;
  onUpdate: (self: ListElement<T, FBT>) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
}

export type ListOptions<T, FBT extends string = "list"> = ElementOptions<FBT, ListElement<T, FBT>> & {
  colors?: {
    bg?: Input;
    fg?: Input;
    focusedBg?: Input;
    focusedFg?: Input;
    selectedBg?: Input;
    selectedFg?: Input;
    scrollIndicator?: Input;
  };
  maxVisibleItems?: number;
  showScrollIndicator?: boolean;
  onSelect?: (
    item: ListItem<any> | null,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onUpdate?: (
    self: ListElement<T, FBT>,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  renderItem?: (
    buffer: OptimizedBuffer,
    framebuffer_buffer: OptimizedBuffer,
    context: RenderItemContext<T>,
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
  maxVisibleItems: 10,
  showScrollIndicator: false,
} satisfies ListOptions<any>;

export const list = Effect.fn(function* <T extends any, FBT extends string = "list">(
  binds: Binds,
  collection: GenericCollection<any>,
  options: ListOptions<any, FBT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  // check if the collection has the displayKey
  const displayKey = yield* collection.getDisplayKey();
  if (!displayKey) return yield* Effect.fail(new Error("displayKey is required"));
  const hasDisplayKey = collection.getItems().pipe(Effect.map((items) => items.some((item) => item[displayKey])));
  const hdk = yield* hasDisplayKey;
  if (!hdk) return yield* Effect.fail(new Error("displayKey is not present in the collection"));

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

  const listElement = yield* base<"list", ListElement<T, FBT>>(
    "list",
    binds,
    {
      ...options,
      position: PositionRelative.make(1),
      selectable: true,
      left: options.left ?? 0,
      top: options.top ?? 0,
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

  const renderItem =
    options.renderItem ??
    Effect.fn(function* (buffer: OptimizedBuffer, framebuffer_buffer: OptimizedBuffer, context: RenderItemContext<T>) {
      const { item, index, isFocused, isSelected, x, y, width, height, colors } = context;
      const baseFg = yield* parseColor(colors.fg);
      const focusedBg = yield* parseColor(colors.focusedBg);
      const focusedFg = yield* parseColor(colors.focusedFg);
      const selBg = yield* parseColor(options.colors?.selectedBg ?? DEFAULTS.colors.selectedBg);
      const selFg = yield* parseColor(options.colors?.selectedFg ?? DEFAULTS.colors.selectedFg);

      // Default rendering logic
      if (isFocused) {
        yield* framebuffer_buffer.fillRect(0, y, width, 1, focusedBg);
      }
      if (isSelected) {
        yield* framebuffer_buffer.fillRect(0, y, width, 1, selBg);
      }

      const textColor = isSelected ? selFg : isFocused ? focusedFg : baseFg;
      yield* framebuffer_buffer.drawText(String(item[displayKey as unknown as keyof T]), 0, y, textColor);
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

    const itemList = yield* collection.getItems();
    const focIdx = yield* Ref.get(focusedIndex);
    const selIdx = yield* Ref.get(selectedIndex);
    const scroll = yield* Ref.get(scrollOffset);

    // Render item list
    const visibleItems = itemList.slice(scroll, scroll + h);

    for (let i = 0; i < visibleItems.length; i++) {
      const actualIndex = scroll + i;
      const item = visibleItems[i];
      const isSelected = actualIndex === selIdx;
      const isFocused = actualIndex === focIdx;
      const itemY = i;

      if (itemY >= h) break;

      yield* renderItem(buffer, framebuffer_buffer, {
        item: item as T,
        index: actualIndex,
        isFocused,
        isSelected,
        x: 0,
        y: itemY,
        width: w,
        height: 1,
        colors: { ...options.colors, ...DEFAULTS.colors },
      });
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
    const itemList = yield* collection.getItems();
    const { heightValue: height } = yield* Ref.get(listElement.dimensions);
    const maxVisibleItems = Math.max(1, height);
    const halfVisible = Math.floor(maxVisibleItems / 2);
    const newScrollOffset = Math.max(0, Math.min(idx - halfVisible, itemList.length - maxVisibleItems));
    yield* Ref.set(scrollOffset, newScrollOffset);
  });

  // Setters/getters
  const setItems = Effect.fn(function* (newItems: ListItem<T>[]) {
    yield* collection.setItems(newItems);
    yield* Ref.set(focusedIndex, 0);
    yield* Ref.set(selectedIndex, -1);
    yield* updateScrollOffset();
  });

  const getItems = Effect.fn(function* () {
    return yield* collection.getItems();
  });

  const setFocusedIndex = Effect.fn(function* (index: number) {
    const itemList = yield* collection.getItems();
    if (index >= 0 && index < itemList.length) {
      yield* Ref.set(focusedIndex, index);
      yield* updateScrollOffset();
    }
  });

  const getFocusedIndex = Effect.fn(function* () {
    return yield* Ref.get(focusedIndex);
  });

  const setSelectedIndex = Effect.fn(function* (index: number) {
    const itemList = yield* collection.getItems();
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
    const fileList = yield* collection.getItems();
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
    const fileList = yield* collection.getItems();
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
        "k",
        Effect.fn(function* () {
          yield* moveUp();
          return true;
        }),
      ),
      Match.whenOr(
        "down",
        "j",
        Effect.fn(function* () {
          yield* moveDown();
          return true;
        }),
      ),
      Match.when(
        "return",
        Effect.fn(function* () {
          const focIdx = yield* Ref.get(focusedIndex);
          const itemList = yield* collection.getItems();
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
          const itemList = yield* collection.getItems();
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
          const itemList = yield* collection.getItems();
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

  const onKeyboardEvent: ListElement<T, FBT>["onKeyboardEvent"] = Effect.fn(function* (event) {
    const fn = options.onKeyboardEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (!event.defaultPrevented) {
      yield* handleKeyPress(event.parsedKey);
    }
  });

  let onSelect = Effect.fn(function* (item: T | null) {
    const fn = options.onSelect ?? Effect.fn(function* (item: T | null) {});
    yield* fn(item);
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* listElement.destroy();
    yield* wrapper.destroy();
  });

  const onUpdate =
    options.onUpdate ??
    Effect.fn(function* (self) {
      yield* collection.onUpdate();
    });

  // Initialize
  yield* wrapper.add(listElement);

  const setOnSelect = Effect.fn(function* (fn: ListElement<T, FBT>["onSelect"]) {
    onSelect = fn;
  });

  return {
    ...wrapper,
    onUpdate,
    renderItem,
    onKeyboardEvent,
    onSelect,
    setOnSelect,
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
