import { Schema } from "effect";

export class ThemeNotFound extends Schema.TaggedError<ThemeNotFound>("ThemeNotFound")("ThemeNotFound", {
  name: Schema.String,
}) {}

export class ThemeFolderNotSupportedYet extends Schema.TaggedError<ThemeFolderNotSupportedYet>(
  "ThemeFolderNotSupportedYet",
)("ThemeFolderNotSupportedYet", {
  name: Schema.String,
}) {}

export class ThemeNotJsonFile extends Schema.TaggedError<ThemeNotJsonFile>("ThemeNotJsonFile")("ThemeNotJsonFile", {
  name: Schema.String,
}) {}
