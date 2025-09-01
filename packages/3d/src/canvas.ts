import { OptimizedBuffer } from "@better-opentui/core/src/buffer";
import type {
  RendererFailedToDrawPackedBuffer,
  RendererFailedToDrawSuperSampleBuffer,
} from "@better-opentui/core/src/errors";
import { RGBAClass } from "@better-opentui/core/src/types";
import type { FileSystem } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { GPUCanvasContextMock } from "bun-webgpu";
import { toArrayBuffer } from "bun:ffi";
import { ConfigError, Console, Context, Effect, Match, Ref, Schema } from "effect";
import { Jimp } from "jimp";
import {
  ComputeParamsBufferNotInitialized,
  ComputePipelineNotInitialized,
  ContextNotSupported,
  CouldNotMapGPUBuffer,
  CouldNotSubmitWorkDone,
  CouldNotWriteImage,
  DeviceNotInitialized,
  FileNotFound,
  MissingGPUCanvasContext,
  MissingReadbackBuffer,
  ScreenshotGPUBufferNotInitialized,
} from "./errors";
// @ts-ignore
import shaderPath from "./shaders/supersampling.wgsl" with { type: "file" };
import { fixPaths, loadTemplate } from "./utils";
import { SuperSampleGPU, SuperSampleNone, type SuperSampleType } from "./wgpurenderer";

export const SuperSampleStandartAlgorithm = Schema.Literal(0).pipe(Schema.brand("SuperSampleStandartAlgorithm"));
export type SuperSampleStandartAlgorithm = typeof SuperSampleStandartAlgorithm.Type;

export const SuperSamplePreSqueezedAlgorithm = Schema.Literal(1).pipe(Schema.brand("SuperSamplePreSqueezedAlgorithm"));
export type SuperSamplePreSqueezedAlgorithm = typeof SuperSamplePreSqueezedAlgorithm.Type;

export const SuperSampleAlgorithmSchema = Schema.Union(SuperSampleStandartAlgorithm, SuperSamplePreSqueezedAlgorithm);

export type SuperSampleAlgorithm = typeof SuperSampleAlgorithmSchema.Type;

const WORKGROUP_SIZE = 4 as const;

export type CliCanvasService = Effect.Effect.Success<ReturnType<typeof makeCliCanvas>>;
// {
//   setSuperSampleAlgorithm: (superSampleAlgorithm: SuperSampleAlgorithm) => Effect.Effect<void>;
//   getContext: (
//     type: string,
//     attrs?: WebGLContextAttributes,
//   ) => Effect.Effect<
//     GPUCanvasContextMock | undefined,
//     ContextNotSupported | DeviceNotInitialized | ComputeParamsBufferNotInitialized
//   >;
//   setSize: (width: number, height: number) => Effect.Effect<void, DeviceNotInitialized>;
//   addEventListener: (event: string, listener: any, options?: any) => Effect.Effect<void>;
//   removeEventListener: (event: string, listener: any, options?: any) => Effect.Effect<void>;
//   dispatchEvent: (event: Event) => Effect.Effect<void>;
//   setSuperSample: (superSample: SuperSampleType) => Effect.Effect<void>;
//   saveToFile: (
//     filePath: string,
//   ) => Effect.Effect<
//     void,
//     DeviceNotInitialized | ScreenshotGPUBufferNotInitialized | CouldNotMapGPUBuffer | CouldNotWriteImage
//   >;
//   readPixelsIntoBuffer: () => Effect.Effect<
//     void,
//     | ConfigError.ConfigError
//     | FileNotFound
//     | PlatformError
//     | DeviceNotInitialized
//     | ComputeParamsBufferNotInitialized
//     | CouldNotMapGPUBuffer
//     | MissingGPUCanvasContext
//     | MissingReadbackBuffer
//     | RendererFailedToDrawSuperSampleBuffer
//     | RendererFailedToDrawPackedBuffer
//     | ComputePipelineNotInitialized
//     | CouldNotSubmitWorkDone,
//     OptimizedBuffer | FileSystem.FileSystem
//   >;
// };

