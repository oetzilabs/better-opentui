import { Effect } from "effect";
import type { Input } from ".";
import { hexToRgb } from "./utils";

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
