import { RGBA } from "@better-opentui/core/src/colors/rgba";
import { Library } from "@better-opentui/core/src/lib";
import { type WidthMethod } from "@better-opentui/core/src/types";
import { packDrawOptions } from "@better-opentui/core/src/utils";
import { type Pointer } from "bun:ffi";
import { Effect } from "effect";
import { getBorderCharArrays, type BorderSides, type BorderStyle } from "../renderer/utils/border";
import type { TextBuffer } from "./text";

export class OptimizedBuffer {
  static fbIdCounter = 0;
  public id: string;
  private bufferPtr: Pointer;
  private width: number;
  private height: number;
  public respectAlpha: boolean = false;
  private useFFI: boolean = true;

  get ptr(): Pointer {
    return this.bufferPtr;
  }

  constructor(ptr: Pointer, width: number, height: number, options: { respectAlpha?: boolean }) {
    this.id = `fb_${OptimizedBuffer.fbIdCounter++}`;
    this.respectAlpha = options.respectAlpha || false;
    this.width = width;
    this.height = height;
    this.bufferPtr = ptr;
  }

  static create = Effect.fn(function* (
    width: number,
    height: number,
    widthMethod: WidthMethod,
    options: { respectAlpha?: boolean; id?: string } = {},
  ) {
    const lib = yield* Library;
    const respectAlpha = options.respectAlpha || false;
    const id = options.id && options.id.trim() !== "" ? options.id : "unnamed buffer";
    const pointer = yield* lib.createOptimizedBufferPointer(width, height, widthMethod, respectAlpha, id);
    return new OptimizedBuffer(pointer, width, height, options);
  });

  private coordsToIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  public getWidth(): number {
    return this.width;
  }

  public getHeight(): number {
    return this.height;
  }

  public setRespectAlpha = (respectAlpha: boolean) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferSetRespectAlpha(this.bufferPtr, respectAlpha);
      this.respectAlpha = respectAlpha;
    });

  public clear = (bg: RGBA = RGBA.fromValues(0, 0, 0, 1), clearChar: string = " ") =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferClear(this.bufferPtr, bg);
    });

  public setCell = (x: number, y: number, char: string, fg: RGBA, bg: RGBA, attributes: number = 0) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferSetCell(this.bufferPtr, x, y, char, fg, bg, attributes);
    });

  public setCellWithAlphaBlending = (x: number, y: number, char: string, fg: RGBA, bg: RGBA, attributes: number = 0) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferSetCellWithAlphaBlending(this.bufferPtr, x, y, char, fg, bg, attributes);
    });

  public drawText = (
    text: string,
    x: number,
    y: number,
    fg: RGBA,
    bg?: RGBA,
    attributes: number = 0,
    selection?: { start: number; end: number; bgColor?: RGBA; fgColor?: RGBA } | null,
  ) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      if (!selection) {
        yield* lib.bufferDrawText(this.bufferPtr, text, x, y, fg, bg, attributes);
        return;
      }

      const { start, end } = selection;

      let selectionBg: RGBA;
      let selectionFg: RGBA;

      if (selection.bgColor) {
        selectionBg = selection.bgColor;
        selectionFg = selection.fgColor || fg;
      } else {
        const defaultBg = bg || RGBA.fromValues(0, 0, 0, 0);
        selectionFg = defaultBg.a > 0 ? defaultBg : RGBA.fromValues(0, 0, 0, 1);
        selectionBg = fg;
      }

      if (start > 0) {
        const beforeText = text.slice(0, start);
        yield* lib.bufferDrawText(this.bufferPtr, beforeText, x, y, fg, bg, attributes);
      }

      if (end > start) {
        const selectedText = text.slice(start, end);
        yield* lib.bufferDrawText(this.bufferPtr, selectedText, x + start, y, selectionFg, selectionBg, attributes);
      }

      if (end < text.length) {
        const afterText = text.slice(end);
        yield* lib.bufferDrawText(this.bufferPtr, afterText, x + end, y, fg, bg, attributes);
      }
    });

  public fillRect = (x: number, y: number, width: number, height: number, bg: RGBA) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferFillRect(this.bufferPtr, x, y, width, height, bg);
    });

  public drawFrameBuffer = (
    destX: number,
    destY: number,
    frameBuffer: OptimizedBuffer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.drawFrameBuffer(
        this.bufferPtr,
        destX,
        destY,
        frameBuffer.ptr,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
      );
    });

  public destroy = Effect.gen(this, function* () {
    const lib = yield* Library;
    yield* lib.destroyOptimizedBuffer(this.bufferPtr);
  });

  public drawTextBuffer = (
    textBuffer: TextBuffer,
    x: number,
    y: number,
    clipRect?: { x: number; y: number; width: number; height: number },
  ) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferDrawTextBuffer(this.bufferPtr, textBuffer.ptr, x, y, clipRect);
    });

  public drawSuperSampleBuffer = (
    x: number,
    y: number,
    pixelDataPtr: Pointer,
    pixelDataLength: number,
    format: "bgra8unorm" | "rgba8unorm",
    alignedBytesPerRow: number,
  ) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferDrawSuperSampleBuffer(
        this.bufferPtr,
        x,
        y,
        pixelDataPtr,
        pixelDataLength,
        format,
        alignedBytesPerRow,
      );
    });

  public drawPackedBuffer = (
    dataPtr: Pointer,
    dataLen: number,
    posX: number,
    posY: number,
    terminalWidthCells: number,
    terminalHeightCells: number,
  ) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferDrawPackedBuffer(
        this.bufferPtr,
        dataPtr,
        dataLen,
        posX,
        posY,
        terminalWidthCells,
        terminalHeightCells,
      );
    });

  public resize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      if (this.width === width && this.height === height) return;
      const lib = yield* Library;

      this.width = width;
      this.height = height;

      yield* lib.bufferResize(this.bufferPtr, width, height);
    });

  public drawBox = (options: {
    x: number;
    y: number;
    width: number;
    height: number;
    borderStyle?: BorderStyle;
    customBorderChars?: Uint32Array;
    border: boolean | BorderSides[];
    borderColor: RGBA;
    backgroundColor: RGBA;
    shouldFill?: boolean;
    title?: string;
    titleAlignment?: "left" | "center" | "right";
  }) =>
    Effect.gen(this, function* () {
      const style = options.borderStyle || "single";
      const borderChars = options.customBorderChars ?? (yield* getBorderCharArrays)[style];

      const packedOptions = yield* packDrawOptions(
        options.border,
        options.shouldFill ?? false,
        options.titleAlignment || "left",
      );
      const lib = yield* Library;
      yield* lib.bufferDrawBox(
        this.bufferPtr,
        options.x,
        options.y,
        options.width,
        options.height,
        borderChars,
        packedOptions,
        options.borderColor,
        options.backgroundColor,
        options.title ?? null,
      );
    });

  public pushScissorRect = (x: number, y: number, width: number, height: number) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferPushScissorRect(this.bufferPtr, x, y, width, height);
    });

  public popScissorRect = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferPopScissorRect(this.bufferPtr);
    });

  public clearScissorRects = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferClearScissorRects(this.bufferPtr);
    });
}
