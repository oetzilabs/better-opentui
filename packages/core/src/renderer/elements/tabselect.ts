import { Effect, Match, Ref } from "effect";
import { max } from "effect/Order";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import type { Binds, ElementOptions } from "./utils";

export interface TabSelectOption<T = any> {
  name: string;
  description: string;
  value?: T;
}

export interface TabSelectElement<T = any, FBT extends string = "tab-select">
  extends BaseElement<"tab-select", TabSelectElement<T, FBT>> {
  setOptions: (options: TabSelectOption<T>[]) => Effect.Effect<void, Collection, Library>;
  getOptions: () => Effect.Effect<TabSelectOption<T>[], Collection, Library>;
  setSelectedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getSelectedIndex: () => Effect.Effect<number, Collection, Library>;
  moveLeft: () => Effect.Effect<void, Collection, Library>;
  moveRight: () => Effect.Effect<void, Collection, Library>;
  selectCurrent: () => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library>;
  onUpdate: (self: TabSelectElement<T, FBT>) => Effect.Effect<void, Collection, Library>;
  onSelect: (option?: TabSelectOption<T>) => Effect.Effect<void, Collection, Library>;
}

export type TabSelectOptions<OptionsType = any, FBT extends string = "tab-select"> = ElementOptions<
  FBT,
  TabSelectElement<OptionsType, FBT>
> & {
  height?: number;
  options?: TabSelectOption<OptionsType>[];
  tabWidth?: number;
  wrapSelection?: boolean;
  showDescription?: boolean;
  showUnderline?: boolean;
  showScrollArrows?: boolean;
  colors?: FrameBufferOptions<TabSelectElement<OptionsType, FBT>>["colors"] & {
    bg?: Input;
    fg?: Input;
    selectedBg?: Input;
    selectedFg?: Input;
    focusedBg?: Input;
    focusedFg?: Input;
    selectedDescriptionColor?: Input;
  };
  maxVisibleTabs?: number;
  onUpdate?: (self: TabSelectElement<OptionsType, FBT>) => Effect.Effect<void, Collection, Library>;
  onSelect?: (option?: TabSelectOption<OptionsType>) => Effect.Effect<void, Collection, Library>;
};

const DEFAULTS = {
  colors: {
    bg: Colors.Transparent,
    fg: Colors.White,
    selectedBg: Colors.Custom("#334455"),
    selectedFg: Colors.Yellow,
    focusedBg: Colors.Custom("#1a1a1a"),
    focusedFg: Colors.White,
    scrollIndicator: Colors.Custom("#666666"),
    descriptionColor: Colors.Gray,
    selectedDescriptionColor: Colors.Gray,
  },
  tabWidth: 20,
  maxVisibleTabs: 10,
  wrapSelection: false,
  showDescription: true,
  showScrollIndicator: false,
  selectedIndex: 0,
  itemSpacing: 0,
  description: "",
  searchable: false,
  parentNode: null,
  showUnderline: true,
  showScrollArrows: true,
};

