import { Effect, Ref } from "effect";
import { MeasureMode, PositionType } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { TextBuffer, TextChunkSchema } from "../../buffer/text";
import { Colors, Input } from "../../colors";
import type { CantParseHexColor, Collection } from "../../errors";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import { isMouseDown, isMouseDrag, isMouseUp } from "../../inputs/mouse";
import type { SelectionState } from "../../types";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { isPositionAbsolute, PositionAbsolute } from "../utils/position";
import { TextSelectionHelper } from "../utils/selection";
import { StyledText } from "../utils/styled-text";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions, RenderContextInterface } from "./utils";

export interface TextElement extends BaseElement<"text", TextElement> {
  setContent: (content: string | StyledText) => Effect.Effect<void, Collection, Library>;
  getContent: () => Effect.Effect<StyledText, Collection, Library>;
  onUpdate: (self: TextElement) => Effect.Effect<void, Collection, Library>;
}

export type TextOptions = ElementOptions<"text", TextElement> & {
  content?: StyledText | string;
  onMouseEvent?: BaseElement<"text", TextElement>["onMouseEvent"];
  onKeyboardEvent?: BaseElement<"text", TextElement>["onKeyboardEvent"];
  onUpdate?: (self: TextElement) => Effect.Effect<void, Collection, Library>;
};

