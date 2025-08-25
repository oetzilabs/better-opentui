import { Effect, Metric, Ref } from "effect";
import Yoga, { Display, Edge, PositionType, type Config as YogaConfig } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import {
  FailedToFreeYogaConfig,
  FailedToFreeYogaNode,
  type CantParseHexColor,
  type Collection,
  type RendererFailedToDestroyOptimizedBuffer,
  type RendererFailedToDestroyTextBuffer,
  type TrackedNodeDestroyed,
} from "../../errors";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import type { SelectionState } from "../../types";
import { Library } from "../../zig";
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
} from "../utils/position";
import { createTrackedNode, TrackedNode } from "../utils/tracknode";
import { type ElementOptions } from "./utils";

const validateOptions = Effect.fn(function* <T extends string, E>(id: string, options: ElementOptions<T, E>) {
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

export type BaseElement<T extends string, E> = {
  type: T;
  id: string;
  num: number;
  selectable: Ref.Ref<boolean>;
  parent: Ref.Ref<BaseElement<any, E> | null>;
  visible: Ref.Ref<boolean>;
  colors: Ref.Ref<{
    fg: Input;
    bg: Input;
    selectableFg: Input;
    selectableBg: Input;
  }>;
  attributes: Ref.Ref<number>;
  location: Ref.Ref<{
    x: number;
    y: number;
    _x: PositionInput;
    _y: PositionInput;
    type: PositionType;
  }>;
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
  renderables: Ref.Ref<BaseElement<any, E>[]>;
  yogaConfig: YogaConfig;
  focused: Ref.Ref<boolean>;
  ensureZIndexSorted: () => Effect.Effect<void>;
  getElements: () => Effect.Effect<BaseElement<any, E>[]>;
  getElementsCount: () => Effect.Effect<number>;
  setVisible: (value: boolean) => Effect.Effect<void>;
  update: () => Effect.Effect<void, Collection, Library>;
  onUpdate: (self: E) => Effect.Effect<void, Collection, Library>;
  render: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void, Collection, Library>;
  add: (
    this: BaseElement<T, E>,
    container: BaseElement<any, E>,
    index?: number | undefined,
  ) => Effect.Effect<void, never, never>;
  setLocation: (loc: { x: number; y: number }) => Effect.Effect<void, never, never>;
  shouldStartSelection: (x: number, y: number) => Effect.Effect<boolean>;
  onSelectionChanged: (
    selection: SelectionState | null,
    w: number,
    h: number,
  ) => Effect.Effect<boolean, Collection | CantParseHexColor, Library>;
  getSelection: () => Effect.Effect<{ start: number; end: number } | null>;
  getSelectedText: () => Effect.Effect<string>;
  processMouseEvent: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  processKeyboardEvent: (event: KeyboardEvent) => Effect.Effect<void, Collection, Library>;
  destroy: () => Effect.Effect<
    void,
    | RendererFailedToDestroyTextBuffer
    | RendererFailedToDestroyOptimizedBuffer
    | TrackedNodeDestroyed
    | FailedToFreeYogaConfig
    | FailedToFreeYogaNode,
    Library
  >;
  onResize: (width: number, height: number) => Effect.Effect<void, Collection | CantParseHexColor, Library>;
  updateFromLayout: () => Effect.Effect<void, Collection, Library>;
  onMouseEvent: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onKeyboardEvent: (event: KeyboardEvent) => Effect.Effect<void, Collection, Library>;
  getRenderable: (id: string) => Effect.Effect<BaseElement<any, E> | undefined, Collection, Library>;
  setBackgroundColor: (
    color: ((oldColor: Input) => Input) | Input,
  ) => Effect.Effect<void, Collection | CantParseHexColor, Library>;
  setForegroundColor: (
    color: ((oldColor: Input) => Input) | Input,
  ) => Effect.Effect<void, Collection | CantParseHexColor, Library>;
  setSelectionBackgroundColor: (
    color: ((oldColor: Input) => Input) | Input,
  ) => Effect.Effect<void, Collection, Library>;
  setSelectionForegroundColor: (
    color: ((oldColor: Input) => Input) | Input,
  ) => Effect.Effect<void, Collection, Library>;
  setFocused: (value: boolean) => Effect.Effect<void, Collection, Library>;
  toString: () => Effect.Effect<string, Collection, Library>;
};

export const elementCounter = Metric.counter("element_counter", {
  description: "a counter that only increases its value",
  incremental: true,
});

export const base = Effect.fn(function* <T extends string, E>(
  type: T,
  options: ElementOptions<T, E> = {
    visible: true,
    selectable: true,
  },
) {
  // id random string
  const id = Math.random().toString(36).slice(2);
  yield* elementCounter(Effect.succeed(1));
  const counter = yield* Metric.value(elementCounter);
  const num = counter.count;
  const visible = yield* Ref.make(options.visible ?? true);
  yield* validateOptions(id, options);
  const location = yield* Ref.make<{
    x: number;
    y: number;
    _x: PositionInput;
    _y: PositionInput;
    type: PositionType;
  }>({
    _x: options.left ?? 0,
    _y: options.top ?? 0,
    x: typeof options.left === "number" ? options.left : 0,
    y: typeof options.top === "number" ? options.top : 0,
    type: options.position ?? PositionAbsolute.make(2),
  });
  const dimensions = yield* Ref.make<{
    widthValue: number;
    heightValue: number;
    width: number | "auto" | `${number}%`;
    height: number | "auto" | `${number}%`;
  }>({
    width: options.width ?? "auto",
    height: options.height ?? "auto",
    widthValue: typeof options.width === "number" ? options.width : 0,
    heightValue: typeof options.height === "number" ? options.height : 0,
  });
  const selectable = yield* Ref.make(options.selectable ?? true);
  const parent = yield* Ref.make<BaseElement<any, E> | null>(null);
  const colors = yield* Ref.make({
    fg: options.colors?.fg ?? Colors.Black,
    bg: options.colors?.bg ?? Colors.Transparent,
    selectableFg: options.colors?.selectableFg ?? Colors.Transparent,
    selectableBg: options.colors?.selectableBg ?? Colors.Transparent,
  });
  const attributes = yield* Ref.make(options.attributes ?? 0);
  const _yogaPerformancePositionUpdated = yield* Ref.make(false);
  const frameBuffer = yield* Ref.make<OptimizedBuffer | null>(null);
  const buffered = yield* Ref.make<boolean>(false);
  const needsZIndexSort = yield* Ref.make(false);
  const zIndex = yield* Ref.make(options.zIndex ?? 0);
  const renderables = yield* Ref.make<BaseElement<any, E>[]>([]);
  const position = yield* Ref.make<Position>({});
  const focused = yield* Ref.make(options.focused ?? false);
  const layoutNode = createTrackedNode();
  const yogaConfig = Yoga.Config.create();
  yogaConfig.setUseWebDefaults(false);
  yogaConfig.setPointScaleFactor(1);

  const setBackgroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(colors, (c) => ({ ...c, bg: color(c.bg) }));
    } else {
      yield* Ref.update(colors, (c) => ({ ...c, bg: color }));
    }
  });

  const setForegroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(colors, (c) => ({ ...c, fg: color(c.fg) }));
    } else {
      yield* Ref.update(colors, (c) => ({ ...c, fg: color }));
    }
  });

  const setSelectionBackgroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(colors, (c) => ({ ...c, selectableBg: color(c.selectableBg) }));
    } else {
      yield* Ref.update(colors, (c) => ({ ...c, selectableBg: color }));
    }
  });

  const setSelectionForegroundColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(colors, (c) => ({ ...c, selectableFg: color(c.selectableFg) }));
    } else {
      yield* Ref.update(colors, (c) => ({ ...c, selectableFg: color }));
    }
  });

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
      } else {
        const p = yield* Ref.get(parent);
        if (p && isPositionRelative(type)) {
          const pL = yield* Ref.get(p.location);
          yield* Ref.update(location, (l) => ({ ...l, y: pL.y + l.y }));
        }
      }
      if (typeof left === "number" && isPositionAbsolute(type)) {
        yield* Ref.update(location, (l) => ({ ...l, x: left }));
      } else {
        const p = yield* Ref.get(parent);
        if (p && isPositionRelative(type)) {
          const pL = yield* Ref.get(p.location);
          yield* Ref.update(location, (l) => ({ ...l, x: pL.x + l.x }));
        }
      }

      yield* Ref.set(_yogaPerformancePositionUpdated, false);
    }
  });

  const setupMarginAndPadding = Effect.fn(function* (options: ElementOptions<T, E>) {
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

  const setupYogaProperties = Effect.fn(function* (options: ElementOptions<T, E>) {
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

  const onResize: BaseElement<any, E>["onResize"] = Effect.fn(function* (width: number, height: number) {
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
  yield* setupYogaProperties(options);

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

  // const update = Effect.fn("base.update")(function* () {
  //   const es = yield* Ref.get(renderables);
  //   yield* Effect.all(
  //     es.map((e) => Effect.suspend(() => e.onUpdate(e)), { concurrency: "unbounded", concurrentFinalizers: true }),
  //   );
  // });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
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

  const onMouseEvent: BaseElement<any, E>["onMouseEvent"] =
    options.onMouseEvent ??
    Effect.fn("base.onMouseEvent")(function* (event: MouseEvent) {
      if (!event.defaultPrevented) {
        const es = yield* Ref.get(renderables);
        yield* Effect.all(es.map((e) => Effect.suspend(() => e.processMouseEvent(event))));
      }
    });

  const onKeyboardEvent: BaseElement<any, E>["onKeyboardEvent"] =
    options.onKeyboardEvent ??
    Effect.fn("base.onKeyboardEvent")(function* (event: KeyboardEvent) {
      if (!event.defaultPrevented) {
        const es = yield* Ref.get(renderables);
        yield* Effect.all(es.map((e) => Effect.suspend(() => e.processKeyboardEvent(event))));
      }
    });

  const processMouseEvent = Effect.fn(function* (handler: BaseElement<any, E>["onMouseEvent"], event: MouseEvent) {
    yield* handler(event);
  });

  const processKeyboardEvent = Effect.fn(function* (
    handler: BaseElement<any, E>["onKeyboardEvent"],
    event: KeyboardEvent,
  ) {
    yield* handler(event);
    const p = yield* Ref.get(parent);
    if (p && !event.defaultPrevented) {
      yield* Effect.suspend(() => p.processKeyboardEvent(event));
    }
  });

  const add = Effect.fn(function* (parentElement: BaseElement<any, E>, container: BaseElement<any, E>, index?: number) {
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

  const onSelectionChanged: (
    selection: SelectionState | null,
    w: number,
    h: number,
  ) => Effect.Effect<boolean, Collection | CantParseHexColor, Library> = Effect.fn(function* (
    selection: SelectionState | null,
    w: number,
    h: number,
  ) {
    return false;
  });

  const getSelection = Effect.fn(function* () {
    const local = yield* Ref.get(localSelection);
    return local;
  });

  const getSelectedText = Effect.fn(function* () {
    return "";
  });

  const destroy = Effect.fn(function* () {
    const elements = yield* Ref.get(renderables);
    yield* Effect.all(
      elements.map((r) => Effect.suspend(() => r.destroy())),
      { concurrency: "unbounded", concurrentFinalizers: true },
    );
    yield* layoutNode.destroy();
    yield* Effect.try({
      try: () => yogaConfig.free(),
      catch: (cause) => new FailedToFreeYogaConfig({ cause }),
    });
  });

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

  const getRenderable = Effect.fn(function* (id: string) {
    const elements = yield* Ref.get(renderables);
    return elements.find((e) => e.id === id);
  });

  const setFocused = Effect.fn(function* (value: boolean) {
    yield* Ref.set(focused, value);
  });

  const onUpdate: BaseElement<any, E>["onUpdate"] = Effect.fn(function* <T>(self: T) {
    const es = yield* Ref.get(renderables);
    yield* Effect.all(
      es.map((e) => Effect.suspend(() => e.update())),
      { concurrency: "unbounded", concurrentFinalizers: true },
    );
  });

  const setLocation = Effect.fn(function* (loc: { x: number; y: number }) {
    yield* Ref.update(location, (l) => ({
      ...l,
      _x: loc.x,
      _y: loc.y,
      x: loc.x,
      y: loc.y,
    }));
  });

  const toString = Effect.fn(function* () {
    const es = yield* Ref.get(renderables);
    const texts = yield* Effect.all(es.map((e) => Effect.suspend(() => e.toString())));
    return texts.join("\n");
  });

  return {
    id,
    num,
    type,
    visible,
    focused,
    colors,
    attributes,
    parent,
    selectable,
    dimensions,
    layoutNode,
    yogaConfig,
    localSelection,
    lineInfo,
    zIndex,
    renderables,
    ensureZIndexSorted,
    setVisible,
    render,
    add: function (this, container: BaseElement<any, any>, index?: number) {
      return add(this, container, index);
    },
    setLocation,
    getSelection,
    getSelectedText,
    getRenderable,
    shouldStartSelection,
    onSelectionChanged,
    onMouseEvent,
    processMouseEvent: function (this, event: MouseEvent) {
      const handler = this.onMouseEvent;
      return processMouseEvent(handler, event);
    },
    onKeyboardEvent,
    processKeyboardEvent: function (this, event: KeyboardEvent) {
      const handler = this.onKeyboardEvent;
      return processKeyboardEvent(handler, event);
    },
    onUpdate,
    update: function (this) {
      const handler = this.onUpdate;
      return handler(this as E);
    },
    setFocused,
    destroy,
    getElements,
    getElementsCount,
    onResize,
    updateFromLayout,
    location,
    setBackgroundColor,
    setForegroundColor,
    setSelectionBackgroundColor,
    setSelectionForegroundColor,
    toString,
  } satisfies BaseElement<T, E>;
});
