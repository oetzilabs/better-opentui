import os from "os";
import { Brand, Effect, Match, Schema } from "effect";
import { Collection, Custom, Input } from "./colors";
import { CantParseHexColor, UnsupportedArchitecture, UnsupportedPlatform } from "./errors";
import type { BorderSides } from "./renderer/utils/border";
import * as TextAttributes from "./textattributes";
import { RGBA, RGBAClass } from "./types";

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

export const rgbToHex = Effect.fn(function* (rgb: RGBAClass) {
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

  return RGBAClass.fromValues(r, g, b, 1);
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

export const createTextAttributes = Effect.fn(function* ({
  bold = false,
  italic = false,
  underline = false,
  dim = false,
  blink = false,
  inverse = false,
  hidden = false,
  strikethrough = false,
}: {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  dim?: boolean;
  blink?: boolean;
  inverse?: boolean;
  hidden?: boolean;
  strikethrough?: boolean;
} = {}) {
  let attributes: number = TextAttributes.None.make(0);

  if (bold) attributes |= TextAttributes.Bold.make(1);
  if (italic) attributes |= TextAttributes.Italic.make(4);
  if (underline) attributes |= TextAttributes.Underline.make(8);
  if (dim) attributes |= TextAttributes.Dim.make(2);
  if (blink) attributes |= TextAttributes.Blink.make(16);
  if (inverse) attributes |= TextAttributes.Inverse.make(32);
  if (hidden) attributes |= TextAttributes.Hidden.make(64);
  if (strikethrough) attributes |= TextAttributes.Strikethrough.make(128);

  return attributes;
});

const platforms = {
  darwin: "macos",
  win32: "windows",
  linux: "linux",
} as const;

const archs = {
  x64: "x86_64",
  arm64: "aarch64",
} as const;

export const getPlatformTarget = Effect.gen(function* () {
  const platform = os.platform();
  const arch = os.arch();

  if (Object.hasOwn(platforms, platform)) {
    const zigPlatform = platforms[platform as keyof typeof platforms];
    if (Object.hasOwn(archs, arch)) {
      const zigArch = archs[arch as keyof typeof archs];
      return `${zigArch}-${zigPlatform}` as const;
    } else {
      return yield* Effect.fail(new UnsupportedArchitecture({ arch }));
    }
  } else {
    return yield* Effect.fail(new UnsupportedPlatform({ platform }));
  }
});

// Pack drawing options into a single u32
// bits 0-3: borderSides, bit 4: shouldFill, bits 5-6: titleAlignment
export const packDrawOptions = Effect.fn(function* (
  border: boolean | BorderSides[],
  shouldFill: boolean,
  titleAlignment: "left" | "center" | "right",
) {
  let packed = 0;

  if (border === true) {
    packed |= 0b1111; // All sides
  } else if (Array.isArray(border)) {
    if (border.includes("top")) packed |= 0b1000;
    if (border.includes("right")) packed |= 0b0100;
    if (border.includes("bottom")) packed |= 0b0010;
    if (border.includes("left")) packed |= 0b0001;
  }

  if (shouldFill) {
    packed |= 1 << 4;
  }

  const alignmentMap: Record<string, number> = {
    left: 0,
    center: 1,
    right: 2,
  };
  const alignment = alignmentMap[titleAlignment];
  packed |= alignment << 5;

  return packed;
});
