import { OptimizedBuffer } from "@opentuee/core/src/buffer/optimized";
import { RenderContext } from "@opentuee/core/src/context";
import {
  FailedToFreeYogaNode,
  RendererFailedToDestroyOptimizedBuffer,
  RendererFailedToDestroyTextBuffer,
} from "@opentuee/core/src/errors";
import { EventEmitter } from "@opentuee/core/src/event-emitter";
import type { ParsedKey } from "@opentuee/core/src/inputs/keyboard";
import type { Align } from "@opentuee/core/src/renderer/utils/align";
import type { FlexDirection } from "@opentuee/core/src/renderer/utils/flex";
import type { Justify } from "@opentuee/core/src/renderer/utils/justify";
import {
  FlexBasis,
  isDimension,
  isFlexBasis,
  isMargin,
  isPadding,
  isPositionAbsolute,
  isPositionInput,
  isPositionRelative,
  isSize,
  Position,
  PositionAbsolute,
  PositionInput,
  PositionRelative,
  PositionTypeString,
  Size,
} from "@opentuee/core/src/renderer/utils/position";
import type { SelectionState } from "@opentuee/core/src/types";
import type { RenderLib } from "@opentuee/core/src/zig";
import type { LayoutOptions } from "@opentuee/ui/src/components/options/layout";
import { Effect, Schema } from "effect";
import { Display, Edge } from "yoga-layout";
import type { MouseEvent } from ".";
import { createTrackedNode, type TrackedNode } from "./tracknode";

export const Focused = Schema.Literal("Focused").pipe(Schema.brand("ElementEvents:Focused"));
export type Focused = typeof Focused.Type;

export const Blurred = Schema.Literal("Blurred").pipe(Schema.brand("ElementEvents:Blurred"));
export type Blurred = typeof Blurred.Type;

export const Events = Schema.Union(Focused).pipe(Schema.brand("ElementEvents"));
export type Events = typeof Events.Type;
export interface RenderableOptions extends Partial<LayoutOptions> {
  width?: PositionInput;
  height?: PositionInput;
  zIndex?: number;
  visible?: boolean;
  buffered?: boolean;
}

export abstract class Renderable {
  static renderablesByNumber: Map<number, Renderable> = new Map();
  static renderableNumber = 0;

  public readonly id: string;
  public readonly num: number;
  private _x: number = 0;
  private _y: number = 0;
  protected _width: PositionInput;
  protected _height: PositionInput;
  private _widthValue: number = 0;
  private _heightValue: number = 0;
  private _zIndex: number;
  public _visible: boolean;
  public selectable: boolean = false;
  protected buffered: boolean;
  protected frameBuffer: OptimizedBuffer | null = null;
  private _dirty: boolean = false;

  protected focusable: boolean = false;
  protected _focused: boolean = false;
  protected keypressHandler: ((key: ParsedKey) => void) | null = null;

  protected layoutNode: TrackedNode;
  protected _positionType: PositionTypeString = PositionRelative.make(1);
  protected _position: Position = {};

  private renderableMap: Map<string, Renderable> = new Map();
  private renderableArray: Renderable[] = [];
  private needsZIndexSort: boolean = false;
  public parent: Renderable | null = null;

  private _options: RenderableOptions;

  // This is a workaround for yoga-layout performance issues (wasm call overhead)
  // when setting the position of an element. Absolute elements do not need a full layout update.
  // But when other attributes change and update the layout, it should update the layout node position.
  // TODO: Use a bun ffi wrapper for a native yoga build instead of wasm.
  private _yogaPerformancePositionUpdated: boolean = false;

  static create = Effect.fn(function* (id: string, options: RenderableOptions) {
    const num = Renderable.renderableNumber++;

    if (typeof options.width === "number") {
      if (options.width < 0) {
        return yield* Effect.fail(new TypeError(`Invalid width for Renderable ${id}: ${options.width}`));
      }
    }
    if (typeof options.height === "number") {
      if (options.height < 0) {
        return yield* Effect.fail(new TypeError(`Invalid width for Renderable ${id}: ${options.height}`));
      }
    }
  });

