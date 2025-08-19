import { Schema } from "effect";

export class FailedToSetFlexDirection extends Schema.TaggedError<FailedToSetFlexDirection>("FailedToSetFlexDirection")(
  "FailedToSetFlexDirection",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FailedToGetComputedWidth extends Schema.TaggedError<FailedToGetComputedWidth>("FailedToGetComputedWidth")(
  "FailedToGetComputedWidth",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FailedToGetComputedHeight extends Schema.TaggedError<FailedToGetComputedHeight>(
  "FailedToGetComputedHeight",
)("FailedToGetComputedHeight", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class FailedToCalculateLayout extends Schema.TaggedError<FailedToCalculateLayout>("FailedToCalculateLayout")(
  "FailedToCalculateLayout",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FailedToFreeYogaConfig extends Schema.TaggedError<FailedToFreeYogaConfig>("FailedToFreeYogaConfig")(
  "FailedToFreeYogaConfig",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FailedToSetKeypressHandler extends Schema.TaggedError<FailedToSetKeypressHandler>(
  "FailedToSetKeypressHandler",
)("FailedToSetKeypressHandler", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class FailedToRemoveKeypressHandler extends Schema.TaggedError<FailedToRemoveKeypressHandler>(
  "FailedToRemoveKeypressHandler",
)("FailedToRemoveKeypressHandler", {
  cause: Schema.optional(Schema.Unknown),
}) {}
