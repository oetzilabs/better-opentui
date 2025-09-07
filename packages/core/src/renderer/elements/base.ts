import type { FileSystem, Path } from "@effect/platform";
import { Effect, Metric, Ref } from "effect";
import Yoga, { Display, Edge, PositionType, type Config as YogaConfig } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import {
  CannotAddElementToItself,
  CannotCreateCycleInElementTree,
  FailedToFreeYogaConfig,
  FailedToFreeYogaNode,
  RendererFailedToCreateFrameBuffer,
  RendererFailedToSetCursorColor,
  RendererFailedToSetCursorPosition,
  RendererFailedToSetCursorStyle,
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
import { type Binds, type ElementOptions } from "./utils";

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
    focusedFg: Input;
    focusedBg: Input;
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
  layoutNode: TrackedNode<T>;
  zIndex: Ref.Ref<number>;
  renderables: Ref.Ref<BaseElement<any, E>[]>;
  yogaConfig: YogaConfig;
  focused: Ref.Ref<boolean>;
  ensureZIndexSorted: () => Effect.Effect<void>;
  getElements: () => Effect.Effect<BaseElement<any, E>[]>;
  getElementsCount: () => Effect.Effect<number>;
  setVisible: (value: boolean) => Effect.Effect<void>;
  update: () => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onUpdate: (self: E) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  doRender: () => (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void, Collection, Library>;
  render: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void, Collection, Library>;
  add: (container: BaseElement<any, any>, index?: number | undefined) => Effect.Effect<void, Collection, never>;
  remove: (container: BaseElement<any, any>) => Effect.Effect<void, Collection, never>;
  setLocation: (loc: { x: number; y: number }) => Effect.Effect<void, never, never>;
  shouldStartSelection: (x: number, y: number) => Effect.Effect<boolean>;
  onSelectionChanged: (
    selection: SelectionState | null,
  ) => Effect.Effect<boolean, Collection | CantParseHexColor, Library>;
  getSelection: () => Effect.Effect<{ start: number; end: number } | null>;
  getSelectedText: () => Effect.Effect<string, Collection, Library>;
  processMouseEvent: (
    event: MouseEvent,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  processKeyboardEvent: (
    event: KeyboardEvent,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  destroy: () => Effect.Effect<
    void,
    | RendererFailedToDestroyTextBuffer
    | RendererFailedToSetCursorPosition
    | RendererFailedToDestroyOptimizedBuffer
    | TrackedNodeDestroyed
    | FailedToFreeYogaConfig
    | FailedToFreeYogaNode,
    Library
  >;
  onResize: (width: number, height: number) => Effect.Effect<void, Collection | CantParseHexColor, Library>;
  updateFromLayout: (self: E) => Effect.Effect<void, Collection, Library>;
  onMouseEvent: (event: MouseEvent) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onKeyboardEvent: (
    event: KeyboardEvent,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
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
  setFocused: (
    value: boolean,
  ) => Effect.Effect<
    void,
    | Collection
    | CantParseHexColor
    | RendererFailedToSetCursorPosition
    | RendererFailedToSetCursorStyle
    | RendererFailedToSetCursorColor,
    Library
  >;
  toString: () => Effect.Effect<string, Collection, Library>;
  getTreeInfo: (self: E) => Effect.Effect<string>;
  setupYogaProperties: (options: ElementOptions<T, E>) => Effect.Effect<void, Collection, Library>;
  createFrameBuffer: () => Effect.Effect<OptimizedBuffer | null, Collection, Library>;
};

export const elementCounter = Metric.counter("element_counter", {
  description: "this counter increases the num of the element",
  incremental: true,
});

export const base = Effect.fn(function* <T extends string, E extends BaseElement<any, any>>(
  type: T,
  binds: Binds,
  options: ElementOptions<T, E> = {
    visible: true,
    selectable: true,
  },
  parentElement: BaseElement<any, any> | null = null,
) {
  // id random string
  const id = Math.random().toString(36).slice(2);
  yield* elementCounter(Effect.succeed(1));
  const counter = yield* Metric.value(elementCounter);
  const num = Math.max(1, counter.count);
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
  const parent = yield* Ref.make<BaseElement<any, E> | null>(parentElement);
  const colors = yield* Ref.make({
    fg: options.colors?.fg ?? Colors.Black,
    bg: options.colors?.bg ?? Colors.Transparent,
    selectableFg: options.colors?.selectableFg ?? Colors.Transparent,
    selectableBg: options.colors?.selectableBg ?? Colors.Transparent,
    focusedFg: options.colors?.focusedFg ?? Colors.Black,
    focusedBg: options.colors?.focusedBg ?? Colors.Transparent,
  });
  const attributes = yield* Ref.make(options.attributes ?? 0);
  const _yogaPerformancePositionUpdated = yield* Ref.make(false);
  const needsZIndexSort = yield* Ref.make(false);
  const zIndex = yield* Ref.make(options.zIndex ?? 0);
  const renderables = yield* Ref.make<BaseElement<any, E>[]>([]);
  const position = yield* Ref.make<Position>({});
  const focused = yield* Ref.make(options.focused ?? false);
  const yogaConfig = Yoga.Config.create();
  yogaConfig.setUseWebDefaults(false);
  yogaConfig.setPointScaleFactor(1);
  const layoutNode = createTrackedNode(type, {}, yogaConfig, parentElement?.layoutNode);
  const _setupYogaNode = yield* Ref.make(false);
  const overflow = yield* Ref.make<"visible" | "hidden" | "scroll">(options.overflow ?? "visible");

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
      const p = yield* Ref.get(parent);
      if (p) {
        const pL = yield* Ref.get(p.location);
        yield* Ref.update(location, (l) => ({ ...l, y: pL.y + l.y, x: pL.x + l.x }));
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
    const v = yield* Ref.get(visible);
    layoutNode.yogaNode.setDisplay(v ? Display.Flex : Display.None);

    if (isFlexBasis(options.flexBasis)) {
      layoutNode.yogaNode.setFlexBasis(options.flexBasis);
    }

    if (isSize(options.minWidth)) {
      layoutNode.yogaNode.setMinWidth(options.minWidth);
    }
    if (isSize(options.minHeight)) {
      layoutNode.yogaNode.setMinHeight(options.minHeight);
    }

    if (options.flexGrow !== undefined) {
      layoutNode.yogaNode.setFlexGrow(options.flexGrow);
    } else {
      layoutNode.yogaNode.setFlexGrow(0);
    }

    if (options.flexShrink !== undefined) {
      layoutNode.yogaNode.setFlexShrink(options.flexShrink);
    } else {
      const shrinkValue = options.flexGrow && options.flexGrow > 0 ? 1 : 0;
      layoutNode.yogaNode.setFlexShrink(shrinkValue);
    }

    if (options.flexDirection !== undefined) {
      layoutNode.yogaNode.setFlexDirection(options.flexDirection);
    }
    if (options.alignItems !== undefined) {
      layoutNode.yogaNode.setAlignItems(options.alignItems);
    }
    if (options.justifyContent !== undefined) {
      layoutNode.yogaNode.setJustifyContent(options.justifyContent);
    }

    if (options.width && isDimension(options.width)) {
      yield* Ref.update(dimensions, (d) => ({ ...d, width: options.width! }));
      const w = options.width;
      if (typeof w === "number") {
        yield* Ref.update(dimensions, (d) => ({ ...d, widthValue: w }));
      }
      yield* layoutNode.setWidth(w);
      if (typeof w === "string" && w.endsWith("%")) {
        const parsed = yield* layoutNode.parseWidth(w);
        if (typeof parsed === "number") {
          yield* Ref.update(dimensions, (d) => ({ ...d, widthValue: parsed }));
        }
      }
      if (w === "auto") {
        let current = parentElement;
        let effectiveWidth = 0;
        while (current) {
          const dims = yield* Ref.get(current.dimensions);
          if (dims.widthValue > 0) {
            effectiveWidth = dims.widthValue;
            break;
          }
          current = yield* Ref.get(current.parent);
        }
        if (effectiveWidth > 0) {
          yield* Ref.update(dimensions, (d) => ({ ...d, widthValue: effectiveWidth }));
        } else {
          yield* Ref.update(dimensions, (d) => ({ ...d, widthValue: 1 }));
        }
      }
    }
    if (options.height && isDimension(options.height)) {
      yield* Ref.update(dimensions, (d) => ({ ...d, height: options.height! }));
      const h = options.height;
      if (typeof h === "number") {
        yield* Ref.update(dimensions, (d) => ({ ...d, heightValue: h }));
      }
      yield* layoutNode.setHeight(h);
      if (typeof h === "string" && h.endsWith("%")) {
        const parsed = yield* layoutNode.parseHeight(h);
        if (typeof parsed === "number") {
          yield* Ref.update(dimensions, (d) => ({ ...d, heightValue: parsed }));
        }
      }
      if (h === "auto") {
        let current = parentElement;
        let effectiveHeight = 0;
        while (current) {
          const dims = yield* Ref.get(current.dimensions);
          if (dims.heightValue > 0) {
            effectiveHeight = dims.heightValue;
            break;
          }
          current = yield* Ref.get(current.parent);
        }
        if (effectiveHeight > 0) {
          yield* Ref.update(dimensions, (d) => ({ ...d, heightValue: effectiveHeight }));
        } else {
          yield* Ref.update(dimensions, (d) => ({ ...d, heightValue: 1 }));
        }
      }
    }

    yield* setPosition(options.position ?? PositionRelative.make(1));
    const { type: posType } = yield* Ref.get(location);
    if (isPositionAbsolute(posType)) {
      layoutNode.yogaNode.setPositionType(posType);
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
      layoutNode.yogaNode.setMaxWidth(options.maxWidth);
    }
    if (isSize(options.maxHeight)) {
      layoutNode.yogaNode.setMaxHeight(options.maxHeight);
    }

    yield* setupMarginAndPadding(options);
    yield* Ref.set(_setupYogaNode, true);
  });

  const createFrameBuffer = Effect.fn(function* () {
    const x = yield* Ref.get(_setupYogaNode);
    if (!x) {
      yield* setupYogaProperties(options);
    }
    const { widthValue: w, heightValue: h } = yield* Ref.get(dimensions);

    if (w <= 0 || h <= 0) {
      return yield* Effect.fail(new RendererFailedToCreateFrameBuffer());
    }
    const { widthMethod } = yield* Ref.get(binds.context);
    const fb = yield* OptimizedBuffer.create(w, h, widthMethod, {
      respectAlpha: true,
      id: id + "fb",
    });
    return fb;
  });

  const onResize: BaseElement<any, E>["onResize"] = Effect.fn(function* (width: number, height: number) {
    // Override in subclasses for additional resize logic
  });

  const onLayoutResize = Effect.fn(function* (width: number, height: number) {
    const v = yield* Ref.get(visible);
    if (v) {
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

  const updateFromLayout = Effect.fn(function* (self: BaseElement<any, E>) {
    // Find root element
    let current: BaseElement<any, any> | null = self;
    while (current) {
      const p: BaseElement<any, any> | null = yield* Ref.get(current.parent);
      if (!p) break;
      current = p;
    }
    const root = current!;

    // Calculate layout on root
    const rootDims = yield* Ref.get(root.dimensions);
    root.layoutNode.yogaNode.calculateLayout(rootDims.widthValue, rootDims.heightValue, Yoga.DIRECTION_LTR);

    // Get computed layout for this element
    const layout = layoutNode.yogaNode.getComputedLayout();
    const { type } = yield* Ref.get(location);
    const yppu = yield* Ref.get(_yogaPerformancePositionUpdated);
    if (isPositionRelative(type) || yppu) {
      yield* Ref.update(location, (l) => ({ ...l, x: layout.left, y: layout.top }));
    }

    const newWidth = Math.max(layout.width, 1);
    const newHeight = Math.max(layout.height, 1);
    if (!isNaN(newWidth) && !isNaN(newHeight)) {
      const { width: oldWidth, height: oldHeight } = yield* Ref.get(dimensions);
      const sizeChanged = oldWidth !== newWidth || oldHeight !== newHeight;

      yield* Ref.update(dimensions, (d) => ({
        ...d,
        width: newWidth,
        height: newHeight,
        widthValue: newWidth,
        heightValue: newHeight,
      }));

      if (sizeChanged) {
        yield* onLayoutResize(newWidth, newHeight);
      }
    }
  });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const es = yield* Ref.get(renderables);
    if (es.length > 0) {
      yield* Effect.all(
        es.map((e) => Effect.suspend(() => e.doRender()(buffer, deltaTime))),
        { concurrency: 10, concurrentFinalizers: true },
      );
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
    options.onMouseEvent ?? Effect.fn("base.onMouseEvent")(function* (event: MouseEvent) {});

  const onKeyboardEvent: BaseElement<any, E>["onKeyboardEvent"] =
    options.onKeyboardEvent ?? Effect.fn("base.onKeyboardEvent")(function* (event: KeyboardEvent) {});

  const processMouseEvent = Effect.fn(function* (handler: BaseElement<any, E>["onMouseEvent"], event: MouseEvent) {
    yield* handler(event);
    if (!event.defaultPrevented) {
      const es = yield* Ref.get(renderables);
      if (es.length > 0) {
        yield* Effect.all(
          es.map((e) => Effect.suspend(() => e.processMouseEvent(event))),
          { concurrency: 10 },
        );
      }
    }
  });

  const processKeyboardEvent = Effect.fn(function* (
    handler: BaseElement<any, E>["onKeyboardEvent"],
    event: KeyboardEvent,
  ) {
    yield* handler(event);
    if (!event.defaultPrevented) {
      const es = yield* Ref.get(renderables);
      if (es.length > 0) {
        yield* Effect.all(
          es.map((e) => Effect.suspend(() => e.processKeyboardEvent(event))),
          { concurrency: 10 },
        );
      }
    }
  });

  const add = Effect.fn(function* (container: BaseElement<any, any>, index?: number) {
    // Prevent self-addition
    if (container.id === id) {
      return yield* Effect.fail(new CannotAddElementToItself());
    }

    // Get current renderables for validation
    const currentRenderables = yield* Ref.get(renderables);

    // Prevent duplicate addition
    if (currentRenderables.some((r) => r.id === container.id)) {
      return;
    }

    // Prevent cycles: check if container is an ancestor
    let current: BaseElement<any, any> | null = yield* Ref.get(parent);
    while (current) {
      if (current.id === container.id) {
        return yield* Effect.fail(new CannotCreateCycleInElementTree());
      }
      current = yield* Ref.get(current.parent);
    }

    // Set index if undefined
    if (index === undefined) {
      index = currentRenderables.length;
    }

    layoutNode.yogaNode.insertChild(container.layoutNode.yogaNode, index);

    // Add to renderables
    yield* Ref.update(renderables, (cs) => {
      if (index! >= cs.length) {
        cs.push(container);
      } else {
        cs.splice(index!, 0, container);
      }
      return cs;
    });
  });

  const remove = Effect.fn(function* (container: BaseElement<any, any>) {
    const elements = yield* Ref.get(renderables);
    const id = container.id;
    const index = elements.findIndex((e) => e.id === id);
    if (index >= 0) {
      elements.splice(index, 1);
      yield* Ref.update(renderables, (cs) => cs.filter((e) => e.id !== id));
    }
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
  ) => Effect.Effect<boolean, Collection | CantParseHexColor, Library> = Effect.fn(function* (
    selection: SelectionState | null,
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
      { concurrency: 10, concurrentFinalizers: true },
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

  const setFocused: BaseElement<any, E>["setFocused"] = Effect.fn(function* (value: boolean) {
    yield* Ref.set(focused, value);
  });

  const onUpdate: BaseElement<any, E>["onUpdate"] = Effect.fn(function* (self: E) {
    const es = yield* Ref.get(renderables);
    if (es.length > 0) {
      yield* Effect.all(
        es.map((e) => Effect.suspend(() => e.update())),
        { concurrency: 10, concurrentFinalizers: true },
      );
      yield* ensureZIndexSorted();
    }
    yield* updateFromLayout(self);
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
    const texts = yield* Effect.all(
      es.map((e) => Effect.suspend(() => e.toString())),
      { concurrency: 10 },
    );
    return texts.join("\n");
  });

  const getTreeInfoRecursive: (indent: string, element: BaseElement<any, any>) => Effect.Effect<string> = Effect.fn(
    function* (indent: string, element: BaseElement<any, any>) {
      const loc = yield* Ref.get(element.location);
      const dims = yield* Ref.get(element.dimensions);
      const info = `${indent}${element.type} (${element.id}:${element.num}): x=${loc.x}, y=${loc.y}, w=${dims.widthValue}, h=${dims.heightValue}\n`;
      const renderables = yield* Ref.get(element.renderables);
      let childInfo = "";
      for (const child of renderables) {
        childInfo += yield* Effect.suspend(() => getTreeInfoRecursive(indent + "  ", child));
      }
      return info + childInfo;
    },
  );

  const getTreeInfo: BaseElement<any, any>["getTreeInfo"] = Effect.fn(function* (self: E) {
    return yield* getTreeInfoRecursive("", self as BaseElement<any, any>);
  });

  const base_getScissorRect = Effect.fn(function* (dimension: { widthValue: number; heightValue: number }) {
    const { widthValue: w, heightValue: h } = dimension;
    const { x, y } = yield* Ref.get(location);
    return { x, y, width: w, height: h };
  });

  const preRender = Effect.fn(function* (buffer: OptimizedBuffer) {
    const _of = yield* Ref.get(overflow);
    const dims = yield* Ref.get(dimensions);
    const shouldPushScissor = _of !== "visible" && dims.widthValue > 0 && dims.heightValue > 0;
    if (shouldPushScissor) {
      const scissorRect = yield* base_getScissorRect(dims);
      yield* buffer.pushScissorRect(scissorRect.x, scissorRect.y, scissorRect.width, scissorRect.height);
    }
  });

  const postRender = Effect.fn(function* (buffer: OptimizedBuffer) {
    const _of = yield* Ref.get(overflow);
    const { widthValue: w, heightValue: h } = yield* Ref.get(dimensions);
    const shouldPopScissor = _of !== "visible" && w > 0 && h > 0;
    if (shouldPopScissor) {
      yield* buffer.popScissorRect();
    }
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
    doRender: function (this) {
      const handler = this.render;
      return (buffer: OptimizedBuffer, deltaTime: number) =>
        Effect.gen(function* () {
          yield* preRender(buffer);
          yield* handler(buffer, deltaTime);
          yield* postRender(buffer);
        });
    },
    add,
    remove,
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
    getTreeInfo: function (this) {
      return getTreeInfo(this as E);
    },
    setupYogaProperties,
    createFrameBuffer,
  } satisfies BaseElement<T, E>;
});
