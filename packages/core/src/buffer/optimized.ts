import { RGBA } from "@opentuee/core/src/types";
import { packDrawOptions } from "@opentuee/core/src/utils";
import { Library } from "@opentuee/core/src/zig";
import { type Pointer } from "bun:ffi";
import { Effect } from "effect";
import { getBorderCharArrays, type BorderSides, type BorderStyle } from "../renderer/utils/border";
import type { TextBuffer } from "./text";

export class OptimizedBuffer {
  static fbIdCounter = 0;
  public id: string;
  private bufferPtr: Pointer;
  private buffer: {
    char: Uint32Array;
    fg: Float32Array;
    bg: Float32Array;
    attributes: Uint8Array;
  };
  private width: number;
  private height: number;
  public respectAlpha: boolean = false;
  private useFFI: boolean = true;

  get ptr(): Pointer {
    return this.bufferPtr;
  }

  constructor(
    ptr: Pointer,
    buffer: {
      char: Uint32Array;
      fg: Float32Array;
      bg: Float32Array;
      attributes: Uint8Array;
    },
    width: number,
    height: number,
    options: { respectAlpha?: boolean },
  ) {
    this.id = `fb_${OptimizedBuffer.fbIdCounter++}`;
    this.respectAlpha = options.respectAlpha || false;
    this.width = width;
    this.height = height;
    this.bufferPtr = ptr;
    this.buffer = buffer;
  }

  static create = Effect.fn(function* (width: number, height: number, options: { respectAlpha?: boolean } = {}) {
    const lib = yield* Library;
    const respectAlpha = options.respectAlpha || false;
    const attributes = yield* lib.createOptimizedBufferAttributes(width, height, respectAlpha);
    return new OptimizedBuffer(attributes.bufferPtr, attributes.buffers, width, height, options);
  });

