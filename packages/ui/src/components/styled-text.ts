import { isTextChunk, TextChunkSchema, type TextChunk } from "@opentuee/core/src/buffer/text";
import { Colors, type Input } from "@opentuee/core/src/colors";
import { RGBA, type RGBAClass } from "@opentuee/core/src/types";
import { createTextAttributes } from "@opentuee/core/src/utils";
import { Effect } from "effect";

export interface StyleAttrs {
  fg?: Input;
  bg?: Input;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  reverse?: boolean;
  blink?: boolean;
}

export class StyledText {
  public readonly chunks: TextChunk[];
  private _length: number;
  // TODO: plaintext should not be needed anymore when selection moved to native
  private _plainText: string;

  constructor(chunks: TextChunk[], length: number, plainText: string) {
    this.chunks = chunks;

    this._length = length;
    this._plainText = plainText;
  }

  toString(): string {
    return this._plainText;
  }

  get length(): number {
    return this._length;
  }
}

export const stringToStyledText = Effect.fn(function* (content: string) {
  const textEncoder = new TextEncoder();
  const chunk = TextChunkSchema.make({
    __isChunk: true as const,
    text: textEncoder.encode(content),
    plainText: content,
  });
  return new StyledText([chunk], content.length, content);
});

export type StylableInput = string | number | boolean | TextChunk;

const textEncoder = new TextEncoder();
const templateCache = new WeakMap<TemplateStringsArray, (TextChunk | null)[]>();

/**
 * Template literal handler for styled text (non-cached version).
 * Returns a StyledText object containing chunks of text with optional styles.
 */
export function tn(strings: TemplateStringsArray, ...values: StylableInput[]): StyledText {
  const chunks: TextChunk[] = [];
  let length = 0;
  let plainText = "";

  for (let i = 0; i < strings.length; i++) {
    const raw = strings[i];

    if (raw) {
      chunks.push(
        TextChunkSchema.make({
          __isChunk: true,
          text: textEncoder.encode(raw),
          plainText: raw,
          attributes: 0,
        }),
      );
      length += raw.length;
      plainText += raw;
    }

    const val = values[i];
    if (typeof val === "object" && "__isChunk" in val) {
      chunks.push(val as TextChunk);
      length += (val as TextChunk).plainText.length;
      plainText += (val as TextChunk).plainText;
    } else if (val !== undefined) {
      const plainTextStr = String(val);
      chunks.push(
        TextChunkSchema.make({
          __isChunk: true,
          text: textEncoder.encode(plainTextStr),
          plainText: plainTextStr,
          attributes: 0,
        }),
      );
      length += plainTextStr.length;
      plainText += plainTextStr;
    }
  }

  return new StyledText(chunks, length, plainText);
}

/**
 * Template literal handler for styled text (cached version).
 * Returns a StyledText object containing chunks of text with optional styles.
 * Uses caching to avoid re-encoding the same template strings.
 */
export function t(strings: TemplateStringsArray, ...values: StylableInput[]): StyledText {
  let cachedStringChunks = templateCache.get(strings);
  let length = 0;
  let plainText = "";

  if (!cachedStringChunks) {
    cachedStringChunks = [];
    for (let i = 0; i < strings.length; i++) {
      const raw = strings[i];
      if (raw) {
        cachedStringChunks.push(
          TextChunkSchema.make({
            __isChunk: true,
            text: textEncoder.encode(raw),
            plainText: raw,
            attributes: 0,
          }),
        );
      } else {
        cachedStringChunks.push(null);
      }
    }
    templateCache.set(strings, cachedStringChunks);
  }

  const chunks: TextChunk[] = [];

  for (let i = 0; i < strings.length; i++) {
    const stringChunk = cachedStringChunks[i];
    if (stringChunk) {
      chunks.push(stringChunk);
      length += stringChunk.plainText.length;
      plainText += stringChunk.plainText;
    }

    const val = values[i];
    if (typeof val === "object" && "__isChunk" in val) {
      chunks.push(val as TextChunk);
      length += (val as TextChunk).plainText.length;
      plainText += (val as TextChunk).plainText;
    } else if (val !== undefined) {
      const plainTextStr = String(val);
      chunks.push(
        TextChunkSchema.make({
          __isChunk: true,
          text: textEncoder.encode(plainTextStr),
          plainText: plainTextStr,
          attributes: 0,
        }),
      );
      length += plainTextStr.length;
      plainText += plainTextStr;
    }
  }

  return new StyledText(chunks, length, plainText);
}

