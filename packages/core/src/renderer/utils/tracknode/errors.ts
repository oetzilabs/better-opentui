import { Schema } from "effect";

export class TrackedNodeDestroyed extends Schema.TaggedError<TrackedNodeDestroyed>("TrackedNodeDestroyed")(
  "TrackedNodeDestroyed",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class ParentTrackedNodeDestroyed extends Schema.TaggedError<ParentTrackedNodeDestroyed>(
  "ParentTrackedNodeDestroyed",
)("ParentTrackedNodeDestroyed", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class FailedToSetTrackedNodeWidthAndHeight extends Schema.TaggedError<FailedToSetTrackedNodeWidthAndHeight>(
  "FailedToSetTrackedNodeWidthAndHeight",
)("FailedToSetTrackedNodeWidthAndHeight", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class FailedToFreeYogaNode extends Schema.TaggedError<FailedToFreeYogaNode>("FailedToFreeYogaNode")(
  "FailedToFreeYogaNode",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FailedToInsertChildTrackNode extends Schema.TaggedError<FailedToInsertChildTrackNode>(
  "FailedToInsertChildTrackNode",
)("FailedToInsertChildTrackNode", {
  cause: Schema.optional(Schema.Unknown),
}) {}
