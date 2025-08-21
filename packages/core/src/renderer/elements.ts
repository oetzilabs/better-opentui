import { Effect, Ref } from "effect";
import { Direction, Display, Edge, MeasureMode } from "yoga-layout";
import { OptimizedBuffer } from "../buffer/optimized";
import { TextBuffer, TextChunkSchema } from "../buffer/text";
import { Colors, Input } from "../colors";
import type {
  CantParseHexColor,
  Collection,
  RendererFailedToAddToHitGrid,
  RendererFailedToDestroyOptimizedBuffer,
  RendererFailedToDestroyTextBuffer,
  TrackedNodeDestroyed,
} from "../errors";
import type { KeyboardEvent } from "../events/keyboard";
import type { MouseEvent } from "../events/mouse";
import type { SelectionState } from "../types";
import { parseColor } from "../utils";
import { Library } from "../zig";
import type { LayoutOptions } from "./layout";
import { StyledText } from "./styled-text";
import { createTrackedNode, TrackedNode } from "./tracknode";
import {
  isDimension,
  isFlexBasis,
  isPercentageNumberMixed,
  isPositionAbsolute,
  isPositionInput,
  isPositionRecord,
  isPositionRelative,
  isPositionType,
  isSize,
  Position,
  PositionAbsolute,
  PositionInput,
  PositionRelative,
  PositionType,
} from "./utils/position";

export type ElementOptions = Partial<LayoutOptions> & {
  visible?: boolean;
  selectable?: boolean;
  colors?: {
    fg?: Input;
    bg?: Input;
    selectableFg?: Input;
    selectableBg?: Input;
  };
  attributes?: number;
};

export interface TextOptions extends ElementOptions {
  content?: StyledText | string;
}

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

