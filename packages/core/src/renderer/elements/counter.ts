import type { FileSystem, Path } from "@effect/platform";
import { Effect, Ref } from "effect";
import { MeasureMode } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { TextBuffer, TextChunkSchema } from "../../buffer/text";
import { Colors, Input } from "../../colors";
import { parseColor } from "../../colors/utils";
import type { Collection } from "../../errors";
import { Library } from "../../lib";
import { isPositionAbsolute, PositionRelative } from "../utils/position";
import { StyledText } from "../utils/styled-text";
import { base, type BaseElement } from "./base";
import { type Binds, type ElementOptions } from "./utils";

export interface CounterElement extends BaseElement<"counter", CounterElement> {
  increment: () => Effect.Effect<void, Collection, Library>;
  decrement: () => Effect.Effect<void, Collection, Library>;
  getValue: () => Effect.Effect<number, Collection, Library>;
  setValue: (value: number) => Effect.Effect<void, Collection, Library>;
}

export type CounterOptions = ElementOptions<"counter", CounterElement> & {
  initialValue?: number;
};

const DEFAULTS = {
  width: "auto",
  height: 1,
  position: PositionRelative.make(1),
  initialValue: 0,
} satisfies CounterOptions;

export const counter = Effect.fn(function* (
  binds: Binds,
  initialValue: number,
  options: CounterOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;

  const value = initialValue ?? DEFAULTS.initialValue;
  const valueString = value.toString();
  const contentWidth = valueString.length;

  const b = yield* base(
    "counter",
    binds,
    {
      ...options,
      position: options.position ?? DEFAULTS.position,
      width: (options.width ?? DEFAULTS.width) === "auto" ? contentWidth : options.width,
      height: options.height ?? DEFAULTS.height,
      ...(options.colors ? { colors: options.colors } : {}),
    },
    parentElement,
  );

  const _value = yield* Ref.make(value);

  const capacity = 32 as const;
  const { widthMethod } = yield* Ref.get(binds.context);

  const tbp = yield* lib.createTextBufferPointer(capacity, widthMethod);
  const textBuffer = new TextBuffer(tbp, capacity);

  const updateDisplay = Effect.fn(function* () {
    const currentValue = yield* Ref.get(_value);
    const valueString = currentValue.toString();
    const textEncoder = new TextEncoder();
    const chunk = TextChunkSchema.make({
      __isChunk: true as const,
      text: textEncoder.encode(valueString),
      plainText: valueString,
    });
    const st = new StyledText([chunk]);
    yield* textBuffer.setStyledText(st);

    // Update dimensions
    const newWidth = valueString.length;
    yield* Ref.update(b.dimensions, (d) => ({
      ...d,
      widthValue: newWidth,
      width: newWidth,
    }));
  });

  yield* updateDisplay();

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;
    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const clipRect = {
      x: loc.x,
      y: loc.y,
      width: w,
      height: h,
    };
    yield* lib.bufferDrawTextBuffer(buffer.ptr, textBuffer.ptr, loc.x, loc.y, clipRect);
  });

  const increment = Effect.fn(function* () {
    yield* Ref.update(_value, (v) => v + 1);
    yield* updateDisplay();
  });

  const decrement = Effect.fn(function* () {
    yield* Ref.update(_value, (v) => v - 1);
    yield* updateDisplay();
  });

  const getValue = Effect.fn(function* () {
    return yield* Ref.get(_value);
  });

  const setValue = Effect.fn(function* (newValue: number) {
    yield* Ref.set(_value, newValue);
    yield* updateDisplay();
  });

  const destroy = Effect.fn(function* () {
    yield* textBuffer.destroy();
    yield* b.destroy();
  });

  const toString = Effect.fn(function* () {
    const currentValue = yield* Ref.get(_value);
    return currentValue.toString();
  });

  b.onUpdate = Effect.fn(function* (self) {
    const c = yield* Ref.get(b.colors);
    const bgC = yield* parseColor(c.bg);
    yield* textBuffer.setDefaultBg(bgC);

    const fgC = yield* parseColor(c.fg);
    yield* textBuffer.setDefaultFg(fgC);
  });

  return {
    ...b,
    render,
    destroy,
    toString,
    increment,
    decrement,
    getValue,
    setValue,
  } satisfies CounterElement;
});
