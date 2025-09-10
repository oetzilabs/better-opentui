import { Effect, Ref } from "effect";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, type Input } from "../../colors";
import { parseColor } from "../../colors/utils";
import type { Collection } from "../../errors";
import type { MouseEvent } from "../../events/mouse";
import { Library } from "../../lib";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import type { Binds, ElementOptions } from "./utils";

export interface ButtonElement<BT extends string = "button"> extends BaseElement<"button", ButtonElement<BT>> {
  setText: (text: string) => Effect.Effect<void, Collection, Library>;
  getText: () => Effect.Effect<string, Collection, Library>;
  onClick: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onHover: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onBlur: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onFocus: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onPress: (event?: MouseEvent) => Effect.Effect<void, Collection, Library>;
}

export type ButtonOptions<BT extends string = "button"> = ElementOptions<BT, ButtonElement<BT>> & {
  colors?: FrameBufferOptions<ButtonElement<BT>>["colors"] & {
    bg?: Input;
    fg?: Input;
    hoverBg?: Input;
    hoverFg?: Input;
    pressedBg?: Input;
    pressedFg?: Input;
  };
  text?: string;
  onClick?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onHover?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onBlur?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onFocus?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onPress?: (event?: MouseEvent) => Effect.Effect<void, Collection, Library>;
  padding?: number;
};

const DEFAULTS = {
  colors: {
    bg: Colors.Custom("#444444"),
    fg: Colors.White,
    hoverBg: Colors.Custom("#666666"),
    hoverFg: Colors.White,
    pressedBg: Colors.Custom("#222222"),
    pressedFg: Colors.White,
  },
  text: "Button",
  padding: 1,
} satisfies ButtonOptions;

