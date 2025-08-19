import type { OptimizedBuffer } from "@opentuee/core/src/buffer/optimized";
import { TextBuffer } from "@opentuee/core/src/buffer/text";
import * as Colors from "@opentuee/core/src/colors";
import type { RenderContext } from "@opentuee/core/src/context";
import type {
  RendererFailedToDestroyOptimizedBuffer,
  RendererFailedToDestroyTextBuffer,
} from "@opentuee/core/src/errors";
import type { EventEmitter } from "@opentuee/core/src/event-emitter";
import { Renderable, type RenderableOptions } from "@opentuee/core/src/renderer/renderable-3";
import { TextSelectionHelper } from "@opentuee/core/src/renderer/selection";
import { isPositionAbsolute, isPositionRelative } from "@opentuee/core/src/renderer/utils/position";
import { RGBA, type SelectionState } from "@opentuee/core/src/types";
import type { RenderLib } from "@opentuee/core/src/zig";
import { Effect } from "effect";
import { MeasureMode } from "yoga-layout";
import { stringToStyledText, type StyledText } from "./styled-text";

// import { TextSelectionHelper } from "../lib/selection";
// import { stringToStyledText, StyledText } from "../lib/styled-text";

export interface TextOptions extends RenderableOptions {
  content?: StyledText | string;
  fg?: Colors.Input;
  bg?: Colors.Input;
  selectionBg?: Colors.Input;
  selectionFg?: Colors.Input;
  selectable?: boolean;
  attributes?: number;
}

export class Text extends Renderable {
  public override selectable: boolean = true;
  private _text: StyledText | undefined;
  private _defaultFg: RGBA | undefined;
  private _defaultBg: RGBA | undefined;
  private _defaultAttributes: number;
  private _selectionBg: RGBA | undefined;
  private _selectionFg: RGBA | undefined;
  private selectionHelper: TextSelectionHelper;

  private textBuffer: TextBuffer | undefined;
  private _plainText: string = "";
  private _lineInfo: { lineStarts: number[]; lineWidths: number[] } = { lineStarts: [], lineWidths: [] };

  private _opts: TextOptions;

  constructor(id: string, options: TextOptions) {
    super(id, options);
    this._opts = options;

    this.selectionHelper = new TextSelectionHelper(
      () => this.getX,
      () => this.getY,
      () => this._plainText.length,
      () => this._lineInfo,
    );

    this._defaultAttributes = options.attributes ?? 0;
    this.selectable = options.selectable ?? true;
  }

  public override initialize() {
    const baseInitialize = super.initialize();
    return Effect.gen(this, function* () {
      yield* baseInitialize;
      this._text = yield* stringToStyledText("");
      if (this._opts.content) {
        this._text =
          typeof this._opts.content === "string" ? yield* stringToStyledText(this._opts.content) : this._opts.content;
      }
      this._defaultFg = this._opts.fg ? yield* RGBA.fromHex(this._opts.fg) : RGBA.fromValues(1, 1, 1, 1);
      this._defaultBg = this._opts.bg ? yield* RGBA.fromHex(this._opts.bg) : RGBA.fromValues(0, 0, 0, 0);
      this._selectionBg = this._opts.selectionBg ? yield* RGBA.fromHex(this._opts.selectionBg) : undefined;
      this._selectionFg = this._opts.selectionFg ? yield* RGBA.fromHex(this._opts.selectionFg) : undefined;
      this.textBuffer = yield* TextBuffer.create(64);
      yield* this.textBuffer!.setDefaultFg(this._defaultFg);
      yield* this.textBuffer!.setDefaultBg(this._defaultBg);
      yield* this.textBuffer!.setDefaultAttributes(this._defaultAttributes);

      yield* this.updateTextInfo();
      yield* this.setupMeasureFunc();
    });
  }

  public getContent = () =>
    Effect.gen(this, function* () {
      return this._text!;
    });

  public setContent = (value: StyledText | string) =>
    Effect.gen(this, function* () {
      this._text = typeof value === "string" ? yield* stringToStyledText(value) : value;
      yield* this.updateTextInfo();
      yield* this.setupMeasureFunc();
      yield* this.needsUpdate;
    });

  public getFg = () =>
    Effect.gen(this, function* () {
      return this._defaultFg;
    });

  public setFg = (value: Colors.Input | undefined) =>
    Effect.gen(this, function* () {
      if (value) {
        this._defaultFg = yield* RGBA.fromHex(value);
        yield* this.textBuffer!.setDefaultFg(this._defaultFg);
        yield* this.needsUpdate;
      }
    });

  getBg = () =>
    Effect.gen(this, function* () {
      return this._defaultBg;
    });

