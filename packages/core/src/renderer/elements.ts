import type { TextOptions } from "@opentuee/ui/src/components/text";
import { Effect, Ref } from "effect";
import { MeasureMode } from "yoga-layout";
import type { OptimizedBuffer } from "../buffer/optimized";
import { TextBuffer, TextChunkSchema } from "../buffer/text";
import { Colors, Input } from "../colors";
import type {
  RendererFailedToAddToHitGrid,
  RendererFailedToDestroyOptimizedBuffer,
  RendererFailedToDestroyTextBuffer,
  RendererFailedToDrawTextBuffer,
} from "../errors";
import type { KeyboardEvent } from "../events/keyboard";
import type { MouseEvent } from "../events/mouse";
import type { SelectionState } from "../types";
import { parseColor } from "../utils";
import { Library } from "../zig";
import { StyledText } from "./styled-text";
import { createTrackedNode } from "./tracknode";
import { isPositionAbsolute, PositionAbsolute, PositionType } from "./utils/position";

export interface RenderContextInterface {
  addToHitGrid: (
    x: number,
    y: number,
    width: number,
    height: number,
    id: number,
  ) => Effect.Effect<void, RendererFailedToAddToHitGrid, Library>;
  width: () => Effect.Effect<number>;
  height: () => Effect.Effect<number>;
  needsUpdate: () => Effect.Effect<void>;
}

class ElementCounter extends Effect.Service<ElementCounter>()("ElementCounter", {
  dependencies: [],
  effect: Effect.gen(function* () {
    const counter = yield* Ref.make(0);
    return {
      getNext: Effect.fn(function* () {
        return yield* Ref.updateAndGet(counter, (c) => c + 1);
      }),
    };
  }),
}) {}

export const ElementCounterLive = ElementCounter.Default;

export type ElementOptions = {
  visible: boolean;
  selectable: boolean;
  colors?: {
    fg?: Input;
    bg?: Input;
    selectableFg?: Input;
    selectableBg?: Input;
  };
  attributes?: number;
};