  constructor(id: string, options: RenderableOptions) {
    this.id = id;
    this.num = Renderable.renderableNumber++;
    Renderable.renderablesByNumber.set(this.num, this);

    this._width = options.width ?? "auto";
    this._height = options.height ?? "auto";

    if (typeof this._width === "number") {
      this._widthValue = this._width;
    }
    if (typeof this._height === "number") {
      this._heightValue = this._height;
    }

    this._zIndex = options.zIndex ?? 0;
    this._visible = options.visible !== false;
    this.buffered = options.buffered ?? false;

    this.layoutNode = createTrackedNode({ renderable: this } as any);
    this.layoutNode.yogaNode.setDisplay(this._visible ? Display.Flex : Display.None);
    this._options = options;
  }

  public initialize() {
    const fn: Effect.Effect<void, Error, RenderContext | EventEmitter | RenderLib> = Effect.gen(this, function* () {
      yield* this.setupYogaProperties(this._options);

      if (this.buffered) {
        yield* this.createFrameBuffer();
      }
    });
    return fn;
  }

  public getVisible = Effect.gen(this, function* () {
    return this._visible;
  });

  public setVisible = (value: boolean) =>
    Effect.gen(this, function* () {
      this._visible = value;
      this.layoutNode.yogaNode.setDisplay(value ? Display.Flex : Display.None);
      if (this._focused) {
        yield* this.blur;
      }
      yield* this.requestLayout();
    });

  public hasSelection(): boolean {
    return false;
  }

  public onSelectionChanged = (selection: SelectionState | null) => {
    const fn: Effect.Effect<boolean, never, RenderLib | RenderContext> = Effect.gen(this, function* () {
      // Default implementation: do nothing
      // Override this method to provide custom selection handling
      return false;
    });
    return fn;
  };

  public getSelectedText = () =>
    Effect.gen(this, function* () {
      // Default implementation: do nothing
      // Override this method to provide custom selection handling
      return "";
    });

  public shouldStartSelection = (x: number, y: number) =>
    Effect.gen(this, function* () {
      return false;
    });

  public focus = Effect.gen(this, function* () {
    const ee = yield* EventEmitter;
    if (this._focused || !this.focusable) return;

    this._focused = true;
    yield* this.needsUpdate;

    this.keypressHandler = (key: ParsedKey) => {
      if (this.handleKeyPress) {
        this.handleKeyPress(key);
      }
    };
    ee.on("keypress", this.keypressHandler);
    ee.emit(Focused.make("Focused"));
  });

  public blur = Effect.gen(this, function* () {
    const ee = yield* EventEmitter;
    if (!this._focused || !this.focusable) return;

    this._focused = false;
    yield* this.needsUpdate;

    if (this.keypressHandler) {
      ee.off("keypress", this.keypressHandler);
      this.keypressHandler = null;
    }

    ee.emit(Blurred.make("Blurred"));
  });

  public isFocused(): boolean {
    return this._focused;
  }

  public handleKeyPress?(key: ParsedKey | string): boolean;

  protected get isDirty(): boolean {
    return this._dirty;
  }

  private markClean(): void {
    this._dirty = false;
  }

  public needsUpdate = Effect.gen(this, function* () {
    this._dirty = true;
    const ctx = yield* RenderContext;
    yield* ctx.needsUpdate();
  });

  public getX: Effect.Effect<number> = Effect.gen(this, function* () {
    const isRelative = Schema.is(PositionRelative);
    if (this.parent && isRelative(this._positionType)) {
      const px = yield* Effect.suspend(() => this.parent!.getX);
      return px + this._x;
    }
    return this._x;
  });

  public setX = (value: number) =>
    Effect.gen(this, function* () {
      yield* this.setLeft(value);
    });

  public getTop() {
    return this._position.top;
  }

