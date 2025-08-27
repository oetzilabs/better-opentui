// https://github.com/sst/opentui/blob/main/src/zig.ts
// converted to Effect

import { BunContext } from "@effect/platform-bun";
import { toArrayBuffer, type Pointer } from "bun:ffi";
import { Context, Effect, Layer } from "effect";
import * as Cursor from "./cursor-style";
import {
  FailedToCreateOptimizedBuffer,
  RendererFailedToAddToHitGrid,
  RendererFailedToCheckHit,
  RendererFailedToClearBuffer,
  RendererFailedToCreate,
  RendererFailedToCreateFrameBuffer,
  RendererFailedToCreateTextBuffer,
  RendererFailedToDestroy,
  RendererFailedToDestroyOptimizedBuffer,
  RendererFailedToDestroyTextBuffer,
  RendererFailedToDisableMouse,
  RendererFailedToDrawBox,
  RendererFailedToDrawFrameBuffer,
  RendererFailedToDrawPackedBuffer,
  RendererFailedToDrawSuperSampleBuffer,
  RendererFailedToDrawText,
  RendererFailedToDrawTextBuffer,
  RendererFailedToDumpBuffers,
  RendererFailedToDumpHitGrid,
  RendererFailedToDumpStdoutBuffer,
  RendererFailedToEnableMouse,
  RendererFailedToFillRect,
  RendererFailedToFinalizeTextBufferLineInfo,
  RendererFailedToGetAttributesPointer,
  RendererFailedToGetBackgroundPointer,
  RendererFailedToGetBuffer,
  RendererFailedToGetBufferHeight,
  RendererFailedToGetBufferWidth,
  RendererFailedToGetCharPointer,
  RendererFailedToGetCurrentBuffer,
  RendererFailedToGetForegroundPointer,
  RendererFailedToGetNextBuffer,
  RendererFailedToGetRespectAlpha,
  RendererFailedToGetTextBuffer,
  RendererFailedToGetTextBufferAttributesPtr,
  RendererFailedToGetTextBufferBgPtr,
  RendererFailedToGetTextBufferCharPtr,
  RendererFailedToGetTextBufferFgPtr,
  RendererFailedToRender,
  RendererFailedToResetTextBuffer,
  RendererFailedToResizeBuffer,
  RendererFailedToResizeRenderer,
  RendererFailedToSetBackgroundColor,
  RendererFailedToSetCellWithAlphaBlending,
  RendererFailedToSetCursorColor,
  RendererFailedToSetCursorPosition,
  RendererFailedToSetCursorStyle,
  RendererFailedToSetOffset,
  RendererFailedToSetRespectAlpha,
  RendererFailedToSetUseThread,
  RendererFailedToUpdateMemoryStats,
  RendererFailedToUpdateStats,
} from "./errors";
import { OpenTUI, OpenTUILive } from "./lib";
import { RGBA } from "./types";

export class RenderPointer extends Context.Tag("RenderPointer")<RenderPointer, Pointer>() {}

export const makeRenderPointer = (pointer: Pointer) => Layer.succeed(RenderPointer, pointer);

export class LibPath extends Context.Tag("LibPath")<LibPath, string | undefined>() {}

export const makeLibPath = (path?: string | undefined) => Layer.succeed(LibPath, path);

export enum DebugOverlayCorner {
  topLeft = 0,
  topRight = 1,
  bottomLeft = 2,
  bottomRight = 3,
}