// Foreground color helpers
export const black = (input: StylableInput) => applyStyle(input, { fg: Colors.Black });
export const red = (input: StylableInput) => applyStyle(input, { fg: Colors.Red });
export const green = (input: StylableInput) => applyStyle(input, { fg: Colors.Green });
export const yellow = (input: StylableInput) => applyStyle(input, { fg: Colors.Yellow });
export const blue = (input: StylableInput) => applyStyle(input, { fg: Colors.Blue });
export const magenta = (input: StylableInput) => applyStyle(input, { fg: Colors.Magenta });
export const cyan = (input: StylableInput) => applyStyle(input, { fg: Colors.Cyan });
export const white = (input: StylableInput) => applyStyle(input, { fg: Colors.White });

export const brightBlack = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightBlack });
export const brightRed = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightRed });
export const brightGreen = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightGreen });
export const brightYellow = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightYellow });
export const brightBlue = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightBlue });
export const brightMagenta = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightMagenta });
export const brightCyan = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightCyan });
export const brightWhite = (input: StylableInput) => applyStyle(input, { fg: Colors.BrightWhite });

// Background color helpers
export const bgBlack = (input: StylableInput) => applyStyle(input, { bg: Colors.Black });
export const bgRed = (input: StylableInput) => applyStyle(input, { bg: Colors.Red });
export const bgGreen = (input: StylableInput) => applyStyle(input, { bg: Colors.Green });
export const bgYellow = (input: StylableInput) => applyStyle(input, { bg: Colors.Yellow });
export const bgBlue = (input: StylableInput) => applyStyle(input, { bg: Colors.Blue });
export const bgMagenta = (input: StylableInput) => applyStyle(input, { bg: Colors.Magenta });
export const bgCyan = (input: StylableInput) => applyStyle(input, { bg: Colors.Cyan });
export const bgWhite = (input: StylableInput) => applyStyle(input, { bg: Colors.White });

// Style helpers
export const bold = (input: StylableInput) => applyStyle(input, { bold: true });
export const italic = (input: StylableInput) => applyStyle(input, { italic: true });
export const underline = (input: StylableInput) => applyStyle(input, { underline: true });
export const strikethrough = (input: StylableInput) => applyStyle(input, { strikethrough: true });
export const dim = (input: StylableInput) => applyStyle(input, { dim: true });
export const reverse = (input: StylableInput) => applyStyle(input, { reverse: true });
export const blink = (input: StylableInput) => applyStyle(input, { blink: true });

// Custom color helpers
export const fg = (color: Input) => (input: StylableInput) => applyStyle(input, { fg: color });
export const bg = (color: Input) => (input: StylableInput) => applyStyle(input, { bg: color });

const applyStyle = Effect.fn(function* (input: StylableInput, style: StyleAttrs) {
  if (isTextChunk(input)) {
    const existingChunk = input;

    const fg = style.fg ? yield* RGBA.fromHex(style.fg) : existingChunk.fg;
    const bg = style.bg ? yield* RGBA.fromHex(style.bg) : existingChunk.bg;

    const newAttrs = yield* createTextAttributes(style);
    const mergedAttrs = existingChunk.attributes ? existingChunk.attributes | newAttrs : newAttrs;

    return TextChunkSchema.make({
      __isChunk: true,
      text: existingChunk.text,
      plainText: existingChunk.plainText,
      fg,
      bg,
      attributes: mergedAttrs,
    });
  } else {
    const plainTextStr = String(input);
    const text = textEncoder.encode(plainTextStr);
    const fg = style.fg ? yield* RGBA.fromHex(style.fg) : undefined;
    const bg = style.bg ? yield* RGBA.fromHex(style.bg) : undefined;
    const attributes = yield* createTextAttributes(style);

    return TextChunkSchema.make({
      __isChunk: true,
      text,
      plainText: plainTextStr,
      fg,
      bg,
      attributes,
    });
  }
});
