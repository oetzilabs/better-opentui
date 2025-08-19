import { Schema } from "effect";

export class DeviceNotInitialized extends Schema.TaggedError<DeviceNotInitialized>("DeviceNotInitializedError")(
  "DeviceNotInitialized",
  {},
) {}

export class ScreenshotGPUBufferNotInitialized extends Schema.TaggedError<ScreenshotGPUBufferNotInitialized>(
  "ScreenshotGPUBufferNotInitialized",
)("ScreenshotGPUBufferNotInitialized", {}) {}

export class CouldNotMapGPUBuffer extends Schema.TaggedError<CouldNotMapGPUBuffer>("CouldNotMapGPUBuffer")(
  "CouldNotMapGPUBuffer",
  {
    cause: Schema.Unknown,
  },
) {}

export class CouldNotWriteImage extends Schema.TaggedError<CouldNotWriteImage>("CouldNotWriteImage")(
  "CouldNotWriteImage",
  {
    cause: Schema.Unknown,
  },
) {}

export class ComputeParamsBufferNotInitialized extends Schema.TaggedError<ComputeParamsBufferNotInitialized>(
  "ComputeParamsBufferNotInitialized",
)("ComputeParamsBufferNotInitialized", {}) {}

export class CouldNotSubmitWorkDone extends Schema.TaggedError<CouldNotSubmitWorkDone>("CouldNotSubmitWorkDone")(
  "CouldNotSubmitWorkDone",
  {
    cause: Schema.Unknown,
  },
) {}

export class ComputePipelineNotInitialized extends Schema.TaggedError<ComputePipelineNotInitialized>(
  "ComputePipelineNotInitialized",
)("ComputePipelineNotInitialized", {}) {}

export class MissingGPUCanvasContext extends Schema.TaggedError<MissingGPUCanvasContext>("MissingGPUCanvasContext")(
  "MissingGPUCanvasContext",
  {},
) {}

export class MissingReadbackBuffer extends Schema.TaggedError<MissingReadbackBuffer>("MissingReadbackBuffer")(
  "MissingReadbackBuffer",
  {},
) {}

export class ContextNotSupported extends Schema.TaggedError<ContextNotSupported>("ContextNotSupported")(
  "ContextNotSupported",
  {
    type: Schema.String,
  },
) {}

export class FileNotFound extends Schema.TaggedError<FileNotFound>("FileNotFound")("FileNotFound", {
  filePath: Schema.String,
}) {}

export class FailedLoadingTexture extends Schema.TaggedError<FailedLoadingTexture>("FailedLoadingTexture")(
  "FailedLoadingTexture",
  {
    cause: Schema.Unknown,
  },
) {}