  public setTop = (value: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      const isPosition = Schema.is(PositionInput);
      if (isPosition(value) || value === undefined) {
        yield* this.setPosition({ top: value });
      }
    });

  public getRight() {
    return this._position.right;
  }

  public setRight = (value: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      const isPosition = Schema.is(PositionInput);
      if (isPosition(value) || value === undefined) {
        yield* this.setPosition({ right: value });
      }
    });

  public getBottom = () =>
    Effect.gen(this, function* () {
      return this._position.bottom;
    });

  public setBottom = (value: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      const isPosition = Schema.is(PositionInput);
      if (isPosition(value) || value === undefined) {
        yield* this.setPosition({ bottom: value });
      }
    });

  public getLeft() {
    return this._position.left;
  }

  public setLeft = (value: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      const isPosition = Schema.is(PositionInput);
      if (isPosition(value) || value === undefined) {
        yield* this.setPosition({ left: value });
      }
    });

  public getY: Effect.Effect<number> = Effect.gen(this, function* () {
    const isRelative = Schema.is(PositionRelative);
    if (this.parent && isRelative(this._positionType)) {
      const py = yield* Effect.suspend(() => this.parent!.getY);
      return py + this._y;
    }
    return this._y;
  });

  public setY = (value: number) =>
    Effect.gen(this, function* () {
      yield* this.setPosition({ top: value });
    });

  public getWidth = () =>
    Effect.gen(this, function* () {
      return this._widthValue;
    });

  public setWidth = (value: PositionInput) =>
    Effect.gen(this, function* () {
      const isPosition = Schema.is(PositionInput);
      if (isPosition(value)) {
        this._width = value;
        yield* this.layoutNode.setWidth(value);
        yield* this.requestLayout();
      }
    });

  public getHeight = () =>
    Effect.gen(this, function* () {
      return this._heightValue;
    });

  public setHeight = (value: PositionInput) =>
    Effect.gen(this, function* () {
      const isPosition = Schema.is(PositionInput);
      if (isPosition(value)) {
        this._height = value;
        yield* this.layoutNode.setHeight(value);
        yield* this.requestLayout();
      }
    });

  public get zIndex(): number {
    return this._zIndex;
  }

  public setZIndex = (value: number) =>
    Effect.gen(this, function* () {
      if (this._zIndex !== value) {
        this._zIndex = value;
        this.parent?.requestZIndexSort();
      }
    });

  public requestZIndexSort(): void {
    this.needsZIndexSort = true;
  }

  private ensureZIndexSorted(): void {
    if (this.needsZIndexSort) {
      this.renderableArray.sort((a, b) => (a.zIndex > b.zIndex ? 1 : a.zIndex < b.zIndex ? -1 : 0));
      this.needsZIndexSort = false;
    }
  }

  protected setupYogaProperties = (options: RenderableOptions) =>
    Effect.gen(this, function* () {
      const node = this.layoutNode.yogaNode;
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

      if (isDimension(options.width)) {
        this._width = options.width;
        yield* this.layoutNode.setWidth(options.width);
      }
      if (isDimension(options.height)) {
        this._height = options.height;
        yield* this.layoutNode.setHeight(options.height);
      }

      this._positionType = options.position ?? PositionRelative.make(1);
      const isAbsolute = Schema.is(PositionAbsolute);
      if (isAbsolute(this._positionType)) {
        node.setPositionType(this._positionType);
      }

      // TODO: flatten position properties internally as well
      const hasPositionProps =
        options.top !== undefined ||
        options.right !== undefined ||
        options.bottom !== undefined ||
        options.left !== undefined;
      if (hasPositionProps) {
        this._position = {
          top: options.top,
          right: options.right,
          bottom: options.bottom,
          left: options.left,
        };
        yield* this.updateYogaPosition(this._position);
      }

      if (isSize(options.maxWidth)) {
        node.setMaxWidth(options.maxWidth);
      }
      if (isSize(options.maxHeight)) {
        node.setMaxHeight(options.maxHeight);
      }

      yield* this.setupMarginAndPadding(options);
    });

  private setupMarginAndPadding = (options: RenderableOptions) =>
    Effect.gen(this, function* () {
      const node = this.layoutNode.yogaNode;
      if (isMargin(options.margin)) {
        node.setMargin(Edge.Top, options.margin);
        node.setMargin(Edge.Right, options.margin);
        node.setMargin(Edge.Bottom, options.margin);
        node.setMargin(Edge.Left, options.margin);
      }
      if (options.margin) {
        if (isMargin(options.margin?.top)) {
          node.setMargin(Edge.Top, options.margin.top);
        }
        if (isMargin(options.margin?.right)) {
          node.setMargin(Edge.Right, options.margin.right);
        }
        if (isMargin(options.margin.bottom)) {
          node.setMargin(Edge.Bottom, options.margin.bottom);
        }
        if (isMargin(options.margin.left)) {
          node.setMargin(Edge.Left, options.margin.left);
        }
      }

      if (isPadding(options.padding)) {
        node.setPadding(Edge.Top, options.padding);
        node.setPadding(Edge.Right, options.padding);
        node.setPadding(Edge.Bottom, options.padding);
        node.setPadding(Edge.Left, options.padding);
      }
      if (options.padding) {
        if (isPadding(options.padding.top)) {
          node.setPadding(Edge.Top, options.padding.top);
        }
        if (isPadding(options.padding.right)) {
          node.setPadding(Edge.Right, options.padding.right);
        }
        if (isPadding(options.padding.bottom)) {
          node.setPadding(Edge.Bottom, options.padding.bottom);
        }
        if (isPadding(options.padding.left)) {
          node.setPadding(Edge.Left, options.padding.left);
        }
      }
    });

  public setPosition = (position: Position) =>
    Effect.gen(this, function* () {
      this._position = { ...this._position, ...position };
      yield* this.updateYogaPosition(position);
    });

  private updateYogaPosition = (position: Position) =>
    Effect.gen(this, function* () {
      const node = this.layoutNode.yogaNode;
      const { top, right, bottom, left } = position;

      if (isPositionRelative(this._positionType)) {
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
        yield* this.requestLayout();
      } else {
        if (typeof top === "number" && isPositionAbsolute(this._positionType)) {
          this._y = top;
        }
        if (typeof left === "number" && isPositionAbsolute(this._positionType)) {
          this._x = left;
        }
        yield* this.needsUpdate;
        this._yogaPerformancePositionUpdated = false;
      }
    });

  public setFlexGrow = (grow: number) =>
    Effect.gen(this, function* () {
      this.layoutNode.yogaNode.setFlexGrow(grow);
      yield* this.requestLayout();
    });

  public setFlexShrink = (shrink: number) =>
    Effect.gen(this, function* () {
      this.layoutNode.yogaNode.setFlexShrink(shrink);
      yield* this.requestLayout();
    });

  public setFlexDirection = (direction: FlexDirection) =>
    Effect.gen(this, function* () {
      this.layoutNode.yogaNode.setFlexDirection(direction);
      yield* this.requestLayout();
    });

  public setAlignItems = (alignItems: Align) =>
    Effect.gen(this, function* () {
      this.layoutNode.yogaNode.setAlignItems(alignItems);
      yield* this.requestLayout();
    });

  public setJustifyContent = (justifyContent: Justify) =>
    Effect.gen(this, function* () {
      this.layoutNode.yogaNode.setJustifyContent(justifyContent);
      yield* this.requestLayout();
    });

  public seFlexBasis = (basis: number | "auto" | undefined) =>
    Effect.gen(this, function* () {
      const isFlexBasis = Schema.is(FlexBasis);
      if (isFlexBasis(basis)) {
        this.layoutNode.yogaNode.setFlexBasis(basis);
        yield* this.requestLayout();
      }
    });

  public setMinWidth = (minWidth: Size | undefined) =>
    Effect.gen(this, function* () {
      const isSize = Schema.is(Size);
      if (isSize(minWidth)) {
        this.layoutNode.yogaNode.setMinWidth(minWidth);
        yield* this.requestLayout();
      }
    });

  public setMaxWidth = (maxWidth: Size | undefined) =>
    Effect.gen(this, function* () {
      const isSize = Schema.is(Size);
      if (isSize(maxWidth)) {
        this.layoutNode.yogaNode.setMaxWidth(maxWidth);
        yield* this.requestLayout();
      }
    });

  public setMinHeight = (minHeight: Size | undefined) =>
    Effect.gen(this, function* () {
      const isSize = Schema.is(Size);
      if (isSize(minHeight)) {
        this.layoutNode.yogaNode.setMinHeight(minHeight);
        yield* this.requestLayout();
      }
    });

  public setMaxHeight = (maxHeight: Size | undefined) =>
    Effect.gen(this, function* () {
      const isSize = Schema.is(Size);
      if (isSize(maxHeight)) {
        this.layoutNode.yogaNode.setMaxHeight(maxHeight);
        yield* this.requestLayout();
      }
    });

  public setMargin = (margin: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      if (isMargin(margin)) {
        const node = this.layoutNode.yogaNode;
        node.setMargin(Edge.Top, margin);
        node.setMargin(Edge.Right, margin);
        node.setMargin(Edge.Bottom, margin);
        node.setMargin(Edge.Left, margin);
        yield* this.requestLayout();
      }
    });

  public setMarginTop = (margin: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      if (isMargin(margin)) {
        this.layoutNode.yogaNode.setMargin(Edge.Top, margin);
        yield* this.requestLayout();
      }
    });

  public setMarginRight = (margin: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      if (isMargin(margin)) {
        this.layoutNode.yogaNode.setMargin(Edge.Right, margin);
        yield* this.requestLayout();
      }
    });

  public setMarginBottom = (margin: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      if (isMargin(margin)) {
        this.layoutNode.yogaNode.setMargin(Edge.Bottom, margin);
        yield* this.requestLayout();
      }
    });

  public setMarginLeft = (margin: PositionInput | undefined) =>
    Effect.gen(this, function* () {
      if (isMargin(margin)) {
        this.layoutNode.yogaNode.setMargin(Edge.Left, margin);
        yield* this.requestLayout();
      }
    });

  public setPadding = (padding: number | `${number}%` | undefined) =>
    Effect.gen(this, function* () {
      if (isPadding(padding)) {
        const node = this.layoutNode.yogaNode;
        node.setPadding(Edge.Top, padding);
        node.setPadding(Edge.Right, padding);
        node.setPadding(Edge.Bottom, padding);
        node.setPadding(Edge.Left, padding);
        yield* this.requestLayout();
      }
    });

  public setPaddingTop = (padding: number | `${number}%` | undefined) =>
    Effect.gen(this, function* () {
      if (isPadding(padding)) {
        this.layoutNode.yogaNode.setPadding(Edge.Top, padding);
        yield* this.requestLayout();
      }
    });

  public setPaddingRight = (padding: number | `${number}%` | undefined) =>
    Effect.gen(this, function* () {
      if (isPadding(padding)) {
        this.layoutNode.yogaNode.setPadding(Edge.Right, padding);
        yield* this.requestLayout();
      }
    });

  public setPaddingBottom = (padding: number | `${number}%` | undefined) =>
    Effect.gen(this, function* () {
      if (isPadding(padding)) {
        this.layoutNode.yogaNode.setPadding(Edge.Bottom, padding);
        yield* this.requestLayout();
      }
    });

  public setPaddingLeft = (padding: number | `${number}%` | undefined) =>
    Effect.gen(this, function* () {
      if (isPadding(padding)) {
        this.layoutNode.yogaNode.setPadding(Edge.Left, padding);
        yield* this.requestLayout();
      }
    });

  public getLayoutNode = () =>
    Effect.gen(this, function* () {
      return this.layoutNode;
    });

  public updateFromLayout = () =>
    Effect.gen(this, function* () {
      const layout = this.layoutNode.yogaNode.getComputedLayout();

      if (isPositionRelative(this._positionType) || this._yogaPerformancePositionUpdated) {
        this._x = layout.left;
        this._y = layout.top;
      }

      const newWidth = Math.max(layout.width, 1);
      const newHeight = Math.max(layout.height, 1);
      const w = yield* this.getWidth();
      const h = yield* this.getHeight();
      const sizeChanged = w !== newWidth || h !== newHeight;

      this._widthValue = newWidth;
      this._heightValue = newHeight;

      if (sizeChanged) {
        yield* this.onLayoutResize(newWidth, newHeight);
      }
    });

  protected onLayoutResize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      if (this._visible) {
        yield* this.handleFrameBufferResize(width, height);
        yield* this.onResize(width, height);
        yield* this.needsUpdate;
      }
    });

  protected handleFrameBufferResize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      if (!this.buffered) return;

      if (width <= 0 || height <= 0) {
        return;
      }

      if (this.frameBuffer) {
        yield* this.frameBuffer.resize(width, height);
      } else {
        yield* this.createFrameBuffer();
      }
    });

  protected createFrameBuffer = () =>
    Effect.gen(this, function* () {
      const w = yield* this.getWidth();
      const h = yield* this.getHeight();

      if (w <= 0 || h <= 0) {
        return;
      }

      this.frameBuffer = yield* OptimizedBuffer.create(w, h, {
        respectAlpha: true,
      }).pipe(
        Effect.catchAll((error) => {
          return Effect.succeed(null);
        })
      );
    });

  protected onResize(width: number, height: number) {
    const fn: Effect.Effect<void, Error, RenderLib | RenderContext> = Effect.gen(this, function* () {
      // Override in subclasses for additional resize logic
    });
    return fn;
  }

  protected requestLayout = () =>
    Effect.gen(this, function* () {
      if (!this._yogaPerformancePositionUpdated) {
        const layout = this.layoutNode.yogaNode.getComputedLayout();

        if (layout.left !== this._x || layout.top !== this._y) {
          this.layoutNode.yogaNode.setPosition(Edge.Left, this._x);
          this.layoutNode.yogaNode.setPosition(Edge.Top, this._y);
        }
        this._yogaPerformancePositionUpdated = true;
      }

      yield* this.needsUpdate;
    });

  private replaceParent = (obj: Renderable) =>
    Effect.gen(this, function* () {
      if (obj.parent) {
        yield* obj.parent.remove(obj.id);
      }
      obj.parent = this;
    });

  public add = (obj: Renderable, index?: number) =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      if (this.renderableMap.has(obj.id)) {
        console.warn(`A renderable with id ${obj.id} already exists in ${this.id}, removing it`);
        yield* this.remove(obj.id);
      }

      yield* this.replaceParent(obj);

      const childLayoutNode = yield* obj.getLayoutNode();
      let insertedIndex: number;
      if (index !== undefined) {
        this.renderableArray.splice(index, 0, obj);
        insertedIndex = yield* this.layoutNode.insertChild(childLayoutNode, index);
      } else {
        this.renderableArray.push(obj);
        insertedIndex = yield* this.layoutNode.addChild(childLayoutNode);
      }
      this.needsZIndexSort = true;
      this.renderableMap.set(obj.id, obj);

      yield* this.requestLayout();

      ee.emit("child:added", obj);

      return insertedIndex;
    });

  insertBefore = (obj: Renderable, anchor?: Renderable) =>
    Effect.gen(this, function* () {
      if (!anchor) {
        return yield* this.add(obj);
      }

      if (!this.renderableMap.has(anchor.id)) {
        return yield* Effect.fail(new Error("Anchor does not exist"));
      }

      const anchorIndex = this.renderableArray.indexOf(anchor);
      if (anchorIndex === -1) {
        return yield* Effect.fail(new Error("Anchor does not exist"));
      }

      return yield* this.add(obj, anchorIndex);
    });

  public getRenderable(id: string): Renderable | undefined {
    return this.renderableMap.get(id);
  }

  public remove = (id: string) =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      if (!id) {
        return;
      }
      if (this.renderableMap.has(id)) {
        const obj = this.renderableMap.get(id);
        if (obj) {
          const childLayoutNode = yield* obj.getLayoutNode();
          yield* this.layoutNode.removeChild(childLayoutNode);
          yield* this.requestLayout();

          obj.parent = null;
          // obj.propagateContext(null);
        }
        this.renderableMap.delete(id);

        const index = this.renderableArray.findIndex((obj) => obj.id === id);
        if (index !== -1) {
          this.renderableArray.splice(index, 1);
        }
        ee.emit("child:removed", id);
      }
    });

  public getChildren(): Renderable[] {
    return [...this.renderableArray];
  }

  public render: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void, Error, RenderContext | RenderLib> =
    (buffer: OptimizedBuffer, deltaTime: number) =>
      Effect.gen(this, function* () {
        const ctx = yield* RenderContext;
        if (!this._visible) return;

        this.beforeRender();
        yield* this.updateFromLayout();

        const renderBuffer = this.buffered && this.frameBuffer ? this.frameBuffer : buffer;

        this.renderSelf(renderBuffer, deltaTime);
        this.markClean();
        const x = yield* this.getX;
        const y = yield* this.getY;
        const w = yield* this.getWidth();
        const h = yield* this.getHeight();
        yield* ctx.addToHitGrid(x, y, w, h, this.num);
        this.ensureZIndexSorted();

        const renderers = this.renderableArray.map((child) =>
          Effect.suspend(() => child.render(renderBuffer, deltaTime))
        );

        yield* Effect.all(renderers);

        if (this.buffered && this.frameBuffer) {
          yield* buffer.drawFrameBuffer(x, y, this.frameBuffer);
        }
      });

  protected beforeRender(): void {
    // Default implementation: do nothing
    // Override this method to provide custom rendering
  }

  protected renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // Default implementation: do nothing
    // Override this method to provide custom rendering
  }

  public destroy() {
    const fn: Effect.Effect<
      void,
      RendererFailedToDestroyOptimizedBuffer | RendererFailedToDestroyTextBuffer | FailedToFreeYogaNode,
      RenderLib | EventEmitter | RenderContext
    > = Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      if (this.parent) {
        yield* this.parent.remove(this.id);
      }

      if (this.frameBuffer) {
        yield* this.frameBuffer.destroy;
        this.frameBuffer = null;
      }

      for (const child of this.renderableArray) {
        child.parent = null;
        // child.destroy();
        yield* Effect.suspend(() => child.destroy());
      }

      this.renderableArray = [];
      this.renderableMap.clear();
      Renderable.renderablesByNumber.delete(this.num);

      // yield* this.layoutNode.destroy;
      yield* this.blur;
      ee.removeAllListeners();

      yield* this.destroySelf();
    });
    return fn;
  }

  public destroyRecursively = () =>
    Effect.gen(this, function* () {
      yield* this.destroy();
      // for (const child of this.renderableArray) {
      //   yield* child.destroyRecursively();
      // }
      // yield Effect.all(this.renderableArray.map((child) => Effect.suspend(() => child.destroyRecursively())));
    });

  protected destroySelf() {
    const fn: Effect.Effect<
      void,
      RendererFailedToDestroyOptimizedBuffer | RendererFailedToDestroyTextBuffer,
      RenderLib | EventEmitter | RenderContext
    > = Effect.gen(this, function* () {
      // Default implementation: do nothing else
      // Override this method to provide custom cleanup
    });
    return fn;
  }

  public processMouseEvent(event: MouseEvent): void {
    this.onMouseEvent(event);
    if (this.parent && !event.defaultPrevented) {
      this.parent.processMouseEvent(event);
    }
  }

  protected onMouseEvent(event: MouseEvent): void {
    // Default implementation: do nothing
    // Override this method to provide custom event handling
  }
}