const validateOptions = Effect.fn(function* (id: number, options: ElementOptions) {
  if (typeof options.width === "number") {
    if (options.width < 0) {
      return yield* Effect.fail(new TypeError(`Invalid width for Renderable ${id}: ${options.width}`));
    }
  }
  if (typeof options.height === "number") {
    if (options.height < 0) {
      return yield* Effect.fail(new TypeError(`Invalid height for Renderable ${id}: ${options.height}`));
    }
  }
  yield* Effect.succeed(true);
});

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
      const visible = yield* Ref.make(options.visible ?? true);
      yield* validateOptions(id, options);
      const location = yield* Ref.make<{
        x: number;
        y: number;
        type: PositionType;
      }>({ x: options.left ?? 0, y: options.top ?? 0, type: PositionAbsolute.make(2) });
      const dimensions = yield* Ref.make<{
        widthValue: number;
        heightValue: number;
        width: number | "auto" | `${number}%`;
        height: number | "auto" | `${number}%`;
      }>({ width: "auto", height: "auto", widthValue: 0, heightValue: 0 });
      const selectable = yield* Ref.make(options.selectable ?? true);
      const parent = yield* Ref.make<BaseElement | null>(null);
      const colors = yield* Ref.make({
        fg: options.colors?.fg ?? Colors.White,
        bg: options.colors?.bg ?? Colors.Black,
        selectableFg: options.colors?.selectableFg ?? Colors.White,
        selectableBg: options.colors?.selectableBg ?? Colors.Black,
      });
      const attributes = yield* Ref.make(options.attributes ?? 0);
      const _yogaPerformancePositionUpdated = yield* Ref.make(false);
      const frameBuffer = yield* Ref.make<OptimizedBuffer | null>(null);
      const buffered = yield* Ref.make<boolean>(false);
      const needsZIndexSort = yield* Ref.make(false);
      const zIndex = yield* Ref.make(options.zIndex ?? 0);
      const renderables = yield* Ref.make<BaseElement[]>([]);
      const position = yield* Ref.make<Position>({});

      const ensureZIndexSorted = Effect.fn(function* () {
        const needsSort = yield* Ref.get(needsZIndexSort);

        if (needsSort) {
          const elements = yield* Ref.get(renderables);

          const zIndexPlusId = elements.map((e) => ({ zIndex: e.zIndex, id: e.id }));
          zIndexPlusId.sort((a, b) => (a.zIndex > b.zIndex ? 1 : a.zIndex < b.zIndex ? -1 : 0));
          const sortedElements = zIndexPlusId.map((e) => elements.find((el) => el.id === e.id)!);

          yield* Ref.set(renderables, sortedElements);
          yield* Ref.set(needsZIndexSort, false);
        }
      });

      const requestLayout = Effect.fn(function* () {
        const yppu = yield* Ref.get(_yogaPerformancePositionUpdated);
        if (!yppu) {
          const layout = layoutNode.yogaNode.getComputedLayout();
          const { x, y } = yield* Ref.get(location);
          if (layout.left !== x || layout.top !== y) {
            layoutNode.yogaNode.setPosition(Edge.Left, x);
            layoutNode.yogaNode.setPosition(Edge.Top, y);
          }
          yield* Ref.set(_yogaPerformancePositionUpdated, true);
        }
      });

      const updateYogaPosition = Effect.fn(function* (position: Position) {
        const node = layoutNode.yogaNode;
        const { top, right, bottom, left } = position;
        const { type } = yield* Ref.get(location);
        if (isPositionRelative(type)) {
          if (isPositionInput(top)) {
            if (top === "auto") {
              node.setPositionAuto(Edge.Top);
            } else {
              node.setPosition(Edge.Top, top);
            }
          }
          if (isPositionInput(right)) {
            if (right === "auto") {
              node.setPositionAuto(Edge.Right);
            } else {
              node.setPosition(Edge.Right, right);
            }
          }
          if (isPositionInput(bottom)) {
            if (bottom === "auto") {
              node.setPositionAuto(Edge.Bottom);
            } else {
              node.setPosition(Edge.Bottom, bottom);
            }
          }
          if (isPositionInput(left)) {
            if (left === "auto") {
              node.setPositionAuto(Edge.Left);
            } else {
              node.setPosition(Edge.Left, left);
            }
          }
          yield* requestLayout();
        } else {
          if (typeof top === "number" && isPositionAbsolute(type)) {
            yield* Ref.update(location, (l) => ({ ...l, y: top }));
          }
          if (typeof left === "number" && isPositionAbsolute(type)) {
            yield* Ref.update(location, (l) => ({ ...l, x: left }));
          }
          yield* Ref.set(_yogaPerformancePositionUpdated, false);
        }
      });

      const setupMarginAndPadding = Effect.fn(function* (options: ElementOptions) {
        const node = layoutNode.yogaNode;

        if (isPercentageNumberMixed(options.margin)) {
          node.setMargin(Edge.Top, options.margin);
          node.setMargin(Edge.Right, options.margin);
          node.setMargin(Edge.Bottom, options.margin);
          node.setMargin(Edge.Left, options.margin);
        }

        if (options.margin && isPositionRecord(options.margin) && isPercentageNumberMixed(options.margin.top)) {
          node.setMargin(Edge.Top, options.margin.top);
        }
        if (options.margin && isPositionRecord(options.margin) && isPercentageNumberMixed(options.margin.right)) {
          node.setMargin(Edge.Right, options.margin.right);
        }
        if (options.margin && isPositionRecord(options.margin) && isPercentageNumberMixed(options.margin.bottom)) {
          node.setMargin(Edge.Bottom, options.margin.bottom);
        }
        if (options.margin && isPositionRecord(options.margin) && isPercentageNumberMixed(options.margin.left)) {
          node.setMargin(Edge.Left, options.margin.left);
        }

        if (options.padding && isPercentageNumberMixed(options.padding)) {
          node.setPadding(Edge.Top, options.padding);
          node.setPadding(Edge.Right, options.padding);
          node.setPadding(Edge.Bottom, options.padding);
          node.setPadding(Edge.Left, options.padding);
        }

        if (options.padding && isPositionRecord(options.padding) && isPercentageNumberMixed(options.padding.top)) {
          node.setPadding(Edge.Top, options.padding.top);
        }
        if (options.padding && isPositionRecord(options.padding) && isPercentageNumberMixed(options.padding.right)) {
          node.setPadding(Edge.Right, options.padding.right);
        }
        if (options.padding && isPositionRecord(options.padding) && isPercentageNumberMixed(options.padding.bottom)) {
          node.setPadding(Edge.Bottom, options.padding.bottom);
        }
        if (options.padding && isPositionRecord(options.padding) && isPercentageNumberMixed(options.padding.left)) {
          node.setPadding(Edge.Left, options.padding.left);
        }
      });

      const setupYogaProperties = Effect.fn(function* (options: ElementOptions) {
        const node = layoutNode.yogaNode;
        const v = yield* Ref.get(visible);
        node.setDisplay(v ? Display.Flex : Display.None);

        if (isFlexBasis(options.flexBasis)) {
          node.setFlexBasis(options.flexBasis);
        }

        if (isSize(options.minWidth)) {
          node.setMinWidth(options.minWidth);
        }
        if (isSize(options.minHeight)) {
          node.setMinHeight(options.minHeight);
        }

        if (options.flexGrow !== undefined) {
          node.setFlexGrow(options.flexGrow);
        } else {
          node.setFlexGrow(0);
        }

        if (options.flexShrink !== undefined) {
          node.setFlexShrink(options.flexShrink);
        } else {
          const shrinkValue = options.flexGrow && options.flexGrow > 0 ? 1 : 0;
          node.setFlexShrink(shrinkValue);
        }

        if (options.flexDirection !== undefined) {
          const flexDirection = node.setFlexDirection(options.flexDirection);
        }
        if (options.alignItems !== undefined) {
          node.setAlignItems(options.alignItems);
        }
        if (options.justifyContent !== undefined) {
          node.setJustifyContent(options.justifyContent);
        }

        if (options.width && isDimension(options.width)) {
          yield* Ref.update(dimensions, (d) => ({ ...d, width: options.width! }));
          yield* layoutNode.setWidth(options.width);
        }
        if (options.height && isDimension(options.height)) {
          yield* Ref.update(dimensions, (d) => ({ ...d, height: options.height! }));
          yield* layoutNode.setHeight(options.height);
        }

        yield* setPosition(options.position ?? PositionRelative.make(1));
        const { type } = yield* Ref.get(location);
        if (isPositionAbsolute(type)) {
          node.setPositionType(type);
        }

        // TODO: flatten position properties internally as well
        const hasPositionProps =
          options.top !== undefined ||
          options.right !== undefined ||
          options.bottom !== undefined ||
          options.left !== undefined;
        if (hasPositionProps) {
          const pos = yield* Ref.updateAndGet(position, (p) => ({
            top: options.top,
            right: options.right,
            bottom: options.bottom,
            left: options.left,
          }));

          yield* updateYogaPosition(pos);
        }

        if (isSize(options.maxWidth)) {
          node.setMaxWidth(options.maxWidth);
        }
        if (isSize(options.maxHeight)) {
          node.setMaxHeight(options.maxHeight);
        }

        yield* setupMarginAndPadding(options);
      });

      const createFrameBuffer = Effect.fn(function* () {
        const { widthValue: w, heightValue: h } = yield* Ref.get(dimensions);

        if (w <= 0 || h <= 0) {
          return;
        }

        const fb = yield* OptimizedBuffer.create(w, h, {
          respectAlpha: true,
        }).pipe(Effect.catchAll(() => Effect.succeed(null)));

        yield* Ref.set(frameBuffer, fb);
      });

      const handleFrameBufferResize = Effect.fn(function* (width: number, height: number) {
        const buf = yield* Ref.get(buffered);
        if (!buf) return;

        if (width <= 0 || height <= 0) {
          return;
        }
        const fb = yield* Ref.get(frameBuffer);
        if (fb) {
          yield* fb.resize(width, height);
        } else {
          yield* createFrameBuffer();
        }
      });

      const onResize: BaseElement["onResize"] = Effect.fn(function* (width: number, height: number) {
        // Override in subclasses for additional resize logic
      });

      const onLayoutResize = Effect.fn(function* (width: number, height: number) {
        const v = yield* Ref.get(visible);
        if (v) {
          yield* handleFrameBufferResize(width, height);
          yield* onResize(width, height);
        }
      });

      const setPosition = Effect.fn(function* (type: PositionType) {
        const { type: oldType } = yield* Ref.get(location);
        if (!isPositionType(type) || oldType === type) return;
        const { type: newType } = yield* Ref.updateAndGet(location, (l) => ({ ...l, type }));
        layoutNode.yogaNode.setPositionType(newType);
        yield* Ref.set(_yogaPerformancePositionUpdated, true);
      });

      const updateFromLayout = Effect.fn(function* () {
        const layout = layoutNode.yogaNode.getComputedLayout();
        const { type } = yield* Ref.get(location);
        const yppu = yield* Ref.get(_yogaPerformancePositionUpdated);
        if (isPositionRelative(type) || yppu) {
          yield* Ref.update(location, (l) => ({ ...l, x: layout.left, y: layout.top }));
        }

        const newWidth = Math.max(layout.width, 1);
        const newHeight = Math.max(layout.height, 1);
        const { width: oldWidth, height: oldHeight } = yield* Ref.get(dimensions);
        const sizeChanged = oldWidth !== newWidth || oldHeight !== newHeight;

        yield* Ref.update(dimensions, (d) => ({ ...d, width: newWidth, height: newHeight }));

        if (sizeChanged) {
          yield* onLayoutResize(newWidth, newHeight);
        }
      });

      const render: BaseElement["render"] = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        const es = yield* Ref.get(renderables);
        for (const element of es) {
          yield* Effect.suspend(() => element.render(buffer, deltaTime));
        }
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

      const add = Effect.fn(function* (parentElement: BaseElement, container: BaseElement, index?: number) {
        if (index === undefined) {
          const cs = yield* Ref.get(renderables);
          index = cs.length;
        }

        yield* Ref.set(parent, parentElement);

        yield* Ref.update(renderables, (cs) => {
          if (index === cs.length) {
            cs.push(container);
          } else {
            cs.splice(index, 0, container);
          }
          return cs;
        });
      });

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        const p = yield* Ref.get(location);
        const { widthValue: width, heightValue: height } = yield* Ref.get(dimensions);
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

      const getSelectedText = Effect.fn(function* () {
        return "";
      });

      const destroy = Effect.fn(function* () {});

      const getElements = Effect.fn(function* () {
        const es = yield* Ref.get(renderables);
        return es;
      });

      const getElementsCount = Effect.fn(function* () {
        const es = yield* Ref.get(renderables);
        let count = es.length; // Count direct renderables

        // Recursively count nested elements
        for (const element of es) {
          const nestedCount = yield* Effect.suspend(() => element.getElementsCount());
          count += nestedCount;
        }

        return count;
      });

      yield* setupYogaProperties(options);

      return {
        id,
        type,
        visible,
        colors,
        attributes,
        parent,
        selectable,
        dimensions,
        layoutNode,
        localSelection,
        lineInfo,
        zIndex,
        renderables,
        ensureZIndexSorted,
        setVisible,
        render,
        add,
        getSelection,
        getSelectedText,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        destroy,
        getElements,
        getElementsCount,
        onResize,
        updateFromLayout,
      } satisfies BaseElement;
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

      const calculateLayout = Effect.fn(function* () {
        const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);
        b.layoutNode.yogaNode.calculateLayout(width, height, Direction.LTR);
      });

      b.render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        // we are in the `render` method of the root element, so we need to render all the elements
        if (b.layoutNode.yogaNode.isDirty()) {
          yield* calculateLayout();
        }
        yield* b.updateFromLayout();
        const elements = yield* Ref.get(b.renderables);
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
        const elements = yield* Ref.get(b.renderables);
        return elements.find((e) => e.id === id);
      });

      const setVisible = Effect.fn(function* (value: boolean) {
        yield* Ref.set(b.visible, value);
      });

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        const elements = yield* Ref.get(b.renderables);
        return yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.shouldStartSelection(x, y))),
        ).pipe(Effect.map((shouldStarts) => shouldStarts.some((shouldStart) => shouldStart)));
      });

      const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null, width: number, height: number) {
        const elements = yield* Ref.get(b.renderables);
        return yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.onSelectionChanged(selection, width, height))),
        ).pipe(Effect.map((changeds) => changeds.some((changed) => changed)));
      });

      const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
        const elements = yield* Ref.get(b.renderables);
        yield* Effect.all(elements.map((element) => Effect.suspend(() => element.processMouseEvent(event))));
      });

      const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
        const elements = yield* Ref.get(b.renderables);
        yield* Effect.all(elements.map((element) => Effect.suspend(() => element.processKeyboardEvent(event))));
      });

      const destroy = Effect.fn(function* () {
        const elements = yield* Ref.get(b.renderables);
        yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.destroy())),
          { concurrency: "unbounded" },
        );
        yield* b.destroy();
      });

      return {
        ...b,
        resize,
        getRenderable,
        setVisible,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        destroy,
      } as const;
    });

    const group = Effect.fn(function* () {
      const b = yield* base("group");
      const parent = yield* Ref.make<BaseElement | null>(null);

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
        yield* Ref.set(b.renderables, [value]);
      });

      const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
        yield* onKeyboardEvent(event);
        const p = yield* Ref.get(b.parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processKeyboardEvent(event));
        }
      });

      const destroy = Effect.fn(function* () {
        const elements = yield* Ref.get(b.renderables);
        yield* Effect.all(
          elements.map((element) => Effect.suspend(() => element.destroy())),
          { concurrency: "unbounded" },
        );
        yield* b.destroy();
      });

      return {
        ...b,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        setContent,
        destroy,
      };
    });

    const text = Effect.fn(function* (content: string, options: TextOptions = {}) {
      const b = yield* base("text", {
        visible: options.visible ?? true,
        selectable: options.selectable ?? true,
        colors: {
          fg: options.colors?.fg ?? Colors.Black,
          bg: options.colors?.bg ?? Colors.White,
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
      yield* Ref.update(b.dimensions, (d) => ({
        ...d,
        width: options.width ?? "auto",
        height: options.height ?? "auto",
      }));
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
        const { width, height, heightValue, widthValue } = yield* Ref.get(b.dimensions);
        const loc = yield* Ref.get(location);
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
        const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
        const changed = reevaluateSelection(w, h);
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

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        // we are in the `render` method of the text element, so we need to render only the text
        const v = yield* Ref.get(b.visible);
        if (!v) return;
        const loc = yield* Ref.get(location);
        const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
        const clipRect = {
          x: loc.x,
          y: loc.y,
          width: w,
          height: h,
        };
        yield* lib.bufferDrawTextBuffer(buffer.ptr, textBuffer.ptr, loc.x, loc.y, clipRect);
        const ctx = yield* Ref.get(context);
        const { x, y } = yield* Ref.get(location);
        yield* ctx.addToHitGrid(x, y, w, h, b.id);
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
        const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
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

      const getSelectedText = Effect.fn(function* () {
        const local = yield* Ref.get(b.localSelection);
        if (!local) return "";
        const c = yield* Ref.get(_content);
        return c.toString().slice(local.start, local.end);
      });

      return {
        ...b,
        getSelectedText,
        render,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        processKeyboardEvent,
        setContent,
        destroy,
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
  colors: Ref.Ref<{
    fg: Input;
    bg: Input;
    selectableFg: Input;
    selectableBg: Input;
  }>;
  attributes: Ref.Ref<number>;
  dimensions: Ref.Ref<{
    widthValue: number;
    heightValue: number;
    width: number | "auto" | `${number}%`;
    height: number | "auto" | `${number}%`;
  }>;
  localSelection: Ref.Ref<{ start: number; end: number } | null>;
  lineInfo: { lineStarts: number[]; lineWidths: number[] };
  layoutNode: TrackedNode;
  zIndex: Ref.Ref<number>;
  renderables: Ref.Ref<BaseElement[]>;
  ensureZIndexSorted: () => Effect.Effect<void>;
  getElements: () => Effect.Effect<BaseElement[]>;
  getElementsCount: () => Effect.Effect<number>;
  setVisible: (value: boolean) => Effect.Effect<void>;
  render: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void, Collection, Library>;
  add: (parent: BaseElement, container: BaseElement, index?: number) => Effect.Effect<void>;
  shouldStartSelection: (x: number, y: number) => Effect.Effect<boolean>;
  onSelectionChanged: (selection: SelectionState | null, width: number, height: number) => Effect.Effect<boolean>;
  getSelection: () => Effect.Effect<{ start: number; end: number } | null>;
  getSelectedText: () => Effect.Effect<string>;
  processMouseEvent: (event: MouseEvent) => Effect.Effect<void>;
  processKeyboardEvent: (event: KeyboardEvent) => Effect.Effect<void>;
  destroy: () => Effect.Effect<
    void,
    RendererFailedToDestroyTextBuffer | RendererFailedToDestroyOptimizedBuffer | TrackedNodeDestroyed,
    Library
  >;
  onResize: (width: number, height: number) => Effect.Effect<void, CantParseHexColor, Library>;
  updateFromLayout: () => Effect.Effect<void, Collection, Library>;
};

type Effects = Effect.Effect.Success<ReturnType<Elements[Methods]>>;

export type Types = Effects["type"];

type SuccessType<T> = T extends Effect.Effect<infer R, unknown, unknown> ? R : never;

type ElementByMethod = {
  [M in Methods]: SuccessType<ReturnType<Elements[M]>>;
};

export type ElementElement<X extends Types> = ElementByMethod[Extract<Methods, X>];
