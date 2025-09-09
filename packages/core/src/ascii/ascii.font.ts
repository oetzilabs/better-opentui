import { Effect, Schema } from "effect";
import { OptimizedBuffer } from "../buffer/optimized";
import { RGBA } from "../colors/rgba";
import block from "./fonts/block.json";
import shade from "./fonts/shade.json";
import slick from "./fonts/slick.json";
import tiny from "./fonts/tiny.json";

/*
 * Renders ASCII fonts to a buffer.
 * Font definitions plugged from cfonts - https://github.com/dominikwilkowski/cfonts
 */

export const fonts = {
  tiny,
  block,
  shade,
  slick,
} as Record<string, FontDefinition>;

const FontSegmentSchema = Schema.Struct({
  text: Schema.String,
  colorIndex: Schema.Number,
});

export type FontSegment = typeof FontSegmentSchema.Type;

const FontDefinitionSchema = Schema.Struct({
  name: Schema.String,
  lines: Schema.Number,
  letterspace_size: Schema.Number,
  letterspace: Schema.Array(Schema.String),
  colors: Schema.optional(Schema.Number),
  chars: Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) }),
});
export type FontDefinition = typeof FontDefinitionSchema.Type;

const ParsedFontDefinitionSchema = Schema.Struct({
  name: Schema.String,
  lines: Schema.Number,
  letterspace_size: Schema.Number,
  letterspace: Schema.Array(Schema.String),
  colors: Schema.Number,
  chars: Schema.Record({
    key: Schema.String,
    value: Schema.Array(Schema.Array(FontSegmentSchema)),
  }),
});

type ParsedFontDefinitionSchema = typeof ParsedFontDefinitionSchema.Type;

const parsedFonts: Record<string, ParsedFontDefinitionSchema> = {};

const parseColorTags = Effect.fn(function* (text: string) {
  const segments: FontSegment[] = [];
  let currentIndex = 0;

  const colorTagRegex = /<c(\d+)>(.*?)<\/c\d+>/g;
  let lastIndex = 0;
  let match;

  while ((match = colorTagRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plainText = text.slice(lastIndex, match.index);
      if (plainText) {
        segments.push(FontSegmentSchema.make({ text: plainText, colorIndex: 0 }));
      }
    }

    const colorIndex = parseInt(match[1]) - 1;
    const taggedText = match[2];
    segments.push(FontSegmentSchema.make({ text: taggedText, colorIndex: Math.max(0, colorIndex) }));

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText) {
      segments.push(FontSegmentSchema.make({ text: remainingText, colorIndex: 0 }));
    }
  }

  return segments;
});

const getParsedFont = Effect.fn(function* (fontKey: keyof typeof fonts) {
  if (!parsedFonts[fontKey]) {
    const fontDef = fonts[fontKey];
    const parsedChars: Record<string, FontSegment[][]> = {};
    const entries = Object.entries(fontDef.chars);
    for (const [char, lines] of entries) {
      const pl = yield* Effect.all(lines.map((line) => parseColorTags(line)));
      parsedChars[char] = pl;
    }

    parsedFonts[fontKey] = {
      ...fontDef,
      colors: fontDef.colors || 1,
      chars: parsedChars,
    };
  }

  return ParsedFontDefinitionSchema.make(parsedFonts[fontKey]);
});

type MessureTextParameter = { text: string; font?: keyof typeof fonts };

export const measureText = Effect.fn(function* ({ text, font = "tiny" }: MessureTextParameter) {
  const fontDef = yield* getParsedFont(font);
  if (!fontDef) {
    console.warn(`Font '${font}' not found`);
    return { width: 0, height: 0 };
  }

  let currentX = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i].toUpperCase();
    const charDef = fontDef.chars[char];

    if (!charDef) {
      const spaceChar = fontDef.chars[" "];
      if (spaceChar && spaceChar[0]) {
        let spaceWidth = 0;
        for (const segment of spaceChar[0]) {
          spaceWidth += segment.text.length;
        }
        currentX += spaceWidth;
      } else {
        currentX += 1;
      }
      continue;
    }

    let charWidth = 0;
    if (charDef[0]) {
      for (const segment of charDef[0]) {
        charWidth += segment.text.length;
      }
    }

    currentX += charWidth;

    if (i < text.length - 1) {
      currentX += fontDef.letterspace_size;
    }
  }

  return {
    width: currentX,
    height: fontDef.lines,
  };
});