  setBg = (value: Colors.Input | undefined) =>
    Effect.gen(this, function* () {
      if (value) {
        this._defaultBg = yield* RGBA.fromHex(value);
        yield* this.textBuffer!.setDefaultBg(this._defaultBg);
        yield* this.needsUpdate;
      }
    });

  getAttributes = () =>
    Effect.gen(this, function* () {
      return this._defaultAttributes;
    });

  setAttributes = (value: number) =>
    Effect.gen(this, function* () {
      this._defaultAttributes = value;
      yield* this.textBuffer!.setDefaultAttributes(this._defaultAttributes);
      yield* this.needsUpdate;
    });

  protected override onResize(width: number, height: number) {
    const baseOnResize = super.onResize;
    return Effect.gen(this, function* () {
      const changed = yield* this.selectionHelper.reevaluateSelection(width, height);
      if (changed) {
        yield* this.syncSelectionToTextBuffer();
        yield* this.needsUpdate;
      }
      yield* baseOnResize(width, height);
    });
  }

  private syncSelectionToTextBuffer = () =>
    Effect.gen(this, function* () {
      const selection = this.selectionHelper.getSelection();
      if (selection) {
        yield* this.textBuffer!.setSelection(selection.start, selection.end, this._selectionBg, this._selectionFg);
      } else {
        yield* this.textBuffer!.resetSelection();
      }
    });

  private updateTextInfo = () =>
    Effect.gen(this, function* () {
      this._plainText = this._text!.toString();
      yield* this.updateTextBuffer;

      const lineInfo = yield* this.textBuffer!.getLineInfo();
      this._lineInfo.lineStarts = lineInfo.lineStarts;
      this._lineInfo.lineWidths = lineInfo.lineWidths;

      const numLines = this._lineInfo.lineStarts.length;
      if (this._height === "auto") {
        yield* this.setHeight(numLines);
      }

      const maxLineWidth = Math.max(...this._lineInfo.lineWidths);

      if (isPositionAbsolute(this._positionType) && this._width === "auto") {
        yield* this.setWidth(maxLineWidth);
      }
      const w = yield* this.getWidth();
      const h = yield* this.getHeight();
      const changed = yield* this.selectionHelper.reevaluateSelection(w, h);
      if (changed) {
        yield* this.syncSelectionToTextBuffer();
        yield* this.needsUpdate;
      }
    });

  private setupMeasureFunc = () =>
    Effect.gen(this, function* () {
      if (isPositionRelative(this._positionType) && this._width === "auto") {
        const measureFunc = (
          width: number,
          widthMode: MeasureMode,
          height: number,
          heightMode: MeasureMode,
        ): { width: number; height: number } => {
          const maxLineWidth = Math.max(...this._lineInfo.lineWidths, 0);
          const numLines = this._lineInfo.lineStarts.length || 1;

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

        this.layoutNode.yogaNode.setMeasureFunc(measureFunc);
      }
    });

  public override shouldStartSelection = (x: number, y: number) =>
    Effect.gen(this, function* () {
      const w = yield* this.getWidth();
      const h = yield* this.getHeight();
      return yield* this.selectionHelper.shouldStartSelection(x, y, w, h);
    });

  public override onSelectionChanged = (selection: SelectionState | null) =>
    Effect.gen(this, function* () {
      const w = yield* this.getWidth();
      const h = yield* this.getHeight();
      const changed = yield* this.selectionHelper.onSelectionChanged(selection, w, h);
      if (changed) {
        yield* this.syncSelectionToTextBuffer();
        yield* this.needsUpdate;
      }
      return this.selectionHelper.hasSelection();
    });

  public override getSelectedText = () =>
    Effect.gen(this, function* () {
      const selection = this.selectionHelper.getSelection();
      if (!selection) return "";
      return this._plainText.slice(selection.start, selection.end);
    });

  public override hasSelection = () => this.selectionHelper.hasSelection();

  private updateTextBuffer = Effect.gen(this, function* () {
    yield* this.textBuffer!.setStyledText(this._text!);
  });

  protected override renderSelf = (buffer: OptimizedBuffer) =>
    Effect.gen(this, function* () {
      const x = yield* this.getX;
      const y = yield* this.getY;
      if (this.textBuffer!.ptr) {
        const width = yield* this.getWidth();
        const height = yield* this.getHeight();
        const clipRect = {
          x,
          y,
          width,
          height,
        };

        yield* buffer.drawTextBuffer(this.textBuffer!, x, y, clipRect);
      }
    });

  public override destroy() {
    const baseDestroy = super.destroy;
    const fn: Effect.Effect<
      void,
      RendererFailedToDestroyOptimizedBuffer | RendererFailedToDestroyTextBuffer,
      RenderLib | EventEmitter | RenderContext
    > = Effect.gen(this, function* () {
      yield* this.textBuffer!.destroy();
      yield* baseDestroy();
    });
    return fn;
  }
}
