import { Brand, Effect, Match, Schema } from "effect";
import { Collection, Custom, type Input } from ".";
import { CantParseHexColor } from "./errors";
import { RGBA } from "./rgba";

export const hexToRgb = Effect.fn(function* (hex: Input) {
  const isTransparent = hex === "transparent";
  if (isTransparent) {
    return RGBA.fromValues(0, 0, 0, 0);
  }
  let h = hex.toString().split("#")[1];

  if (h.length === 3) {
    const first = h[0];
    if (!first) {
      return yield* Effect.fail(
        new CantParseHexColor({
          hex: h,
        }),
      );
    }
    h = first + first + h[1] + h[1] + h[2] + h[2];
  }

  if (!/^[0-9A-Fa-f]{6}$/.test(h)) {
    // yield* Console.warn(`Invalid hex color: ${h}, defaulting to magenta`);
    return RGBA.fromValues(1, 0, 1, 1);
  }

  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;

  return RGBA.fromValues(r, g, b, 1);
});

export const rgbToHex = Effect.fn(function* (rgb: RGBA) {
  const [r, g, b, a] = rgb.toInts();
  return (
    "#" +
    [r, g, b]
      .map((x) => {
        const hex = Math.floor(Math.max(0, Math.min(1, x!) * 255)).toString(16);
        return hex.length === 1 ? "0" + hex : hex;
      })
      .join("")
  );
});
export const hsvToRgb = Effect.fn(function* (h: number, s: number, v: number) {
  const rgb = [0, 0, 0];

  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  const rx = Match.value(i).pipe(
    Match.when(0, () => [v, t, p] as const),
    Match.when(1, () => [q, v, p] as const),
    Match.when(2, () => [p, v, t] as const),
    Match.when(3, () => [p, q, v] as const),
    Match.when(4, () => [t, p, v] as const),
    Match.when(5, () => [v, p, q] as const),
    Match.orElse(() => [0, 0, 0] as [number, number, number]),
  );
  const [r, g, b] = rx;

  return RGBA.fromValues(r, g, b, 1);
});

export const parseColor = Effect.fn(function* (color: Input) {
  if (color === "transparent") {
    return RGBA.fromValues(0, 0, 0, 0);
  }
  const isCustom = Schema.is(Custom);
  if (isCustom(color)) {
    return yield* hexToRgb(color);
  }

  if (Object.hasOwn(Collection, color)) {
    const brand = Brand.nominal<Input>();
    const _color = brand(color);
    return yield* hexToRgb(_color);
  }

  return yield* hexToRgb(color);
});
