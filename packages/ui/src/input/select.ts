import { fonts, measureText, renderFontToFrameBuffer } from "@opentuee/core/src/ascii/ascii.font";
import * as Colors from "@opentuee/core/src/colors";
import type { RendererFailedToResizeRenderer } from "@opentuee/core/src/errors";
import { EventEmitter } from "@opentuee/core/src/event-emitter";
import type { ParsedKey } from "@opentuee/core/src/inputs/keyboard";
import { RGBAClass } from "@opentuee/core/src/types";
import * as Renderables from "@opentuee/ui/src/components/renderables";
import { Context, Effect, Match, Ref, Schema } from "effect";
import { makeBufferedElement, type BufferedElementOptions, type BufferedElementService } from "../bufferedelement";

export type SelectOption = {
  name: string;
  description: string;
  value?: string;
};

const SelectionChanged = Schema.Literal("selectionChanged").pipe(Schema.brand("SelectionChanged"));
export type SelectionChanged = typeof SelectionChanged.Type;
const ItemSelected = Schema.Literal("itemSelected").pipe(Schema.brand("ItemSelected"));
export type ItemSelected = typeof ItemSelected.Type;

export const SelectElementEvents = Schema.Union(SelectionChanged, ItemSelected).pipe(
  Schema.brand("SelectElementEvents"),
);
export type SelectElementEvents = typeof SelectElementEvents.Type;

export type SelectElementOptions = BufferedElementOptions & {
  options: SelectOption[];
  selectedBackgroundColor?: Colors.Input;
  selectedTextColor?: Colors.Input;
  descriptionColor?: Colors.Input;
  selectedDescriptionColor?: Colors.Input;
  showScrollIndicator?: boolean;
  wrapSelection?: boolean;
  showDescription?: boolean;
  font?: keyof typeof fonts;
  itemSpacing?: number;
  fastScrollStep?: number;
};

export type SelectService = Effect.Effect.Success<ReturnType<typeof makeSelectElement>>;

export class SelectElement extends Context.Tag("SelectElement")<SelectElement, SelectService>() {}