export const getCharacterPositions = Effect.fn(function* (text: string, font: keyof typeof fonts = "tiny") {
  const fontDef = yield* getParsedFont(font);
  if (!fontDef) {
    return [0];
  }

  const positions: number[] = [0];
  let currentX = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i].toUpperCase();
    const charDef = fontDef.chars[char];

    let charWidth = 0;
    if (!charDef) {
      const spaceChar = fontDef.chars[" "];
      if (spaceChar && spaceChar[0]) {
        for (const segment of spaceChar[0]) {
          charWidth += segment.text.length;
        }
      } else {
        charWidth = 1;
      }
    } else if (charDef[0]) {
      for (const segment of charDef[0]) {
        charWidth += segment.text.length;
      }
    }

    currentX += charWidth;

    if (i < text.length - 1) {
      currentX += fontDef.letterspace_size;
    }

    positions.push(currentX);
  }

  return positions;
});

export const coordinateToCharacterIndex = Effect.fn(function* (
  x: number,
  text: string,
  font: keyof typeof fonts = "tiny",
) {
  const positions = yield* getCharacterPositions(text, font);

  if (x < 0) {
    return 0;
  }

  for (let i = 0; i < positions.length - 1; i++) {
    const currentPos = positions[i];
    const nextPos = positions[i + 1];

    if (x >= currentPos && x < nextPos) {
      const charMidpoint = currentPos + (nextPos - currentPos) / 2;
      return x < charMidpoint ? i : i + 1;
    }
  }

  if (positions.length > 0 && x >= positions[positions.length - 1]) {
    return text.length;
  }

  return 0;
});

export const renderFontToFrameBuffer = Effect.fn(function* ({
  buffer,
  text,
  x = 0,
  y = 0,
  fg = [RGBA.fromInts(255, 255, 255, 255)],
  bg = RGBA.fromInts(0, 0, 0, 255),
  font = "tiny",
}: {
  buffer: OptimizedBuffer;
  text: string;
  x?: number;
  y?: number;
  fg?: RGBA | RGBA[];
  bg?: RGBA;
  font?: keyof typeof fonts;
}) {
  const width = buffer.getWidth();
  const height = buffer.getHeight();

  const fontDef = yield* getParsedFont(font);
  if (!fontDef) {
    console.warn(`Font '${font}' not found`);
    return { width: 0, height: 0 };
  }

  const colors = Array.isArray(fg) ? fg : [fg];

  if (y < 0 || y + fontDef.lines > height) {
    return { width: 0, height: fontDef.lines };
  }

  let currentX = x;
  const startX = x;

  for (let i = 0; i < text.length; i++) {
    const char = text[i].toUpperCase();
    const charDef = fontDef.chars[char];

    if (!charDef) {
      const spaceChar = fontDef.chars[" "];
      if (spaceChar && spaceChar[0]) {
        let spaceWidth = 0;
        for (const segment of spaceChar[0]) {
          spaceWidth += segment.text.length;
        }
        currentX += spaceWidth;
      } else {
        currentX += 1;
      }
      continue;
    }

    let charWidth = 0;
    if (charDef[0]) {
      for (const segment of charDef[0]) {
        charWidth += segment.text.length;
      }
    }

    if (currentX >= width) break;
    if (currentX + charWidth < 0) {
      currentX += charWidth + fontDef.letterspace_size;
      continue;
    }

    for (let lineIdx = 0; lineIdx < fontDef.lines && lineIdx < charDef.length; lineIdx++) {
      const segments = charDef[lineIdx];
      const renderY = y + lineIdx;

      if (renderY >= 0 && renderY < height) {
        let segmentX = currentX;

        for (const segment of segments) {
          const segmentColor = colors[segment.colorIndex] || colors[0];

          for (let charIdx = 0; charIdx < segment.text.length; charIdx++) {
            const renderX = segmentX + charIdx;

            if (renderX >= 0 && renderX < width) {
              const fontChar = segment.text[charIdx];
              if (fontChar !== " ") {
                yield* buffer.setCell(renderX, renderY, fontChar, segmentColor, bg);
              }
            }
          }

          segmentX += segment.text.length;
        }
      }
    }

    currentX += charWidth;

    if (i < text.length - 1) {
      currentX += fontDef.letterspace_size;
    }
  }

  return {
    width: currentX - startX,
    height: fontDef.lines,
  };
});
