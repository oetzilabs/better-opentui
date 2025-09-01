import { Effect, Match, Ref } from "effect";
import Fuse, { type IFuseOptions } from "fuse.js";
import { fonts, measureText, renderFontToFrameBuffer } from "../../ascii/ascii.font";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { PositionAbsolute, PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import { group, type GroupElement } from "./group";
import { input } from "./input";
import { text } from "./text";
import type { Binds, ElementOptions } from "./utils";

export interface SelectOption<T> {
  name: string;
  description?: string;
  value?: T;
  disabled?: boolean;
  id?: string; // Optional ID for stable identification
}

export interface MultiSelectElement<T = any, FBT extends string = "multi-select">
  extends BaseElement<"multi-select", MultiSelectElement<T, FBT>> {
  setOptions: (options: SelectOption<T>[]) => Effect.Effect<void, Collection, Library>;
  getOptions: () => Effect.Effect<SelectOption<T>[], Collection, Library>;
  setSelectedIds: (ids: string[]) => Effect.Effect<void, Collection, Library>;
  getSelectedIds: () => Effect.Effect<string[], Collection, Library>;
  getSelectedOptions: () => Effect.Effect<SelectOption<T>[], Collection, Library>;
  toggleSelection: (index: number) => Effect.Effect<void, Collection, Library>;
  setFocusedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getFocusedIndex: () => Effect.Effect<number, Collection, Library>;
  setTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setSelectedTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setSelectedBgColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setFocusedBgColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setFocusedTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setWrapSelection: (wrap: boolean) => Effect.Effect<void, Collection, Library>;
  setShowDescription: (show: boolean) => Effect.Effect<void, Collection, Library>;
  setShowScrollIndicator: (show: boolean) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library>;
  onUpdate: (self: MultiSelectElement<T, FBT>) => Effect.Effect<void, Collection, Library>;
  onSelect: (options: SelectOption<T>[]) => Effect.Effect<void, Collection, Library>;
}

export type MultiSelectOptions<OptionsType = any, FBT extends string = "multi-select"> = ElementOptions<
  FBT,
  MultiSelectElement<OptionsType, FBT>
> & {
  colors?: FrameBufferOptions<MultiSelectElement<OptionsType, FBT>>["colors"] & {
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
    headerBg?: Input;
    headerFg?: Input;
  };
  options?: SelectOption<OptionsType>[];
  selectedIds?: string[];
  focusedIndex?: number;
  wrapSelection?: boolean;
  showDescription?: boolean;
  showScrollIndicator?: boolean;
  itemSpacing?: number;
  onUpdate?: (self: MultiSelectElement<OptionsType, FBT>) => Effect.Effect<void, Collection, Library>;
  onSelect?: (options: SelectOption<OptionsType>[]) => Effect.Effect<void, Collection, Library>;
  description?: string;
  font?: keyof typeof fonts;
  search?: { enabled: boolean; location?: "top" | "bottom"; config?: IFuseOptions<SelectOption<OptionsType>> };
  maxHeaderItems?: number;
  parentNode?: BaseElement<any, any> | null;
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
    headerBg: Colors.Custom("#2a2a2a"),
    headerFg: Colors.White,
  },
  wrapSelection: false,
  showDescription: true,
  showScrollIndicator: false,
  selectedIds: [],
  focusedIndex: 0,
  itemSpacing: 0,
  description: "",
  search: { enabled: false, location: "top", config: { keys: ["name", "value"] } },
  maxHeaderItems: 3,
  parentNode: null,
} satisfies MultiSelectOptions<any>;