export class Elements extends Effect.Service<Elements>()("Elements", {
  dependencies: [ElementCounterLive],
  effect: Effect.gen(function* () {
    const lib = yield* Library;
    const counter = yield* ElementCounter;
    const cachedGlobalSelection = yield* Ref.make<SelectionState | null>(null);

    const base = Effect.fn(function* (
      type: Methods,
      options: ElementOptions = {
        visible: true,
        selectable: true,
      },
    ) {
      const id = yield* counter.getNext();
      const visible = yield* Ref.make(options.visible);
      const location = yield* Ref.make({ x: 0, y: 0 });
      const dimensions = yield* Ref.make({ width: 0, height: 0 });
      const selectable = yield* Ref.make(options.selectable);
      const parent = yield* Ref.make<BaseElement | null>(null);
      const colors = yield* Ref.make({
        fg: options.colors?.fg ?? Colors.White,
        bg: options.colors?.bg ?? Colors.Black,
        selectableFg: options.colors?.selectableFg ?? Colors.White,
        selectableBg: options.colors?.selectableBg ?? Colors.Black,
      });
      const attributes = yield* Ref.make(options.attributes ?? 0);

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        // empty
        // yield* Console.log("Rendering base element");
      });

      const setVisible = Effect.fn(function* (value: boolean) {
        yield* Ref.set(visible, value);
      });

      const localSelection = yield* Ref.make<{ start: number; end: number } | null>(null);
      const lineInfo: { lineStarts: number[]; lineWidths: number[] } = {
        lineStarts: [],
        lineWidths: [],
      };

      const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});
      const onKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {});

      const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
        yield* onMouseEvent(event);
        const p = yield* Ref.get(parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processMouseEvent(event));
        }
      });

      const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
        yield* onKeyboardEvent(event);
        const p = yield* Ref.get(parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processKeyboardEvent(event));
        }
      });

      const add = Effect.fn(function* (container: BaseElement, index?: number) {});

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        const p = yield* Ref.get(location);
        const { width, height } = yield* Ref.get(dimensions);
        const localX = x - p.x;
        const localY = y - p.y;
        return localX >= 0 && localX < width && localY >= 0 && localY < height;
      });

      const onSelectionChanged = Effect.fn(function* (
        selection: SelectionState | null,
        width: number,
        height: number = 1,
      ) {
        return false;
      });
      const layoutNode = createTrackedNode();

      const getSelection = Effect.fn(function* () {
        const local = yield* Ref.get(localSelection);
        return local;
      });

      const destroy = Effect.fn(function* () {});

      const getElements = Effect.fn(function* () {
        return [];
      });

      const getElementsCount = Effect.fn(function* () {
        return 0;
      });

      return {
        id,
        type,
        visible,
        colors,
        attributes,
        parent,
        selectable,
        layoutNode,
        localSelection,
        lineInfo,
        setVisible,
        render,
        add,
        getSelection,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        destroy,
        getElements,
        getElementsCount,
      };
    });

    const context = yield* Ref.make<RenderContextInterface>({
      width: Effect.fn(function* () {
        return 0;
      }),
      height: Effect.fn(function* () {
        return 0;
      }),
      addToHitGrid: Effect.fn(function* (x: number, y: number, width: number, height: number, id: number) {}),
      needsUpdate: Effect.fn(function* () {}),
    });

    const updateContext = Effect.fn(function* (ctx: RenderContextInterface) {
      yield* Ref.set(context, ctx);
    });

    const root = Effect.fn(function* (ctx: RenderContextInterface) {
      yield* Ref.set(context, ctx);
      const b = yield* base("root");
      const elementsHolder = yield* Ref.make<BaseElement[]>([]);

      const getElements = Effect.fn(function* () {
        return yield* Ref.get(elementsHolder);
      });

      const getElementsCount = Effect.fn(function* () {
        const es = yield* Ref.get(elementsHolder);
        // deep count of all elements
        let count = es.length;
        for (let i = 0; i < es.length; i++) {
          const e = es[i];
          if (e.visible) {
            count += yield* Effect.suspend(() => e.getElementsCount());
          }
        }
        return count;
      });

      const add = Effect.fn(function* (container: BaseElement, index?: number) {
        if (index === undefined) {
          const cs = yield* Ref.get(elementsHolder);
          index = cs.length;
        }

        // Set the parent reference for the container
        yield* Ref.set(container.parent, b);

        yield* Ref.update(elementsHolder, (cs) => {
          cs.splice(index, 0, container);
          return cs;
        });
      });

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        const elements = yield* Ref.get(elementsHolder);
        yield* Effect.all(
          elements.map((e) => Effect.suspend(() => e.render(buffer, deltaTime))),
          { concurrency: "unbounded" },
        );
      });

      const resize = Effect.fn(function* (width: number, height: number) {
        yield* b.layoutNode.setWidth(width);
        yield* b.layoutNode.setHeight(height);
      });

      const getRenderable = Effect.fn(function* (id: number) {
        const elements = yield* Ref.get(elementsHolder);
        return elements.find((e) => e.id === id);
      });

      const setVisible = Effect.fn(function* (value: boolean) {
        yield* Ref.set(b.visible, value);
      });

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        const elements = yield* Ref.get(elementsHolder);
        return yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.shouldStartSelection(x, y))),
        ).pipe(Effect.map((shouldStarts) => shouldStarts.some((shouldStart) => shouldStart)));
      });

      const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null, width: number, height: number) {
        const elements = yield* Ref.get(elementsHolder);
        return yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.onSelectionChanged(selection, width, height))),
        ).pipe(Effect.map((changeds) => changeds.some((changed) => changed)));
      });

      const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
        const elements = yield* Ref.get(elementsHolder);
        yield* Effect.all(elements.map((element) => Effect.suspend(() => element.processMouseEvent(event))));
      });

      const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
        const elements = yield* Ref.get(elementsHolder);
        yield* Effect.all(elements.map((element) => Effect.suspend(() => element.processKeyboardEvent(event))));
      });

      const destroy = Effect.fn(function* () {
        const elements = yield* Ref.get(elementsHolder);
        yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.destroy())),
          { concurrency: "unbounded" },
        );
        yield* b.destroy();
      });

      return {
        ...b,
        render,
        resize,
        getRenderable,
        add,
        setVisible,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        destroy,
        getElements,
        getElementsCount,
      } as const;
    });

    const group = Effect.fn(function* () {
      const b = yield* base("group");
      const groupElements = yield* Ref.make<BaseElement[]>([]);
      const parent = yield* Ref.make<BaseElement | null>(null);

      const getElements = Effect.fn(function* () {
        return yield* Ref.get(groupElements);
      });

      const getElementsCount = Effect.fn(function* () {
        const es = yield* Ref.get(groupElements);
        // deep count of all elements
        let count = es.length;
        for (let i = 0; i < es.length; i++) {
          const e = es[i];
          if (e.visible) {
            count += yield* Effect.suspend(() => e.getElementsCount());
          }
        }
        return count;
      });

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        const v = yield* Ref.get(b.visible);
        if (!v) return;
        const elements = yield* Ref.get(groupElements);
        yield* Effect.all(
          elements.map((e) => Effect.suspend(() => e.render(buffer, deltaTime))),
          { concurrency: "unbounded" },
        );
        yield* b.render(buffer, deltaTime);
      });

      const setVisible = Effect.fn(function* (value: boolean) {
        yield* Ref.set(b.visible, value);
      });

      const add = Effect.fn(function* (container: BaseElement, index?: number) {
        if (index === undefined) {
          const cs = yield* Ref.get(groupElements);
          index = cs.length;
        }
        yield* Ref.update(groupElements, (cs) => {
          cs.splice(index, 0, container);
          return cs;
        });
      });
      const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});
      const onKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {});

      const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
        yield* onMouseEvent(event);
        const p = yield* Ref.get(parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processMouseEvent(event));
        }
      });

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        return false;
      });

      const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
        return false;
      });

      const setContent = Effect.fn(function* (value: BaseElement) {
        yield* Ref.set(groupElements, [value]);
      });

      const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
        yield* onKeyboardEvent(event);
        const p = yield* Ref.get(b.parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processKeyboardEvent(event));
        }
      });

      const destroy = Effect.fn(function* () {
        const elements = yield* Ref.get(groupElements);
        yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.destroy())),
          { concurrency: "unbounded" },
        );
        yield* b.destroy();
      });

      return {
        ...b,
        setVisible,
        render,
        add,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        setContent,
        destroy,
        getElementsCount,
      };
    });

    const text = Effect.fn(function* (content: string, options: TextOptions = {}) {
      const b = yield* base("text", {
        visible: options.visible ?? true,
        selectable: options.selectable ?? true,
        colors: {
          fg: options.fg ?? Colors.Black,
          bg: options.bg ?? Colors.White,
        },
        attributes: options.attributes,
      });
      const textEncoder = new TextEncoder();
      const chunk = TextChunkSchema.make({
        __isChunk: true as const,
        text: textEncoder.encode(content),
        plainText: content,
      });
      const st = new StyledText([chunk]);
      const _content = yield* Ref.make(st);
      const location = yield* Ref.make<{
        x: number;
        y: number;
        type: PositionType;
      }>({ x: 0, y: 0, type: PositionAbsolute.make(2) });
      const dimensions = yield* Ref.make<{
        widthValue: number;
        heightValue: number;
        width: number | "auto" | `${number}%`;
        height: number | "auto" | `${number}%`;
      }>({ width: options.width ?? "auto", height: options.height ?? "auto", widthValue: 0, heightValue: 0 });
      const capacity = 64 as const;
      const tba = yield* lib.createTextBuffer(capacity);
      const textBuffer = new TextBuffer(tba.bufferPtr, tba.buffers, capacity);
      const c = yield* Ref.get(b.colors);
      const bgC = yield* parseColor(c.bg);
      yield* textBuffer.setDefaultBg(bgC);
      const fgC = yield* parseColor(c.fg);
      yield* textBuffer.setDefaultFg(fgC);
      const attrs = yield* Ref.get(b.attributes);
      yield* textBuffer.setDefaultAttributes(attrs);

      const getElements = Effect.fn(function* () {
        return [];
      });

      const getElementsCount = Effect.fn(function* () {
        return 0;
      });

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

      const reevaluateSelection = Effect.fn(function* (width: number, height: number) {
        const cgs = yield* Ref.get(cachedGlobalSelection);
        if (!cgs) {
          return false;
        }
        return yield* onSelectionChanged(cgs, width, height);
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
        const _plainText = content.toString();
        yield* updateTextBuffer();

        b.lineInfo = yield* textBuffer.getLineInfo();

        const numLines = b.lineInfo.lineStarts.length;
        const { width, height, heightValue, widthValue } = yield* Ref.get(dimensions);
        const loc = yield* Ref.get(location);
        if (isPositionAbsolute(loc.type) && height === "auto") {
          yield* Ref.update(dimensions, (d) => ({
            ...d,
            heightValue: numLines,
          }));
          b.layoutNode.yogaNode.markDirty();
        }

        const maxLineWidth = Math.max(...b.lineInfo.lineWidths);
        if (isPositionAbsolute(loc.type) && width === "auto") {
          // widthValue = maxLineWidth;
          yield* Ref.update(dimensions, (d) => ({
            ...d,
            widthValue: maxLineWidth,
          }));
          b.layoutNode.yogaNode.markDirty();
        }
        const { widthValue: w, heightValue: h } = yield* Ref.get(dimensions);
        const changed = reevaluateSelection(w, h);
        if (changed) {
          yield* syncSelectionToTextBuffer();
        }
      });
      yield* updateTextInfo();

      const onResize = Effect.fn(function* (width: number, height: number) {
        const changed = yield* reevaluateSelection(width, height);
        if (changed) {
          yield* syncSelectionToTextBuffer();
        }
      });

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        yield* Effect.log("Rendering text");
        const v = yield* Ref.get(b.visible);
        if (!v) return;
        const loc = yield* Ref.get(location);
        const { widthValue: w, heightValue: h } = yield* Ref.get(dimensions);
        const clipRect = {
          x: loc.x,
          y: loc.y,
          width: w,
          height: h,
        };
        yield* lib.bufferDrawTextBuffer(buffer.ptr, textBuffer.ptr, loc.x, loc.y, clipRect);
        // yield* b.render(buffer, deltaTime);
        // yield* Effect.log("Rendering text");
      });

      const setVisible = Effect.fn(function* (value: boolean) {
        yield* Ref.set(b.visible, value);
      });

      const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});
      const onKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {});

      const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
        yield* onMouseEvent(event);
        const p = yield* Ref.get(b.parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processMouseEvent(event));
        }
      });

      const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
        yield* onKeyboardEvent(event);
        const p = yield* Ref.get(b.parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processKeyboardEvent(event));
        }
      });

      const add = Effect.fn(function* (container: BaseElement, index?: number) {});

      const setContent = Effect.fn(function* (value: string) {
        const textEncoder = new TextEncoder();
        const chunk = TextChunkSchema.make({
          __isChunk: true as const,
          text: textEncoder.encode(content),
          plainText: content,
        });
        const st = new StyledText([chunk]);
        yield* Ref.set(_content, st);
        yield* updateTextInfo();
      });

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        const p = yield* Ref.get(location);
        const { widthValue: w, heightValue: h } = yield* Ref.get(dimensions);
        const localX = x - p.x;
        const localY = y - p.y;
        return localX >= 0 && localX < w && localY >= 0 && localY < h;
      });

      const onSelectionChanged = Effect.fn(function* (
        selection: SelectionState | null,
        width: number,
        height: number = 1,
      ) {
        const previousSelection = yield* Ref.get(b.localSelection);
        if (!selection?.isActive) {
          yield* Ref.set(b.localSelection, null);
          return previousSelection !== null;
        }
        const p = yield* Ref.get(location);
        const myEndY = p.y + height - 1;

        if (myEndY < selection.anchor.y || p.y > selection.focus.y) {
          yield* Ref.set(b.localSelection, null);
          return previousSelection !== null;
        }

        if (height === 1) {
          const textLength = content.length;

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

        const ls = yield* Ref.get(b.localSelection);
        return (
          (ls !== null) !== (previousSelection !== null) ||
          ls?.start !== previousSelection?.start ||
          ls?.end !== previousSelection?.end
        );
      });

      const destroy = Effect.fn(function* () {
        yield* textBuffer.destroy();
      });

      return {
        ...b,
        setVisible,
        render,
        add,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        setContent,
        onResize,
        destroy,
        getElements,
      };
    });

    return {
      root,
      group,
      text,
      updateContext,
    };
  }),
}) {}

