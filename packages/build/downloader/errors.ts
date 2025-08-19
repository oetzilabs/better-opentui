import { Schema } from "effect";

export class DownloaderFileNotFound extends Schema.TaggedError<DownloaderFileNotFound>()("DownloaderFileNotFound", {
  url: Schema.String,
  cause: Schema.Unknown,
}) {}

export class DownloaderError extends Schema.TaggedError<DownloaderError>()("DownloaderError", {
  cause: Schema.Unknown,
}) {}
