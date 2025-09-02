import { Effect, Ref } from "effect";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { MouseEvent } from "../../events/mouse";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import type { Binds, ElementOptions } from "./utils";

export interface ButtonElement<BT extends string = "button"> extends BaseElement<"button", ButtonElement<BT>> {
  setText: (text: string) => Effect.Effect<void, Collection, Library>;
  getText: () => Effect.Effect<string, Collection, Library>;
  onClick: () => Effect.Effect<void, Collection, Library>;
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
  onClick?: () => Effect.Effect<void, Collection, Library>;
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
      yield* Ref.set(isPressed, true);
      yield* Ref.set(isHovered, true);
    } else if (event.type === "up") {
      const wasPressed = yield* Ref.get(isPressed);
      if (wasPressed && isInside) {
        yield* onClick();
      }
      yield* Ref.set(isPressed, false);
    } else if (event.type === "move") {
      yield* Ref.set(isHovered, isInside);
    }
  });

  // Setters/getters
  const setText = Effect.fn(function* (text: string) {
    yield* Ref.set(buttonText, text);
  });

  const getText = Effect.fn(function* () {
    return yield* Ref.get(buttonText);
  });

  const onClick = Effect.fn(function* () {
    const fn = options.onClick ?? Effect.fn(function* () {});
    yield* fn();
  });

  const onUpdate = Effect.fn(function* (_self) {
    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, b.num);
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
    render,
    setText,
    getText,
    destroy,
  };
});
