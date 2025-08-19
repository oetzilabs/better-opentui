import type { OptimizedBuffer } from "@opentuee/core/src/buffer/optimized";
import * as Colors from "@opentuee/core/src/colors";
import type { RenderContext } from "@opentuee/core/src/context";
import { Renderable, type RenderableOptions } from "@opentuee/core/src/renderer/renderable-3";
import { RGBA } from "@opentuee/core/src/types";
import type { RenderLib } from "@opentuee/core/src/zig";
import { Effect } from "effect";
import { Edge } from "yoga-layout";
import {
  borderCharsToArray,
  getBorderSides,
  type BorderCharacters,
  type BorderSides,
  type BorderSidesConfig,
  type BorderStyle,
} from "./border";

export interface BoxOptions extends RenderableOptions {
  backgroundColor?: Colors.Input;
  borderStyle?: BorderStyle;
  border?: boolean | BorderSides[];
  borderColor?: Colors.Input;
  customBorderChars?: BorderCharacters;
  shouldFill?: boolean;
  title?: string;
  titleAlignment?: "left" | "center" | "right";
  focusedBorderColor?: Colors.Input;
}

export class Box extends Renderable {
  protected _backgroundColor: RGBA | undefined;
  protected _border: boolean | BorderSides[];
  protected _borderStyle: BorderStyle;
  protected _borderColor: RGBA | undefined;
  protected _focusedBorderColor: RGBA | undefined;
  protected customBorderChars?: Uint32Array;
  protected borderSides: BorderSidesConfig;
  public shouldFill: boolean;
  protected _title?: string;
  protected _titleAlignment: "left" | "center" | "right";
  private _opts: BoxOptions;

  constructor(id: string, options: BoxOptions) {
    super(id, options);
    this._border = options.border ?? true;
    this._borderStyle = options.borderStyle || "single";
    this.shouldFill = options.shouldFill ?? true;
    this._title = options.title;
    this._titleAlignment = options.titleAlignment || "left";
    this.borderSides = getBorderSides(this._border);
    this._opts = options;
  }

  public override initialize = () => {
    const baseInitialize = super.initialize();
    return Effect.gen(this, function* () {
      yield* baseInitialize;
      this._backgroundColor = yield* RGBA.fromHex(this._opts.backgroundColor || Colors.Transparent.make("transparent"));
      this._borderColor = yield* RGBA.fromHex(this._opts.borderColor || Colors.White.make("#FFFFFF"));
      this._focusedBorderColor = yield* RGBA.fromHex(this._opts.focusedBorderColor || Colors.Blue.make("#0000FF"));
      this.customBorderChars = this._opts.customBorderChars
        ? yield* borderCharsToArray(this._opts.customBorderChars)
        : undefined;
      yield* this.applyYogaBorders();
    });
  };

  public get backgroundColor(): RGBA {
    return this._backgroundColor!;
  }

  public setBackgroundColor = (value: Colors.Input) =>
    Effect.gen(this, function* () {
      const newColor = yield* RGBA.fromHex(value);
      if (this._backgroundColor !== newColor) {
        this._backgroundColor = newColor;
        yield* this.needsUpdate;
      }
    });

  public getBorder = () =>
    Effect.gen(this, function* () {
      return this._border;
    });

  public setBorder = (value: boolean | BorderSides[]) =>
    Effect.gen(this, function* () {
      if (this._border !== value) {
        this._border = value;
        this.borderSides = getBorderSides(value);
        yield* this.applyYogaBorders();
        yield* this.needsUpdate;
      }
    });

  public getBorderStyle = () =>
    Effect.gen(this, function* () {
      return this._borderStyle;
    });

  public setBorderStyle = (value: BorderStyle) =>
    Effect.gen(this, function* () {
      if (this._borderStyle !== value) {
        this._borderStyle = value;
        this.customBorderChars = undefined;
        yield* this.needsUpdate;
      }
    });

  public getBorderColor = () =>
    Effect.gen(this, function* () {
      return this._borderColor;
    });

  public setBorderColor = (value: Colors.Input) =>
    Effect.gen(this, function* () {
      const newColor = yield* RGBA.fromHex(value);
      if (this._borderColor !== newColor) {
        this._borderColor = newColor;
        yield* this.needsUpdate;
      }
    });

  public getFocusedBorderColor = () =>
    Effect.gen(this, function* () {
      return this._focusedBorderColor;
    });

  public setFocusedBorderColor = (value: Colors.Input) =>
    Effect.gen(this, function* () {
      const newColor = yield* RGBA.fromHex(value);
      if (this._focusedBorderColor !== newColor) {
        this._focusedBorderColor = newColor;
        if (this._focused) {
          yield* this.needsUpdate;
        }
      }
    });

  public getTitle = () =>
    Effect.gen(this, function* () {
      return this._title;
    });

  public setTitle = (value: string | undefined) =>
    Effect.gen(this, function* () {
      if (this._title !== value) {
        this._title = value;
        yield* this.needsUpdate;
      }
    });

  public getTitleAlignment = () =>
    Effect.gen(this, function* () {
      return this._titleAlignment;
    });

  public setTitleAlignment = (value: "left" | "center" | "right") =>
    Effect.gen(this, function* () {
      if (this._titleAlignment !== value) {
        this._titleAlignment = value;
        yield* this.needsUpdate;
      }
    });

  protected override renderSelf = (buffer: OptimizedBuffer) =>
    Effect.gen(this, function* () {
      const currentBorderColor = this._focused ? this._focusedBorderColor : this._borderColor;
      const x = yield* this.getX;
      const y = yield* this.getY;
      const width = yield* this.getWidth();
      const height = yield* this.getHeight();

      yield* buffer.drawBox({
        x,
        y,
        width,
        height,
        borderStyle: this._borderStyle,
        customBorderChars: this.customBorderChars,
        border: this._border,
        borderColor: currentBorderColor!,
        backgroundColor: this._backgroundColor!,
        shouldFill: this.shouldFill,
        title: this._title,
        titleAlignment: this._titleAlignment,
      });
    });

  private applyYogaBorders = () =>
    Effect.gen(this, function* () {
      const node = this.layoutNode.yogaNode;
      node.setBorder(Edge.Left, this.borderSides.left ? 1 : 0);
      node.setBorder(Edge.Right, this.borderSides.right ? 1 : 0);
      node.setBorder(Edge.Top, this.borderSides.top ? 1 : 0);
      node.setBorder(Edge.Bottom, this.borderSides.bottom ? 1 : 0);
      yield* this.requestLayout();
    });
}