export const makeSelectElement = (id: string, opts: SelectElementOptions) =>
  Effect.gen(function* () {
    const ee = yield* EventEmitter;
    const renderable = yield* makeBufferedElement(id, {
      ...opts,
      type: Renderables.Select.make("Select"),
    });
    const options = yield* Ref.make(opts.options);
    const showScrollIndicator = yield* Ref.make(opts.showScrollIndicator ?? false);
    const wrapSelection = yield* Ref.make(opts.wrapSelection ?? false);
    const shd = opts.showDescription ?? true;
    const showDescription = yield* Ref.make(shd);
    const font = yield* Ref.make(opts.font);
    const isp = opts.itemSpacing || 0;
    const itemSpacing = yield* Ref.make(isp);

    const mt = yield* measureText({ text: "A", font: opts.font });
    const fh = opts.font ? mt.height : 1;
    const fontHeight = yield* Ref.make(fh);
    const lpi = (shd ? (opts.font ? fh + 1 : 2) : opts.font ? fh : 1) + isp;
    const linesPerItem = yield* Ref.make(lpi);

    const b = yield* Ref.get(renderable.border);
    const hasBorder = b !== false;
    const h = yield* Ref.get(renderable.height);
    const uh = hasBorder ? h - 2 : h;
    const usableHeight = yield* Ref.make(uh);
    const maxVisibleItems = yield* Ref.make(Math.max(1, uh / lpi));

    const selectedBackgroundColor = yield* Ref.make(opts.selectedBackgroundColor || Colors.Custom.make("#334455"));
    const selectedTextColor = yield* Ref.make(opts.selectedTextColor || Colors.Yellow.make("#FFFF00"));
    const descriptionColor = yield* Ref.make(opts.descriptionColor || Colors.Custom.make("#888888"));
    const selectedDescriptionColor = yield* Ref.make(opts.selectedDescriptionColor || Colors.Custom.make("#CCCCCC"));
    const fastScrollStep = yield* Ref.make(opts.fastScrollStep || 5);

    const selectedIndex = yield* Ref.make(0);
    const scrollOffset = yield* Ref.make(0);

    const refreshContent = Effect.fn(function* (
      contentX: number,
      contentY: number,
      contentWidth: number,
      contentHeight: number,
    ) {
      const os = yield* Ref.get(options);
      if (os.length === 0) return;
      const so = yield* Ref.get(scrollOffset);
      const mvi = yield* Ref.get(maxVisibleItems);
      const visibleOptions = os.slice(so, so + mvi);

      for (let i = 0; i < visibleOptions.length; i++) {
        const actualIndex = so + i;
        const option = visibleOptions[i];
        const si = yield* Ref.get(selectedIndex);
        const isSelected = actualIndex === si;
        const lpi = yield* Ref.get(linesPerItem);
        const itemY = contentY + i * lpi;

        if (itemY + lpi - 1 >= contentY + contentHeight) break;

        if (isSelected) {
          const is = yield* Ref.get(itemSpacing);
          const contentHeight = lpi - is;
          const sbc = yield* Ref.get(selectedBackgroundColor);
          const sbcc = yield* RGBAClass.fromHex(sbc);
          yield* renderable.frameBuffer.fillRect(contentX, itemY, contentWidth, contentHeight, sbcc);
        }

        const nameContent = `${isSelected ? "▶ " : "  "}${option.name}`;
        const stc = yield* Ref.get(selectedTextColor);
        const tc = yield* Ref.get(renderable.textColor);
        const nameColor = isSelected ? stc : tc;
        let descX = contentX + 3;

        const f = yield* Ref.get(font);
        const fg = yield* RGBAClass.fromHex(nameColor);
        if (f) {
          const indicator = isSelected ? "▶ " : "  ";
          yield* renderable.frameBuffer.drawText(indicator, contentX + 1, itemY, fg);

          const indicatorWidth = 2;
          const sbc = yield* Ref.get(selectedBackgroundColor);
          const bgc = yield* Ref.get(renderable.backgroundColor);
          const bg = yield* RGBAClass.fromHex(isSelected ? sbc : bgc);
          yield* renderFontToFrameBuffer({
            text: option.name,
            x: contentX + 1 + indicatorWidth,
            y: itemY,
            fg,
            bg,
            font: f,
          });
          descX = contentX + 1 + indicatorWidth;
        } else {
          yield* renderable.frameBuffer.drawText(nameContent, contentX + 1, itemY, fg);
        }
        const shd = yield* Ref.get(showDescription);
        const fh = yield* Ref.get(fontHeight);
        if (shd && itemY + fh < contentY + contentHeight) {
          const sdc = yield* Ref.get(selectedDescriptionColor);
          const dc = yield* Ref.get(descriptionColor);
          const descColor = yield* RGBAClass.fromHex(isSelected ? sdc : dc);

          yield* renderable.frameBuffer.drawText(option.description, descX, itemY + fh, descColor);
        }
      }

      const ssi = yield* Ref.get(showScrollIndicator);

      if (ssi && os.length > mvi) {
        yield* renderScrollIndicatorToFrameBuffer(contentX, contentY, contentWidth, contentHeight);
      }
    });

    const renderScrollIndicatorToFrameBuffer = Effect.fn(function* (
      contentX: number,
      contentY: number,
      contentWidth: number,
      contentHeight: number,
    ) {
      const si = yield* Ref.get(selectedIndex);
      const os = yield* Ref.get(options);
      const scrollPercent = si / Math.max(1, os.length - 1);
      const indicatorHeight = Math.max(1, contentHeight - 2);
      const indicatorY = contentY + 1 + Math.floor(scrollPercent * indicatorHeight);
      const indicatorX = contentX + contentWidth - 1;
      const c = yield* RGBAClass.fromHex(Colors.BrightBlack.make("#666666"));
      yield* renderable.frameBuffer.drawText("█", indicatorX, indicatorY, c);
    });

    const setOptions = Effect.fn(function* (opts: SelectOption[]) {
      yield* Ref.set(options, opts);
      yield* Ref.update(selectedIndex, (si) => Math.min(si, opts.length - 1));
      yield* updateScrollOffset();
      yield* Ref.set(renderable.needsRefresh, true);
    });

    const getSelectedOption = Effect.fn(function* () {
      const os = yield* Ref.get(options);
      const si = yield* Ref.get(selectedIndex);
      return os[si] || null;
    });

    const getSelectedIndex = Effect.fn(function* () {
      return yield* Ref.get(selectedIndex);
    });

    const moveUp = Effect.fn(function* (steps: number = 1) {
      const os = yield* Ref.get(options);
      const ws = yield* Ref.get(wrapSelection);
      yield* Ref.update(selectedIndex, (si) => {
        const newIndex = si - steps;
        if (newIndex >= 0) {
          si = newIndex;
        } else if (ws && os.length > 0) {
          si = os.length - 1;
        } else {
          si = 0;
        }
        return si;
      });

      yield* updateScrollOffset();
      yield* Ref.set(renderable.needsRefresh, true);
      const si = yield* Ref.get(selectedIndex);
      const so = yield* getSelectedOption();
      ee.emit(SelectionChanged.make("selectionChanged"), si, so);
    });

    const moveDown = Effect.fn(function* (steps: number = 1) {
      const os = yield* Ref.get(options);
      const ws = yield* Ref.get(wrapSelection);
      yield* Ref.update(selectedIndex, (si) => {
        const newIndex = si + steps;
        if (newIndex < os.length) {
          si = newIndex;
        } else if (ws && os.length > 0) {
          si = 0;
        } else {
          si = os.length - 1;
        }
        return si;
      });

      yield* updateScrollOffset();
      yield* Ref.set(renderable.needsRefresh, true);
      const si = yield* Ref.get(selectedIndex);
      const so = yield* getSelectedOption();
      ee.emit(SelectionChanged.make("selectionChanged"), si, so);
    });

    const selectCurrent = Effect.fn(function* () {
      const selected = yield* getSelectedOption();
      if (selected) {
        const si = yield* Ref.get(selectedIndex);
        ee.emit(ItemSelected.make("itemSelected"), si, selected);
      }
    });

    const setSelectedIndex = Effect.fn(function* (index: number) {
      const os = yield* Ref.get(options);
      if (index >= 0 && index < os.length) {
        yield* Ref.set(selectedIndex, index);
        yield* updateScrollOffset();
        yield* Ref.set(renderable.needsRefresh, true);
        const so = yield* getSelectedOption();
        const si = yield* Ref.get(selectedIndex);
        ee.emit(SelectionChanged.make("selectionChanged"), si, so);
      }
    });

    const updateScrollOffset = Effect.fn(function* () {
      const os = yield* Ref.get(options);
      if (!os) return;

      const mvi = yield* Ref.get(maxVisibleItems);
      const halfVisible = Math.floor(mvi / 2);
      const si = yield* Ref.get(selectedIndex);
      const newScrollOffset = Math.max(0, Math.min(si - halfVisible, os.length - mvi));
      const so = yield* Ref.get(scrollOffset);
      if (newScrollOffset !== so) {
        yield* Ref.set(scrollOffset, newScrollOffset);
        yield* Ref.set(renderable.needsRefresh, true);
      }
    });

    const onResize = Effect.fn(function* (width: number, height: number) {
      const bo = yield* Ref.get(renderable.border);
      const hasBorder = bo !== false;
      const usableHeight = hasBorder ? height - 2 : height;
      const lpi = yield* Ref.get(linesPerItem);
      yield* Ref.set(maxVisibleItems, Math.max(1, Math.floor(usableHeight / lpi)));
      yield* updateScrollOffset();
      yield* renderable.onResize(width, height);
    });

    const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
      const keyName = key.name;
      const isShift = key.shift;
      const x = yield* Match.value(keyName).pipe(
        Match.whenOr(
          "up",
          "k",
          Effect.fn(function* () {
            const fss = yield* Ref.get(fastScrollStep);
            yield* moveUp(isShift ? fss : 1);
            return true;
          }),
        ),
        Match.whenOr(
          "down",
          "j",
          Effect.fn(function* () {
            const fss = yield* Ref.get(fastScrollStep);
            yield* moveDown(isShift ? fss : 1);
            return true;
          }),
        ),
        Match.whenOr(
          "return",
          "enter",
          Effect.fn(function* () {
            yield* selectCurrent();
            return true;
          }),
        ),
        Match.orElse(
          Effect.fn(function* () {
            if (
              key.sequence &&
              key.sequence.length === 1 &&
              key.sequence.charCodeAt(0) >= 32 &&
              key.sequence.charCodeAt(0) <= 126
            ) {
              yield* setSelectedIndex(key.sequence.charCodeAt(0) - 32);
              return true;
            } else {
              return false;
            }
          }),
        ),
      );

      return x;
    });

    const getShowScrollIndicator = Effect.fn(function* () {
      return yield* Ref.get(showScrollIndicator);
    });

    const setShowScrollIndicator = Effect.fn(function* (show: boolean) {
      yield* Ref.set(showScrollIndicator, show);
      yield* Ref.set(renderable.needsRefresh, true);
    });

    const getShowDescription = Effect.fn(function* () {
      return yield* Ref.get(showDescription);
    });

    const setShowDescription = Effect.fn(function* (show: boolean) {
      const shd = yield* Ref.get(showDescription);
      if (shd !== show) {
        const _show = yield* Ref.updateAndGet(showDescription, () => show);
        const is = yield* Ref.get(itemSpacing);
        const f = yield* Ref.get(font);
        const fHeight = yield* Ref.get(fontHeight);
        const lpi = yield* Ref.updateAndGet(linesPerItem, (lpi) => {
          return (_show ? (f ? fHeight + 1 : 2) : f ? fHeight : 1) + is;
        });
        const b = yield* Ref.get(renderable.border);

        const hasBorder = b !== false;
        const h = yield* Ref.get(renderable.height);
        const usableHeight = hasBorder ? h - 2 : h;
        yield* Ref.set(maxVisibleItems, Math.max(1, Math.floor(usableHeight / lpi)));
        yield* updateScrollOffset();
        yield* Ref.set(renderable.needsRefresh, true);
      }
    });

    const getWrapSelection = Effect.fn(function* () {
      return yield* Ref.get(wrapSelection);
    });

    const setWrapSelection = Effect.fn(function* (wrap: boolean) {
      yield* Ref.set(wrapSelection, wrap);
      // yield* updateScrollOffset();
      // yield* Ref.set(renderable.needsRefresh, true);
    });

    return {
      ...renderable,
      refreshContent,
      renderScrollIndicatorToFrameBuffer,
      setOptions,
      getSelectedOption,
      getSelectedIndex,
      moveUp,
      moveDown,
      selectCurrent,
      setSelectedIndex,
      onResize,
      handleKeyPress,
      getShowScrollIndicator,
      setShowScrollIndicator,
      getShowDescription,
      setShowDescription,
      getWrapSelection,
      setWrapSelection,
    };
  });
