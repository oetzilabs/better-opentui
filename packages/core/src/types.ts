// https://github.com/sst/opentui/blob/main/src/types.ts
// converted to Effect

import { Effect, Ref, Schema } from "effect";
import { type Input } from "./colors";
import { hexToRgb, rgbToHex } from "./utils";

export const DebugTopLeft = Schema.Literal(0).pipe(Schema.brand("DebugTopLeft"));
export const DebugTopRight = Schema.Literal(1).pipe(Schema.brand("DebugTopRight"));
export const DebugBottomLeft = Schema.Literal(2).pipe(Schema.brand("DebugBottomLeft"));
export const DebugBottomRight = Schema.Literal(3).pipe(Schema.brand("DebugBottomRight"));

export type DebugTopLeft = typeof DebugTopLeft.Type;
export type DebugTopRight = typeof DebugTopRight.Type;
export type DebugBottomLeft = typeof DebugBottomLeft.Type;
export type DebugBottomRight = typeof DebugBottomRight.Type;

export const DebugOverlayCorner = Schema.Union(DebugTopLeft, DebugTopRight, DebugBottomLeft, DebugBottomRight);

export type DebugOverlayCorner = typeof DebugOverlayCorner.Type;

export interface SelectionState {
  anchor: { x: number; y: number };
  focus: { x: number; y: number };
  isActive: boolean;
  isSelecting: boolean;
}

export class RGBAClass {
  buffer: Float32Array;

  constructor(buffer: Float32Array) {
    this.buffer = buffer;
  }

  static fromArray(array: Float32Array) {
    return new RGBAClass(array);
  }

  static fromValues(r: number, g: number, b: number, a: number = 1.0) {
    return new RGBAClass(new Float32Array([r, g, b, a]));
  }

  static fromInts(r: number, g: number, b: number, a: number = 255) {
    return new RGBAClass(new Float32Array([r / 255, g / 255, b / 255, a / 255]));
  }

  static fromHex(hex: Input) {
    return hexToRgb(hex);
  }

  public toHex() {
    return rgbToHex(new RGBAClass(this.buffer));
  }

  public hasAlpha(): boolean {
    return this.buffer[3] !== 0;
  }

  public blendColors(other: RGBAClass): RGBAClass {
    const [selfR, selfG, selfB, selfA] = this.buffer;
    const [otherR, otherG, otherB, otherA] = other.buffer;

    if (selfA === 1.0) {
      return this;
    }

    const alpha = selfA;

    let perceptualAlpha: number;

    if (alpha > 0.8) {
      const normalizedHighAlpha = (alpha - 0.8) * 5.0;
      const curvedHighAlpha = Math.pow(normalizedHighAlpha, 0.2);
      perceptualAlpha = 0.8 + curvedHighAlpha * 0.2;
    } else {
      perceptualAlpha = Math.pow(alpha, 0.9);
    }

    const r = selfR * perceptualAlpha + otherR * (1 - perceptualAlpha);
    const g = selfG * perceptualAlpha + otherG * (1 - perceptualAlpha);
    const b = selfB * perceptualAlpha + otherB * (1 - perceptualAlpha);

    const buffer = new Float32Array([r, g, b, otherA]);

    return RGBAClass.fromArray(buffer);
  }

  toInts() {
    return [
      Math.round(this.buffer[0]! * 255),
      Math.round(this.buffer[1]! * 255),
      Math.round(this.buffer[2]! * 255),
      Math.round(this.buffer[3]! * 255),
    ];
  }
}

export class RGBA {
  buffer: Float32Array;

  constructor(buffer: Float32Array) {
    this.buffer = buffer;
  }

  static fromArray(array: Float32Array) {
    return new RGBA(array);
  }

  static fromValues(r: number, g: number, b: number, a: number = 1.0) {
    return new RGBA(new Float32Array([r, g, b, a]));
  }

  static fromInts(r: number, g: number, b: number, a: number = 255) {
    return new RGBA(new Float32Array([r / 255, g / 255, b / 255, a / 255]));
  }

  static fromHex = (hex: Input) =>
    Effect.gen(function* () {
      return yield* hexToRgb(hex);
    });

  toInts(): [number, number, number, number] {
    return [Math.round(this.r * 255), Math.round(this.g * 255), Math.round(this.b * 255), Math.round(this.a * 255)];
  }

  get r(): number {
    return this.buffer[0];
  }

  set r(value: number) {
    this.buffer[0] = value;
  }

  get g(): number {
    return this.buffer[1];
  }

  set g(value: number) {
    this.buffer[1] = value;
  }

  get b(): number {
    return this.buffer[2];
  }

  set b(value: number) {
    this.buffer[2] = value;
  }

  get a(): number {
    return this.buffer[3];
  }

