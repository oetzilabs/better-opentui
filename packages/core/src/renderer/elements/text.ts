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

  b.onMouseEvent = Effect.fn("text.onMouseEvent")(function* (event) {
    yield* Effect.annotateCurrentSpan("text.onMouseEvent", event);
    const fn: BaseElement<"text", TextElement>["onMouseEvent"] =
      options.onMouseEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (event.source) {
      if (event.source.id === b.id) {
        if (isMouseDown(event.type) || isMouseDrag(event.type) || isMouseUp(event.type)) {
          yield* event.source.setFocused(true);
        } else {
          yield* event.source.setFocused(false);
        }
      }
    }
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

  const reevaluateSelection = Effect.fn(function* (w: number, h: number) {
    const cgs = yield* Ref.get(binds.cachedGlobalSelection);
    if (!cgs) {
      return false;
    }
    return yield* b.onSelectionChanged(cgs, w, h);
  });

  const updateTextBuffer = Effect.fn(function* () {
    const st = yield* Ref.get(_content);
    yield* textBuffer.setStyledText(st);
  });

  const syncSelectionToTextBuffer = Effect.fn(function* () {
    const selection = yield* b.getSelection();
    if (selection) {
      const { selectableBg, selectableFg } = yield* Ref.get(b.colors);
      const sgb = yield* parseColor(selectableBg);
      const sfg = yield* parseColor(selectableFg);

      yield* textBuffer.setSelection(selection.start, selection.end, sgb, sfg);
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
    const changed = reevaluateSelection(widthValue, heightValue);
    if (changed) {
      yield* syncSelectionToTextBuffer();
    }
  });
  yield* updateTextInfo();

  b.onResize = Effect.fn(function* (width: number, height: number) {
    const changed = yield* reevaluateSelection(width, height);
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
    const p = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const localX = x - p.x;
    const localY = y - p.y;
    return localX >= 0 && localX < w && localY >= 0 && localY < h;
  });

  b.onSelectionChanged = Effect.fn(function* (selection: SelectionState | null, w: number, h: number) {
    if (!selection) return false;
    const previousSelection = yield* Ref.get(b.localSelection);
    if (!selection?.isActive) {
      yield* Ref.set(b.localSelection, null);
      yield* syncSelectionToTextBuffer();
      return previousSelection !== null;
    }
    const p = yield* Ref.get(b.location);
    const myEndY = p.y + h - 1;

    if (myEndY < selection.anchor.y || p.y > selection.focus.y) {
      yield* Ref.set(b.localSelection, null);
      yield* syncSelectionToTextBuffer();
      return previousSelection !== null;
    }

    if (h === 1) {
      const content = yield* Ref.get(_content);
      const textLength = content.toString().length;

      // Entire line is selected
      if (p.y > selection.anchor.y && p.y < selection.focus.y) {
        yield* Ref.set(b.localSelection, { start: 0, end: textLength });
      }

      // Selection spans this single line
      if (p.y === selection.anchor.y && p.y === selection.focus.y) {
        const start = Math.max(0, Math.min(selection.anchor.x - p.x, textLength));
        const end = Math.max(0, Math.min(selection.focus.x - p.x, textLength));
        yield* Ref.set(b.localSelection, start < end ? { start, end } : null);
      }

      // Line is at start of selection
      if (p.y === selection.anchor.y) {
        const start = Math.max(0, Math.min(selection.anchor.x - p.x, textLength));
        yield* Ref.set(b.localSelection, start < textLength ? { start, end: textLength } : null);
      }

      // Line is at end of selection
      if (p.y === selection.focus.y) {
        const end = Math.max(0, Math.min(selection.focus.x - p.x, textLength));
        yield* Ref.set(b.localSelection, end > 0 ? { start: 0, end } : null);
      }
    } else {
      const textLength = content.length;

      let selectionStart: number | null = null;
      let selectionEnd: number | null = null;

      for (let i = 0; i < b.lineInfo.lineStarts.length; i++) {
        const lineY = p.y + i;

        if (lineY < selection.anchor.y || lineY > selection.focus.y) continue;

        const lineStart = b.lineInfo.lineStarts[i];
        const lineEnd = i < b.lineInfo.lineStarts.length - 1 ? b.lineInfo.lineStarts[i + 1] - 1 : textLength;
        const lineWidth = b.lineInfo.lineWidths[i];

        if (lineY > selection.anchor.y && lineY < selection.focus.y) {
          // Entire line is selected
          if (selectionStart === null) selectionStart = lineStart;
          selectionEnd = lineEnd;
        } else if (lineY === selection.anchor.y && lineY === selection.focus.y) {
          // Selection starts and ends on this line
          const localStartX = Math.max(0, Math.min(selection.anchor.x - p.x, lineWidth));
          const localEndX = Math.max(0, Math.min(selection.focus.x - p.x, lineWidth));
          if (localStartX < localEndX) {
            selectionStart = lineStart + localStartX;
            selectionEnd = lineStart + localEndX;
          }
        } else if (lineY === selection.anchor.y) {
          // Selection starts on this line
          const localStartX = Math.max(0, Math.min(selection.anchor.x - p.x, lineWidth));
          if (localStartX < lineWidth) {
            selectionStart = lineStart + localStartX;
            selectionEnd = lineEnd;
          }
        } else if (lineY === selection.focus.y) {
          // Selection ends on this line
          const localEndX = Math.max(0, Math.min(selection.focus.x - p.x, lineWidth));
          if (localEndX > 0) {
            if (selectionStart === null) selectionStart = lineStart;
            selectionEnd = lineStart + localEndX;
          }
        }
      }
    }

    yield* syncSelectionToTextBuffer();
    const ls = yield* Ref.get(b.localSelection);
    return (
      (ls !== null) !== (previousSelection !== null) ||
      ls?.start !== previousSelection?.start ||
      ls?.end !== previousSelection?.end
    );
  });

  b.destroy = Effect.fn(function* () {
    yield* textBuffer.destroy();
  });

  const getSelectedText = Effect.fn(function* () {
    const local = yield* Ref.get(b.localSelection);
    if (!local) return "";
    const c = yield* Ref.get(_content);
    return c.toString().slice(local.start, local.end);
  });

  b.toString = Effect.fn(function* () {
    const c = yield* Ref.get(_content);
    return c.toString();
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

  return {
    ...b,
    getSelectedText,
    // onSelectionChanged: onSelectionChanged as BaseElement<"text", TextElement>["onSelectionChanged"],
    setContent,
    getContent,
    setBackgroundColor,
    setForegroundColor,
    setSelectionBackgroundColor,
    setSelectionForegroundColor,
  } satisfies TextElement;
});
