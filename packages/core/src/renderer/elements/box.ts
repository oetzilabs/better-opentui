import { Effect, Ref } from "effect";
import { Edge } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, type Input } from "../../colors";
import type { Collection } from "../../errors";
import { isMouseDown, isMouseDrag, isMouseUp } from "../../inputs/mouse";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import {
  borderCharsToArray,
  getBorderSides,
  type BorderCharacters,
  type BorderSides,
  type BorderStyle,
} from "../utils/border";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions } from "./utils";

export interface BoxOptions extends ElementOptions<"box", BoxElement> {
  borderStyle?: BorderStyle;
  border?: boolean | BorderSides[];
  borderColor?: Input;
  customBorderChars?: BorderCharacters;
  shouldFill?: boolean;
  title?: string;
  titleAlignment?: "left" | "center" | "right";
  focusedBorderColor?: Input;
}

export interface BoxElement extends BaseElement<"box", BoxElement> {
  setBorder: (value: boolean | BorderSides[]) => Effect.Effect<void, Collection, Library>;
  setBorderStyle: (value: BorderStyle) => Effect.Effect<void, Collection, Library>;
  setBorderColor: (value: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setFocusedBorderColor: (value: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setTitle: (value: string | undefined) => Effect.Effect<void, Collection, Library>;
  setTitleAlignment: (value: "left" | "center" | "right") => Effect.Effect<void, Collection, Library>;
}

export const box = Effect.fn(function* (binds: Binds, options: BoxOptions = {}) {
  // const lib = yield* Library;
  const b = yield* base<"box", BoxElement>("box", options);

  b.onMouseEvent = Effect.fn("box.onMouseEvent")(function* (event) {
    const fn = options.onMouseEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (event.source) {
      if (event.source.id === b.id) {
        if (isMouseDown(event.type) || isMouseDrag(event.type) || isMouseUp(event.type)) {
          yield* event.source.setFocused(true);
        } else {
          yield* event.source.setFocused(false);
        }
      }
    }
  });

  const border = yield* Ref.make<boolean | BorderSides[]>(options.border ?? true);
  const borderStyle = yield* Ref.make<BorderStyle>(options.borderStyle || "single");
  const borderColor = yield* Ref.make(options.borderColor ?? Colors.White);
  const focusedBorderColor = yield* Ref.make(options.focusedBorderColor ?? Colors.Custom("#00AAFF"));
  const customBorderChars = yield* Ref.make<Uint32Array | undefined>(
    options.customBorderChars ? yield* borderCharsToArray(options.customBorderChars) : undefined,
  );
  const borderSides = yield* Ref.make(getBorderSides(options.border ?? true));
  const shouldFill = yield* Ref.make(options.shouldFill ?? true);
  const title = yield* Ref.make(options.title);
  const plainTitle = yield* Ref.make(options.title);
  const titleAlignment = yield* Ref.make<"left" | "center" | "right">(options.titleAlignment || "left");

  // helper to apply yoga borders when border changes
  const applyYogaBorders = Effect.fn(function* () {
    const sides = yield* Ref.get(borderSides);
    const node = b.layoutNode.yogaNode;
    node.setBorder(Edge.Left, sides.left ? 1 : 0);
    node.setBorder(Edge.Right, sides.right ? 1 : 0);
    node.setBorder(Edge.Top, sides.top ? 1 : 0);
    node.setBorder(Edge.Bottom, sides.bottom ? 1 : 0);
  });
  yield* applyYogaBorders();

  const setBorder = Effect.fn(function* (value: boolean | BorderSides[]) {
    yield* Ref.set(border, value);
    yield* Ref.set(borderSides, getBorderSides(value));
    yield* applyYogaBorders();
  });

  const setBorderStyle = Effect.fn(function* (value: BorderStyle) {
    yield* Ref.set(borderStyle, value);
    yield* Ref.set(customBorderChars, undefined);
  });

  const setBorderColor = Effect.fn(function* (value: ((oldColor: Input) => Input) | Input) {
    if (typeof value === "function") {
      yield* Ref.update(borderColor, (c) => value(c));
    } else {
      yield* Ref.update(borderColor, (c) => value);
    }
  });

  const setFocusedBorderColor = Effect.fn(function* (value: ((oldColor: Input) => Input) | Input) {
    if (typeof value === "function") {
      yield* Ref.update(focusedBorderColor, (c) => value(c));
    } else {
      yield* Ref.update(focusedBorderColor, (c) => value);
    }
  });

  const setTitle = Effect.fn(function* (value: string | undefined) {
    yield* Ref.set(title, value);
  });

  const setTitleAlignment = Effect.fn(function* (value: "left" | "center" | "right") {
    yield* Ref.set(titleAlignment, value);
  });

  b.onUpdate = Effect.fn("box.update")(function* () {
    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, b.num);

    const f = yield* Ref.get(b.focused);
    const pt = yield* Ref.get(plainTitle);
    yield* Effect.annotateCurrentSpan("box.update", { f, pt });
    if (pt) {
      yield* setTitle(f ? `${pt} (Focused)` : `${pt} (Not Focused)`);
    }
  });

  b.onMouseEvent = Effect.fn("box.onMouseEvent")(function* (event) {
    yield* Effect.annotateCurrentSpan("box.onMouseEvent", event);
    const fn: BaseElement<"box", BoxElement>["onMouseEvent"] = options.onMouseEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (event.source) {
      if (event.source.id === b.id) {
        if (isMouseDown(event.type) || isMouseDrag(event.type) || isMouseUp(event.type)) {
          yield* event.source.setFocused(true);
        } else {
          yield* event.source.setFocused(false);
        }
      }
    }
  });

  b.render = Effect.fn("box.render")(function* (buffer: OptimizedBuffer, _dt: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;

    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const colors = yield* Ref.get(b.colors);

    const br = yield* Ref.get(border);
    const bs = yield* Ref.get(borderStyle);
    const brc = yield* Ref.get(borderColor);
    const fbrc = yield* Ref.get(focusedBorderColor);
    const cb = yield* Ref.get(customBorderChars);
    const sf = yield* Ref.get(shouldFill);
    const t = yield* Ref.get(title);
    const ta = yield* Ref.get(titleAlignment);

    const fc = yield* Ref.get(b.focused);

    const bgC = yield* parseColor(colors.bg);
    const brcC = yield* parseColor(brc);
    const fbrcC = yield* parseColor(fbrc);

    const currentBorderColor = !fc ? brcC : fbrcC;

    yield* buffer.drawBox({
      x: loc.x,
      y: loc.y,
      width: w,
      height: h,
      borderStyle: bs,
      customBorderChars: cb,
      border: br,
      borderColor: currentBorderColor,
      backgroundColor: bgC,
      shouldFill: sf,
      title: t,
      titleAlignment: ta!,
    });
  });

  const empty = Effect.fn(function* () {
    // remove all children
    yield* Ref.set(b.renderables, []);
  });

  return {
    ...b,
    setBorder,
    setBorderStyle,
    setBorderColor,
    setFocusedBorderColor,
    setTitle,
    setTitleAlignment,
    empty,
  };
});