export class CliCanvas extends Context.Tag("CliCanvas")<CliCanvas, CliCanvasService>() {}

export const makeCliCanvas = Effect.fn(function* (
  device: GPUDevice,
  width: number,
  height: number,
  superSample: SuperSampleType,
  sampleAlgo: SuperSampleAlgorithm = SuperSampleStandartAlgorithm.make(0),
) {
  const _device = yield* Ref.make<GPUDevice | undefined>(device);
  const readbackBuffer = yield* Ref.make<GPUBuffer | null>(null);
  const _width = yield* Ref.make(width);
  const _height = yield* Ref.make(height);
  const gpuCanvasContext = yield* Ref.make<GPUCanvasContextMock | undefined>(undefined);

  const superSampleDrawTimeMs = yield* Ref.make(0);
  const mapAsyncTimeMs = yield* Ref.make(0);
  const _superSample = yield* Ref.make<SuperSampleType>(superSample);

  const computePipeline = yield* Ref.make<GPUComputePipeline | null>(null);
  const computeBindGroupLayout = yield* Ref.make<GPUBindGroupLayout | null>(null);
  const computeOutputBuffer = yield* Ref.make<GPUBuffer | null>(null);
  const computeParamsBuffer = yield* Ref.make<GPUBuffer | null>(null);
  const computeReadbackBuffer = yield* Ref.make<GPUBuffer | null>(null);
  const updateScheduled = yield* Ref.make(false);
  const screenshotGPUBuffer = yield* Ref.make<GPUBuffer | null>(null);
  const superSampleAlgorithm = yield* Ref.make<SuperSampleAlgorithm>(SuperSampleStandartAlgorithm.make(0));

  const setSuperSampleAlgorithm = Effect.fn(function* (ssa: SuperSampleAlgorithm) {
    yield* Ref.set(superSampleAlgorithm, ssa);
    yield* scheduleUpdateComputeBuffers();
  });

  const getSuperSampleAlgorithm = Effect.fn(function* () {
    return yield* Ref.get(superSampleAlgorithm);
  });

  const getContext = Effect.fn(function* (type: string, attrs?: WebGLContextAttributes) {
    if (type === "webgpu") {
      const w = yield* Ref.get(_width);
      const h = yield* Ref.get(_height);
      yield* updateReadbackBuffer(w, h);
      yield* updateComputeBuffers(w, h);
      return yield* Ref.get(gpuCanvasContext);
    }
    return yield* Effect.fail(new ContextNotSupported({ type }));
  });

  const setSize = Effect.fn(function* (width: number, height: number) {
    const w = yield* Ref.get(_width);
    const h = yield* Ref.get(_height);
    const ctx = yield* Ref.get(gpuCanvasContext);
    if (!ctx) return;
    yield* Ref.update(gpuCanvasContext, (context) => {
      context!.setSize(width, height);
      return context;
    });
    yield* updateReadbackBuffer(w, h);
    yield* scheduleUpdateComputeBuffers();
  });

  const addEventListener = Effect.fn(function* (event: string, listener: any, options?: any) {
    yield* Console.error("addEventListener mockCanvas", event, listener, options);
  });

  const removeEventListener = Effect.fn(function* (event: string, listener: any, options?: any) {
    yield* Console.error("removeEventListener mockCanvas", event, listener, options);
  });

  const dispatchEvent = Effect.fn(function* (event: Event) {
    yield* Console.error("dispatchEvent mockCanvas", event);
  });

  const setSuperSample = Effect.fn(function* (superSample: SuperSampleType) {
    yield* Ref.set(_superSample, superSample);
  });

  const saveToFile = Effect.fn(function* (filePath: string) {
    const bytesPerPixel = 4; // RGBA
    const width = yield* Ref.get(_width);
    const height = yield* Ref.get(_height);
    const unalignedBytesPerRow = width * bytesPerPixel;
    const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
    const textureBufferSize = alignedBytesPerRow * height;

    const dev = yield* Ref.get(_device);
    if (!dev) return yield* Effect.fail(new DeviceNotInitialized());
    const sgpub = yield* Ref.get(screenshotGPUBuffer);
    if (!sgpub || sgpub.size !== textureBufferSize) {
      if (sgpub) {
        sgpub.destroy();
      }
      yield* Ref.set(
        screenshotGPUBuffer,
        dev.createBuffer({
          label: "Screenshot GPU Buffer",
          size: textureBufferSize,
          usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
        }),
      );
    }

    const ctx = yield* Ref.get(gpuCanvasContext);
    if (!ctx) return;
    const texture = ctx.getCurrentTexture();

    const commandEncoder = dev.createCommandEncoder({ label: "Screenshot Command Encoder" });
    if (!sgpub) return yield* Effect.fail(new ScreenshotGPUBufferNotInitialized());
    commandEncoder.copyTextureToBuffer(
      { texture: texture },
      { buffer: sgpub, bytesPerRow: alignedBytesPerRow, rowsPerImage: height },
      { width, height },
    );
    const commandBuffer = commandEncoder.finish();
    dev.queue.submit([commandBuffer]);

    yield* Effect.tryPromise({
      try: () => sgpub.mapAsync(GPUMapMode.READ),
      catch: (e) => new CouldNotMapGPUBuffer({ cause: e }),
    });

    const resultBuffer = sgpub.getMappedRange();
    const pixelData = new Uint8Array(resultBuffer);
    const contextFormat = texture.format;
    const isBGRA = contextFormat === "bgra8unorm";

    // Handle row padding - extract only the actual image data
    const imageData = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      const srcOffset = y * alignedBytesPerRow;
      const dstOffset = y * width * 4;

      if (isBGRA) {
        for (let x = 0; x < width; x++) {
          const srcPixelOffset = srcOffset + x * 4;
          const dstPixelOffset = dstOffset + x * 4;

          imageData[dstPixelOffset] = pixelData[srcPixelOffset + 2];
          imageData[dstPixelOffset + 1] = pixelData[srcPixelOffset + 1];
          imageData[dstPixelOffset + 2] = pixelData[srcPixelOffset];
          imageData[dstPixelOffset + 3] = pixelData[srcPixelOffset + 3];
        }
      } else {
        imageData.set(pixelData.subarray(srcOffset, srcOffset + width * 4), dstOffset);
      }
    }

    const image = new Jimp({
      data: Buffer.from(imageData),
      width,
      height,
    });

    yield* Effect.tryPromise({
      try: () => image.write(filePath as `${string}.${string}`),
      catch: (e) => new CouldNotWriteImage({ cause: e }),
    });
    sgpub.unmap();
  });

  const initComputePipeline = Effect.fn(function* () {
    const cp = yield* Ref.get(computePipeline);
    if (cp) return;
    const dev = yield* Ref.get(_device);
    if (!dev) return yield* Effect.fail(new DeviceNotInitialized());
    const filePaths = yield* fixPaths({
      shaderPath,
    });
    const SUPERSAMPLING_COMPUTE_SHADER = yield* loadTemplate(filePaths.shaderPath, {
      WORKGROUP_SIZE: WORKGROUP_SIZE.toString(),
    });

    const shaderModule = dev.createShaderModule({
      label: "SuperSampling Compute Shader",
      code: SUPERSAMPLING_COMPUTE_SHADER,
    });

    const cbgl = dev.createBindGroupLayout({
      label: "SuperSampling Bind Group Layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: "float", viewDimension: "2d" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });
    yield* Ref.set(computeBindGroupLayout, cbgl);

    const pipelineLayout = dev.createPipelineLayout({
      label: "SuperSampling Pipeline Layout",
      bindGroupLayouts: [cbgl],
    });

    const pipelineLayout2 = dev.createComputePipeline({
      label: "SuperSampling Compute Pipeline",
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });
    yield* Ref.set(computePipeline, pipelineLayout2);

    // Create uniform buffer for parameters (8 bytes - 2 u32s: width, height)
    yield* Ref.set(
      computeParamsBuffer,
      dev.createBuffer({
        label: "SuperSampling Params Buffer",
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    );

    yield* updateComputeParams();
  });

  const updateComputeParams = Effect.fn(function* () {
    const dev = yield* Ref.get(_device);
    if (!dev) return yield* Effect.fail(new DeviceNotInitialized());

    const cpb = yield* Ref.get(computeParamsBuffer);
    const ss = yield* Ref.get(_superSample);
    const isSuperSampleNone = Schema.is(SuperSampleNone);
    if (!cpb || isSuperSampleNone(ss)) return yield* Effect.fail(new ComputeParamsBufferNotInitialized());

    // Update uniform buffer with parameters
    // Note: this.width/height are render dimensions (2x terminal size for super sampling)
    const paramsData = new ArrayBuffer(16);
    const uint32View = new Uint32Array(paramsData);
    const width = yield* Ref.get(_width);
    const height = yield* Ref.get(_height);
    const ssa = yield* Ref.get(superSampleAlgorithm);

    uint32View[0] = width;
    uint32View[1] = height;
    uint32View[2] = ssa;

    dev.queue.writeBuffer(cpb, 0, paramsData);
  });

  const scheduleUpdateComputeBuffers = Effect.fn(function* () {
    yield* Ref.set(updateScheduled, true);
  });

  const updateComputeBuffers = Effect.fn(function* (width: number, height: number) {
    const ss = yield* Ref.get(_superSample);
    const isSuperSampleNone = Schema.is(SuperSampleNone);
    if (isSuperSampleNone(ss)) return;
    yield* updateComputeParams();

    // Calculate output buffer size (48 bytes per cell: 2 vec4f + u32 + 3 padding u32s)
    // Must match WGSL calculation exactly: (params.width + 1u) / 2u
    const cellBytesSize = 48; // 16 + 16 + 4 + 4 + 4 + 4 bytes (16-byte aligned)
    const terminalWidthCells = Math.floor((width + 1) / 2);
    const terminalHeightCells = Math.floor((height + 1) / 2);
    const outputBufferSize = terminalWidthCells * terminalHeightCells * cellBytesSize;

    const cob = yield* Ref.get(computeOutputBuffer);
    const crb = yield* Ref.get(computeReadbackBuffer);

    const oldOutputBuffer = cob;
    const oldReadbackBuffer = crb;

    if (oldOutputBuffer) {
      oldOutputBuffer.destroy();
    }
    if (oldReadbackBuffer) {
      oldReadbackBuffer.destroy();
    }

    const dev = yield* Ref.get(_device);
    if (!dev) return yield* Effect.fail(new DeviceNotInitialized());

    // Create new buffers
    yield* Ref.set(
      computeOutputBuffer,
      dev.createBuffer({
        label: "SuperSampling Output Buffer",
        size: outputBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      }),
    );

    yield* Ref.set(
      computeReadbackBuffer,
      dev.createBuffer({
        label: "SuperSampling Readback Buffer",
        size: outputBufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
    );
  });

  const runComputeShaderSuperSampling = Effect.fn(function* (texture: GPUTexture) {
    const buffer = yield* OptimizedBuffer;
    const us = yield* Ref.get(updateScheduled);
    if (us) {
      yield* Ref.set(updateScheduled, false);
      const dev = yield* Ref.get(_device);
      if (!dev) return yield* Effect.fail(new DeviceNotInitialized());
      yield* Effect.tryPromise({
        try: () => dev.queue.onSubmittedWorkDone(),
        catch: (e) => new CouldNotSubmitWorkDone({ cause: e }),
      });
      const w = yield* Ref.get(_width);
      const h = yield* Ref.get(_height);
      yield* updateComputeBuffers(w, h);
    }

    yield* initComputePipeline();

    const cpl = yield* Ref.get(computePipeline);
    const cbgl = yield* Ref.get(computeBindGroupLayout);
    const cob = yield* Ref.get(computeOutputBuffer);
    const cpb = yield* Ref.get(computeParamsBuffer);
    const crb = yield* Ref.get(computeReadbackBuffer);
    if (!cpl || !cbgl || !cob || !cpb || !crb) {
      return yield* Effect.fail(new ComputePipelineNotInitialized());
    }

    const mapAsyncStart = performance.now();
    const textureView = texture.createView({
      label: "SuperSampling Input Texture View",
    });
    const dev = yield* Ref.get(_device);
    if (!dev) return yield* Effect.fail(new DeviceNotInitialized());
    const bindGroup = dev.createBindGroup({
      label: "SuperSampling Bind Group",
      layout: cbgl,
      entries: [
        { binding: 0, resource: textureView },
        { binding: 1, resource: { buffer: cob } },
        { binding: 2, resource: { buffer: cpb } },
      ],
    });

    const commandEncoder = dev.createCommandEncoder({ label: "SuperSampling Command Encoder" });
    const computePass = commandEncoder.beginComputePass({ label: "SuperSampling Compute Pass" });
    computePass.setPipeline(cpl);
    computePass.setBindGroup(0, bindGroup);

    const w = yield* Ref.get(_width);
    const h = yield* Ref.get(_height);
    // Must match WGSL calculation exactly: (params.width + 1u) / 2u
    const terminalWidthCells = Math.floor((w + 1) / 2);
    const terminalHeightCells = Math.floor((h + 1) / 2);
    const dispatchX = Math.ceil(terminalWidthCells / WORKGROUP_SIZE);
    const dispatchY = Math.ceil(terminalHeightCells / WORKGROUP_SIZE);

    computePass.dispatchWorkgroups(dispatchX, dispatchY, 1);
    computePass.end();

    commandEncoder.copyBufferToBuffer(cob, 0, crb, 0, cob.size);

    const commandBuffer = commandEncoder.finish();
    dev.queue.submit([commandBuffer]);

    yield* Effect.tryPromise({
      try: () => crb.mapAsync(GPUMapMode.READ),
      catch: (e) => new CouldNotMapGPUBuffer({ cause: e }),
    });

    const resultsPtr = crb.getMappedRangePtr();
    const size = crb!.size;

    yield* Ref.set(mapAsyncTimeMs, performance.now() - mapAsyncStart);

    const ssStart = performance.now();
    yield* buffer.drawPackedBuffer(resultsPtr, size, 0, 0, terminalWidthCells, terminalHeightCells);
    yield* Ref.set(superSampleDrawTimeMs, performance.now() - ssStart);

    crb.unmap();
  });

  const updateReadbackBuffer = Effect.fn(function* (renderWidth: number, renderHeight: number) {
    const rb = yield* Ref.get(readbackBuffer);
    if (rb) {
      rb.destroy();
    }
    const bytesPerPixel = 4; // Assuming RGBA8 or BGRA8
    const unalignedBytesPerRow = renderWidth * bytesPerPixel;
    const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
    const textureBufferSize = alignedBytesPerRow * renderHeight;

    const dev = yield* Ref.get(_device);
    if (!dev) return yield* Effect.fail(new DeviceNotInitialized());

    yield* Ref.set(
      readbackBuffer,
      dev.createBuffer({
        label: "Readback Buffer",
        size: textureBufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      }),
    );
  });

  const readPixelsIntoBuffer = Effect.fn(
    function* () {
      const buffer = yield* OptimizedBuffer;
      const ctx = yield* Ref.get(gpuCanvasContext);
      if (!ctx) return yield* Effect.fail(new MissingGPUCanvasContext());

      const texture = ctx.getCurrentTexture();
      ctx.switchTextures();
      const isSuperSampleGPU = Schema.is(SuperSampleGPU);
      const ss = yield* Ref.get(_superSample);
      if (isSuperSampleGPU(ss)) {
        yield* runComputeShaderSuperSampling(texture);
        return;
      }
      const rbb = yield* Ref.get(readbackBuffer);
      if (!rbb) return yield* Effect.fail(new MissingReadbackBuffer());

      // cleanup
      yield* Effect.addFinalizer((exit) => Effect.sync(() => rbb.unmap()));

      const w = yield* Ref.get(_width);
      const h = yield* Ref.get(_height);
      const bytesPerPixel = 4; // Assuming RGBA8 or BGRA8
      const unalignedBytesPerRow = w * bytesPerPixel;
      const alignedBytesPerRow = Math.ceil(unalignedBytesPerRow / 256) * 256;
      const contextFormat = texture.format;
      const dev = yield* Ref.get(_device);
      if (!dev) return yield* Effect.fail(new DeviceNotInitialized());
      const commandEncoder = dev.createCommandEncoder({ label: "Readback Command Encoder" });
      commandEncoder.copyTextureToBuffer(
        { texture: texture },
        { buffer: rbb, bytesPerRow: alignedBytesPerRow, rowsPerImage: h },
        {
          width: w,
          height: h,
        },
      );
      const commandBuffer = commandEncoder.finish();
      dev.queue.submit([commandBuffer]);

      const mapStart = performance.now();
      yield* Effect.tryPromise({
        try: () => rbb.mapAsync(GPUMapMode.READ, 0, rbb.size),
        catch: (e) => new CouldNotMapGPUBuffer({ cause: e }),
      });
      yield* Ref.set(mapAsyncTimeMs, performance.now() - mapStart);

      const mappedRangePtr = rbb.getMappedRangePtr(0, rbb.size);
      const bufPtr = mappedRangePtr;

      yield* Match.value(ss).pipe(
        Match.when(
          isSuperSampleGPU,
          Effect.fn(function* () {
            const format = contextFormat === "bgra8unorm" ? "bgra8unorm" : "rgba8unorm";
            const ssStart = performance.now();
            yield* buffer.drawSuperSampleBuffer(0, 0, bufPtr, rbb.size, format, alignedBytesPerRow);
            yield* Ref.set(superSampleDrawTimeMs, performance.now() - ssStart);
          }),
        ),
        Match.orElse(
          Effect.fn(function* () {
            yield* Ref.set(superSampleDrawTimeMs, 0);
            const pixelData = new Uint8Array(toArrayBuffer(bufPtr, 0, rbb.size));
            const isBGRA = contextFormat === "bgra8unorm";
            const backgroundColor = RGBAClass.fromValues(0, 0, 0, 1);

            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const pixelIndexInPaddedRow = y * alignedBytesPerRow + x * bytesPerPixel;

                if (pixelIndexInPaddedRow + 3 >= pixelData.length) continue;

                let rByte, gByte, bByte; // Alpha currently ignored

                if (isBGRA) {
                  bByte = pixelData[pixelIndexInPaddedRow];
                  gByte = pixelData[pixelIndexInPaddedRow + 1];
                  rByte = pixelData[pixelIndexInPaddedRow + 2];
                } else {
                  // Assume RGBA
                  rByte = pixelData[pixelIndexInPaddedRow];
                  gByte = pixelData[pixelIndexInPaddedRow + 1];
                  bByte = pixelData[pixelIndexInPaddedRow + 2];
                }

                // Convert to [0-1] range for RGB class
                const r = rByte / 255.0;
                const g = gByte / 255.0;
                const b = bByte / 255.0;

                const cellColor = RGBAClass.fromValues(r, g, b, 1.0);

                yield* buffer.setCell(x, y, "█", cellColor, backgroundColor);
              }
            }
          }),
        ),
      );
    },
    (effect) => effect.pipe(Effect.scoped),
  );

  const result = {
    setSuperSampleAlgorithm,
    getContext,
    setSize,
    addEventListener,
    removeEventListener,
    dispatchEvent,
    setSuperSample,
    saveToFile,
    readPixelsIntoBuffer,
  };
  yield* Ref.set(gpuCanvasContext, new GPUCanvasContextMock(result as unknown as HTMLCanvasElement, width, height));
  return result;
});
