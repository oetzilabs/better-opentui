import { Effect, Match, Ref } from "effect";
import { fonts, measureText, renderFontToFrameBuffer } from "../../ascii/ascii.font";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { base, type BaseElement } from "./base";
import { framebuffer, type FrameBufferOptions } from "./framebuffer";
import type { Binds, ElementOptions } from "./utils";

export interface SelectOption<T> {
  name: string;
  description?: string;
  value?: T;
  disabled?: boolean;
}

export interface SelectElement<T = any, FBT extends string = "select">
  extends BaseElement<"select", SelectElement<T, FBT>> {
  setOptions: (options: SelectOption<T>[]) => Effect.Effect<void, Collection, Library>;
  getOptions: () => Effect.Effect<SelectOption<T>[], Collection, Library>;
  setSelectedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getSelectedIndex: () => Effect.Effect<number, Collection, Library>;
  getSelectedOption: () => Effect.Effect<SelectOption<T> | null, Collection, Library>;
  setTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setSelectedTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setSelectedBgColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setFocusedBgColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setFocusedTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setWrapSelection: (wrap: boolean) => Effect.Effect<void, Collection, Library>;
  setShowDescription: (show: boolean) => Effect.Effect<void, Collection, Library>;
  setShowScrollIndicator: (show: boolean) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library>;
  onUpdate: (self: SelectElement<T, FBT>) => Effect.Effect<void, Collection, Library>;
  onSelect: (option?: SelectOption<T>) => Effect.Effect<void, Collection, Library>;
}

export type SelectOptions<OptionsType = any, FBT extends string = "select"> = ElementOptions<
  FBT,
  SelectElement<OptionsType, FBT>
> & {
  colors?: FrameBufferOptions<SelectElement<OptionsType, FBT>>["colors"] & {
    bg?: Input;
    fg?: Input;
    selectedBg?: Input;
    selectedFg?: Input;
    focusedBg?: Input;
    focusedFg?: Input;
    scrollIndicator?: Input;
    descriptionColor?: Input;
    selectedDescriptionColor?: Input;
    disabledDescriptionColor?: Input;
  };
  options?: SelectOption<OptionsType>[];
  selectedIndex?: number;
  wrapSelection?: boolean;
  showDescription?: boolean;
  showScrollIndicator?: boolean;
  itemSpacing?: number;
  onUpdate?: (self: SelectElement<OptionsType, FBT>) => Effect.Effect<void, Collection, Library>;
  onSelect?: (option?: SelectOption<OptionsType>) => Effect.Effect<void, Collection, Library>;
  description?: string;
  font?: keyof typeof fonts;
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
  wrapSelection: false,
  showDescription: true,
  showScrollIndicator: false,
  selectedIndex: 0,
  itemSpacing: 0,
  description: "",
};

