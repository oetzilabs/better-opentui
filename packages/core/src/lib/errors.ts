import { Schema } from "effect";

export class OpenTueeLibraryNotFound extends Schema.TaggedError<OpenTueeLibraryNotFound>()("OpenTueeLibraryNotFound", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class OpenTueeLibraryNotLoaded extends Schema.TaggedError<OpenTueeLibraryNotLoaded>()(
  "OpenTueeLibraryNotLoaded",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class UnsupportedPlatform extends Schema.TaggedError<UnsupportedPlatform>()("UnsupportedPlatform", {
  cause: Schema.optional(Schema.Unknown),
  platform: Schema.String,
}) {}

export class UnsupportedArchitecture extends Schema.TaggedError<UnsupportedArchitecture>()("UnsupportedArchitecture", {
  cause: Schema.optional(Schema.Unknown),
  arch: Schema.String,
}) {}
