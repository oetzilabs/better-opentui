// asciifont.ts
import { Effect, Ref } from "effect";
import { getCharacterPositions, measureText, renderFontToFrameBuffer, type fonts } from "../../ascii/ascii.font";
import type { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { SelectionState } from "../../types";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { ASCIIFontSelectionHelper } from "../utils/selection";
import type { BaseElement } from "./base";
import { framebuffer, type FrameBufferElement, type FrameBufferOptions } from "./framebuffer";
import type { Binds } from "./utils";

export interface ASCIIFontElement extends BaseElement<"asciifont", ASCIIFontElement> {
  setText: (text: string) => Effect.Effect<void, Collection, Library>;
  getText: () => Effect.Effect<string, Collection, Library>;
  setFont: (font: keyof typeof fonts) => Effect.Effect<void, Collection, Library>;
  getFont: () => Effect.Effect<keyof typeof fonts, Collection, Library>;
  getSelectedText: () => Effect.Effect<string, Collection, Library>;
}

export type ASCIIFontOptions = Partial<FrameBufferOptions<ASCIIFontElement>> & {
  text?: string;
  font?: "tiny" | "block" | "shade" | "slick";
  fg?: Input | Input[];
  bg?: Input;
  selectionBg?: Input;
  selectionFg?: Input;
  selectable?: boolean;
};

export const DEFAULTS = {
  font: "tiny",
  respectAlpha: true,
};

export const asciifont = Effect.fn(function* (
  binds: Binds,
  options: ASCIIFontOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  const measurements = yield* measureText({ text: options.text ?? "", font: options.font ?? "tiny" });
  const b = yield* framebuffer<ASCIIFontElement, "asciifont">(
    binds,
    "asciifont",
    {
      ...options,
      width: measurements.width,
      height: measurements.height,
      respectAlpha: options.respectAlpha ?? DEFAULTS.respectAlpha,
      selectable: options.selectable ?? true,
    },
    parentElement,
  );

  const text = yield* Ref.make(options.text ?? "");
  const font = yield* Ref.make<keyof typeof fonts>(options.font ?? DEFAULTS.font);
  const fg = yield* Ref.make<Input[]>(Array.isArray(options.fg) ? options.fg : [options.fg ?? Colors.White]);
  const bg = yield* Ref.make<Input>(options.bg ?? Colors.Transparent);
  const selectionBg = yield* Ref.make<Input | undefined>(options.selectionBg);
  const selectionFg = yield* Ref.make<Input | undefined>(options.selectionFg);

  // Selection helper
  const selectionHelper = new ASCIIFontSelectionHelper(
    Effect.fn(function* () {
      const loc = yield* Ref.get(b.location);
      return loc.x;
    }),
    Effect.fn(function* () {
      const loc = yield* Ref.get(b.location);
      return loc.y;
    }),
    Effect.fn(function* () {
      return yield* Ref.get(text);
    }),
    Effect.fn(function* () {
      return yield* Ref.get(font);
    }),
  );

  // Update dimensions based on text/font
  const updateDimensions = Effect.fn(function* () {
    const t = yield* Ref.get(text);
    const f = yield* Ref.get(font);
    const measurements = yield* measureText({ text: t, font: f });
    yield* Ref.update(b.dimensions, (d) => ({
      ...d,
      width: options.width ?? (measurements.width || 1),
      height: options.height ?? (measurements.height || 1),
      widthValue: measurements.width || 1,
      heightValue: measurements.height || 1,
    }));
    // b.layoutNode.yogaNode.markDirty();
  });

  // Render logic
  const render = Effect.fn(function* (buffer: OptimizedBuffer, dt: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;
    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const t = yield* Ref.get(text);
    const f = yield* Ref.get(font);
    const fgColors = yield* Ref.get(fg);
    const bgColor = yield* parseColor(yield* Ref.get(bg));
    const selBg = yield* Ref.get(selectionBg);
    const selFg = yield* Ref.get(selectionFg);

    const parsedFg = yield* Effect.all(fgColors.map((fgc) => parseColor(fgc)));

    // Clear background
    // yield* buffer.fillRect(loc.x, loc.y, w, h, bgColor);

    // Render font
    yield* renderFontToFrameBuffer({ buffer, text: t, x: loc.x, y: loc.y, fg: parsedFg, bg: bgColor, font: f });

    // Selection highlight
    const selection = selectionHelper.getSelection();
    if (selection && (selBg || selFg)) {
      const selectedText = t.slice(selection.start, selection.end);
      if (selectedText) {
        const positions = yield* getCharacterPositions(t, f);
        const startX = loc.x + (positions[selection.start] || 0);
        const { width: mtw } = yield* measureText({ text: t, font: f });
        const endX = selection.end < positions.length ? loc.x + positions[selection.end] : loc.x + (mtw || 0);

        if (selBg) {
          const selBgColor = yield* parseColor(selBg);
          yield* buffer.fillRect(startX, loc.y, endX - startX, h, selBgColor);
        }
        yield* renderFontToFrameBuffer({
          buffer,
          text: selectedText,
          x: startX,
          y: loc.y,
          fg: selFg ? [yield* parseColor(selFg)] : parsedFg,
          bg: selBg ? yield* parseColor(selBg) : bgColor,
          font: f,
        });
      }
    }
  });

  // Setters/getters
  const setText = Effect.fn(function* (value: string) {
    yield* Ref.set(text, value);
    yield* updateDimensions();
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* selectionHelper.reevaluateSelection(w, h);
  });

  const getText = Effect.fn(function* () {
    return yield* Ref.get(text);
  });

  const setFont = Effect.fn(function* (value: keyof typeof fonts) {
    yield* Ref.set(font, value);
    yield* updateDimensions();
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* selectionHelper.reevaluateSelection(w, h);
  });

  const getFont = Effect.fn(function* () {
    return yield* Ref.get(font);
  });

  // Selection logic
  b.shouldStartSelection = Effect.fn(function* (x: number, y: number) {
    const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);
    return yield* selectionHelper.shouldStartSelection(x, y, width, height);
  });

  b.onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
    const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);
    const changed = selectionHelper.onSelectionChanged(selection, width, height);
    return selectionHelper.hasSelection();
  });

  const getSelectedText = Effect.fn(function* () {
    const t = yield* Ref.get(text);
    const selection = selectionHelper.getSelection();
    if (!selection) return "";
    return t.slice(selection.start, selection.end);
  });

  // Initial dimension update
  yield* updateDimensions();

  return {
    ...b,
    render,
    setText,
    getText,
    setFont,
    getFont,
    getSelectedText,
  } satisfies ASCIIFontElement;
});
