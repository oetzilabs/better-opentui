import { Schema } from "effect";

export class CantParseHexColor extends Schema.TaggedError<CantParseHexColor>()("CantParseHexColor", {
  cause: Schema.optional(Schema.Unknown),
  hex: Schema.String,
}) {}

export class UnsupportedPlatform extends Schema.TaggedError<UnsupportedPlatform>()("UnsupportedPlatform", {
  cause: Schema.optional(Schema.Unknown),
  platform: Schema.String,
}) {}

export class UnsupportedArchitecture extends Schema.TaggedError<UnsupportedArchitecture>()("UnsupportedArchitecture", {
  cause: Schema.optional(Schema.Unknown),
  arch: Schema.String,
}) {}

export class OpenTueeLibraryNotFound extends Schema.TaggedError<OpenTueeLibraryNotFound>()("OpenTueeLibraryNotFound", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class OpenTueeLibraryNotLoaded extends Schema.TaggedError<OpenTueeLibraryNotLoaded>()(
  "OpenTueeLibraryNotLoaded",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDestroy extends Schema.TaggedError<RendererFailedToDestroy>()("RendererFailedToDestroy", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class RendererFailedToCreate extends Schema.TaggedError<RendererFailedToCreate>()("RendererFailedToCreate", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class RendererFailedToSetUseThread extends Schema.TaggedError<RendererFailedToSetUseThread>()(
  "RendererFailedToSetUseThread",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToSetBackgroundColor extends Schema.TaggedError<RendererFailedToSetBackgroundColor>()(
  "RendererFailedToSetBackgroundColor",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToSetOffset extends Schema.TaggedError<RendererFailedToSetOffset>()(
  "RendererFailedToSetOffset",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToUpdateStats extends Schema.TaggedError<RendererFailedToUpdateStats>()(
  "RendererFailedToUpdateStats",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToUpdateMemoryStats extends Schema.TaggedError<RendererFailedToUpdateMemoryStats>()(
  "RendererFailedToUpdateMemoryStats",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetNextBuffer extends Schema.TaggedError<RendererFailedToGetNextBuffer>()(
  "RendererFailedToGetNextBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class NextBufferNotAvailable extends Schema.TaggedError<NextBufferNotAvailable>()("NextBufferNotAvailable", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class RendererFailedToGetBufferWidth extends Schema.TaggedError<RendererFailedToGetBufferWidth>()(
  "RendererFailedToGetBufferWidth",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetBufferHeight extends Schema.TaggedError<RendererFailedToGetBufferHeight>()(
  "RendererFailedToGetBufferHeight",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetCurrentBuffer extends Schema.TaggedError<RendererFailedToGetCurrentBuffer>()(
  "RendererFailedToGetCurrentBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
    pointer: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetBuffer extends Schema.TaggedError<RendererFailedToGetBuffer>()(
  "RendererFailedToGetBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetCharPointer extends Schema.TaggedError<RendererFailedToGetCharPointer>()(
  "RendererFailedToGetCharPointer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetForegroundPointer extends Schema.TaggedError<RendererFailedToGetForegroundPointer>()(
  "RendererFailedToGetForegroundPointer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetBackgroundPointer extends Schema.TaggedError<RendererFailedToGetBackgroundPointer>()(
  "RendererFailedToGetBackgroundPointer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetAttributesPointer extends Schema.TaggedError<RendererFailedToGetAttributesPointer>()(
  "RendererFailedToGetAttributesPointer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetRespectAlpha extends Schema.TaggedError<RendererFailedToGetRespectAlpha>()(
  "RendererFailedToGetRespectAlpha",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToSetRespectAlpha extends Schema.TaggedError<RendererFailedToSetRespectAlpha>()(
  "RendererFailedToSetRespectAlpha",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToClearBuffer extends Schema.TaggedError<RendererFailedToClearBuffer>()(
  "RendererFailedToClearBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDrawText extends Schema.TaggedError<RendererFailedToDrawText>()(
  "RendererFailedToDrawText",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToSetCellWithAlphaBlending extends Schema.TaggedError<RendererFailedToSetCellWithAlphaBlending>()(
  "RendererFailedToSetCellWithAlphaBlending",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToFillRect extends Schema.TaggedError<RendererFailedToFillRect>()(
  "RendererFailedToFillRect",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDrawSuperSampleBuffer extends Schema.TaggedError<RendererFailedToDrawSuperSampleBuffer>()(
  "RendererFailedToDrawSuperSampleBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDrawPackedBuffer extends Schema.TaggedError<RendererFailedToDrawPackedBuffer>()(
  "RendererFailedToDrawPackedBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToResizeBuffer extends Schema.TaggedError<RendererFailedToResizeBuffer>()(
  "RendererFailedToResizeBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToResizeRenderer extends Schema.TaggedError<RendererFailedToResizeRenderer>()(
  "RendererFailedToResizeRenderer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToSetCursorPosition extends Schema.TaggedError<RendererFailedToSetCursorPosition>()(
  "RendererFailedToSetCursorPosition",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToSetCursorStyle extends Schema.TaggedError<RendererFailedToSetCursorStyle>()(
  "RendererFailedToSetCursorStyle",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToSetCursorColor extends Schema.TaggedError<RendererFailedToSetCursorColor>()(
  "RendererFailedToSetCursorColor",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToRender extends Schema.TaggedError<RendererFailedToRender>()("RendererFailedToRender", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class RendererFailedToDestroyOptimizedBuffer extends Schema.TaggedError<RendererFailedToDestroyOptimizedBuffer>()(
  "RendererFailedToDestroyOptimizedBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDrawFrameBuffer extends Schema.TaggedError<RendererFailedToDrawFrameBuffer>()(
  "RendererFailedToDrawFrameBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDumpHitGrid extends Schema.TaggedError<RendererFailedToDumpHitGrid>()(
  "RendererFailedToDumpHitGrid",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDumpBuffers extends Schema.TaggedError<RendererFailedToDumpBuffers>()(
  "RendererFailedToDumpBuffers",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDumpStdoutBuffer extends Schema.TaggedError<RendererFailedToDumpStdoutBuffer>()(
  "RendererFailedToDumpStdoutBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class OptimizedBufferDrawTextLocalInvalidText extends Schema.TaggedError<OptimizedBufferDrawTextLocalInvalidText>()(
  "OptimizedBufferDrawTextLocalInvalidText",
  {
    cause: Schema.optional(Schema.Unknown),
    text: Schema.String,
    x: Schema.Int,
    y: Schema.Int,
    fg: Schema.Unknown,
    bg: Schema.Unknown,
  },
) {}

export class MissingBackgroundColor extends Schema.TaggedError<MissingBackgroundColor>()("MissingBackgroundColor", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class RendererFailedToAddToHitGrid extends Schema.TaggedError<RendererFailedToAddToHitGrid>()(
  "RendererFailedToAddToHitGrid",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FailedToCreateOptimizedBuffer extends Schema.TaggedError<FailedToCreateOptimizedBuffer>()(
  "FailedToCreateOptimizedBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToCheckHit extends Schema.TaggedError<RendererFailedToCheckHit>()(
  "RendererFailedToCheckHit",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDrawBox extends Schema.TaggedError<RendererFailedToDrawBox>()("RendererFailedToDrawBox", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class RendererFailedToCreateTextBuffer extends Schema.TaggedError<RendererFailedToCreateTextBuffer>()(
  "RendererFailedToCreateTextBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetTextBufferCharPtr extends Schema.TaggedError<RendererFailedToGetTextBufferCharPtr>()(
  "RendererFailedToGetTextBufferCharPtr",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetTextBufferFgPtr extends Schema.TaggedError<RendererFailedToGetTextBufferFgPtr>()(
  "RendererFailedToGetTextBufferFgPtr",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetTextBufferBgPtr extends Schema.TaggedError<RendererFailedToGetTextBufferBgPtr>()(
  "RendererFailedToGetTextBufferBgPtr",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetTextBufferAttributesPtr extends Schema.TaggedError<RendererFailedToGetTextBufferAttributesPtr>()(
  "RendererFailedToGetTextBufferAttributesPtr",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToResetTextBuffer extends Schema.TaggedError<RendererFailedToResetTextBuffer>()(
  "RendererFailedToResetTextBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToGetTextBuffer extends Schema.TaggedError<RendererFailedToGetTextBuffer>()(
  "RendererFailedToGetTextBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToFinalizeTextBufferLineInfo extends Schema.TaggedError<RendererFailedToFinalizeTextBufferLineInfo>()(
  "RendererFailedToFinalizeTextBufferLineInfo",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDrawTextBuffer extends Schema.TaggedError<RendererFailedToDrawTextBuffer>()(
  "RendererFailedToDrawTextBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDestroyTextBuffer extends Schema.TaggedError<RendererFailedToDestroyTextBuffer>()(
  "RendererFailedToDestroyTextBuffer",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FrameCallbackError extends Schema.TaggedError<FrameCallbackError>("FrameCallbackError")(
  "FrameCallbackError",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class FailedToFreeYogaNode extends Schema.TaggedError<FailedToFreeYogaNode>()("FailedToFreeYogaNode", {
  cause: Schema.optional(Schema.Unknown),
}) {}

export class RendererFailedToEnableMouse extends Schema.TaggedError<RendererFailedToEnableMouse>()(
  "RendererFailedToEnableMouse",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class RendererFailedToDisableMouse extends Schema.TaggedError<RendererFailedToDisableMouse>()(
  "RendererFailedToDisableMouse",
  {
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class WritingToBufferError extends Schema.TaggedError<WritingToBufferError>()("WritingToBufferError", {
  cause: Schema.optional(Schema.Unknown),
}) {}

// all errors
export type Collection =
  | NextBufferNotAvailable
  | WritingToBufferError
  | RendererFailedToDisableMouse
  | RendererFailedToEnableMouse
  | FailedToFreeYogaNode
  | RendererFailedToDrawTextBuffer
  | RendererFailedToFinalizeTextBufferLineInfo
  | RendererFailedToGetTextBuffer
  | RendererFailedToGetTextBufferCharPtr
  | RendererFailedToGetTextBufferFgPtr
  | RendererFailedToGetTextBufferBgPtr
  | RendererFailedToGetTextBufferAttributesPtr
  | RendererFailedToResetTextBuffer
  | RendererFailedToCreateTextBuffer
  | RendererFailedToDrawBox
  | RendererFailedToCheckHit
  | CantParseHexColor
  | RendererFailedToUpdateStats
  | RendererFailedToSetBackgroundColor
  | RendererFailedToSetCursorPosition
  | RendererFailedToSetCursorStyle
  | RendererFailedToUpdateMemoryStats
  | RendererFailedToGetNextBuffer
  | RendererFailedToGetCurrentBuffer
  | RendererFailedToGetBuffer
  | RendererFailedToGetCharPointer
  | RendererFailedToGetForegroundPointer
  | RendererFailedToGetBackgroundPointer
  | RendererFailedToGetAttributesPointer
  | RendererFailedToGetRespectAlpha
  | RendererFailedToSetRespectAlpha
  | RendererFailedToClearBuffer
  | RendererFailedToDrawText
  | RendererFailedToDrawFrameBuffer
  | RendererFailedToDrawPackedBuffer
  | RendererFailedToDrawSuperSampleBuffer
  | RendererFailedToResizeBuffer
  | RendererFailedToResizeRenderer
  | RendererFailedToSetCursorColor
  | RendererFailedToAddToHitGrid
  | RendererFailedToDumpHitGrid
  | RendererFailedToDumpBuffers
  | RendererFailedToDumpStdoutBuffer
  | OptimizedBufferDrawTextLocalInvalidText
  | MissingBackgroundColor
  | RendererFailedToAddToHitGrid
  | FailedToCreateOptimizedBuffer;
