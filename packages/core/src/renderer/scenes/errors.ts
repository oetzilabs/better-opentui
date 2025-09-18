import { Schema } from "effect";

export class SceneNotFound extends Schema.TaggedError<SceneNotFound>("SceneNotFound")("SceneNotFound", {
  name: Schema.String,
}) {}
