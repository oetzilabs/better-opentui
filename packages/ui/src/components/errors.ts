import { Schema } from "effect";

export class RenderableHasParentCantDestroy extends Schema.TaggedError<RenderableHasParentCantDestroy>(
  "RenderableHasParentCantDestroy",
)("RenderableHasParentCantDestroy", { id: Schema.Unknown }) {}

export class MissingChildLayoutNode extends Schema.TaggedError<MissingChildLayoutNode>("MissingChildLayoutNode")(
  "MissingChildLayoutNode",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}
