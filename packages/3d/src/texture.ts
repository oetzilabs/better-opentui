import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import { Jimp } from "jimp";
import { ClampToEdgeWrapping, Color, DataTexture, NearestFilter, RGBAFormat, UnsignedByteType } from "three";
import { FailedLoadingTexture } from "./errors";

export const loadTextureFromFile = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(path);
  if (!exists) {
    return null;
  }
  const file = yield* fs.readFile(path);
  const buffer = Buffer.from(file);

  const image = yield* Effect.tryPromise({
    try: () => Jimp.read(buffer),
    catch: (e) => new FailedLoadingTexture({ cause: e }),
  });

  image.flip({ horizontal: false, vertical: true });

  const texture = new DataTexture(
    image.bitmap.data,
    image.bitmap.width,
    image.bitmap.height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.needsUpdate = true;
  texture.format = RGBAFormat;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false; // Usually true for webGL, but our sampler flips V

  return texture;
});
interface SimpleImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const createCheckerboard = Effect.fn(function* (
  size: number = 256,
  color1: Color = new Color(1.0, 1.0, 1.0),
  color2: Color = new Color(0.0, 0.0, 0.0),
  checkSize: number = 32,
) {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const isEvenX = Math.floor(x / checkSize) % 2 === 0;
      const isEvenY = Math.floor(y / checkSize) % 2 === 0;
      const color = (isEvenX && isEvenY) || (!isEvenX && !isEvenY) ? color1 : color2;

      const index = (y * size + x) * 4;
      data[index] = Math.floor(color.r * 255);
      data[index + 1] = Math.floor(color.g * 255);
      data[index + 2] = Math.floor(color.b * 255);
      data[index + 3] = 255; // Alpha
    }
  }

  const imageData: SimpleImageData = { data, width: size, height: size };
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  texture.format = RGBAFormat;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;

  return texture;
});
export const createGradient = Effect.fn(function* (
  size: number = 256,
  startColor: Color = new Color(1.0, 0.0, 0.0),
  endColor: Color = new Color(0.0, 0.0, 1.0),
  direction: "horizontal" | "vertical" | "radial" = "vertical",
) {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let t = 0;

      if (direction === "horizontal") {
        t = x / (size - 1);
      } else if (direction === "vertical") {
        t = y / (size - 1);
      } else if (direction === "radial") {
        const dx = x - size / 2;
        const dy = y - size / 2;
        t = Math.min(1, Math.sqrt(dx * dx + dy * dy) / (size / 2));
      }

      const r = startColor.r * (1 - t) + endColor.r * t;
      const g = startColor.g * (1 - t) + endColor.g * t;
      const b = startColor.b * (1 - t) + endColor.b * t;

      const index = (y * size + x) * 4;
      data[index] = Math.floor(r * 255);
      data[index + 1] = Math.floor(g * 255);
      data[index + 2] = Math.floor(b * 255);
      data[index + 3] = 255; // Alpha
    }
  }

  const imageData: SimpleImageData = { data, width: size, height: size };
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  texture.format = RGBAFormat;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;

  return texture;
});

export const createNoise = Effect.fn(function* (
  size: number = 256,
  scale: number = 1,
  octaves: number = 1,
  color1: Color = new Color(1.0, 1.0, 1.0),
  color2: Color = new Color(0.0, 0.0, 0.0),
) {
  const data = new Uint8ClampedArray(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let noise = 0;
      let amplitude = 1;
      let frequency = 1;

      for (let o = 0; o < octaves; o++) {
        const nx = (x * frequency * scale) / size;
        const ny = (y * frequency * scale) / size;
        const sampleX = Math.sin(nx * 12.9898) * 43758.5453;
        const sampleY = Math.cos(ny * 78.233) * 43758.5453;
        const sample = Math.sin(sampleX + sampleY) * 0.5 + 0.5;
        noise += sample * amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }

      noise = Math.min(1, Math.max(0, noise)); // Normalize

      const r = color1.r * noise + color2.r * (1 - noise);
      const g = color1.g * noise + color2.g * (1 - noise);
      const b = color1.b * noise + color2.b * (1 - noise);

      const index = (y * size + x) * 4;
      data[index] = Math.floor(r * 255);
      data[index + 1] = Math.floor(g * 255);
      data[index + 2] = Math.floor(b * 255);
      data[index + 3] = 255; // Alpha
    }
  }

  const imageData: SimpleImageData = { data, width: size, height: size };
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  texture.needsUpdate = true;
  texture.format = RGBAFormat;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.flipY = false;

  return texture;
});
