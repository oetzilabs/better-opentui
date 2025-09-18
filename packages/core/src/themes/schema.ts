import { Schema } from "effect";
import { Input } from "../colors";

const ThemeSchemaV1 = Schema.Struct({
  name: Schema.String,
  colors: Schema.Struct({
    bg: Input,
    fg: Input,
    cursorColor: Input,
  }),
  elements: Schema.Struct({
    button: Schema.Struct({
      bg: Input,
      fg: Input,
      focusedBg: Input,
      focusedFg: Input,
      placeholderColor: Input,
      cursorColor: Input,
    }),
    input: Schema.Struct({
      bg: Input,
      fg: Input,
      focusedBg: Input,
      focusedFg: Input,
      placeholderColor: Input,
      cursorColor: Input,
    }),
    textarea: Schema.Struct({
      bg: Input,
      fg: Input,
      focusedBg: Input,
      focusedFg: Input,
      placeholderColor: Input,
      cursorColor: Input,
    }),
    checkbox: Schema.Struct({
      bg: Input,
      fg: Input,
      focusedBg: Input,
      focusedFg: Input,
      placeholderColor: Input,
      cursorColor: Input,
    }),
    radio: Schema.Struct({
      bg: Input,
      fg: Input,
      focusedBg: Input,
      focusedFg: Input,
      placeholderColor: Input,
      cursorColor: Input,
    }),
  }),
});

const ThemeSchemaV2 = Schema.Struct({
  name: Schema.String,
  colors: Schema.Struct({
    bg: Input,
    fg: Input,
    cursorColor: Input,
  }),
  elements: Schema.Record({
    key: Schema.String,
    value: Schema.Record({
      key: Schema.String,
      value: Input,
    }),
  }),
});

export const ThemeSchema = ThemeSchemaV2;

export type Theme = typeof ThemeSchema.Type;
