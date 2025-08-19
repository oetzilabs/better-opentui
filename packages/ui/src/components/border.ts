import * as Colors from "@opentuee/core/src/colors";
import { Effect, Schema } from "effect";

export const BorderSidesConfig = Schema.Struct({
  top: Schema.Boolean,
  right: Schema.Boolean,
  bottom: Schema.Boolean,
  left: Schema.Boolean,
});

export type BorderSidesConfig = typeof BorderSidesConfig.Type;

export const BorderStyle = Schema.Union(
  Schema.Literal("single"),
  Schema.Literal("double"),
  Schema.Literal("rounded"),
  Schema.Literal("heavy"),
);

export const BorderSides = Schema.Union(
  Schema.Literal("top"),
  Schema.Literal("right"),
  Schema.Literal("bottom"),
  Schema.Literal("left"),
);

export type BorderStyle = typeof BorderStyle.Type;
export type BorderSides = typeof BorderSides.Type;

export const BorderCharactersSchema = Schema.Struct({
  topLeft: Schema.String,
  topRight: Schema.String,
  bottomLeft: Schema.String,
  bottomRight: Schema.String,
  horizontal: Schema.String,
  vertical: Schema.String,
  topT: Schema.String,
  bottomT: Schema.String,
  leftT: Schema.String,
  rightT: Schema.String,
  cross: Schema.String,
});

export type BorderCharacters = typeof BorderCharactersSchema.Type;

export const BorderChars: Record<BorderStyle, BorderCharacters> = {
  single: {
    topLeft: "┌",
    topRight: "┐",
    bottomLeft: "└",
    bottomRight: "┘",
    horizontal: "─",
    vertical: "│",
    topT: "┬",
    bottomT: "┴",
    leftT: "├",
    rightT: "┤",
    cross: "┼",
  },
  double: {
    topLeft: "╔",
    topRight: "╗",
    bottomLeft: "╚",
    bottomRight: "╝",
    horizontal: "═",
    vertical: "║",
    topT: "╦",
    bottomT: "╩",
    leftT: "╠",
    rightT: "╣",
    cross: "╬",
  },
  rounded: {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
    topT: "┬",
    bottomT: "┴",
    leftT: "├",
    rightT: "┤",
    cross: "┼",
  },
  heavy: {
    topLeft: "┏",
    topRight: "┓",
    bottomLeft: "┗",
    bottomRight: "┛",
    horizontal: "━",
    vertical: "┃",
    topT: "┳",
    bottomT: "┻",
    leftT: "┣",
    rightT: "┫",
    cross: "╋",
  },
};

export const BorderDrawOptions = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  borderStyle: BorderStyle,
  border: Schema.Union(Schema.Boolean, Schema.Array(BorderSides).pipe(Schema.mutable)),
  borderColor: Colors.Input,
  customBorderChars: Schema.optional(BorderCharactersSchema),
  backgroundColor: Colors.Input,
  title: Schema.optional(Schema.String),
  titleAlignment: Schema.optional(
    Schema.Union(Schema.Literal("left"), Schema.Literal("center"), Schema.Literal("right")),
  ),
});

export type BorderDrawOptions = typeof BorderDrawOptions.Type;

// Convert BorderCharacters to Uint32Array for passing to Zig
export const borderCharsToArray = Effect.fn(function* (chars: BorderCharacters) {
  const array = new Uint32Array(11);
  array[0] = chars.topLeft.codePointAt(0)!;
  array[1] = chars.topRight.codePointAt(0)!;
  array[2] = chars.bottomLeft.codePointAt(0)!;
  array[3] = chars.bottomRight.codePointAt(0)!;
  array[4] = chars.horizontal.codePointAt(0)!;
  array[5] = chars.vertical.codePointAt(0)!;
  array[6] = chars.topT.codePointAt(0)!;
  array[7] = chars.bottomT.codePointAt(0)!;
  array[8] = chars.leftT.codePointAt(0)!;
  array[9] = chars.rightT.codePointAt(0)!;
  array[10] = chars.cross.codePointAt(0)!;
  return array;
});

// Pre-converted border character arrays for performance
export const getBorderCharArrays = Effect.gen(function* () {
  return {
    single: yield* borderCharsToArray(BorderChars.single),
    double: yield* borderCharsToArray(BorderChars.double),
    rounded: yield* borderCharsToArray(BorderChars.rounded),
    heavy: yield* borderCharsToArray(BorderChars.heavy),
  };
});

export const getBorderSides = (border: boolean | BorderSides[]) => {
  return border === true
    ? BorderSidesConfig.make({ top: true, right: true, bottom: true, left: true })
    : Array.isArray(border)
      ? BorderSidesConfig.make({
          top: border.includes("top"),
          right: border.includes("right"),
          bottom: border.includes("bottom"),
          left: border.includes("left"),
        })
      : BorderSidesConfig.make({ top: false, right: false, bottom: false, left: false });
};