export const button = Effect.fn(function* <BT extends string = "button">(
  binds: Binds,
  options: ButtonOptions<BT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  const b = yield* base<"button", ButtonElement<BT>>(
    "button",
    binds,
    {
      ...options,
      position: PositionRelative.make(1),
      selectable: true,
      height: options.height ?? 1,
      width: options.width ?? (options.text ?? DEFAULTS.text).length + (options.padding ?? DEFAULTS.padding) * 2,
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
        focusedBg: options.colors?.hoverBg ?? DEFAULTS.colors.hoverBg,
        focusedFg: options.colors?.hoverFg ?? DEFAULTS.colors.hoverFg,
      },
    },
    parentElement,
  );

  const framebuffer_buffer = yield* b.createFrameBuffer();

  const buttonText = yield* Ref.make(options.text ?? DEFAULTS.text);
  const isPressed = yield* Ref.make(false);
  const isHovered = yield* Ref.make(false);

  const hoverBg = yield* Ref.make(options.colors?.hoverBg ?? DEFAULTS.colors.hoverBg);
  const hoverFg = yield* Ref.make(options.colors?.hoverFg ?? DEFAULTS.colors.hoverFg);
  const pressedBg = yield* Ref.make(options.colors?.pressedBg ?? DEFAULTS.colors.pressedBg);
  const pressedFg = yield* Ref.make(options.colors?.pressedFg ?? DEFAULTS.colors.pressedFg);

  const previousFocused = yield* Ref.make(false);
  const previousPressed = yield* Ref.make(false);
  const pressStartTime = yield* Ref.make(0);
  const holdDelay = 500; // ms

  // Rendering
  const render = Effect.fn(function* (buffer: OptimizedBuffer, _dt: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;

    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const focused = yield* Ref.get(b.focused);
    const colors = yield* Ref.get(b.colors);
    const pressed = yield* Ref.get(isPressed);
    const hovered = yield* Ref.get(isHovered);

    let bgColor: Input;
    let fgColor: Input;

    if (pressed) {
      bgColor = yield* Ref.get(pressedBg);
      fgColor = yield* Ref.get(pressedFg);
    } else if (hovered || focused) {
      bgColor = yield* Ref.get(hoverBg);
      fgColor = yield* Ref.get(hoverFg);
    } else {
      bgColor = colors.bg;
      fgColor = colors.fg;
    }

    const parsedBg = yield* parseColor(bgColor);
    const parsedFg = yield* parseColor(fgColor);

    yield* framebuffer_buffer.clear(parsedBg);

    const text = yield* Ref.get(buttonText);
    const textX = Math.floor((w - text.length) / 2);
    const textY = Math.floor(h / 2);

    yield* framebuffer_buffer.drawText(text, textX, textY, parsedFg);

    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
  });

  // Mouse event handling
  const onMouseEvent = Effect.fn(function* (event: MouseEvent) {
    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);

    const localX = event.x - loc.x;
    const localY = event.y - loc.y;
    const isInside = localX >= 0 && localX < w && localY >= 0 && localY < h;

    if (event.type === "down" && isInside) {
      const currentPressed = yield* Ref.get(isPressed);
      yield* Ref.set(previousPressed, currentPressed);
      yield* Ref.set(isPressed, true);
      yield* Ref.set(isHovered, true);
      yield* Ref.set(pressStartTime, Date.now());
      yield* onFocus(event);
    } else if (event.type === "up") {
      const wasPressed = yield* Ref.get(isPressed);
      yield* Ref.set(previousPressed, wasPressed);
      if (wasPressed && isInside) {
        yield* onClick(event);
      }
      yield* Ref.set(isPressed, false);
      yield* Ref.set(pressStartTime, 0);
    } else if (event.type === "move") {
      if (isInside) yield* onHover(event);
      yield* Ref.set(isHovered, isInside);
    } else {
      yield* onBlur(event);
    }
  });

  // Setters/getters
  const setText = Effect.fn(function* (text: string) {
    yield* Ref.set(buttonText, text);
  });

  const getText = Effect.fn(function* () {
    return yield* Ref.get(buttonText);
  });

  const onHover = Effect.fn(function* (event: MouseEvent) {
    const fn = options.onHover ?? Effect.fn(function* (event: MouseEvent) {});
    yield* fn(event);
    yield* Ref.set(isHovered, true);
  });

  const onBlur = Effect.fn(function* (event: MouseEvent) {
    const currentFocused = yield* Ref.get(b.focused);
    yield* Ref.set(previousFocused, currentFocused);
    const fn = options.onBlur ?? Effect.fn(function* (event: MouseEvent) {});
    yield* fn(event);
    yield* Ref.set(b.focused, false);
    yield* Ref.set(isHovered, false);
  });

  const onPress = Effect.fn(function* (event?: MouseEvent) {
    const currentPressed = yield* Ref.get(isPressed);
    yield* Ref.set(previousPressed, currentPressed);
    const fn = options.onPress ?? Effect.fn(function* (_event?: MouseEvent) {});
    yield* fn(event);
    yield* Ref.set(isPressed, true);
    yield* Ref.set(isHovered, true);
  });

  const onFocus = Effect.fn(function* (event: MouseEvent) {
    const currentFocused = yield* Ref.get(b.focused);
    yield* Ref.set(previousFocused, currentFocused);
    const fn = options.onFocus ?? Effect.fn(function* (event: MouseEvent) {});
    yield* fn(event);
    yield* Ref.set(b.focused, true);
    yield* Ref.set(isHovered, true);
  });

  const onClick = Effect.fn(function* (event: MouseEvent) {
    const fn = options.onClick ?? Effect.fn(function* (event: MouseEvent) {});
    yield* fn(event);
  });

  const onUpdate = Effect.fn(function* (_self: ButtonElement) {
    const fn = options.onUpdate ?? Effect.fn(function* (_self: ButtonElement) {});
    yield* fn(_self);
    // set dimensions of the button based on the text
    const text = yield* Ref.get(buttonText);
    const textWidth = text.length + (options.padding ?? DEFAULTS.padding) * 2;
    const textHeight = 1;
    yield* framebuffer_buffer.resize(textWidth, textHeight);
    yield* Ref.update(b.dimensions, (bd) => ({
      ...bd,
      width: textWidth,
      widthValue: textWidth,
      height: textHeight,
      heightValue: textHeight,
    }));

    const pressed = yield* Ref.get(isPressed);
    const startTime = yield* Ref.get(pressStartTime);
    if (pressed && startTime > 0 && Date.now() - startTime > holdDelay) {
      yield* onPress();
    }
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* b.destroy();
  });

  return {
    ...b,
    onMouseEvent,
    onUpdate,
    onClick,
    onHover,
    onBlur,
    onFocus,
    onPress,
    render,
    setText,
    getText,
    destroy,
  };
});