export const select = Effect.fn(function* <OptionsType, FBT extends string = "select">(
  binds: Binds,
  options: SelectOptions<OptionsType>,
) {
  const lib = yield* Library;
  const b = yield* base<"select", SelectElement<OptionsType>>("select", {
    ...options,
    selectable: true,
    colors: {
      bg: options.colors?.bg ?? DEFAULTS.colors.bg,
      fg: options.colors?.fg ?? DEFAULTS.colors.fg,
      focusedBg: options.colors?.focusedBg ?? DEFAULTS.colors.focusedBg,
      focusedFg: options.colors?.focusedFg ?? DEFAULTS.colors.focusedFg,
    },
  });

  const framebuffer_buffer = yield* b.createFrameBuffer();

  const opts = yield* Ref.make(options.options ?? []);
  const selectedIndex = yield* Ref.make(options.selectedIndex ?? DEFAULTS.selectedIndex);
  const wrapSelection = yield* Ref.make(options.wrapSelection ?? DEFAULTS.wrapSelection);
  const showDescription = yield* Ref.make(options.showDescription ?? DEFAULTS.showDescription);
  const showScrollIndicator = yield* Ref.make(options.showScrollIndicator ?? DEFAULTS.showScrollIndicator);
  const description = yield* Ref.make(options.description ?? DEFAULTS.description);

  const selectedBg = yield* Ref.make(options.colors?.selectedBg ?? DEFAULTS.colors.selectedBg);
  const selectedFg = yield* Ref.make(options.colors?.selectedFg ?? DEFAULTS.colors.selectedFg);
  const scrollIndicatorColor = yield* Ref.make(options.colors?.scrollIndicator ?? DEFAULTS.colors.scrollIndicator);
  const itemSpacing = yield* Ref.make(options.itemSpacing ?? DEFAULTS.itemSpacing);
  const descriptionColor = yield* Ref.make(options.colors?.descriptionColor ?? DEFAULTS.colors.descriptionColor);
  const selectedDescriptionColor = yield* Ref.make(
    options.colors?.selectedDescriptionColor ?? DEFAULTS.colors.selectedDescriptionColor,
  );

  // Calculate max visible items
  const linesPerItem = yield* Ref.make((options.showDescription ?? DEFAULTS.showDescription) ? 2 : 1);
  const scrollOffset = yield* Ref.make(0);
  const font = yield* Ref.make(options.font);
  const fontHeight = options.font ? (yield* measureText({ text: "A", font: options.font })).height : 1;

  // Helper to update scroll offset
  const updateScrollOffset = Effect.fn(function* () {
    const idx = yield* Ref.get(selectedIndex);
    const optionsArr = yield* Ref.get(opts);
    const { heightValue: height } = yield* Ref.get(b.dimensions);
    const maxVisibleItems = Math.max(1, Math.floor(height / (yield* Ref.get(linesPerItem))));
    const halfVisible = Math.floor(maxVisibleItems / 2);
    const newScrollOffset = Math.max(0, Math.min(idx - halfVisible, optionsArr.length - maxVisibleItems));
    yield* Ref.set(scrollOffset, newScrollOffset);
  });

  // Rendering
  const render = Effect.fn(function* (buffer: OptimizedBuffer, _dt: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;

    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const focused = yield* Ref.get(b.focused);
    const colors = yield* Ref.get(b.colors);
    const bgColor = yield* parseColor(focused ? colors.focusedBg : colors.bg);
    yield* framebuffer_buffer.clear(bgColor);

    const optionsArr = yield* Ref.get(opts);
    const idx = yield* Ref.get(selectedIndex);
    const scroll = yield* Ref.get(scrollOffset);
    const showDesc = yield* Ref.get(showDescription);
    const desc = yield* Ref.get(description);
    const selectBg = yield* Ref.get(selectedBg);
    const selBg = yield* parseColor(selectBg);
    const selectFg = yield* Ref.get(selectedFg);
    const selFg = yield* parseColor(selectFg);
    const baseFg = yield* parseColor(focused ? colors.focusedFg : colors.fg);
    const baseBg = yield* parseColor(focused ? colors.focusedBg : colors.bg);
    const descColor = yield* Ref.get(descriptionColor);
    const selDescColor = yield* Ref.get(selectedDescriptionColor);
    const parsedDescColor = yield* parseColor(descColor);
    const parsedSelDescColor = yield* parseColor(selDescColor);

    const fnt = yield* Ref.get(font);

    const contentX = 0;
    const contentY = 0;
    const { widthValue: contentWidth, heightValue: contentHeight } = yield* Ref.get(b.dimensions);
    const maxVisibleItems = Math.max(1, Math.floor(contentHeight / (yield* Ref.get(linesPerItem))));

    const visibleOptions = optionsArr.slice(scroll, scroll + maxVisibleItems);
    const lpi = yield* Ref.get(linesPerItem);
    const itemSpace = yield* Ref.get(itemSpacing);

    for (let i = 0; i < visibleOptions.length; i++) {
      const so = yield* Ref.get(scrollOffset);
      const actualIndex = so + i;
      const option = visibleOptions[i];
      const selIdx = yield* Ref.get(selectedIndex);
      const isSelected = actualIndex === selIdx;
      const itemY = contentY + i * lpi;

      if (itemY + lpi - 1 >= contentY + contentHeight) break;

      if (isSelected) {
        const contentHeight = lpi - itemSpace;
        yield* framebuffer_buffer.fillRect(contentX, itemY, contentWidth, contentHeight, selBg);
      }

      const nameContent = `${isSelected ? "▶ " : "  "}${option.name}`;
      const nameColor = isSelected ? selFg : baseFg;
      let descX = contentX + 3;

      if (fnt) {
        const indicator = isSelected ? "▶ " : "  ";
        yield* framebuffer_buffer.drawText(indicator, contentX + 1, itemY, nameColor);

        const indicatorWidth = 2;
        yield* renderFontToFrameBuffer({
          buffer: framebuffer_buffer,
          text: option.name,
          x: contentX + 1 + indicatorWidth,
          y: itemY,
          fg: nameColor,
          bg: isSelected ? selBg : bgColor,
          font: fnt,
        });
        descX = contentX + 1 + indicatorWidth;
      } else {
        yield* framebuffer_buffer.drawText(nameContent, contentX + 1, itemY, nameColor);
      }
      if (showDesc && itemY + fontHeight < contentY + contentHeight) {
        const descColor = isSelected ? parsedSelDescColor : parsedDescColor;
        const descBg = b.focused ? baseBg : bgColor;
        yield* framebuffer_buffer.drawText(desc, descX, itemY + fontHeight, descColor);
      }
    }

    // Scroll indicator
    const showScroll = yield* Ref.get(showScrollIndicator);
    if (showScroll && optionsArr.length > maxVisibleItems) {
      const scrollPercent = idx / Math.max(1, optionsArr.length - 1);
      const indicatorHeight = Math.max(1, h - 2);
      const indicatorY = 1 + Math.floor(scrollPercent * indicatorHeight);
      const indicatorX = w - 1;
      const sic = yield* Ref.get(scrollIndicatorColor);
      const parsedSIC = yield* parseColor(sic);
      yield* framebuffer_buffer.drawText("█", indicatorX, indicatorY, parsedSIC);
    }

    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
  });

  // Setters/getters
  const setOptions = Effect.fn(function* (optionsArr: SelectOption<OptionsType>[]) {
    yield* Ref.set(opts, optionsArr);
    const idx = yield* Ref.get(selectedIndex);
    yield* Ref.set(selectedIndex, Math.min(idx, Math.max(0, optionsArr.length - 1)));
    yield* updateScrollOffset();
  });

  const getOptions = Effect.fn(function* () {
    return yield* Ref.get(opts);
  });

  const setSelectedIndex = Effect.fn(function* (index: number) {
    const optionsArr = yield* Ref.get(opts);
    if (index >= 0 && index < optionsArr.length) {
      yield* Ref.set(selectedIndex, index);
      yield* updateScrollOffset();
    }
  });

  const getSelectedIndex = Effect.fn(function* () {
    return yield* Ref.get(selectedIndex);
  });

  const getSelectedOption = Effect.fn(function* () {
    const optionsArr = yield* Ref.get(opts);
    const idx = yield* Ref.get(selectedIndex);
    return optionsArr[idx] ?? null;
  });

  const setTextColor = b.setForegroundColor;

  const setSelectedTextColor = Effect.fn(function* (color) {
    if (typeof color === "function") {
      yield* Ref.update(selectedFg, (c) => color(c));
    } else {
      yield* Ref.set(selectedFg, color);
    }
  });

  const setSelectedBgColor = Effect.fn(function* (color) {
    if (typeof color === "function") {
      yield* Ref.update(selectedBg, (c) => color(c));
    } else {
      yield* Ref.set(selectedBg, color);
    }
  });

  const setFocusedBgColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(b.colors, (c) => {
        return {
          ...c,
          focusedBg: color(c.focusedBg),
        };
      });
    } else {
      yield* Ref.update(b.colors, (c) => ({ ...c, focusedBg: color }));
    }
  });

  const setFocusedTextColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(b.colors, (c) => {
        return {
          ...c,
          focusedFg: color(c.focusedBg),
        };
      });
    } else {
      yield* Ref.update(b.colors, (c) => ({ ...c, focusedFg: color }));
    }
  });

  const setWrapSelection = Effect.fn(function* (wrap: boolean) {
    yield* Ref.set(wrapSelection, wrap);
  });

  const setShowDescription = Effect.fn(function* (show: boolean) {
    yield* Ref.set(showDescription, show);
    yield* Ref.set(linesPerItem, show ? 2 : 1);
  });

  const setShowScrollIndicator = Effect.fn(function* (show: boolean) {
    yield* Ref.set(showScrollIndicator, show);
  });

  // Keyboard navigation
  const moveUp = Effect.fn(function* (steps: number = 1) {
    const idx = yield* Ref.get(selectedIndex);
    const optionsArr = yield* Ref.get(opts);
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx - steps;
    if (newIndex >= 0) {
      yield* Ref.set(selectedIndex, newIndex);
    } else if (wrap && optionsArr.length > 0) {
      yield* Ref.set(selectedIndex, optionsArr.length - 1);
    } else {
      yield* Ref.set(selectedIndex, 0);
    }
    yield* updateScrollOffset();
  });

  const moveDown = Effect.fn(function* (steps: number = 1) {
    const idx = yield* Ref.get(selectedIndex);
    const optionsArr = yield* Ref.get(opts);
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx + steps;
    if (newIndex < optionsArr.length) {
      yield* Ref.set(selectedIndex, newIndex);
    } else if (wrap && optionsArr.length > 0) {
      yield* Ref.set(selectedIndex, 0);
    } else {
      yield* Ref.set(selectedIndex, optionsArr.length - 1);
    }
    yield* updateScrollOffset();
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const keyName = key.name;
    const isShift = key.shift;
    return yield* Match.value(keyName).pipe(
      Match.when(
        "up",
        Effect.fn(function* () {
          yield* moveUp(isShift ? 5 : 1);
          return true;
        }),
      ),
      Match.when(
        "down",
        Effect.fn(function* () {
          yield* moveDown(isShift ? 5 : 1);
          return true;
        }),
      ),
      Match.whenOr(
        "return",
        "enter",
        Effect.fn(function* () {
          const cs = yield* getSelectedOption();
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

  const onUpdate: SelectElement<OptionsType, FBT>["onUpdate"] = Effect.fn(function* (self) {
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
    yield* handleKeyPress(event.parsedKey);
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
  });

  const onSelect = Effect.fn(function* (option?: SelectOption<OptionsType>) {
    const fn = options.onSelect ?? Effect.fn(function* (option?: SelectOption<OptionsType>) {});
    yield* fn(option);
  });

  return {
    ...b,
    onUpdate,
    onSelect,
    render,
    setOptions,
    getOptions,
    setSelectedIndex,
    getSelectedIndex,
    getSelectedOption,
    setTextColor,
    setSelectedTextColor,
    setSelectedBgColor,
    setFocusedBgColor,
    setFocusedTextColor,
    setWrapSelection,
    setShowDescription,
    setShowScrollIndicator,
    handleKeyPress,
    destroy,
  } satisfies SelectElement<OptionsType, "select">;
});
