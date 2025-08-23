// https://github.com/sst/opentui/blob/main/src/buffer.ts
// Converted to Effect

// import { resolveRenderLib, type RenderLib } from "./zig";
import { type Pointer } from "bun:ffi";
import { Context, Effect, Layer, Ref } from "effect";
import { Fragment, type StyledText } from "../../ui/src/components/fragment";
import { MissingBackgroundColor, OptimizedBufferDrawTextLocalInvalidText } from "./errors";
import { BorderChars, type BorderDrawOptions, type BorderSidesConfig } from "./renderer/utils/border";
import { RGBAClass, RGBAv2 } from "./types";
import { createTextAttributes, parseColor } from "./utils";
import { RenderLib } from "./zig";

class FbIdCounterClass {
  static id: number = 0;
  getNext(): Effect.Effect<number> {
    const x = FbIdCounterClass.id++;
    return Effect.succeed(x);
  }
}

class FbIdCounter extends Context.Tag("FbIdCounter")<FbIdCounter, FbIdCounterClass>() {}

export const fbIdCounter = Layer.succeed(FbIdCounter, new FbIdCounterClass());

export class OptimizedBufferPointer extends Context.Tag("OptimizedBufferPointer")<OptimizedBufferPointer, Pointer>() {}

export type OptimizedBufferBufferService = {
  char: Uint32Array;
  fg: Float32Array;
  bg: Float32Array;
  attributes: Uint8Array;
};

export class OptimizedBufferBuffer extends Context.Tag("OptimizedBufferBuffer")<
  OptimizedBufferBuffer,
  OptimizedBufferBufferService
>() {}

export const makeOptimizedBufferBuffer = Effect.fn(function* (
  char: Uint32Array,
  fg: Float32Array,
  bg: Float32Array,
  attributes: Uint8Array,
) {
  return {
    char,
    fg,
    bg,
    attributes,
  } satisfies OptimizedBufferBufferService;
});

export const createOptimizedBufferBufferLayer = (
  char: Uint32Array,
  fg: Float32Array,
  bg: Float32Array,
  attributes: Uint8Array,
) => Layer.effect(OptimizedBufferBuffer, makeOptimizedBufferBuffer(char, fg, bg, attributes));

export type OptimizedBufferService = Effect.Effect.Success<ReturnType<typeof makeOptimizedBuffer>>;

export class OptimizedBuffer extends Context.Tag("OptimizedBuffer")<OptimizedBuffer, OptimizedBufferService>() {}