export const tabselect = Effect.fn(function* <OptionsType, FBT extends string = "tab-select">(
  binds: Binds,
  options: TabSelectOptions<OptionsType>,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;

  const calculateDynamicHeight = Effect.fn(function* (showUnderline: boolean, showDescription: boolean) {
    let height = 1;

    if (showUnderline) {
      height += 1;
    }

    if (showDescription) {
      height += 1;
    }

    return height;
  });
  const calculatedHeight = yield* calculateDynamicHeight(
    options.showUnderline ?? DEFAULTS.showUnderline,
    options.showDescription ?? DEFAULTS.showDescription,
  );
  console.debug("calculatedHeight", calculatedHeight);

  const b = yield* base<"tab-select", TabSelectElement<OptionsType, FBT>>(
    "tab-select",
    binds,
    {
      ...options,
      width: options.width,
      height: calculatedHeight,
      colors: {
        ...options.colors,
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
      },
    },
    parentElement,
  );

  // state
  const opts = yield* Ref.make(options.options ?? []);
  const selectedIndex = yield* Ref.make(0);
  const scrollOffset = yield* Ref.make(0);
  const tabWidth = yield* Ref.make(options.tabWidth ?? DEFAULTS.tabWidth);
  const wrapSelection = yield* Ref.make(options.wrapSelection ?? DEFAULTS.wrapSelection);
  const maxVisibleTabs = yield* Ref.make(options.maxVisibleTabs ?? DEFAULTS.maxVisibleTabs);
  const scrollIndex = yield* Ref.make(0);
  const selectedBg = yield* Ref.make(options.colors?.selectedBg ?? DEFAULTS.colors.selectedBg);
  const selectedFg = yield* Ref.make(options.colors?.selectedFg ?? DEFAULTS.colors.selectedFg);
  const showUnderline = yield* Ref.make(options.showUnderline ?? DEFAULTS.showUnderline);
  const showDescription = yield* Ref.make(options.showDescription ?? DEFAULTS.showDescription);
  const showScrollArrows = yield* Ref.make(options.showScrollArrows ?? DEFAULTS.showScrollArrows);
  const selectedDescriptionColor = yield* Ref.make(
    options.colors?.selectedDescriptionColor ?? DEFAULTS.colors.selectedDescriptionColor,
  );

  const framebuffer_buffer = yield* b.createFrameBuffer();

  // helpers
  const updateScrollOffset = Effect.fn(function* () {
    const mvt = yield* Ref.get(maxVisibleTabs);
    const halfVisible = Math.floor(mvt / 2);
    const idx = yield* Ref.get(selectedIndex);
    const so = yield* Ref.get(scrollOffset);
    const arr = yield* Ref.get(opts);
    const newScrollOffset = Math.max(0, Math.min(idx - halfVisible, arr.length - mvt));

    if (newScrollOffset !== so) {
      yield* Ref.set(scrollOffset, newScrollOffset);
    }
  });

  const moveLeft = Effect.fn(function* () {
    const idx = yield* Ref.get(selectedIndex);
    const ws = yield* Ref.get(wrapSelection);
    const arr = yield* Ref.get(opts);

    if (idx > 0) yield* Ref.update(selectedIndex, (idx) => idx - 1);
    else if (ws && arr.length > 0) yield* Ref.update(selectedIndex, (idx) => arr.length - 1);

    yield* updateScrollOffset();
  });

  const moveRight = Effect.fn(function* () {
    const idx = yield* Ref.get(selectedIndex);
    const ws = yield* Ref.get(wrapSelection);
    const arr = yield* Ref.get(opts);

    if (idx < arr.length - 1) yield* Ref.update(selectedIndex, (idx) => idx + 1);
    else if (ws && arr.length > 0) yield* Ref.update(selectedIndex, (idx) => 0);

    yield* updateScrollOffset();
  });

  const selectCurrent = Effect.fn(function* () {
    const idx = yield* Ref.get(selectedIndex);
    const arr = yield* Ref.get(opts);
    if (options.onSelect) yield* options.onSelect(arr[idx]);
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const focused = yield* Ref.get(b.focused);
    if (!focused) return false;
    const keyName = key.name;
    return yield* Match.value(keyName).pipe(
      Match.when(
        "left",
        Effect.fn(function* () {
          yield* moveLeft();
          return true;
        }),
      ),
      Match.when(
        "right",
        Effect.fn(function* () {
          yield* moveRight();
          return true;
        }),
      ),
      Match.whenOr(
        "return",
        "enter",
        Effect.fn(function* () {
          const cs = yield* getSelectedTab();
          yield* onSelect(cs);
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

  const onUpdate: TabSelectElement<OptionsType, FBT>["onUpdate"] = Effect.fn(function* (self) {
    const fn = options.onUpdate ?? Effect.fn(function* (self) {});
    yield* fn(self);
    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, b.num);
    yield* b.updateFromLayout();
  });

  b.onKeyboardEvent = Effect.fn(function* (event) {
    const fn = options.onKeyboardEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (!event.defaultPrevented) {
      yield* handleKeyPress(event.parsedKey);
    }
  });

  // rendering (like your refreshFrameBuffer)
  const render = Effect.fn(function* (buf: OptimizedBuffer, dt: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;
    const arr = yield* Ref.get(opts);
    if (arr.length === 0) return;
    const focused = yield* Ref.get(b.focused);
    const colors = yield* Ref.get(b.colors);
    const fbgc = yield* parseColor(colors.focusedBg);
    const bgc = yield* parseColor(colors.bg);

    // Use focused colors if focused
    const bgColor = focused ? fbgc : bgc;
    yield* framebuffer_buffer.clear(bgColor);

    const contentX = 0;
    const contentY = 0;
    const { widthValue: contentWidth, heightValue: contentHeight } = yield* Ref.get(b.dimensions);
    const optionsArr = yield* Ref.get(opts);
    const so = yield* Ref.get(scrollOffset);
    const mvt = yield* Ref.get(maxVisibleTabs);

    const visibleOptions = optionsArr.slice(so, so + mvt);

    const si = yield* Ref.get(selectedIndex);
    if (si >= visibleOptions.length) return;
    const tw = yield* Ref.get(tabWidth);
    const selBg = yield* Ref.get(selectedBg);
    const selFg = yield* Ref.get(selectedFg);
    const sbgc = yield* parseColor(selBg);
    const sfgc = yield* parseColor(selFg);
    const fgC = yield* parseColor(colors.fg);
    const focusedFgC = yield* parseColor(colors.focusedFg);
    const baseTextColor = focused ? focusedFgC : fgC;
    const su = yield* Ref.get(showUnderline);
    const showDesc = yield* Ref.get(showDescription);
    const showSA = yield* Ref.get(showScrollArrows);
    const sdc = yield* Ref.get(selectedDescriptionColor);
    const sdcc = yield* parseColor(sdc);

    // Render tab names
    for (let i = 0; i < visibleOptions.length; i++) {
      const actualIndex = so + i;
      const option = visibleOptions[i];
      const isSelected = actualIndex === si;
      const tabX = contentX + i * tw;

      if (tabX >= contentX + contentWidth) break;

      const actualTabWidth = Math.min(tw, contentWidth - i * tw);

      if (isSelected) {
        yield* framebuffer_buffer.fillRect(tabX, contentY, actualTabWidth, 1, sbgc);
      }

      const nameColor = isSelected ? sfgc : baseTextColor;
      const nameContent = yield* truncateText(option.name, actualTabWidth - 2);
      yield* framebuffer_buffer.drawText(nameContent, tabX + 1, contentY, nameColor);

      if (isSelected && su && contentHeight >= 2) {
        const underlineY = contentY + 1;
        const underlineBg = isSelected ? sbgc : bgColor;
        yield* framebuffer_buffer.drawText("▬".repeat(actualTabWidth), tabX, underlineY, nameColor, underlineBg);
      }
    }

    if (showDesc && contentHeight >= (su ? 3 : 2)) {
      const selectedOption = yield* getSelectedTab();
      if (selectedOption) {
        const descriptionY = contentY + (su ? 2 : 1);
        const descColor = sdcc;
        const descContent = yield* truncateText(selectedOption.description, contentWidth - 2);
        yield* framebuffer_buffer.drawText(descContent, contentX + 1, descriptionY, descColor);
      }
    }

    if (showSA && optionsArr.length > mvt) {
      yield* renderScrollArrowsToFrameBuffer(contentX, contentY, contentWidth, contentHeight);
    }

    const { x, y } = yield* Ref.get(b.location);

    yield* buf.drawFrameBuffer(x, y, framebuffer_buffer);
  });

  const renderScrollArrowsToFrameBuffer = Effect.fn(function* (
    contentX: number,
    contentY: number,
    contentWidth: number,
    contentHeight: number,
  ) {
    const so = yield* Ref.get(scrollOffset);
    const optsArr = yield* Ref.get(opts);
    const mvt = yield* Ref.get(maxVisibleTabs);
    const hasMoreLeft = so > 0;
    const hasMoreRight = so + mvt < optsArr.length;

    const aaaaaa = yield* parseColor(Colors.Custom("#AAAAAA"));
    if (hasMoreLeft) {
      yield* framebuffer_buffer.drawText("‹", contentX, contentY, aaaaaa);
    }

    if (hasMoreRight) {
      yield* framebuffer_buffer.drawText("›", contentX + contentWidth - 1, contentY, aaaaaa);
    }
  });

  const getSelectedTab = Effect.fn(function* () {
    const idx = yield* Ref.get(selectedIndex);
    const optsArr = yield* Ref.get(opts);
    return optsArr[idx];
  });

  const truncateText = Effect.fn(function* (text: string, maxWidth: number) {
    if (text.length <= maxWidth) return text;
    return text.substring(0, Math.max(0, maxWidth - 1)) + "…";
  });

  const setOptions = Effect.fn(function* (o: TabSelectOption<OptionsType>[]) {
    yield* Ref.set(opts, o);
    yield* updateScrollOffset();
  });

  const getOptions = Effect.fn(function* () {
    return yield* Ref.get(opts);
  });

  const setSelectedIndex = Effect.fn(function* (i: number) {
    yield* Ref.set(selectedIndex, i);
  });

  const getSelectedIndex = Effect.fn(function* () {
    return yield* Ref.get(selectedIndex);
  });

  const onSelect = Effect.fn(function* (option?: TabSelectOption<OptionsType>) {
    const fn = options.onSelect ?? Effect.fn(function* (option?: TabSelectOption<OptionsType>) {});
    yield* fn(option);
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* b.destroy();
  });

  return {
    ...b,
    onSelect,
    onUpdate,
    render,
    setOptions,
    getOptions,
    setSelectedIndex,
    getSelectedIndex,
    moveLeft,
    moveRight,
    selectCurrent,
    handleKeyPress,
    destroy,
  } satisfies TabSelectElement<OptionsType, FBT>;
});