export const multiSelect = Effect.fn(function* <OptionsType, FBT extends string = "multi-select">(
  binds: Binds,
  options: MultiSelectOptions<OptionsType>,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  const searchOpts = options.search ?? DEFAULTS.search;

  const parentDimensions = yield* Ref.get(parentElement.dimensions);

  const b = yield* base<"multi-select", MultiSelectElement<OptionsType, FBT>>(
    "multi-select",
    binds,
    {
      ...options,
      position: PositionAbsolute.make(2),
      selectable: true,
      left: 0,
      top: searchOpts.enabled && searchOpts.location === "top" ? 1 : 0, // Only account for search input
      height: options.height
        ? options.height === "auto"
          ? Math.min(
              (options.options ?? []).length * 2,
              parentDimensions.heightValue - (searchOpts.enabled ? 3 : 2), // Search + spacing + header
              Infinity,
            )
          : options.height
        : options.height,
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
        focusedBg: options.colors?.focusedBg ?? DEFAULTS.colors.focusedBg,
        focusedFg: options.colors?.focusedFg ?? DEFAULTS.colors.focusedFg,
      },
    },
    parentElement,
  );

  const framebuffer_buffer = yield* b.createFrameBuffer();

  const originalOpts = yield* Ref.make(options.options ?? []); // Always contains full original options
  const opts = yield* Ref.make(options.options ?? []); // Current display options (filtered or full)
  const selectedIds = yield* Ref.make<string[]>([]); // Selected option IDs
  const focusedIndex = yield* Ref.make(options.focusedIndex ?? DEFAULTS.focusedIndex);

  // Helper function to get or generate ID for an option
  const getOptionId = (option: SelectOption<OptionsType>, index: number): string => {
    return option.id || `option-${index}`;
  };

  // Initialize selected IDs from provided IDs
  const initialSelectedIds = options.selectedIds ?? [];
  yield* Ref.set(selectedIds, initialSelectedIds);
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

  const searchable = yield* Ref.make(searchOpts.enabled);

  const keys = options.showDescription ? ["name", "value", "description"] : ["name", "value"];

  const fuse = searchOpts.enabled ? new Fuse(options.options ?? [], searchOpts.config ?? { keys }) : null;

  const listHeight = (yield* Ref.get(b.dimensions)).heightValue;

  const searchinput = yield* input(
    binds,
    {
      ...options,
      focused: options.focused ?? false,
      visible: true,
      colors: options.colors ?? DEFAULTS.colors,
      width: options.width,
      position: PositionAbsolute.make(2), // Position relative to parent
      height: 1,
      left: 0,
      top: searchOpts.enabled && searchOpts.location === "bottom" ? listHeight : 0,
      value: "",
      placeholder: "Search options",
      onUpdate: Effect.fn(function* (self) {
        const f = yield* Ref.get(self.focused);
        if (!f) return;
        const value = yield* self.getValue();
        if (value.length === 0) {
          const originalOptions = yield* Ref.get(originalOpts);
          yield* Ref.set(opts, originalOptions);
        } else if (fuse) {
          const filteredOptions = fuse.search(value).map((o) => o.item);
          yield* Ref.set(opts, filteredOptions);
        } else {
          const originalOptions = yield* Ref.get(originalOpts);
          yield* Ref.set(opts, originalOptions);
        }
        yield* updateScrollOffset();
      }),
    },
    parentElement,
  );

  yield* parentElement.add(searchinput);

  // Helper to update scroll offset
  const updateScrollOffset = Effect.fn(function* () {
    const idx = yield* Ref.get(focusedIndex);
    const optionsArr = yield* Ref.get(opts); // Use current display options for scrolling
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
    const selIds = yield* Ref.get(selectedIds);
    const focIdx = yield* Ref.get(focusedIndex);
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
    const contentY = 0; // Always start from top since positioning is handled by the 'top' property
    const { widthValue: contentWidth, heightValue: contentHeight } = yield* Ref.get(b.dimensions);
    const maxVisibleItems = Math.max(1, Math.floor(contentHeight / (yield* Ref.get(linesPerItem))));

    const visibleOptions = optionsArr.slice(scroll, scroll + maxVisibleItems);
    const lpi = yield* Ref.get(linesPerItem);
    const itemSpace = yield* Ref.get(itemSpacing);

    for (let i = 0; i < visibleOptions.length; i++) {
      const so = yield* Ref.get(scrollOffset);
      const actualIndex = so + i;
      const option = visibleOptions[i];
      const optionId = getOptionId(option, actualIndex);
      const isSelected = selIds.includes(optionId);
      const isFocused = actualIndex === focIdx;
      const itemY = contentY + i * lpi;

      if (itemY + lpi - 1 >= contentY + contentHeight) break;

      if (isFocused) {
        const contentHeight = lpi - itemSpace;
        yield* framebuffer_buffer.fillRect(contentX, itemY, contentWidth, contentHeight, selBg);
      }

      const checkbox = isSelected ? "[✓]" : "[ ]";
      const nameContent = `${checkbox} ${option.name}`;
      const nameColor = isFocused ? selFg : baseFg;
      let descX = contentX + 6; // Account for checkbox width

      if (fnt) {
        yield* framebuffer_buffer.drawText(checkbox, contentX + 1, itemY, nameColor);

        const checkboxWidth = 3;
        yield* renderFontToFrameBuffer({
          buffer: framebuffer_buffer,
          text: option.name,
          x: contentX + 1 + checkboxWidth,
          y: itemY,
          fg: nameColor,
          bg: isFocused ? selBg : bgColor,
          font: fnt,
        });
        descX = contentX + 1 + checkboxWidth;
      } else {
        yield* framebuffer_buffer.drawText(nameContent, contentX + 1, itemY, nameColor);
      }

      if (showDesc && itemY + fontHeight < contentY + contentHeight) {
        const descColor = isFocused ? parsedSelDescColor : parsedDescColor;
        const descBg = b.focused ? baseBg : bgColor;
        const descText = option.description ?? desc;
        yield* framebuffer_buffer.drawText(descText, descX, itemY + fontHeight, descColor);
      }
    }

    // Scroll indicator
    const showScroll = yield* Ref.get(showScrollIndicator);
    if (showScroll && optionsArr.length > maxVisibleItems) {
      const scrollPercent = focIdx / Math.max(1, optionsArr.length - 1);
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
    yield* Ref.set(originalOpts, optionsArr); // Update original options
    yield* Ref.set(opts, optionsArr); // Update current display options
    const focIdx = yield* Ref.get(focusedIndex);
    yield* Ref.set(focusedIndex, Math.min(focIdx, Math.max(0, optionsArr.length - 1)));
    // Filter out invalid selected IDs
    const selIds = yield* Ref.get(selectedIds);
    const validIds = selIds.filter((id) => optionsArr.some((option, index) => getOptionId(option, index) === id));
    yield* Ref.set(selectedIds, validIds);
    yield* updateScrollOffset();
  });

  const getOptions = Effect.fn(function* () {
    return yield* Ref.get(opts);
  });

  const setSelectedIds = Effect.fn(function* (ids: string[]) {
    const optionsArr = yield* Ref.get(originalOpts); // Validate against original options
    const validIds = ids.filter((id) => optionsArr.some((option, index) => getOptionId(option, index) === id));
    yield* Ref.set(selectedIds, validIds);
  });

  const getSelectedIds = Effect.fn(function* () {
    return yield* Ref.get(selectedIds);
  });

  const getSelectedOptions = Effect.fn(function* () {
    const optionsArr = yield* Ref.get(originalOpts); // Always use original options
    const selIds = yield* Ref.get(selectedIds);
    return optionsArr.filter((option) => selIds.includes(getOptionId(option, optionsArr.indexOf(option))));
  });

  const toggleSelection = Effect.fn(function* (index: number) {
    const optionsArr = yield* Ref.get(opts);
    if (index < 0 || index >= optionsArr.length) return;

    const selectedOption = optionsArr[index];
    const optionId = getOptionId(selectedOption, index);

    const selIds = yield* Ref.get(selectedIds);
    const isSelected = selIds.includes(optionId);

    if (isSelected) {
      yield* Ref.set(
        selectedIds,
        selIds.filter((id) => id !== optionId),
      );
    } else {
      yield* Ref.set(selectedIds, [...selIds, optionId]);
    }
  });

  const setFocusedIndex = Effect.fn(function* (index: number) {
    const optionsArr = yield* Ref.get(opts); // Use current display options for bounds checking
    if (index >= 0 && index < optionsArr.length) {
      yield* Ref.set(focusedIndex, index);
      yield* updateScrollOffset();
    }
  });

  const getFocusedIndex = Effect.fn(function* () {
    return yield* Ref.get(focusedIndex);
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
    const idx = yield* Ref.get(focusedIndex);
    const optionsArr = yield* Ref.get(opts); // Use current display options for navigation
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx - steps;
    if (newIndex >= 0) {
      yield* Ref.set(focusedIndex, newIndex);
    } else if (wrap && optionsArr.length > 0) {
      yield* Ref.set(focusedIndex, optionsArr.length - 1);
    } else {
      yield* Ref.set(focusedIndex, 0);
    }
    yield* updateScrollOffset();
  });

  const moveDown = Effect.fn(function* (steps: number = 1) {
    const idx = yield* Ref.get(focusedIndex);
    const optionsArr = yield* Ref.get(opts); // Use current display options for navigation
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx + steps;
    if (newIndex < optionsArr.length) {
      yield* Ref.set(focusedIndex, newIndex);
    } else if (wrap && optionsArr.length > 0) {
      yield* Ref.set(focusedIndex, 0);
    } else {
      yield* Ref.set(focusedIndex, optionsArr.length - 1);
    }
    yield* updateScrollOffset();
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const focused = yield* Ref.get(b.focused);
    if (!focused) return false;
    const sa = yield* Ref.get(searchable);
    const keyName = key.name;
    const isShift = key.shift;

    // If searchable is enabled, handle focus switching with Tab
    if (sa && keyName === "tab") {
      yield* Ref.update(searchinput.focused, (f) => !f);
      return true;
    }

    // Handle navigation and selection keys when list is focused
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
      Match.when(
        "space",
        Effect.fn(function* () {
          const searchFocused = yield* Ref.get(searchinput.focused);
          if (!searchFocused) {
            const focIdx = yield* Ref.get(focusedIndex);
            yield* toggleSelection(focIdx);
          }
          return true;
        }),
      ),
      Match.whenOr(
        "return",
        "enter",
        Effect.fn(function* () {
          const selectedOpts = yield* getSelectedOptions();
          yield* onSelect(selectedOpts);
          return true;
        }),
      ),
      Match.orElse(
        Effect.fn(function* () {
          // If searchable, let search input handle other keys when list is focused

          return false;
        }),
      ),
    );
  });

  const onUpdate = Effect.fn(function* (self) {
    const fn = options.onUpdate ?? Effect.fn(function* (self) {});
    yield* fn(self);
    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, b.num);
  });

  b.onKeyboardEvent = Effect.fn(function* (event) {
    const fn = options.onKeyboardEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (!event.defaultPrevented) {
      yield* handleKeyPress(event.parsedKey);
    }
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* b.destroy();
  });

  const onSelect: MultiSelectElement<OptionsType, "multi-select">["onSelect"] = Effect.fn(function* (
    selectedOptions: SelectOption<OptionsType>[],
  ) {
    const fn = options.onSelect ?? Effect.fn(function* (selectedOptions: SelectOption<OptionsType>[]) {});
    yield* fn(selectedOptions);
  });

  return {
    ...b,
    onUpdate,
    onSelect,
    render,
    setOptions,
    getOptions,
    setSelectedIds,
    getSelectedIds,
    getSelectedOptions,
    toggleSelection,
    setFocusedIndex,
    getFocusedIndex,
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
  } satisfies MultiSelectElement<OptionsType, "multi-select">;
});
