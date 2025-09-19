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
import type { Content } from "./types";
import { calculateContentDimensions, convertToElement, type Binds, type ElementOptions } from "./utils";

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
  content?: Content;
  onClick?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onHover?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onBlur?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onFocus?: (event: MouseEvent) => Effect.Effect<void, Collection, Library>;
  onPress?: (event?: MouseEvent) => Effect.Effect<void, Collection, Library>;
  padding?: number;
};

const DEFAULTS = {
  content: "Button",
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
      focusable: true,
      height: options.height ?? "auto",
      width: options.width ?? "auto",
      ...(options.colors ? { colors: options.colors } : {}),
    },
    parentElement,
  );

  const _content = yield* convertToElement(options.content ?? DEFAULTS.content, binds, b);
  let [contentWidth, contentHeight] = yield* calculateContentDimensions(_content);

  yield* Ref.update(b.dimensions, (bd) => ({
    ...bd,
    width: contentWidth + ((options.padding as number | undefined) ?? DEFAULTS.padding) * 2,
    widthValue: contentWidth + ((options.padding as number | undefined) ?? DEFAULTS.padding) * 2,
    height: contentHeight,
    heightValue: contentHeight,
  }));

  const padding = (options.padding as number | undefined) ?? DEFAULTS.padding;
  if (padding > 0) {
    yield* _content.setLocation({ x: padding, y: 0 });
  }

  const framebuffer_buffer = yield* b.createFrameBuffer();

  const buttonContent = yield* Ref.make(_content);
  const isPressed = yield* Ref.make(false);
  const isHovered = yield* Ref.make(false);

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
      bgColor = colors.pressedBg;
      fgColor = colors.pressedFg;
    } else if (hovered || focused) {
      bgColor = colors.hoverBg;
      fgColor = colors.hoverFg;
    } else {
      bgColor = colors.bg;
      fgColor = colors.fg;
    }

    const parsedBg = yield* parseColor(bgColor);
    const parsedFg = yield* parseColor(fgColor);

    yield* framebuffer_buffer.clear(parsedBg);

    // const rs = yield* Ref.get(b.renderables);
    // yield* Effect.all(
    //   rs.map((r) => r.doRender()(framebuffer_buffer, _dt)),
    //   { concurrency: "unbounded" },
    // );

    const content = yield* Ref.get(buttonContent);
    yield* content.doRender()(framebuffer_buffer, _dt);

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
    event.preventDefault();
  });

  // Setters/getters
  const setContent = Effect.fn(function* (content: Content) {
    const converted = yield* convertToElement(content, binds, b);
    yield* Ref.set(buttonContent, converted);
    yield* Ref.set(b.renderables, [converted]);
  });

  const getContent = Effect.fn(function* () {
    return yield* Ref.get(buttonContent);
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
    // const rs = yield* Ref.get(b.renderables);
    // yield* Effect.all(
    //   rs.map((r) => r.update()),
    //   { concurrency: "unbounded" },
    // );

    const padding = options.padding ?? DEFAULTS.padding;
    const bc = yield* Ref.get(buttonContent);
    yield* bc.update();
    const [textWidth, textHeight] = yield* calculateContentDimensions(bc);
    const fbWidth = textWidth + padding * 2;
    const fbHeight = textHeight;
    yield* framebuffer_buffer.resize(fbWidth, fbHeight);
    yield* Ref.update(b.dimensions, (bd) => ({
      ...bd,
      width: fbWidth,
      widthValue: fbWidth,
      height: fbHeight,
      heightValue: fbHeight,
    }));
    yield* b.layoutNode.setWidth(fbWidth);
    yield* b.layoutNode.setHeight(fbHeight);

    if (padding > 0) {
      yield* bc.setLocation({ x: padding, y: 0 });
    }

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
    setText: setContent,
    getText: getContent,
    destroy,
  };
});
