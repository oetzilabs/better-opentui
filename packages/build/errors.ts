import { Schema } from "effect";

export class UnknownPlattform extends Schema.TaggedError<UnknownPlattform>("UnknownPlattform")("UnknownPlattform", {
  platform: Schema.String,
}) {}

export class UnknownArchitecture extends Schema.TaggedError<UnknownArchitecture>("UnknownArchitecture")(
  "UnknownArchitecture",
  {
    platform: Schema.String,
    architecture: Schema.String,
  },
) {}