  set a(value: number) {
    this.buffer[3] = value;
  }

  public hasAlpha(): boolean {
    return this.buffer[3] !== 0;
  }

  public blendColors(other: RGBA): RGBA {
    const [selfR, selfG, selfB, selfA] = this.buffer;
    const [otherR, otherG, otherB, otherA] = other.buffer;

    if (selfA === 1.0) {
      return this;
    }

    const alpha = selfA;

    let perceptualAlpha: number;

    if (alpha > 0.8) {
      const normalizedHighAlpha = (alpha - 0.8) * 5.0;
      const curvedHighAlpha = Math.pow(normalizedHighAlpha, 0.2);
      perceptualAlpha = 0.8 + curvedHighAlpha * 0.2;
    } else {
      perceptualAlpha = Math.pow(alpha, 0.9);
    }

    const r = selfR * perceptualAlpha + otherR * (1 - perceptualAlpha);
    const g = selfG * perceptualAlpha + otherG * (1 - perceptualAlpha);
    const b = selfB * perceptualAlpha + otherB * (1 - perceptualAlpha);

    const buffer = new Float32Array([r, g, b, otherA]);

    return RGBA.fromArray(buffer);
  }

  map<R>(fn: (value: number) => R) {
    return [fn(this.r), fn(this.g), fn(this.b), fn(this.a)];
  }

  toString() {
    return `rgba(${this.r.toFixed(2)}, ${this.g.toFixed(2)}, ${this.b.toFixed(2)}, ${this.a.toFixed(2)})`;
  }
}

export class RGBAv2 extends Effect.Service<RGBAv2>()("@opentuee/rgb-v2", {
  accessors: true,
  scoped: Effect.fn(function* (buffer: Float32Array) {
    const buf = yield* Ref.make(buffer);
    const r = yield* Ref.make(buffer[0]!);
    const g = yield* Ref.make(buffer[1]!);
    const b = yield* Ref.make(buffer[2]!);
    const a = yield* Ref.make<number | null>(buffer[3] ?? null);

    const getR = Effect.fn(function* () {
      return yield* Ref.get(r);
    });
    const getG = Effect.fn(function* () {
      return yield* Ref.get(g);
    });
    const getB = Effect.fn(function* () {
      return yield* Ref.get(b);
    });
    const getA = Effect.fn(function* () {
      return yield* Ref.get(a);
    });

    const setR = Effect.fn(function* (value: number) {
      yield* Ref.set(r, value);
    });
    const setG = Effect.fn(function* (value: number) {
      yield* Ref.set(g, value);
    });
    const setB = Effect.fn(function* (value: number) {
      yield* Ref.set(b, value);
    });
    const setA = Effect.fn(function* (value: number) {
      yield* Ref.set(a, value);
    });

    const hasAlpha = Effect.fn(function* () {
      const _a = yield* Ref.get(a);
      if (_a === 0) {
        return false;
      }
      return true;
    });

    const getBuffer = Effect.fn(function* () {
      return yield* Ref.get(buf);
    });

    const setBuffer = Effect.fn(function* (value: Float32Array) {
      yield* Ref.set(buf, value);
      yield* Ref.set(r, value[0]!);
      yield* Ref.set(g, value[1]!);
      yield* Ref.set(b, value[2]!);
      yield* Ref.set(a, value[3] ?? null);
    });

    const blendWith: (other: RGBAv2) => Effect.Effect<void> = Effect.fn(function* (other: RGBAv2) {
      const [selfR, selfG, selfB, selfA] = yield* getBuffer();
      const [otherR, otherG, otherB, otherA] = yield* Effect.suspend(() => other.getBuffer());

      if (selfA === 1.0) {
        return;
      }

      const alpha = selfA;

      let perceptualAlpha: number;

      if (alpha > 0.8) {
        const normalizedHighAlpha = (alpha - 0.8) * 5.0;
        const curvedHighAlpha = Math.pow(normalizedHighAlpha, 0.2);
        perceptualAlpha = 0.8 + curvedHighAlpha * 0.2;
      } else {
        perceptualAlpha = Math.pow(alpha, 0.9);
      }

      const r = selfR * perceptualAlpha + otherR * (1 - perceptualAlpha);
      const g = selfG * perceptualAlpha + otherG * (1 - perceptualAlpha);
      const b = selfB * perceptualAlpha + otherB * (1 - perceptualAlpha);

      const buffer = new Float32Array([r, g, b, otherA]);

      yield* setBuffer(buffer);
    });

    return {
      getBuffer,
      setBuffer,
      blendWith,
      getR,
      getG,
      getB,
      getA,
      setR,
      setG,
      setB,
      setA,
      hasAlpha,
    } as const;
  }),
}) {}

export const RGBAv2Live = RGBAv2.Default;
