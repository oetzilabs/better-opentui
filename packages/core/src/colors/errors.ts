import { Schema } from "effect";

export class CantParseHexColor extends Schema.TaggedError<CantParseHexColor>()("CantParseHexColor", {
  cause: Schema.optional(Schema.Unknown),
  hex: Schema.String,
}) {}