  public get buffers(): {
    char: Uint32Array;
    fg: Float32Array;
    bg: Float32Array;
    attributes: Uint8Array;
  } {
    return this.buffer;
  }

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
      if (this.useFFI) {
        yield* this.clearFFI(bg);
      } else {
        yield* this.clearLocal(bg, clearChar);
      }
    });

  public clearLocal = (bg: RGBA = RGBA.fromValues(0, 0, 0, 1), clearChar: string = " ") =>
    Effect.gen(this, function* () {
      this.buffer.char.fill(clearChar.charCodeAt(0));
      this.buffer.attributes.fill(0);

      for (let i = 0; i < this.width * this.height; i++) {
        const index = i * 4;

        this.buffer.fg[index] = 1.0;
        this.buffer.fg[index + 1] = 1.0;
        this.buffer.fg[index + 2] = 1.0;
        this.buffer.fg[index + 3] = 1.0;

        this.buffer.bg[index] = bg.r;
        this.buffer.bg[index + 1] = bg.g;
        this.buffer.bg[index + 2] = bg.b;
        this.buffer.bg[index + 3] = bg.a;
      }
    });

  public setCell = (x: number, y: number, char: string, fg: RGBA, bg: RGBA, attributes: number = 0) =>
    Effect.gen(this, function* () {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

      const index = this.coordsToIndex(x, y);
      const colorIndex = index * 4;

      // Set character and attributes
      this.buffer.char[index] = char.charCodeAt(0);
      this.buffer.attributes[index] = attributes;

      // Set foreground color
      this.buffer.fg[colorIndex] = fg.r;
      this.buffer.fg[colorIndex + 1] = fg.g;
      this.buffer.fg[colorIndex + 2] = fg.b;
      this.buffer.fg[colorIndex + 3] = fg.a;

      // Set background color
      this.buffer.bg[colorIndex] = bg.r;
      this.buffer.bg[colorIndex + 1] = bg.g;
      this.buffer.bg[colorIndex + 2] = bg.b;
      this.buffer.bg[colorIndex + 3] = bg.a;
    });

  public get = (x: number, y: number) =>
    Effect.gen(this, function* () {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;

      const index = this.coordsToIndex(x, y);
      const colorIndex = index * 4;

      return {
        char: this.buffer.char[index],
        fg: RGBA.fromArray(this.buffer.fg.slice(colorIndex, colorIndex + 4)),
        bg: RGBA.fromArray(this.buffer.bg.slice(colorIndex, colorIndex + 4)),
        attributes: this.buffer.attributes[index],
      };
    });

  public setCellWithAlphaBlending = (x: number, y: number, char: string, fg: RGBA, bg: RGBA, attributes: number = 0) =>
    Effect.gen(this, function* () {
      if (this.useFFI) {
        yield* this.setCellWithAlphaBlendingFFI(x, y, char, fg, bg, attributes);
      } else {
        yield* this.setCellWithAlphaBlendingLocal(x, y, char, fg, bg, attributes);
      }
    });

  public setCellWithAlphaBlendingLocal = (
    x: number,
    y: number,
    char: string,
    fg: RGBA,
    bg: RGBA,
    attributes: number = 0,
  ) =>
    Effect.gen(this, function* () {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

      const hasBgAlpha = bg.hasAlpha();
      const hasFgAlpha = fg.hasAlpha();

      if (hasBgAlpha || hasFgAlpha) {
        const destCell = yield* this.get(x, y);
        if (destCell) {
          const blendedBgRgb = hasBgAlpha ? bg.blendColors(destCell.bg) : bg;

          const preserveChar = char === " " && destCell.char !== 0 && String.fromCharCode(destCell.char) !== " ";
          const finalChar = preserveChar ? destCell.char : char.charCodeAt(0);

          let finalFg: RGBA;
          if (preserveChar) {
            finalFg = bg.blendColors(destCell.fg);
          } else {
            finalFg = hasFgAlpha ? fg.blendColors(destCell.bg) : fg;
          }

          const finalAttributes = preserveChar ? destCell.attributes : attributes;
          const finalBg = RGBA.fromValues(blendedBgRgb.r, blendedBgRgb.g, blendedBgRgb.b, bg.a);

          yield* this.setCell(x, y, String.fromCharCode(finalChar), finalFg, finalBg, finalAttributes);
          return;
        }
      }

      yield* this.setCell(x, y, char, fg, bg, attributes);
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
      if (!selection) {
        yield* this.drawTextFFI.call(this, text, x, y, fg, bg, attributes);
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
        yield* this.drawTextFFI.call(this, beforeText, x, y, fg, bg, attributes);
      }

      if (end > start) {
        const selectedText = text.slice(start, end);
        yield* this.drawTextFFI.call(this, selectedText, x + start, y, selectionFg, selectionBg, attributes);
      }

      if (end < text.length) {
        const afterText = text.slice(end);
        yield* this.drawTextFFI.call(this, afterText, x + end, y, fg, bg, attributes);
      }
    });

  public fillRect = (x: number, y: number, width: number, height: number, bg: RGBA) =>
    Effect.gen(this, function* () {
      if (this.useFFI) {
        yield* this.fillRectFFI(x, y, width, height, bg);
      } else {
        yield* this.fillRectLocal(x, y, width, height, bg);
      }
    });

  public fillRectLocal = (x: number, y: number, width: number, height: number, bg: RGBA) =>
    Effect.gen(this, function* () {
      const startX = Math.max(0, x);
      const startY = Math.max(0, y);
      const endX = Math.min(this.getWidth() - 1, x + width - 1);
      const endY = Math.min(this.getHeight() - 1, y + height - 1);

      if (startX > endX || startY > endY) return;

      const hasAlpha = bg.hasAlpha();

      if (hasAlpha) {
        const fg = RGBA.fromValues(1.0, 1.0, 1.0, 1.0);
        for (let fillY = startY; fillY <= endY; fillY++) {
          for (let fillX = startX; fillX <= endX; fillX++) {
            yield* this.setCellWithAlphaBlending(fillX, fillY, " ", fg, bg, 0);
          }
        }
      } else {
        for (let fillY = startY; fillY <= endY; fillY++) {
          for (let fillX = startX; fillX <= endX; fillX++) {
            const index = this.coordsToIndex(fillX, fillY);
            const colorIndex = index * 4;

            this.buffer.char[index] = " ".charCodeAt(0);
            this.buffer.attributes[index] = 0;

            this.buffer.fg[colorIndex] = 1.0;
            this.buffer.fg[colorIndex + 1] = 1.0;
            this.buffer.fg[colorIndex + 2] = 1.0;
            this.buffer.fg[colorIndex + 3] = 1.0;

            this.buffer.bg[colorIndex] = bg.r;
            this.buffer.bg[colorIndex + 1] = bg.g;
            this.buffer.bg[colorIndex + 2] = bg.b;
            this.buffer.bg[colorIndex + 3] = bg.a;
          }
        }
      }
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
      // Prefer FFI for framebuffer drawing
      yield* this.drawFrameBufferFFI(destX, destY, frameBuffer, sourceX, sourceY, sourceWidth, sourceHeight);
    });

  public drawFrameBufferLocal = (
    destX: number,
    destY: number,
    frameBuffer: OptimizedBuffer,
    sourceX?: number,
    sourceY?: number,
    sourceWidth?: number,
    sourceHeight?: number,
  ) =>
    Effect.gen(this, function* () {
      const srcX = sourceX ?? 0;
      const srcY = sourceY ?? 0;
      const srcWidth = sourceWidth ?? frameBuffer.getWidth();
      const srcHeight = sourceHeight ?? frameBuffer.getHeight();

      if (srcX >= frameBuffer.getWidth() || srcY >= frameBuffer.getHeight()) return;
      if (srcWidth === 0 || srcHeight === 0) return;

      const clampedSrcWidth = Math.min(srcWidth, frameBuffer.getWidth() - srcX);
      const clampedSrcHeight = Math.min(srcHeight, frameBuffer.getHeight() - srcY);

      const startDestX = Math.max(0, destX);
      const startDestY = Math.max(0, destY);
      const endDestX = Math.min(this.width - 1, destX + clampedSrcWidth - 1);
      const endDestY = Math.min(this.height - 1, destY + clampedSrcHeight - 1);

      if (!frameBuffer.respectAlpha) {
        for (let dY = startDestY; dY <= endDestY; dY++) {
          for (let dX = startDestX; dX <= endDestX; dX++) {
            const relativeDestX = dX - destX;
            const relativeDestY = dY - destY;
            const sX = srcX + relativeDestX;
            const sY = srcY + relativeDestY;

            if (sX >= frameBuffer.getWidth() || sY >= frameBuffer.getHeight()) continue;

            const destIndex = this.coordsToIndex(dX, dY);
            const srcIndex = frameBuffer.coordsToIndex(sX, sY);

            const destColorIndex = destIndex * 4;
            const srcColorIndex = srcIndex * 4;

            // Copy character and attributes
            this.buffer.char[destIndex] = frameBuffer.buffer.char[srcIndex];
            this.buffer.attributes[destIndex] = frameBuffer.buffer.attributes[srcIndex];

            // Copy foreground color
            this.buffer.fg[destColorIndex] = frameBuffer.buffer.fg[srcColorIndex];
            this.buffer.fg[destColorIndex + 1] = frameBuffer.buffer.fg[srcColorIndex + 1];
            this.buffer.fg[destColorIndex + 2] = frameBuffer.buffer.fg[srcColorIndex + 2];
            this.buffer.fg[destColorIndex + 3] = frameBuffer.buffer.fg[srcColorIndex + 3];

            // Copy background color
            this.buffer.bg[destColorIndex] = frameBuffer.buffer.bg[srcColorIndex];
            this.buffer.bg[destColorIndex + 1] = frameBuffer.buffer.bg[srcColorIndex + 1];
            this.buffer.bg[destColorIndex + 2] = frameBuffer.buffer.bg[srcColorIndex + 2];
            this.buffer.bg[destColorIndex + 3] = frameBuffer.buffer.bg[srcColorIndex + 3];
          }
        }
        return;
      }

      for (let dY = startDestY; dY <= endDestY; dY++) {
        for (let dX = startDestX; dX <= endDestX; dX++) {
          const relativeDestX = dX - destX;
          const relativeDestY = dY - destY;
          const sX = srcX + relativeDestX;
          const sY = srcY + relativeDestY;

          if (sX >= frameBuffer.getWidth() || sY >= frameBuffer.getHeight()) continue;

          const srcIndex = frameBuffer.coordsToIndex(sX, sY);
          const srcColorIndex = srcIndex * 4;

          if (frameBuffer.buffer.bg[srcColorIndex + 3] === 0 && frameBuffer.buffer.fg[srcColorIndex + 3] === 0) {
            continue;
          }

          const charCode = frameBuffer.buffer.char[srcIndex];
          const fg: RGBA = RGBA.fromArray(frameBuffer.buffer.fg.slice(srcColorIndex, srcColorIndex + 4));
          const bg: RGBA = RGBA.fromArray(frameBuffer.buffer.bg.slice(srcColorIndex, srcColorIndex + 4));
          const attributes = frameBuffer.buffer.attributes[srcIndex];

          yield* this.setCellWithAlphaBlending(dX, dY, String.fromCharCode(charCode), fg, bg, attributes);
        }
      }
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
      // Use native implementation
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
      // Prefer FFI for super sample buffer drawing
      yield* this.drawSuperSampleBufferFFI(x, y, pixelDataPtr, pixelDataLength, format, alignedBytesPerRow);
    });

  //
  // FFI
  //

  public drawSuperSampleBufferFFI = (
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

  public setCellWithAlphaBlendingFFI = (x: number, y: number, char: string, fg: RGBA, bg: RGBA, attributes?: number) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferSetCellWithAlphaBlending(this.bufferPtr, x, y, char, fg, bg, attributes);
    });

  public fillRectFFI = (x: number, y: number, width: number, height: number, bg: RGBA) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferFillRect(this.bufferPtr, x, y, width, height, bg);
    });

  public resize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      if (this.width === width && this.height === height) return;
      const lib = yield* Library;

      this.width = width;
      this.height = height;

      this.buffer = yield* lib.bufferResize(this.bufferPtr, width, height);
    });

  public clearFFI = (bg: RGBA = RGBA.fromValues(0, 0, 0, 1)) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferClear(this.bufferPtr, bg);
    });

  public drawTextFFI = (
    text: string,
    x: number,
    y: number,
    fg: RGBA = RGBA.fromValues(1.0, 1.0, 1.0, 1.0),
    bg?: RGBA,
    attributes: number = 0,
  ) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.bufferDrawText(this.bufferPtr, text, x, y, fg, bg, attributes);
    });

  public drawFrameBufferFFI = (
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
}