export class Library extends Effect.Service<Library>()("Library", {
  dependencies: [OpenTUILive],
  effect: Effect.gen(function* () {
    const opentui = yield* OpenTUI;
    const createRenderer = Effect.fn(function* (width: number, height: number) {
      const rendererPointer = yield* Effect.try({
        try: () => opentui.symbols.createRenderer(width, height),
        catch: (error) => new RendererFailedToCreate({ cause: error }),
      });
      if (!rendererPointer) return yield* Effect.fail(new RendererFailedToCreate());
      // const cli = yield* new

      return rendererPointer;
    });

    const encoder = new TextEncoder();

    const destroyRenderer = Effect.fn(function* (rendererPointer: Pointer) {
      yield* Effect.try({
        try: () => opentui.symbols.destroyRenderer(rendererPointer),
        catch: (error) => new RendererFailedToDestroy({ cause: error }),
      });
    });

    const setUseThread = Effect.fn(function* (pointer: Pointer, useThread: boolean) {
      return yield* Effect.try({
        try: () => opentui.symbols.setUseThread(pointer, useThread),
        catch: (error) => new RendererFailedToSetUseThread({ cause: error }),
      });
    });

    const setBackgroundColor = Effect.fn(function* (renderPointer: Pointer, color: RGBA) {
      return yield* Effect.try({
        try: () => opentui.symbols.setBackgroundColor(renderPointer, color.buffer),
        catch: (error) => new RendererFailedToSetBackgroundColor({ cause: error }),
      });
    });
    const setDebugOverlay = Effect.fn(function* (renderer: Pointer, enabled: boolean, corner: DebugOverlayCorner) {
      opentui.symbols.setDebugOverlay(renderer, enabled, corner);
    });

    const setRenderOffset = Effect.fn(function* (pointer: Pointer, offset: number) {
      return yield* Effect.try({
        try: () => opentui.symbols.setRenderOffset(pointer, offset),
        catch: (error) => new RendererFailedToSetOffset({ cause: error }),
      });
    });

    const updateStats = Effect.fn(function* (
      rendererPointer: Pointer,
      time: number,
      fps: number,
      frameCallbackTime: number,
    ) {
      return yield* Effect.try({
        try: () => opentui.symbols.updateStats(rendererPointer, time, fps, frameCallbackTime),
        catch: (error) => new RendererFailedToUpdateStats({ cause: error }),
      });
    });

    const updateMemoryStats = Effect.fn(function* (
      rendererPointer: Pointer,
      heapUsed: number,
      heapTotal: number,
      arrayBuffers: number,
    ) {
      yield* Effect.try({
        try: () => opentui.symbols.updateMemoryStats(rendererPointer, heapUsed, heapTotal, arrayBuffers),
        catch: (error) => new RendererFailedToUpdateMemoryStats({ cause: error }),
      });
    });

    const getNextBuffer = Effect.fn(function* (pointer: Pointer) {
      const bufferPtr = yield* Effect.try({
        try: () => opentui.symbols.getNextBuffer(pointer),
        catch: (error) => new RendererFailedToGetNextBuffer({ cause: error }),
      });

      if (!bufferPtr) {
        return yield* Effect.fail(new RendererFailedToGetNextBuffer());
      }

      const width = yield* Effect.try({
        try: () => opentui.symbols.getBufferWidth(bufferPtr),
        catch: (error) => new RendererFailedToGetBufferWidth({ cause: error }),
      });
      const height = yield* Effect.try({
        try: () => opentui.symbols.getBufferHeight(bufferPtr),
        catch: (error) => new RendererFailedToGetBufferHeight({ cause: error }),
      });

      const size = width * height;
      const buffers = yield* getBuffer(bufferPtr, size);

      return {
        bufferPtr,
        buffers,
        width,
        height,
      };
    });

    const getCurrentBuffer = Effect.fn(function* (pointer: Pointer) {
      const bufferPtr = yield* Effect.try({
        try: () => opentui.symbols.getCurrentBuffer(pointer),
        catch: (error) => new RendererFailedToGetCurrentBuffer({ cause: error }),
      });
      if (!bufferPtr) {
        return yield* Effect.fail(new RendererFailedToGetCurrentBuffer({ pointer: pointer }));
      }

      const width = yield* Effect.try({
        try: () => opentui.symbols.getBufferWidth(bufferPtr),
        catch: (error) => new RendererFailedToGetBufferWidth({ cause: error }),
      });
      const height = yield* Effect.try({
        try: () => opentui.symbols.getBufferHeight(bufferPtr),
        catch: (error) => new RendererFailedToGetBufferWidth({ cause: error }),
      });
      const size = width * height;
      const buffers = yield* getBuffer(bufferPtr, size);
      return { bufferPtr, buffers, width, height };
    });

    const getBuffer = Effect.fn(function* (bufferPtr: Pointer, size: number) {
      const charPtr = yield* Effect.try({
        try: () => opentui.symbols.bufferGetCharPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetCharPointer({ cause: error }),
      });
      const fgPtr = yield* Effect.try({
        try: () => opentui.symbols.bufferGetFgPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetForegroundPointer({ cause: error }),
      });
      const bgPtr = yield* Effect.try({
        try: () => opentui.symbols.bufferGetBgPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetBackgroundPointer({ cause: error }),
      });
      const attributesPtr = yield* Effect.try({
        try: () => opentui.symbols.bufferGetAttributesPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetAttributesPointer({ cause: error }),
      });

      if (!charPtr || !fgPtr || !bgPtr || !attributesPtr) {
        return yield* Effect.fail(
          new RendererFailedToGetBuffer({
            cause: new Error("Failed to get buffer pointers"),
          }),
        );
      }

      const buffers = {
        char: new Uint32Array(toArrayBuffer(charPtr, 0, size * 4)),
        fg: new Float32Array(toArrayBuffer(fgPtr, 0, size * 4 * 4)), // 4 floats per RGBA
        bg: new Float32Array(toArrayBuffer(bgPtr, 0, size * 4 * 4)), // 4 floats per RGBA
        attributes: new Uint8Array(toArrayBuffer(attributesPtr, 0, size)),
      };

      return buffers;
    });

    const bufferGetCharPtr = Effect.fn(function* (bufferPtr: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.bufferGetCharPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetCharPointer({ cause: error }),
      });
    });

    const bufferGetFgPtr = Effect.fn(function* (bufferPtr: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.bufferGetFgPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetForegroundPointer({ cause: error }),
      });
    });

    const bufferGetBgPtr = Effect.fn(function* (bufferPtr: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.bufferGetBgPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetBackgroundPointer({ cause: error }),
      });
    });

    const bufferGetAttributesPtr = Effect.fn(function* (bufferPtr: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.bufferGetAttributesPtr(bufferPtr),
        catch: (error) => new RendererFailedToGetAttributesPointer({ cause: error }),
      });
    });

    const bufferGetRespectAlpha = Effect.fn(function* (bufferPtr: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.bufferGetRespectAlpha(bufferPtr),
        catch: (error) => new RendererFailedToGetRespectAlpha({ cause: error }),
      });
    });

    const bufferSetRespectAlpha = Effect.fn(function* (bufferPtr: Pointer, respectAlpha: boolean) {
      return yield* Effect.try({
        try: () => opentui.symbols.bufferSetRespectAlpha(bufferPtr, respectAlpha),
        catch: (error) => new RendererFailedToSetRespectAlpha({ cause: error }),
      });
    });

    const getBufferWidth = Effect.fn(function* (bufferPtr: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.getBufferWidth(bufferPtr),
        catch: (error) => new RendererFailedToGetBufferWidth({ cause: error }),
      });
    });

    const getBufferHeight = Effect.fn(function* (bufferPtr: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.getBufferHeight(bufferPtr),
        catch: (error) => new RendererFailedToGetBufferHeight({ cause: error }),
      });
    });

    const bufferClear = Effect.fn(function* (bufferPtr: Pointer, color: RGBA) {
      return yield* Effect.try({
        try: () => opentui.symbols.bufferClear(bufferPtr, color.buffer),
        catch: (error) => new RendererFailedToClearBuffer({ cause: error }),
      });
    });

    const bufferDrawText = Effect.fn(function* (
      buffer: Pointer,
      text: string,
      x: number,
      y: number,
      color: RGBA,
      bgColor?: RGBA,
      attributes?: number,
    ) {
      const textBytes = encoder.encode(text);
      const textLength = textBytes.byteLength;
      const bg = bgColor ? bgColor.buffer : null;
      const fg = color.buffer;

      yield* Effect.try({
        try: () => opentui.symbols.bufferDrawText(buffer, textBytes, textLength, x, y, fg, bg, attributes ?? 0),
        catch: (e) => new RendererFailedToDrawText({ cause: e }),
      });
    });

    const bufferSetCellWithAlphaBlending = Effect.fn(function* (
      buffer: Pointer,
      x: number,
      y: number,
      char: string,
      color: RGBA,
      bgColor: RGBA,
      attributes?: number,
    ) {
      const charPtr = char.codePointAt(0) ?? " ".codePointAt(0)!;
      const bg = bgColor.buffer;
      const fg = color.buffer;

      yield* Effect.try({
        try: () => opentui.symbols.bufferSetCellWithAlphaBlending(buffer, x, y, charPtr, fg, bg, attributes ?? 0),
        catch: (e) => new RendererFailedToSetCellWithAlphaBlending({ cause: e }),
      });
    });

    const bufferFillRect = Effect.fn(function* (
      buffer: Pointer,
      x: number,
      y: number,
      width: number,
      height: number,
      color: RGBA,
    ) {
      const bg = color.buffer;

      yield* Effect.try({
        try: () => opentui.symbols.bufferFillRect(buffer, x, y, width, height, bg),
        catch: (e) => new RendererFailedToFillRect({ cause: e }),
      });
    });

    const bufferDrawSuperSampleBuffer = Effect.fn(function* (
      buffer: Pointer,
      x: number,
      y: number,
      pixelDataPtr: Pointer,
      pixelDataLength: number,
      format: "bgra8unorm" | "rgba8unorm",
      alignedBytesPerRow: number,
    ) {
      const formatId = format === "bgra8unorm" ? 0 : 1;
      yield* Effect.try({
        try: () =>
          opentui.symbols.bufferDrawSuperSampleBuffer(
            buffer,
            x,
            y,
            pixelDataPtr,
            pixelDataLength,
            formatId,
            alignedBytesPerRow,
          ),
        catch: (e) => new RendererFailedToDrawSuperSampleBuffer({ cause: e }),
      });
    });

    const bufferDrawPackedBuffer = Effect.fn(function* (
      buffer: Pointer,
      dataPtr: Pointer,
      dataLen: number,
      posX: number,
      posY: number,
      terminalWidthCells: number,
      terminalHeightCells: number,
    ) {
      yield* Effect.try({
        try: () =>
          opentui.symbols.bufferDrawPackedBuffer(
            buffer,
            dataPtr,
            dataLen,
            posX,
            posY,
            terminalWidthCells,
            terminalHeightCells,
          ),
        catch: (e) => new RendererFailedToDrawPackedBuffer({ cause: e }),
      });
    });

    const bufferResize = Effect.fn(function* (buffer: Pointer, width: number, height: number) {
      yield* Effect.try({
        try: () => opentui.symbols.bufferResize(buffer, width, height),
        catch: (e) => new RendererFailedToResizeBuffer({ cause: e }),
      });
      const buffer2 = yield* getBuffer(buffer, width * height);
      return buffer2;
    });

    const resizeRenderer = Effect.fn(function* (renderer: Pointer, width: number, height: number) {
      yield* Effect.try({
        try: () => opentui.symbols.resizeRenderer(renderer, width, height),
        catch: (e) => new RendererFailedToResizeRenderer({ cause: e }),
      });
    });

    const setCursorPosition = Effect.fn(function* (x: number, y: number, visible: boolean) {
      yield* Effect.try({
        try: () => opentui.symbols.setCursorPosition(x, y, visible),
        catch: (e) => new RendererFailedToSetCursorPosition({ cause: e }),
      });
    });

    const setCursorStyle = Effect.fn(function* (style: Cursor.Style, blinking: boolean) {
      const stylePtr = encoder.encode(style);
      const styleLength = stylePtr.byteLength;
      yield* Effect.try({
        try: () => opentui.symbols.setCursorStyle(stylePtr, styleLength, blinking),
        catch: (e) => new RendererFailedToSetCursorStyle({ cause: e }),
      });
    });

    const setCursorColor = Effect.fn(function* (color: RGBA) {
      const c = color.buffer;
      yield* Effect.try({
        try: () => opentui.symbols.setCursorColor(c),
        catch: (e) => new RendererFailedToSetCursorColor({ cause: e }),
      });
    });

    const render = Effect.fn(function* (renderer: Pointer, force: boolean) {
      yield* Effect.try({
        try: () => opentui.symbols.render(renderer, force),
        catch: (e) => new RendererFailedToRender({ cause: e }),
      });
    });

    const destroyOptimizedBuffer = Effect.fn(function* (bufferPtr: Pointer) {
      yield* Effect.try({
        try: () => opentui.symbols.destroyOptimizedBuffer(bufferPtr),
        catch: (e) => new RendererFailedToDestroyOptimizedBuffer({ cause: e }),
      });
    });

    const drawFrameBuffer = Effect.fn(function* (
      targetBufferPtr: Pointer,
      destX: number,
      destY: number,
      bufferPtr: Pointer,
      sourceX?: number,
      sourceY?: number,
      sourceWidth?: number,
      sourceHeight?: number,
    ) {
      const srcX = sourceX ?? 0;
      const srcY = sourceY ?? 0;
      const srcWidth = sourceWidth ?? 0;
      const srcHeight = sourceHeight ?? 0;
      yield* Effect.try({
        try: () =>
          opentui.symbols.drawFrameBuffer(targetBufferPtr, destX, destY, bufferPtr, srcX, srcY, srcWidth, srcHeight),
        catch: (e) => new RendererFailedToDrawFrameBuffer({ cause: e }),
      });
    });

    const dumpHitGrid = Effect.fn(function* (renderer: Pointer) {
      yield* Effect.try({
        try: () => opentui.symbols.dumpHitGrid(renderer),
        catch: (e) => new RendererFailedToDumpHitGrid({ cause: e }),
      });
    });

    const dumpBuffers = Effect.fn(function* (renderer: Pointer, timestamp?: number) {
      yield* Effect.try({
        try: () => opentui.symbols.dumpBuffers(renderer, timestamp ?? 0),
        catch: (e) => new RendererFailedToDumpBuffers({ cause: e }),
      });
    });

    const dumpStdoutBuffer = Effect.fn(function* (renderer: Pointer, timestamp?: number) {
      yield* Effect.try({
        try: () => opentui.symbols.dumpStdoutBuffer(renderer, timestamp ?? 0),
        catch: (e) => new RendererFailedToDumpStdoutBuffer({ cause: e }),
      });
    });

    const addToHitGrid = Effect.fn(function* (
      renderer: Pointer,
      x: number,
      y: number,
      width: number,
      height: number,
      id: number,
    ) {
      yield* Effect.try({
        try: () => opentui.symbols.addToHitGrid(renderer, x, y, width, height, id),
        catch: (e) => new RendererFailedToAddToHitGrid({ cause: e }),
      });
    });

    const checkHit = Effect.fn(function* (pointer: Pointer, x: number, y: number) {
      return yield* Effect.try({
        try: () => opentui.symbols.checkHit(pointer, x, y),
        catch: (e) => new RendererFailedToCheckHit({ cause: e }),
      });
    });

    const createOptimizedBufferAttributes = Effect.fn(function* (
      width: number,
      height: number,
      respectAlpha: boolean = false,
    ) {
      const bufferPtr = opentui.symbols.createOptimizedBuffer(width, height, respectAlpha);
      if (!bufferPtr) {
        // return yield* Effect.fail(new Error(`Failed to create optimized buffer: ${width}x${height}`));
        return yield* Effect.fail(new RendererFailedToCreateFrameBuffer());
      }
      const size = width * height;
      const buffers = yield* getBuffer(bufferPtr, size);
      return {
        bufferPtr,
        buffers,
        width,
        height,
      };
    });

    const bufferDrawBox = Effect.fn(function* (
      buffer: Pointer,
      x: number,
      y: number,
      width: number,
      height: number,
      borderChars: Uint32Array,
      packedOptions: number,
      borderColor: RGBA,
      backgroundColor: RGBA,
      title: string | null,
    ) {
      const titleBytes = title ? encoder.encode(title) : null;
      const titleLen = title ? titleBytes!.length : 0;
      const titlePtr = title ? titleBytes : null;

      return yield* Effect.try({
        try: () =>
          opentui.symbols.bufferDrawBox(
            buffer,
            x,
            y,
            width,
            height,
            borderChars,
            packedOptions,
            borderColor.buffer,
            backgroundColor.buffer,
            titlePtr,
            titleLen,
          ),
        catch: (e) => new RendererFailedToDrawBox({ cause: e }),
      });
    });

    const createTextBuffer = Effect.fn(function* (capacity: number) {
      const bufferPtr = yield* Effect.try({
        try: () => opentui.symbols.createTextBuffer(capacity),
        catch: (error) => new RendererFailedToCreateTextBuffer({ cause: error }),
      });
      if (!bufferPtr) {
        return yield* Effect.fail(new RendererFailedToCreateTextBuffer());
      }

      const charPtr = yield* textBufferGetCharPtr(bufferPtr);
      const fgPtr = yield* textBufferGetFgPtr(bufferPtr);
      const bgPtr = yield* textBufferGetBgPtr(bufferPtr);
      const attributesPtr = yield* textBufferGetAttributesPtr(bufferPtr);

      const buffer = {
        char: new Uint32Array(toArrayBuffer(charPtr, 0, capacity * 4)),
        fg: new Float32Array(toArrayBuffer(fgPtr, 0, capacity * 4 * 4)),
        bg: new Float32Array(toArrayBuffer(bgPtr, 0, capacity * 4 * 4)),
        attributes: new Uint16Array(toArrayBuffer(attributesPtr, 0, capacity * 2)), // 2 bytes per u16
      };

      return {
        bufferPtr,
        buffers: buffer,
      };
    });

    const textBufferGetCharPtr = Effect.fn(function* (buffer: Pointer) {
      const ptr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetCharPtr(buffer),
        catch: (e) => new RendererFailedToGetTextBufferCharPtr({ cause: e }),
      });
      if (!ptr) {
        return yield* Effect.fail(new RendererFailedToGetTextBufferCharPtr());
      }
      return ptr;
    });

    const textBufferGetFgPtr = Effect.fn(function* (buffer: Pointer) {
      const ptr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetFgPtr(buffer),
        catch: (e) => new RendererFailedToGetTextBufferFgPtr({ cause: e }),
      });
      if (!ptr) {
        return yield* Effect.fail(new RendererFailedToGetTextBufferFgPtr());
      }
      return ptr;
    });

    const textBufferGetBgPtr = Effect.fn(function* (buffer: Pointer) {
      const ptr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetBgPtr(buffer),
        catch: (e) => new RendererFailedToGetTextBufferBgPtr({ cause: e }),
      });
      if (!ptr) {
        return yield* Effect.fail(new RendererFailedToGetTextBufferBgPtr());
      }
      return ptr;
    });

    const textBufferGetAttributesPtr = Effect.fn(function* (buffer: Pointer) {
      const ptr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetAttributesPtr(buffer),
        catch: (e) => new RendererFailedToGetTextBufferAttributesPtr({ cause: e }),
      });
      if (!ptr) {
        return yield* Effect.fail(new RendererFailedToGetTextBufferAttributesPtr());
      }
      return ptr;
    });

    const textBufferGetLength = Effect.fn(function* (buffer: Pointer) {
      return opentui.symbols.textBufferGetLength(buffer);
    });

    const textBufferSetCell = Effect.fn(function* (
      buffer: Pointer,
      index: number,
      char: number,
      fg: Float32Array,
      bg: Float32Array,
      attr: number,
    ) {
      opentui.symbols.textBufferSetCell(buffer, index, char, fg, bg, attr);
    });

    const textBufferConcat = Effect.fn(function* (buffer1: Pointer, buffer2: Pointer) {
      const resultPtr = opentui.symbols.textBufferConcat(buffer1, buffer2);
      if (!resultPtr) {
        return yield* Effect.fail(new Error("Failed to concatenate TextBuffers"));
      }

      const length = yield* textBufferGetLength(resultPtr);
      const charPtr = yield* textBufferGetCharPtr(resultPtr);
      const fgPtr = yield* textBufferGetFgPtr(resultPtr);
      const bgPtr = yield* textBufferGetBgPtr(resultPtr);
      const attributesPtr = yield* textBufferGetAttributesPtr(resultPtr);

      const buffer = {
        char: new Uint32Array(toArrayBuffer(charPtr, 0, length * 4)),
        fg: new Float32Array(toArrayBuffer(fgPtr, 0, length * 4 * 4)),
        bg: new Float32Array(toArrayBuffer(bgPtr, 0, length * 4 * 4)),
        attributes: new Uint16Array(toArrayBuffer(attributesPtr, 0, length * 2)),
      };

      return {
        bufferPtr: resultPtr,
        buffers: buffer,
        length,
      };
    });

    const getTextBuffer = Effect.fn(function* (bufferPtr: Pointer, size: number) {
      const charPtr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetCharPtr(bufferPtr),
        catch: (e) => new RendererFailedToGetTextBufferCharPtr({ cause: e }),
      });
      const fgPtr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetFgPtr(bufferPtr),
        catch: (e) => new RendererFailedToGetTextBufferFgPtr({ cause: e }),
      });
      const bgPtr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetBgPtr(bufferPtr),
        catch: (e) => new RendererFailedToGetTextBufferBgPtr({ cause: e }),
      });
      const attributesPtr = yield* Effect.try({
        try: () => opentui.symbols.textBufferGetAttributesPtr(bufferPtr),
        catch: (e) => new RendererFailedToGetTextBufferAttributesPtr({ cause: e }),
      });

      if (!charPtr || !fgPtr || !bgPtr || !attributesPtr) {
        return yield* Effect.fail(new RendererFailedToGetTextBuffer());
      }

      const buffers = {
        char: new Uint32Array(toArrayBuffer(charPtr, 0, size * 4)),
        fg: new Float32Array(toArrayBuffer(fgPtr, 0, size * 4 * 4)), // 4 floats per RGBA
        bg: new Float32Array(toArrayBuffer(bgPtr, 0, size * 4 * 4)), // 4 floats per RGBA
        attributes: new Uint16Array(toArrayBuffer(attributesPtr, 0, size * 2)), // 2 bytes per u16
      };

      return buffers;
    });

    const textBufferResize = Effect.fn(function* (buffer: Pointer, newLength: number) {
      opentui.symbols.textBufferResize(buffer, newLength);
      const buffers = yield* getTextBuffer(buffer, newLength);
      return buffers;
    });

    const textBufferReset = Effect.fn(function* (buffer: Pointer) {
      yield* Effect.try({
        try: () => opentui.symbols.textBufferReset(buffer),
        catch: (e) => new RendererFailedToResetTextBuffer({ cause: e }),
      });
    });

    const textBufferSetSelection = Effect.fn(function* (
      buffer: Pointer,
      start: number,
      end: number,
      bgColor: RGBA | null,
      fgColor: RGBA | null,
    ) {
      const bg = bgColor ? bgColor.buffer : null;
      const fg = fgColor ? fgColor.buffer : null;
      opentui.symbols.textBufferSetSelection(buffer, start, end, bg, fg);
    });

    const textBufferResetSelection = Effect.fn(function* (buffer: Pointer) {
      opentui.symbols.textBufferResetSelection(buffer);
    });

    const textBufferSetDefaultFg = Effect.fn(function* (buffer: Pointer, fg: RGBA | null) {
      const fgPtr = fg ? fg.buffer : null;
      opentui.symbols.textBufferSetDefaultFg(buffer, fgPtr);
    });

    const textBufferSetDefaultBg = Effect.fn(function* (buffer: Pointer, bg: RGBA | null) {
      const bgPtr = bg ? bg.buffer : null;
      opentui.symbols.textBufferSetDefaultBg(buffer, bgPtr);
    });

    const textBufferSetDefaultAttributes = Effect.fn(function* (buffer: Pointer, attributes: number | null) {
      const attrValue = attributes === null ? null : new Uint8Array([attributes]);
      opentui.symbols.textBufferSetDefaultAttributes(buffer, attrValue);
    });

    const textBufferResetDefaults = Effect.fn(function* (buffer: Pointer) {
      opentui.symbols.textBufferResetDefaults(buffer);
    });

    const textBufferWriteChunk = Effect.fn(function* (
      buffer: Pointer,
      textBytes: Uint8Array,
      fg: RGBA | null,
      bg: RGBA | null,
      attributes: number | null,
    ) {
      const attrValue = attributes === null ? null : new Uint8Array([attributes]);
      return opentui.symbols.textBufferWriteChunk(
        buffer,
        textBytes,
        textBytes.length,
        fg ? fg.buffer : null,
        bg ? bg.buffer : null,
        attrValue,
      );
    });

    const textBufferGetCapacity = Effect.fn(function* (buffer: Pointer) {
      return opentui.symbols.textBufferGetCapacity(buffer);
    });

    const textBufferFinalizeLineInfo = Effect.fn(function* (buffer: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.textBufferFinalizeLineInfo(buffer),
        catch: (e) => new RendererFailedToFinalizeTextBufferLineInfo({ cause: e }),
      });
    });

    const textBufferGetLineInfo = Effect.fn(function* (buffer: Pointer) {
      const lineCount = opentui.symbols.textBufferGetLineCount(buffer);
      if (lineCount === 0) {
        return { lineStarts: [], lineWidths: [] };
      }

      const lineStartsPtr = opentui.symbols.textBufferGetLineStartsPtr(buffer);
      const lineWidthsPtr = opentui.symbols.textBufferGetLineWidthsPtr(buffer);

      if (!lineStartsPtr || !lineWidthsPtr) {
        return { lineStarts: [], lineWidths: [] };
      }

      const lineStartsArray = new Uint32Array(toArrayBuffer(lineStartsPtr, 0, lineCount * 4));
      const lineWidthsArray = new Uint32Array(toArrayBuffer(lineWidthsPtr, 0, lineCount * 4));

      const lineStarts = Array.from(lineStartsArray);
      const lineWidths = Array.from(lineWidthsArray);

      return { lineStarts, lineWidths };
    });

    const getTextBufferArrays = Effect.fn(function* (buffer: Pointer, size: number) {
      return yield* getTextBuffer(buffer, size);
    });

    const bufferDrawTextBuffer = Effect.fn(function* (
      buffer: Pointer,
      textBuffer: Pointer,
      x: number,
      y: number,
      clipRect?: { x: number; y: number; width: number; height: number },
    ) {
      const hasClipRect = clipRect !== undefined && clipRect !== null;
      const clipX = clipRect?.x ?? 0;
      const clipY = clipRect?.y ?? 0;
      const clipWidth = clipRect?.width ?? 0;
      const clipHeight = clipRect?.height ?? 0;

      yield* Effect.try({
        try: () =>
          opentui.symbols.bufferDrawTextBuffer(
            buffer,
            textBuffer,
            x,
            y,
            clipX,
            clipY,
            clipWidth,
            clipHeight,
            hasClipRect,
          ),
        catch: (e) => new RendererFailedToDrawTextBuffer({ cause: e }),
      });
    });

    const destroyTextBuffer = Effect.fn(function* (buffer: Pointer) {
      return yield* Effect.try({
        try: () => opentui.symbols.destroyTextBuffer(buffer),
        catch: (e) => new RendererFailedToDestroyTextBuffer({ cause: e }),
      });
    });

    const clearTerminal = Effect.fn(function* (renderer: Pointer) {
      opentui.symbols.clearTerminal(renderer);
    });

    const enableMouse = Effect.fn(function* (renderer: Pointer, enable: boolean) {
      // opentui.symbols.enableMouse(renderer, enable);
      return yield* Effect.try({
        try: () => opentui.symbols.enableMouse(renderer, enable),
        catch: (e) => new RendererFailedToEnableMouse({ cause: e }),
      });
    });

    const disableMouse = Effect.fn(function* (renderer: Pointer) {
      // opentui.symbols.disableMouse(renderer);
      return yield* Effect.try({
        try: () => opentui.symbols.disableMouse(renderer),
        catch: (e) => new RendererFailedToDisableMouse({ cause: e }),
      });
    });

    return {
      enableMouse,
      disableMouse,
      createRenderer,
      bufferDrawBox,
      createTextBuffer,
      destroyRenderer,
      createOptimizedBufferAttributes,
      destroyOptimizedBuffer,
      setUseThread,
      setBackgroundColor,
      setRenderOffset,
      updateStats,
      updateMemoryStats,
      getNextBuffer,
      getCurrentBuffer,
      getBuffer,
      bufferGetCharPtr,
      bufferGetFgPtr,
      bufferGetBgPtr,
      bufferGetAttributesPtr,
      bufferGetRespectAlpha,
      bufferSetRespectAlpha,
      getBufferWidth,
      getBufferHeight,
      bufferClear,
      bufferDrawText,
      bufferDrawTextBuffer,
      bufferSetCellWithAlphaBlending,
      bufferFillRect,
      bufferDrawSuperSampleBuffer,
      bufferDrawPackedBuffer,
      bufferResize,
      resizeRenderer,
      setCursorPosition,
      setCursorStyle,
      setCursorColor,
      render,
      drawFrameBuffer,
      dumpHitGrid,
      dumpBuffers,
      dumpStdoutBuffer,
      addToHitGrid,
      checkHit,
      getTextBufferArrays,
      textBufferGetCharPtr,
      textBufferGetFgPtr,
      textBufferGetBgPtr,
      textBufferGetAttributesPtr,
      textBufferGetLength,
      textBufferSetCell,
      textBufferConcat,
      textBufferResize,
      textBufferReset,
      textBufferSetSelection,
      textBufferResetSelection,
      textBufferSetDefaultFg,
      textBufferSetDefaultBg,
      textBufferSetDefaultAttributes,
      textBufferResetDefaults,
      textBufferWriteChunk,
      textBufferGetCapacity,
      textBufferFinalizeLineInfo,
      textBufferGetLineInfo,
      destroyTextBuffer,
      setDebugOverlay,
      clearTerminal,
    } as const;
  }),
}) {}

export const LibraryLive = Library.Default;