export const ElementsLive = Elements.Default;

export type Methods = "group" | "text" | "root";
export type MethodParameters = {
  [key in Methods]: Parameters<Elements[key]>;
};

export type BaseElement = {
  type: Methods;
  id: number;
  selectable: Ref.Ref<boolean>;
  parent: Ref.Ref<BaseElement | null>;
  visible: Ref.Ref<boolean>;
  getElements: () => Effect.Effect<BaseElement[]>;
  getElementsCount: () => Effect.Effect<number>;
  setVisible: (value: boolean) => Effect.Effect<void>;
  render: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void, RendererFailedToDrawTextBuffer>;
  add: (container: BaseElement, index?: number) => Effect.Effect<void>;
  shouldStartSelection: (x: number, y: number) => Effect.Effect<boolean>;
  onSelectionChanged: (selection: SelectionState | null, width: number, height: number) => Effect.Effect<boolean>;
  getSelection: () => Effect.Effect<{ start: number; end: number } | null>;
  processMouseEvent: (event: MouseEvent) => Effect.Effect<void>;
  processKeyboardEvent: (event: KeyboardEvent) => Effect.Effect<void>;
  destroy: () => Effect.Effect<
    void,
    RendererFailedToDestroyTextBuffer | RendererFailedToDestroyOptimizedBuffer,
    Library
  >;
};

type Effects = Effect.Effect.Success<ReturnType<Elements[Methods]>>;

export type Types = Effects["type"];

type SuccessType<T> = T extends Effect.Effect<infer R, unknown, unknown> ? R : never;

type ElementByMethod = {
  [M in Methods]: SuccessType<ReturnType<Elements[M]>>;
};

export type ElementElement<X extends Types> = ElementByMethod[Extract<Methods, X>];
