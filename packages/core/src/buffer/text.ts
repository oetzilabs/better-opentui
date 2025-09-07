import { type Pointer } from "bun:ffi";
import { Effect, Schema } from "effect";
import type { StyledText } from "../renderer/utils/styled-text";
import { RGBA, type WidthMethod } from "../types";
import { Library } from "../zig";

export class TextBuffer {
  private bufferPtr: Pointer;
  private _length: number = 0;
  private _capacity: number;
  private _lineInfo?: { lineStarts: number[]; lineWidths: number[] };

  constructor(ptr: Pointer, capacity: number) {
    this.bufferPtr = ptr;
    this._capacity = capacity;
  }

  static create = (capacity: number = 256, widthMethod: WidthMethod) =>
    Effect.gen(function* () {
      const lib = yield* Library;
      const textBufferPointer = yield* lib.createTextBufferPointer(capacity, widthMethod);
      return new TextBuffer(textBufferPointer, capacity);
    });

  public setStyledText = (text: StyledText) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferReset(this.bufferPtr);
      this._length = 0;
      this._lineInfo = undefined;

      for (const chunk of text.chunks) {
        const result = yield* lib.textBufferWriteChunk(
          this.bufferPtr,
          chunk.text,
          chunk.fg || null,
          chunk.bg || null,
          chunk.attributes ?? null,
        );

        if (result & 1) {
          this._capacity = yield* lib.textBufferGetCapacity(this.bufferPtr);
        }
      }
      // TODO: textBufferFinalizeLineInfo can return the length of the text buffer, not another call to textBufferGetLength
      yield* lib.textBufferFinalizeLineInfo(this.bufferPtr);
      this._length = yield* lib.textBufferGetLength(this.bufferPtr);
    });

  public setDefaultFg = (fg: RGBA | null) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferSetDefaultFg(this.bufferPtr, fg);
    });

  public setDefaultBg = (bg: RGBA | null) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferSetDefaultBg(this.bufferPtr, bg);
    });

  public setDefaultAttributes = (attributes: number | null) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferSetDefaultAttributes(this.bufferPtr, attributes);
    });

  public resetDefaults = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferResetDefaults(this.bufferPtr);
    });

  public get length(): number {
    return this._length;
  }

  public get capacity(): number {
    return this._capacity;
  }

  public get ptr(): Pointer {
    return this.bufferPtr;
  }

  public getSelectedText = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      if (this._length === 0) return "";
      const selectedBytes = yield* lib.getSelectedTextBytes(this.bufferPtr, this._length);

      if (!selectedBytes) return "";

      return lib.decoder.decode(selectedBytes);
    });

  public getLineInfo = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      if (!this._lineInfo) {
        this._lineInfo = yield* lib.textBufferGetLineInfo(this.bufferPtr);
      }
      return this._lineInfo;
    });

  public setSelection = (start: number, end: number, bgColor?: RGBA, fgColor?: RGBA) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferSetSelection(this.bufferPtr, start, end, bgColor || null, fgColor || null);
    });

  public resetSelection = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferResetSelection(this.bufferPtr);
    });

  public setLocalSelection = (
    anchorX: number,
    anchorY: number,
    focusX: number,
    focusY: number,
    bgColor?: RGBA,
    fgColor?: RGBA,
  ) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      return yield* lib.textBufferSetLocalSelection(
        this.bufferPtr,
        anchorX,
        anchorY,
        focusX,
        focusY,
        bgColor || null,
        fgColor || null,
      );
    });

  public resetLocalSelection = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferResetLocalSelection(this.bufferPtr);
    });

  public getSelection = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      return lib.textBufferGetSelection(this.bufferPtr);
    });

  public hasSelection = () =>
    Effect.gen(this, function* () {
      const sel = yield* this.getSelection();
      return sel !== null;
    });

  public destroy = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.destroyTextBuffer(this.bufferPtr);
    });
}

export const TextChunkSchema = Schema.Struct({
  __isChunk: Schema.Literal(true),
  text: Schema.Uint8Array,
  plainText: Schema.String,
  fg: Schema.optional(Schema.instanceOf(RGBA)),
  bg: Schema.optional(Schema.instanceOf(RGBA)),
  attributes: Schema.optional(Schema.Number),
}).pipe(Schema.brand("TextChunk"));

export type TextChunk = typeof TextChunkSchema.Type;

export const isTextChunk = Schema.is(TextChunkSchema);
