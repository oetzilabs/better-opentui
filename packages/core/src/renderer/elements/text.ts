import type { FileSystem, Path } from "@effect/platform";
import { Effect, Ref } from "effect";
import { MeasureMode } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { TextBuffer, TextChunkSchema } from "../../buffer/text";
import { Colors, Input } from "../../colors";
import { parseColor } from "../../colors/utils";
import type { Collection } from "../../errors";
import { Library } from "../../lib";
import type { SelectionState } from "../../types";
import { isPositionAbsolute, PositionRelative } from "../utils/position";
import { TextSelectionHelper } from "../utils/selection";
import { StyledText } from "../utils/styled-text";
import { base, type BaseElement } from "./base";
import { calculateContentDimensions, type Binds, type ElementOptions } from "./utils";

export interface TextElement extends BaseElement<"text", TextElement> {
  setContent: (content: string | StyledText) => Effect.Effect<void, Collection, Library>;
  getContent: () => Effect.Effect<StyledText, Collection, Library>;
  onUpdate: (self: TextElement) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
}

export type TextOptions = ElementOptions<"text", TextElement> & {
  content?: StyledText | string;
  onMouseEvent?: BaseElement<"text", TextElement>["onMouseEvent"];
  onKeyboardEvent?: BaseElement<"text", TextElement>["onKeyboardEvent"];
  onUpdate?: (self: TextElement) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onResize?: (width: number, height: number) => Effect.Effect<void, Collection, Library>;
};

const DEFAULTS = {
  colors: {
    bg: Colors.Transparent,
    fg: Colors.Black,
    selectableBg: Colors.Custom("#334455"),
    selectableFg: Colors.Yellow,
  },
  width: "auto",
  height: "auto",
  position: PositionRelative.make(1),
  content: "",
  selectable: false,
} satisfies TextOptions;

export const text = Effect.fn(function* (
  binds: Binds,
  content: string | StyledText,
  options: TextOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;

  const contentWidth = content instanceof StyledText ? content.toString().length : content.length;

  const b = yield* base(
    "text",
    binds,
    {
      ...options,
      position: options.position ?? DEFAULTS.position,
      width: (options.width ?? DEFAULTS.width) === "auto" ? contentWidth : options.width,
      height: options.height ?? DEFAULTS.height,
      colors: {
        ...options.colors,
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
        selectableBg: options.colors?.selectableBg ?? DEFAULTS.colors.selectableBg,
        selectableFg: options.colors?.selectableFg ?? DEFAULTS.colors.selectableFg,
      },
      selectable: options.selectable ?? DEFAULTS.selectable,
    },
    parentElement,
  );

  const onUpdate: TextElement["onUpdate"] = Effect.fn(function* (self) {
    // yield* b.onUpdate(self);
    const fn = options.onUpdate ?? Effect.fn(function* (self) {});
    yield* fn(self);
    // update width and height based on the content
    const [textWidth, textHeight] = yield* calculateContentDimensions(self);
    yield* Ref.update(b.dimensions, (d) => ({
      ...d,
      width: textWidth,
      widthValue: textWidth,
      height: textHeight,
      heightValue: textHeight,
    }));
  });

  let st: StyledText;
  const textEncoder = new TextEncoder();
  if (typeof content === "string") {
    const chunk = TextChunkSchema.make({
      __isChunk: true as const,
      text: textEncoder.encode(content),
      plainText: content,
    });
    st = new StyledText([chunk]);
  } else {
    st = content;
  }

  const _content = yield* Ref.make(st);
  const contentLength = st.toString().length;

  const capacity = 256 as const;
  const { widthMethod } = yield* Ref.get(binds.context);

  const tbp = yield* lib.createTextBufferPointer(capacity, widthMethod);
  const textBuffer = new TextBuffer(tbp, capacity);

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
    let measuredWidth = contentLength;
    let measuredHeight = Math.ceil(contentLength / Math.max(1, width));

    if (widthMode === MeasureMode.Exactly) {
      measuredWidth = width;
    } else if (widthMode === MeasureMode.AtMost) {
      measuredWidth = Math.min(contentLength, width);
    }

    if (heightMode === MeasureMode.Exactly) {
      measuredHeight = height;
    } else if (heightMode === MeasureMode.AtMost) {
      measuredHeight = Math.min(measuredHeight, height);
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
    const { width, height, heightValue: currentHeight, widthValue: currentWidth } = yield* Ref.get(b.dimensions);
    const loc = yield* Ref.get(b.location);
    if (height === "auto" && numLines !== currentHeight) {
      yield* Ref.update(b.dimensions, (d) => ({
        ...d,
        heightValue: numLines,
      }));
      b.layoutNode.yogaNode.markDirty();
    }

    const maxLineWidth = Math.max(...b.lineInfo.lineWidths);
    if (width === "auto" && maxLineWidth !== currentWidth) {
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

  const onResize = Effect.fn(function* (width: number, height: number) {
    const fn = options.onResize ?? Effect.fn(function* (width: number, height: number) {});
    yield* fn(width, height);
    const changed = yield* selectionHelper.reevaluateSelection(width, height);
    if (changed) {
      yield* syncSelectionToTextBuffer();
    }
  });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
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

    const changed = yield* selectionHelper.onSelectionChanged(selection, width, height);
    if (changed) {
      yield* syncSelectionToTextBuffer();
    }
    return selectionHelper.hasSelection();
  });

  const destroy = Effect.fn(function* () {
    yield* textBuffer.destroy();
    yield* b.destroy();
  });

  const toString = Effect.fn(function* () {
    const c = yield* Ref.get(_content);
    return c.toString();
  });

  const getSelectedText = Effect.fn(function* () {
    const selection = selectionHelper.getSelection();
    if (!selection) return "";
    const _plainText = yield* toString();
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
    if (typeof color === "function") {
      yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableBg: color(c.selectableBg) }));
    } else {
      yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableBg: color }));
    }
  });

  const setSelectionForegroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableFg: color(c.selectableFg) }));
    } else {
      yield* Ref.updateAndGet(b.colors, (c) => ({ ...c, selectableFg: color }));
    }
  });
  yield* updateTextInfo();

  return {
    ...b,
    onResize,
    render,
    onUpdate,
    getSelectedText,
    setContent,
    getContent,
    setBackgroundColor,
    setForegroundColor,
    setSelectionBackgroundColor,
    setSelectionForegroundColor,
    destroy,
    toString,
  } satisfies TextElement;
});
