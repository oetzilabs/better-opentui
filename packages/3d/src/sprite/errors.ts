import { Schema } from "effect";

export class EmptyMeshPoolArray extends Schema.TaggedClass<EmptyMeshPoolArray>("EmptyMeshPoolArray")(
  "EmptyMeshPoolArray",
  {
    pool: Schema.Unknown,
  },
) {}

export class MaxInstancesReached extends Schema.TaggedClass<MaxInstancesReached>("MaxInstancesReached")(
  "MaxInstancesReached",
  {
    maxInstances: Schema.Number,
  },
) {}

export class EmptyFreeIndicesArray extends Schema.TaggedClass<EmptyFreeIndicesArray>("EmptyFreeIndicesArray")(
  "EmptyFreeIndicesArray",
  {
    freeIndices: Schema.Unknown,
  },
) {}

export class AttemptedToReleaseInvalidInstanceIndex extends Schema.TaggedError<AttemptedToReleaseInvalidInstanceIndex>(
  "AttemptedToReleaseInvalidInstanceIndex",
)("AttemptedToReleaseInvalidInstanceIndex", {
  instanceIndex: Schema.Number,
}) {}