export const text = Effect.fn(function* (binds: Binds, content: string, options: TextOptions = {}) {
  const lib = yield* Library;
  const b = yield* base("text", options);

  b.onUpdate = Effect.fn(function* (self) {
    const fn = options.onUpdate ?? Effect.fn(function* (self) {});
    yield* fn(self);
    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, b.num);
    yield* updateTextInfo();
  });

  const textEncoder = new TextEncoder();
  const chunk = TextChunkSchema.make({
    __isChunk: true as const,
    text: textEncoder.encode(content),
    plainText: content,
  });
  const st = new StyledText([chunk]);
  const _content = yield* Ref.make(st);
  yield* Ref.update(b.dimensions, (d) => ({
    ...d,
    width: options.width ?? "auto",
    height: options.height ?? "auto",
  }));
  const capacity = 256 as const;
  const tba = yield* lib.createTextBuffer(capacity);
  const textBuffer = new TextBuffer(tba.bufferPtr, tba.buffers, capacity);
  const c = yield* Ref.get(b.colors);
  const bgC = yield* parseColor(c.bg);
  yield* textBuffer.setDefaultBg(bgC);
  const fgC = yield* parseColor(c.fg);
  yield* textBuffer.setDefaultFg(fgC);
  const attrs = yield* Ref.get(b.attributes);
  yield* textBuffer.setDefaultAttributes(attrs);
  const selectionHelper = new TextSelectionHelper(
    Effect.fn(function* () {
      const loc = yield* Ref.get(b.location);
      return loc.x;
    }),
    Effect.fn(function* () {
      const loc = yield* Ref.get(b.location);
      return loc.y;
    }),
    Effect.fn(function* () {
      const c = yield* Ref.get(_content);
      return c.toString().length;
    }),
    () => b.lineInfo,
  );
  const measureFunc = (
    width: number,
    widthMode: MeasureMode,
    height: number,
    heightMode: MeasureMode,
  ): { width: number; height: number } => {
    const maxLineWidth = Math.max(...b.lineInfo.lineWidths, 0);
    const numLines = b.lineInfo.lineStarts.length || 1;

    let measuredWidth = maxLineWidth;
    let measuredHeight = numLines;

    if (widthMode === MeasureMode.Exactly) {
      measuredWidth = width;
    } else if (widthMode === MeasureMode.AtMost) {
      measuredWidth = Math.min(maxLineWidth, width);
    }

    if (heightMode === MeasureMode.Exactly) {
      measuredHeight = height;
    } else if (heightMode === MeasureMode.AtMost) {
      measuredHeight = Math.min(numLines, height);
    }

    return {
      width: Math.max(1, measuredWidth),
      height: Math.max(1, measuredHeight),
    };
  };

  yield* Effect.sync(() => b.layoutNode.yogaNode.setMeasureFunc(measureFunc));

  const updateTextBuffer = Effect.fn(function* () {
    const st = yield* Ref.get(_content);
    yield* textBuffer.setStyledText(st);
  });

  const syncSelectionToTextBuffer = Effect.fn(function* () {
    const selection = selectionHelper.getSelection();
    if (selection) {
      const { selectableBg, selectableFg } = yield* Ref.get(b.colors);
      const sbg = yield* parseColor(selectableBg);
      const sfg = yield* parseColor(selectableFg);

      yield* textBuffer.setSelection(selection.start, selection.end, sbg, sfg);
    } else {
      yield* textBuffer.resetSelection();
    }
  });

  // update text info
  const updateTextInfo = Effect.fn(function* () {
    yield* updateTextBuffer();

    b.lineInfo = yield* textBuffer.getLineInfo();

    const numLines = b.lineInfo.lineStarts.length;
    const { width, height } = yield* Ref.get(b.dimensions);
    const loc = yield* Ref.get(b.location);
    if (isPositionAbsolute(loc.type) && height === "auto") {
      yield* Ref.update(b.dimensions, (d) => ({
        ...d,
        heightValue: numLines,
      }));
      b.layoutNode.yogaNode.markDirty();
    }

    const maxLineWidth = Math.max(...b.lineInfo.lineWidths);
    if (isPositionAbsolute(loc.type) && width === "auto") {
      // widthValue = maxLineWidth;
      yield* Ref.update(b.dimensions, (d) => ({
        ...d,
        widthValue: maxLineWidth,
      }));
      b.layoutNode.yogaNode.markDirty();
    }
    const { heightValue, widthValue } = yield* Ref.get(b.dimensions);
    const changed = selectionHelper.reevaluateSelection(widthValue, heightValue);
    if (changed) {
      yield* syncSelectionToTextBuffer();
    }
  });

  b.onResize = Effect.fn(function* (width: number, height: number) {
    const changed = yield* selectionHelper.reevaluateSelection(width, height);
    if (changed) {
      yield* syncSelectionToTextBuffer();
    }
  });

  b.render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    // we are in the `render` method of the text element, so we need to render only the text
    const v = yield* Ref.get(b.visible);
    if (!v) return;
    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const clipRect = {
      x: loc.x,
      y: loc.y,
      width: w,
      height: h,
    };
    yield* lib.bufferDrawTextBuffer(buffer.ptr, textBuffer.ptr, loc.x, loc.y, clipRect);
  });

  const setContent = Effect.fn(function* (value: string | StyledText) {
    let st: StyledText;
    if (typeof value === "string") {
      const textEncoder = new TextEncoder();
      const chunk = TextChunkSchema.make({
        __isChunk: true as const,
        text: textEncoder.encode(value),
        plainText: value,
      });
      st = new StyledText([chunk]);
    } else {
      st = value;
    }
    yield* Ref.set(_content, st);
    yield* updateTextInfo();
  });

  const getContent = Effect.fn(function* () {
    return yield* Ref.get(_content);
  });

  b.shouldStartSelection = Effect.fn(function* (x: number, y: number) {
    const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);
    return yield* selectionHelper.shouldStartSelection(x, y, width, height);
  });

  b.onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
    const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);

    const changed = selectionHelper.onSelectionChanged(selection, width, height);
    if (changed) {
      yield* syncSelectionToTextBuffer();
    }
    return selectionHelper.hasSelection();
  });

  // b.onMouseEvent = Effect.fn("text.onMouseEvent")(function* (event) {
  //   yield* Effect.annotateCurrentSpan("text.onMouseEvent", event);
  //   const fn: BaseElement<"text", TextElement>["onMouseEvent"] =
  //     options.onMouseEvent ?? Effect.fn(function* (event) {});
  //   yield* fn(event);
  // });

  b.destroy = Effect.fn(function* () {
    yield* textBuffer.destroy();
  });

  b.toString = Effect.fn(function* () {
    const c = yield* Ref.get(_content);
    return c.toString();
  });

  const getSelectedText = Effect.fn(function* () {
    const selection = selectionHelper.getSelection();
    if (!selection) return "";
    const _plainText = yield* b.toString();
    return _plainText.slice(selection.start, selection.end);
  });

  const setBackgroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    let colors;
    if (typeof color === "function") {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, bg: color(c.bg) }));
    } else {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, bg: color }));
    }

    const parsedColor = yield* parseColor(colors.bg);
    // set color on the text buffer
    yield* textBuffer.setDefaultBg(parsedColor);
  });

  const setForegroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    let colors;
    if (typeof color === "function") {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, fg: color(c.fg) }));
    } else {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, fg: color }));
    }

    const parsedColor = yield* parseColor(colors.fg);
    // set color on the text buffer
    yield* textBuffer.setDefaultFg(parsedColor);
  });

  const setSelectionBackgroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    let colors;
    if (typeof color === "function") {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableBg: color(c.selectableBg) }));
    } else {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableBg: color }));
    }
  });

  const setSelectionForegroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    let colors;
    if (typeof color === "function") {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableFg: color(c.selectableFg) }));
    } else {
      colors = yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableFg: color }));
    }
  });
  yield* updateTextInfo();

  return {
    ...b,
    getSelectedText,
    setContent,
    getContent,
    setBackgroundColor,
    setForegroundColor,
    setSelectionBackgroundColor,
    setSelectionForegroundColor,
  } satisfies TextElement;
});
