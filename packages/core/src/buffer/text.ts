import { RGBA } from "@opentuee/core/src/types";
import { Library } from "@opentuee/core/src/zig";
import { type Pointer } from "bun:ffi";
import { Effect, Schema } from "effect";
import type { StyledText } from "../renderer/utils/styled-text";

export class TextBuffer {
  private bufferPtr: Pointer;
  private buffer: {
    char: Uint32Array;
    fg: Float32Array;
    bg: Float32Array;
    attributes: Uint16Array;
  };
  private _length: number = 0;
  private _capacity: number;
  private _lineInfo?: { lineStarts: number[]; lineWidths: number[] };

  constructor(
    ptr: Pointer,
    buffer: {
      char: Uint32Array;
      fg: Float32Array;
      bg: Float32Array;
      attributes: Uint16Array;
    },
    capacity: number,
  ) {
    this.bufferPtr = ptr;
    this.buffer = buffer;
    this._capacity = capacity;
  }

  static create = (capacity: number = 256) =>
    Effect.gen(function* () {
      const lib = yield* Library;
      const textBufferAttributes = yield* lib.createTextBuffer(capacity);
      return new TextBuffer(textBufferAttributes.bufferPtr, textBufferAttributes.buffers, capacity);
    });

  private syncBuffersAfterResize = Effect.gen(this, function* () {
    const lib = yield* Library;
    const capacity = yield* lib.textBufferGetCapacity(this.bufferPtr);
    this.buffer = yield* lib.getTextBufferArrays(this.bufferPtr, capacity);
    this._capacity = capacity;
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
          yield* this.syncBuffersAfterResize;
        }
      }

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

  public getLineInfo = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      if (!this._lineInfo) {
        this._lineInfo = yield* lib.textBufferGetLineInfo(this.bufferPtr);
      }
      return this._lineInfo;
    });

  public toString(): string {
    const chars: string[] = [];
    for (let i = 0; i < this._length; i++) {
      chars.push(String.fromCharCode(this.buffer.char[i]));
    }
    return chars.join("");
  }

  public concat = (other: TextBuffer) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      const attributes = yield* lib.textBufferConcat(this.bufferPtr, other.bufferPtr);
      return new TextBuffer(attributes.bufferPtr, attributes.buffers, attributes.length);
    });

  public setSelection = (start: number, end: number, bgColor?: RGBA, fgColor?: RGBA) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      console.log({ start, end, bgColor, fgColor });
      yield* lib.textBufferSetSelection(this.bufferPtr, start, end, bgColor || null, fgColor || null);
    });

  public resetSelection = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.textBufferResetSelection(this.bufferPtr);
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