export const makeOptimizedBuffer = Effect.fn(
  function* (
    pointer: Pointer,
    buffers: OptimizedBufferBufferService,
    _width: number,
    _height: number,
    options: {} = {},
  ) {
    const idCounter = yield* FbIdCounter;
    const fbId = `fb_${idCounter.getNext()}`;
    const lib = yield* RenderLib;
    // const bufferPointer = yield* OptimizedBufferPointer;
    // const obbuffer = yield* OptimizedBufferBuffer;
    const buffer = yield* Ref.make(buffers);
    const width = yield* Ref.make(_width);
    const height = yield* Ref.make(_height);
    const useFFI = yield* Ref.make(true);
    const respectAlpha = yield* Ref.make(false);

    const coordsToIndex = Effect.fn(function* (x: number, y: number) {
      const w = yield* Ref.get(width);
      return y * w + x;
    });

    const setBuffer = Effect.fn(function* (buffers: OptimizedBufferBufferService) {
      yield* Ref.set(buffer, buffers);
    });

    const getWidth = Effect.fn(function* () {
      const w = yield* Ref.get(width);
      return w;
    });

    const getHeight = Effect.fn(function* () {
      const h = yield* Ref.get(height);
      return h;
    });

    const setRespectAlpha = Effect.fn(function* (respectAlpha: boolean) {
      yield* lib.bufferSetRespectAlpha(pointer, respectAlpha);
    });

    const clear = Effect.fn(function* (bg?: RGBAClass, clearChar: string = " ") {
      const u = yield* useFFI;
      if (!bg) return yield* Effect.fail(new MissingBackgroundColor());
      if (u) {
        yield* clearFFI(bg);
      } else {
        yield* clearLocal(bg, clearChar);
      }
    });

    const clearLocal = Effect.fn(function* (bg: RGBAClass, clearChar: string = " ") {
      const bgBuffer = bg.buffer;
      const w = yield* getWidth();
      const h = yield* getHeight();
      const b = yield* Ref.update(buffer, (buffer) => {
        buffer.char.fill(clearChar.charCodeAt(0));
        buffer.attributes.fill(0);

        for (let i = 0; i < w * h; i++) {
          const index = i * 4;

          buffer.fg[index] = 1.0;
          buffer.fg[index + 1] = 1.0;
          buffer.fg[index + 2] = 1.0;
          buffer.fg[index + 3] = 1.0;

          buffer.bg[index] = bgBuffer[0];
          buffer.bg[index + 1] = bgBuffer[1];
          buffer.bg[index + 2] = bgBuffer[2];
          buffer.bg[index + 3] = bgBuffer[3];
        }
        return buffer;
      });
    });

    const setCell = Effect.fn(function* (
      x: number,
      y: number,
      char: string,
      fg: RGBAClass,
      bg: RGBAClass,
      attributes: number = 0,
    ) {
      const w = yield* getWidth();
      const h = yield* getHeight();
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const index = yield* coordsToIndex(x, y);
      const colorIndex = index * 4;

      const fgBuffer = fg.buffer;
      const bgBuffer = bg.buffer;

      yield* Ref.update(buffer, (buffer) => {
        // Set character and attributes
        buffer.char[index] = char.charCodeAt(0);
        buffer.attributes[index] = attributes;

        // Set foreground color
        buffer.fg[colorIndex] = fgBuffer[0];
        buffer.fg[colorIndex + 1] = fgBuffer[1];
        buffer.fg[colorIndex + 2] = fgBuffer[2];
        buffer.fg[colorIndex + 3] = fgBuffer[3];

        // Set background color
        buffer.bg[colorIndex] = bgBuffer[0];
        buffer.bg[colorIndex + 1] = bgBuffer[1];
        buffer.bg[colorIndex + 2] = bgBuffer[2];
        buffer.bg[colorIndex + 3] = bgBuffer[3];

        return buffer;
      });
    });

    const get = Effect.fn(function* (x: number, y: number) {
      const w = yield* getWidth();
      const h = yield* getHeight();
      if (x < 0 || x >= w || y < 0 || y >= h) return null;
      const index = yield* coordsToIndex(x, y);
      const colorIndex = index * 4;

      const b = yield* Ref.get(buffer);
      const char = b.char[index];
      const fg = RGBAClass.fromArray(b.fg.slice(colorIndex, colorIndex + 4));
      const bg = RGBAClass.fromArray(b.bg.slice(colorIndex, colorIndex + 4));
      const attributes = b.attributes[index];

      return {
        char,
        fg,
        bg,
        attributes,
      };
    });

    const setCellWithAlphaBlending = Effect.fn(function* (
      x: number,
      y: number,
      char: string,
      fg: RGBAClass,
      bg: RGBAClass,
      attributes: number = 0,
    ) {
      const u = yield* Ref.get(useFFI);
      if (u) {
        yield* setCellWithAlphaBlendingFFI(x, y, char, fg, bg, attributes);
      } else {
        yield* setCellWithAlphaBlendingLocal(x, y, char, fg, bg, attributes);
      }
    });

    const setCellWithAlphaBlendingLocal = Effect.fn(function* (
      x: number,
      y: number,
      char: string,
      fg: RGBAClass,
      bg: RGBAClass,
      attributes: number = 0,
    ) {
      const w = yield* getWidth();
      const h = yield* getHeight();
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const hasBgAlpha = bg.hasAlpha();
      const hasFgAlpha = fg.hasAlpha();
      if (hasBgAlpha || hasFgAlpha) {
        const destCell = yield* get(x, y);
        if (destCell) {
          const blendedBgRgb = hasBgAlpha ? bg.blendColors(destCell.bg) : bg;
          const preserveChar = char === " " && destCell.char !== 0 && String.fromCharCode(destCell.char) !== " ";
          const finalChar = preserveChar ? destCell.char : char.charCodeAt(0);
          let finalFg: RGBAClass;
          if (preserveChar) {
            finalFg = bg.blendColors(destCell.bg);
          } else {
            finalFg = hasFgAlpha ? fg.blendColors(destCell.bg) : fg;
          }
          const finalAttributes = preserveChar ? destCell.attributes : attributes;

          const [bbgR, bbgG, bbgB] = blendedBgRgb.buffer;
          const bgA = blendedBgRgb.buffer[3];
          const finalBg = RGBAClass.fromValues(bbgR, bbgG, bbgB, bgA);
          yield* setCell(x, y, String.fromCharCode(finalChar), finalFg, finalBg, finalAttributes);
          return;
        }
      }
    });

    const drawText = Effect.fn(function* (
      text: string,
      x: number,
      y: number,
      fg: RGBAClass,
      bg?: RGBAClass,
      attributes: number = 0,
      selection?: {
        start: number;
        end: number;
        bgColor?: RGBAClass;
        fgColor?: RGBAClass;
      } | null,
    ) {
      const w = yield* getWidth();
      const h = yield* getHeight();
      const u = yield* Ref.get(useFFI);
      const method = u ? drawTextFFI : drawTextLocal;
      if (!selection) {
        yield* method(text, x, y, fg, bg, attributes);
        return;
      }
      const { start, end } = selection;

      let selectionBg: RGBAClass;
      let selectionFg: RGBAClass;

      if (selection.bgColor) {
        selectionBg = selection.bgColor;
        selectionFg = selection.fgColor || fg;
      } else {
        const defaultBg = bg || RGBAClass.fromValues(0, 0, 0, 0);
        selectionFg = defaultBg.hasAlpha() ? defaultBg : RGBAClass.fromValues(0, 0, 0, 1);
        selectionBg = fg;
      }

      if (start > 0) {
        const beforeText = text.slice(0, start);
        yield* method(beforeText, x, y, fg, bg, attributes);
      }

      if (end > start) {
        const selectedText = text.slice(start, end);
        yield* method(selectedText, x + start, y, selectionFg, selectionBg, attributes);
      }

      if (end < text.length) {
        const afterText = text.slice(end);
        yield* method(afterText, x + end, y, fg, bg, attributes);
      }
    });

    const drawTextLocal = Effect.fn(function* (
      text: string,
      x: number,
      y: number,
      fg: RGBAClass,
      bg?: RGBAClass,
      attributes: number = 0,
    ) {
      const w = yield* getWidth();
      const h = yield* getHeight();
      if (y < 0 || y >= h) return;
      if (!text || typeof text !== "string") {
        return yield* Effect.fail(
          new OptimizedBufferDrawTextLocalInvalidText({
            text,
            x,
            y,
            fg,
            bg,
          }),
        );
      }

      let startX = w;
      let endX = 0;

      let i = 0;
      for (const char of text) {
        const charX = x + i;
        i++;

        if (charX < 0 || charX >= w) continue;

        startX = Math.min(startX, charX);
        endX = Math.max(endX, charX);

        let bgColor = bg;
        if (!bgColor) {
          const existingCell = yield* get(charX, y);
          if (existingCell) {
            bgColor = existingCell.bg;
          } else {
            bgColor = RGBAClass.fromValues(0.0, 0.0, 0.0, 1.0); // Default black if no existing cell
          }
        }
        yield* setCellWithAlphaBlending(charX, y, char, fg, bgColor, attributes);
      }
    });

    const fillRect = Effect.fn(function* (x: number, y: number, width: number, height: number, bg: RGBAClass) {
      const u = yield* Ref.get(useFFI);
      if (u) {
        yield* fillRectFFI(x, y, width, height, bg);
      } else {
        yield* fillRectLocal(x, y, width, height, bg);
      }
    });

    const fillRectLocal = Effect.fn(function* (x: number, y: number, width: number, height: number, bg: RGBAClass) {
      const startX = Math.max(0, x);
      const startY = Math.max(0, y);
      const w = yield* getWidth();
      const h = yield* getHeight();
      const endX = Math.min(w - 1, x + width - 1);
      const endY = Math.min(h - 1, y + height - 1);

      if (startX > endX || startY > endY) return;

      const hasAlpha = bg.hasAlpha();

      if (hasAlpha) {
        const fg = RGBAClass.fromValues(1.0, 1.0, 1.0, 1.0);
        for (let fillY = startY; fillY <= endY; fillY++) {
          for (let fillX = startX; fillX <= endX; fillX++) {
            yield* setCellWithAlphaBlending(fillX, fillY, " ", fg, bg, 0);
          }
        }
      } else {
        for (let fillY = startY; fillY <= endY; fillY++) {
          for (let fillX = startX; fillX <= endX; fillX++) {
            const index = yield* coordsToIndex(fillX, fillY);
            const colorIndex = index * 4;

            const bgBuffer = bg.buffer;
            yield* Ref.update(buffer, (buffer) => {
              buffer.char[index] = " ".charCodeAt(0);
              buffer.attributes[index] = 0;

              buffer.fg[colorIndex] = 1.0;
              buffer.fg[colorIndex + 1] = 1.0;
              buffer.fg[colorIndex + 2] = 1.0;
              buffer.fg[colorIndex + 3] = 1.0;

              buffer.bg[colorIndex] = bgBuffer[0];
              buffer.bg[colorIndex + 1] = bgBuffer[1];
              buffer.bg[colorIndex + 2] = bgBuffer[2];
              buffer.bg[colorIndex + 3] = bgBuffer[3];

              return buffer;
            });
          }
        }
      }
    });

    const drawFrameBuffer = Effect.fn(function* (
      destX: number,
      destY: number,
      frameBufferPointer: Pointer,
      sourceX?: number,
      sourceY?: number,
      sourceWidth?: number,
      sourceHeight?: number,
    ) {
      return yield* drawFrameBufferFFI(destX, destY, frameBufferPointer, sourceX, sourceY, sourceWidth, sourceHeight);
    });

    const drawFrameBufferLocal = Effect.fn(function* (
      destX: number,
      destY: number,
      frameBuffer: OptimizedBufferService,
      sourceX?: number,
      sourceY?: number,
      sourceWidth?: number,
      sourceHeight?: number,
    ) {
      const srcX = sourceX ?? 0;
      const srcY = sourceY ?? 0;
      const fbw = yield* frameBuffer.getWidth();
      const fbh = yield* frameBuffer.getHeight();
      const fbb = yield* frameBuffer.getBuffer();
      const w = yield* getWidth();
      const h = yield* getHeight();
      const srcWidth = sourceWidth ?? fbw;
      const srcHeight = sourceHeight ?? fbh;

      if (srcX >= fbw || srcY >= fbh) return;
      if (srcWidth === 0 || srcHeight === 0) return;

      const clampedSrcWidth = Math.min(srcWidth, fbw - srcX);
      const clampedSrcHeight = Math.min(srcHeight, fbh - srcY);

      const startDestX = Math.max(0, destX);
      const startDestY = Math.max(0, destY);
      const endDestX = Math.min(w - 1, destX + clampedSrcWidth - 1);
      const endDestY = Math.min(h - 1, destY + clampedSrcHeight - 1);
      const ra = yield* frameBuffer.getRespectAlpha();

      if (!ra) {
        for (let dY = startDestY; dY <= endDestY; dY++) {
          for (let dX = startDestX; dX <= endDestX; dX++) {
            const relativeDestX = dX - destX;
            const relativeDestY = dY - destY;
            const sX = srcX + relativeDestX;
            const sY = srcY + relativeDestY;

            if (sX >= fbw || sY >= fbh) continue;

            const destIndex = yield* coordsToIndex(dX, dY);
            const srcIndex = yield* frameBuffer.coordsToIndex(sX, sY);

            const destColorIndex = destIndex * 4;
            const srcColorIndex = srcIndex * 4;
            // Copy character and attributes
            yield* Ref.update(buffer, (buffer) => {
              buffer.char[destIndex] = fbb.char[srcIndex];
              buffer.attributes[destIndex] = fbb.attributes[srcIndex];

              // Copy foreground color
              buffer.fg[destColorIndex] = fbb.fg[srcColorIndex];
              buffer.fg[destColorIndex + 1] = fbb.fg[srcColorIndex + 1];
              buffer.fg[destColorIndex + 2] = fbb.fg[srcColorIndex + 2];
              buffer.fg[destColorIndex + 3] = fbb.fg[srcColorIndex + 3];

              // Copy background color
              buffer.bg[destColorIndex] = fbb.bg[srcColorIndex];
              buffer.bg[destColorIndex + 1] = fbb.bg[srcColorIndex + 1];
              buffer.bg[destColorIndex + 2] = fbb.bg[srcColorIndex + 2];
              buffer.bg[destColorIndex + 3] = fbb.bg[srcColorIndex + 3];

              return buffer;
            });
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

          if (sX >= fbw || sY >= fbh) continue;

          const srcIndex = yield* frameBuffer.coordsToIndex(sX, sY);
          const srcColorIndex = srcIndex * 4;

          if (fbb.bg[srcColorIndex + 3] === 0 && fbb.fg[srcColorIndex + 3] === 0) {
            continue;
          }

          const charCode = fbb.char[srcIndex];
          const fg: RGBAClass = RGBAClass.fromArray(fbb.fg.slice(srcColorIndex, srcColorIndex + 4));
          const bg: RGBAClass = RGBAClass.fromArray(fbb.bg.slice(srcColorIndex, srcColorIndex + 4));
          const attributes = fbb.attributes[srcIndex];

          yield* setCellWithAlphaBlending(dX, dY, String.fromCharCode(charCode), fg, bg, attributes);
        }
      }
    });

    const destroy = Effect.fn(function* () {
      yield* lib.destroyOptimizedBuffer(pointer);
    });

    const drawStyledText = Effect.fn(function* (
      styledText: StyledText,
      x: number,
      y: number,
      defaultFg: RGBAClass,
      defaultBg: RGBAClass,
    ) {
      yield* drawStyledTextLocal(styledText, x, y, defaultFg, defaultBg);
    });

    const drawStyledTextLocal = Effect.fn(function* (
      styledText: StyledText,
      x: number,
      y: number,
      defaultFg: RGBAClass = RGBAClass.fromValues(1, 1, 1, 1),
      defaultBg: RGBAClass = RGBAClass.fromValues(0, 0, 0, 0),
      selection?: {
        start: number;
        end: number;
        bgColor?: RGBAClass;
        fgColor?: RGBAClass;
      },
    ) {
      let currentX = x;
      let currentY = y;
      let charIndex = 0;

      for (const styledChar of styledText) {
        if (styledChar.char === "\n") {
          currentY++;
          currentX = x;
          charIndex++;
          continue;
        }

        let fg = styledChar.style.fg ? yield* parseColor(styledChar.style.fg) : defaultFg;
        let bg = styledChar.style.bg ? yield* parseColor(styledChar.style.bg) : defaultBg;

        const isSelected = selection && charIndex >= selection.start && charIndex < selection.end;

        if (isSelected) {
          if (selection.bgColor) {
            bg = selection.bgColor;
            if (selection.fgColor) {
              fg = selection.fgColor;
            }
          } else {
            const temp = fg;
            fg = bg.hasAlpha() ? bg : RGBAClass.fromValues(0, 0, 0, 1);
            bg = temp;
          }
        }

        if (styledChar.style.reverse) {
          [fg, bg] = [bg, fg];
        }

        const attributes = yield* createTextAttributes({
          bold: styledChar.style.bold,
          italic: styledChar.style.italic,
          underline: styledChar.style.underline,
          dim: styledChar.style.dim,
          blink: styledChar.style.blink,
          inverse: styledChar.style.reverse,
          hidden: false,
          strikethrough: styledChar.style.strikethrough,
        });

        yield* setCellWithAlphaBlending(currentX, currentY, styledChar.char, fg, bg, attributes);

        currentX++;
        charIndex++;
      }
    });

    const drawStyledTextFragment = Effect.fn(function* (
      x: number,
      y: number,
      defaultFg?: RGBAClass,
      defaultBg?: RGBAClass,
      selection?: {
        start: number;
        end: number;
        bgColor?: RGBAClass;
        fgColor?: RGBAClass;
      },
    ) {
      yield* drawStyledTextFragmentLocal(x, y, defaultFg, defaultBg, selection);
    });

    const drawStyledTextFragmentLocal = Effect.fn(function* (
      x: number,
      y: number,
      defaultFg?: RGBAClass,
      defaultBg?: RGBAClass,
      selection?: {
        start: number;
        end: number;
        bgColor?: RGBAClass;
        fgColor?: RGBAClass;
      },
    ) {
      const fm = yield* Fragment;
      return yield* drawStyledTextLocal(fm.toStyledText(), x, y, defaultFg, defaultBg, selection);
    });

    const drawSuperSampleBuffer = Effect.fn(function* (
      x: number,
      y: number,
      pixelDataPtr: Pointer,
      pixelDataLength: number,
      format: "bgra8unorm" | "rgba8unorm",
      alignedBytesPerRow: number,
    ) {
      yield* drawSuperSampleBufferFFI(x, y, pixelDataPtr, pixelDataLength, format, alignedBytesPerRow);
    });

    const drawSuperSampleBufferFFI = Effect.fn(function* (
      x: number,
      y: number,
      pixelDataPtr: Pointer,
      pixelDataLength: number,
      format: "bgra8unorm" | "rgba8unorm",
      alignedBytesPerRow: number,
    ) {
      return yield* lib.bufferDrawSuperSampleBuffer(
        pointer,
        x,
        y,
        pixelDataPtr,
        pixelDataLength,
        format,
        alignedBytesPerRow,
      );
    });

    const drawPackedBuffer = Effect.fn(function* (
      dataPtr: Pointer,
      dataLen: number,
      posX: number,
      posY: number,
      terminalWidthCells: number,
      terminalHeightCells: number,
    ) {
      yield* lib.bufferDrawPackedBuffer(pointer, dataPtr, dataLen, posX, posY, terminalWidthCells, terminalHeightCells);
    });

    const setCellWithAlphaBlendingFFI = Effect.fn(function* (
      x: number,
      y: number,
      char: string,
      fg: RGBAClass,
      bg: RGBAClass,
      attributes: number = 0,
    ) {
      yield* lib.bufferSetCellWithAlphaBlending(pointer, x, y, char, fg, bg, attributes);
    });

    const fillRectFFI = Effect.fn(function* (x: number, y: number, width: number, height: number, bg: RGBAClass) {
      yield* lib.bufferFillRect(pointer, x, y, width, height, bg);
    });

    const resize = Effect.fn(function* (width: number, height: number) {
      yield* lib.resizeRenderer(pointer, width, height);
    });

    const clearFFI = Effect.fn(function* (bg: RGBAClass) {
      yield* lib.bufferClear(pointer, bg);
    });

    const drawTextFFI = Effect.fn(function* (
      text: string,
      x: number,
      y: number,
      fg: RGBAClass,
      bg?: RGBAClass,
      attributes: number = 0,
    ) {
      return yield* lib.bufferDrawText(pointer, text, x, y, fg, bg, attributes);
    });

    const drawFrameBufferFFI = Effect.fn(function* (
      destX: number,
      destY: number,
      frameBufferPointer: Pointer,
      sourceX?: number,
      sourceY?: number,
      sourceWidth?: number,
      sourceHeight?: number,
    ) {
      return yield* lib.drawFrameBuffer(
        pointer,
        destX,
        destY,
        frameBufferPointer,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
      );
    });

    const getPointer = Effect.fn(function* () {
      return pointer;
    });

    const getRespectAlpha = Effect.fn(function* () {
      const u = yield* Ref.get(respectAlpha);
      return u;
    });

    const getBuffer = Effect.fn(function* () {
      return yield* Ref.get(buffer);
    });

    const getBorderSides: (border: BorderDrawOptions["border"]) => Effect.Effect<BorderSidesConfig> = Effect.fn(
      function* (border: BorderDrawOptions["border"]) {
        return border === true
          ? { top: true, right: true, bottom: true, left: true }
          : Array.isArray(border)
            ? {
                top: border.includes("top"),
                right: border.includes("right"),
                bottom: border.includes("bottom"),
                left: border.includes("left"),
              }
            : { top: false, right: false, bottom: false, left: false };
      },
    );

    const drawBorder = Effect.fn(function* (options: BorderDrawOptions) {
      const borderColor = yield* parseColor(options.borderColor);
      const backgroundColor = yield* parseColor(options.backgroundColor);
      const borderSides = yield* getBorderSides(options.border);
      const borders = options.customBorderChars || BorderChars[options.borderStyle];
      const bufferWidth = yield* getWidth();
      const bufferHeight = yield* getHeight();

      // Calculate visible area within buffer bounds
      const startX = Math.max(0, options.x);
      const startY = Math.max(0, options.y);
      const endX = Math.min(bufferWidth - 1, options.x + options.width - 1);
      const endY = Math.min(bufferHeight - 1, options.y + options.height - 1);

      // Calculate title positions if title is provided
      const drawTop = borderSides.top;
      let shouldDrawTitle = false;
      let titleX = startX;
      let titleStartX = 0;
      let titleEndX = 0;

      if (options.title && options.title.length > 0 && drawTop) {
        const titleLength = options.title.length;
        const minTitleSpace = 4; // Min space needed for title with border

        shouldDrawTitle = options.width >= titleLength + minTitleSpace;

        if (shouldDrawTitle) {
          const padding = 2;

          if (options.titleAlignment === "center") {
            titleX = startX + Math.max(padding, Math.floor((options.width - titleLength) / 2));
          } else if (options.titleAlignment === "right") {
            titleX = startX + options.width - padding - titleLength;
          } else {
            titleX = startX + padding;
          }

          titleX = Math.max(startX + padding, Math.min(titleX, endX - titleLength));
          titleStartX = titleX;
          titleEndX = titleX + titleLength - 1;
        }
      }

      const drawBottom = borderSides.bottom;
      const drawLeft = borderSides.left;
      const drawRight = borderSides.right;

      // Special cases for extending vertical borders
      const leftBorderOnly = drawLeft && !drawTop && !drawBottom;
      const rightBorderOnly = drawRight && !drawTop && !drawBottom;
      const bottomOnlyWithVerticals = drawBottom && !drawTop && (drawLeft || drawRight);
      const topOnlyWithVerticals = drawTop && !drawBottom && (drawLeft || drawRight);

      const extendVerticalsToTop = leftBorderOnly || rightBorderOnly || bottomOnlyWithVerticals;
      const extendVerticalsToBottom = leftBorderOnly || rightBorderOnly || topOnlyWithVerticals;

      // Draw horizontal borders
      if (drawTop || drawBottom) {
        // Draw top border
        if (drawTop) {
          for (let x = startX; x <= endX; x++) {
            if (startY >= 0 && startY < bufferHeight) {
              let char = borders.horizontal;

              // Handle corners
              if (x === startX) {
                char = drawLeft ? borders.topLeft : borders.horizontal;
              } else if (x === endX) {
                char = drawRight ? borders.topRight : borders.horizontal;
              }

              // Skip rendering border char if title should be drawn at this position
              if (shouldDrawTitle && x >= titleStartX && x <= titleEndX) {
                continue;
              }

              yield* setCellWithAlphaBlending(x, startY, char, borderColor, backgroundColor);
            }
          }
        }

        // Draw bottom border
        if (drawBottom) {
          for (let x = startX; x <= endX; x++) {
            if (endY >= 0 && endY < bufferHeight) {
              let char = borders.horizontal;

              // Handle corners
              if (x === startX) {
                char = drawLeft ? borders.bottomLeft : borders.horizontal;
              } else if (x === endX) {
                char = drawRight ? borders.bottomRight : borders.horizontal;
              }

              yield* setCellWithAlphaBlending(x, endY, char, borderColor, backgroundColor);
            }
          }
        }
      }

      // Draw vertical borders
      const verticalStartY = extendVerticalsToTop ? startY : startY + (drawTop ? 1 : 0);
      const verticalEndY = extendVerticalsToBottom ? endY : endY - (drawBottom ? 1 : 0);

      if (drawLeft || drawRight) {
        for (let y = verticalStartY; y <= verticalEndY; y++) {
          // Left border
          if (drawLeft && startX >= 0 && startX < bufferWidth) {
            yield* setCellWithAlphaBlending(startX, y, borders.vertical, borderColor, backgroundColor);
          }

          // Right border
          if (drawRight && endX >= 0 && endX < bufferWidth) {
            yield* setCellWithAlphaBlending(endX, y, borders.vertical, borderColor, backgroundColor);
          }
        }
      }

      // Draw title if specified
      if (shouldDrawTitle && options.title) {
        yield* drawText(options.title, titleX, startY, borderColor, backgroundColor, 0);
      }
    });

    const setWidth = Effect.fn(function* (w: number) {
      yield* Ref.set(width, w);
      const h = yield* Ref.get(height);
      yield* resize(w, h);
    });

    const setHeight = Effect.fn(function* (h: number) {
      yield* Ref.set(height, h);
      const w = yield* Ref.get(width);
      yield* resize(w, h);
    });

    return {
      fbId,
      clear,
      setCell,
      get,
      setWidth,
      setHeight,
      getWidth,
      getHeight,
      getRespectAlpha,
      setRespectAlpha,
      coordsToIndex,
      setBuffer,
      getBuffer,
      destroy,
      drawStyledTextFragment,
      drawStyledText,
      drawFrameBuffer,
      drawPackedBuffer,
      drawSuperSampleBufferFFI,
      drawSuperSampleBuffer,
      resize,
      getPointer,
      fillRect,
      drawText,
      drawBorder,
      clearLocal,
    };
  },
  (effect) => effect.pipe(Effect.provide([fbIdCounter])),
);
