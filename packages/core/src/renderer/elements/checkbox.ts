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

export interface CheckboxElement<BT extends string = "checkbox"> extends BaseElement<"checkbox", CheckboxElement<BT>> {
  setText: (text: string) => Effect.Effect<void, Collection, Library>;
  getText: () => Effect.Effect<string, Collection, Library>;
  setChecked: (checked: boolean) => Effect.Effect<void, Collection, Library>;
  getChecked: () => Effect.Effect<boolean, Collection, Library>;
  onClick: (event: MouseEvent & { checked: boolean }) => Effect.Effect<void, Collection, Library>;
  onHover: (event: MouseEvent & { checked: boolean }) => Effect.Effect<void, Collection, Library>;
  onBlur: (event: MouseEvent & { checked: boolean }) => Effect.Effect<void, Collection, Library>;
  onFocus: (event: MouseEvent & { checked: boolean }) => Effect.Effect<void, Collection, Library>;
  onPress: (event?: MouseEvent & { checked: boolean }) => Effect.Effect<void, Collection, Library>;
}

export type CheckboxOptions<BT extends string = "checkbox"> = ElementOptions<BT, CheckboxElement<BT>> & {
  colors?: FrameBufferOptions<CheckboxElement<BT>>["colors"] & {
    bg?: Input;
    fg?: Input;
    hoverBg?: Input;
    hoverFg?: Input;
    pressedBg?: Input;
    pressedFg?: Input;
  };
  text?: string;
  checked?: boolean;
  onClick?: (
    event: MouseEvent & {
      checked: boolean;
    },
  ) => Effect.Effect<void, Collection, Library>;
  onHover?: (
    event: MouseEvent & {
      checked: boolean;
    },
  ) => Effect.Effect<void, Collection, Library>;
  onBlur?: (
    event: MouseEvent & {
      checked: boolean;
    },
  ) => Effect.Effect<void, Collection, Library>;
  onFocus?: (
    event: MouseEvent & {
      checked: boolean;
    },
  ) => Effect.Effect<void, Collection, Library>;
  onPress?: (
    event?: MouseEvent & {
      checked: boolean;
    },
  ) => Effect.Effect<void, Collection, Library>;
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
  text: "Checkbox",
  checked: false,
  padding: 1,
} satisfies CheckboxOptions;

export const checkbox = Effect.fn(function* <BT extends string = "checkbox">(
  binds: Binds,
  options: CheckboxOptions<BT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  const b = yield* base<"checkbox", CheckboxElement<BT>>(
    "checkbox",
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

  const checkboxText = yield* Ref.make(options.text ?? DEFAULTS.text);
  const isChecked = yield* Ref.make(options.checked ?? DEFAULTS.checked);
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
    const checked = yield* Ref.get(isChecked);

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

    const text = yield* Ref.get(checkboxText);
    const checkboxSymbol = checked ? "[x]" : "[ ]";
    const fullText = `${checkboxSymbol} ${text}`;
    const textX = 0;
    const textY = Math.floor(h / 2);

    yield* framebuffer_buffer.drawText(fullText, textX, textY, parsedFg);

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
    yield* Ref.set(checkboxText, text);
  });

  const getText = Effect.fn(function* () {
    return yield* Ref.get(checkboxText);
  });

  const setChecked = Effect.fn(function* (checked: boolean) {
    yield* Ref.set(isChecked, checked);
  });

  const getChecked = Effect.fn(function* () {
    return yield* Ref.get(isChecked);
  });

  const onHover = Effect.fn(function* (event: MouseEvent) {
    const checked = yield* Ref.get(isChecked);
    const fn = options.onHover ?? Effect.fn(function* (event: MouseEvent & { checked: boolean }) {});
    yield* fn(Object.assign(event, { checked }));
    yield* Ref.set(isHovered, true);
  });

  const onBlur = Effect.fn(function* (event: MouseEvent) {
    const checked = yield* Ref.get(isChecked);
    const currentFocused = yield* Ref.get(b.focused);
    yield* Ref.set(previousFocused, currentFocused);
    const fn = options.onBlur ?? Effect.fn(function* (event: MouseEvent & { checked: boolean }) {});
    yield* fn(Object.assign(event, { checked }));
    yield* Ref.set(b.focused, false);
    yield* Ref.set(isHovered, false);
  });

  const onPress = Effect.fn(function* (event?: MouseEvent) {
    const checked = yield* Ref.get(isChecked);
    const currentPressed = yield* Ref.get(isPressed);
    yield* Ref.set(previousPressed, currentPressed);
    const fn = options.onPress ?? Effect.fn(function* (event?: MouseEvent & { checked: boolean }) {});
    if (event) {
      yield* fn(Object.assign(event, { checked }));
    } else {
      yield* fn();
    }
    yield* Ref.set(isPressed, true);
    yield* Ref.set(isHovered, true);
  });

  const onFocus = Effect.fn(function* (event: MouseEvent) {
    const checked = yield* Ref.get(isChecked);
    const currentFocused = yield* Ref.get(b.focused);
    yield* Ref.set(previousFocused, currentFocused);
    const fn = options.onFocus ?? Effect.fn(function* (event: MouseEvent & { checked: boolean }) {});
    yield* fn(Object.assign(event, { checked }));
    yield* Ref.set(b.focused, true);
    yield* Ref.set(isHovered, true);
  });

  const onClick = Effect.fn(function* (event: MouseEvent) {
    // Toggle checked state first
    const currentChecked = yield* Ref.get(isChecked);
    const newChecked = !currentChecked;
    yield* Ref.set(isChecked, newChecked);

    // Pass the NEW checked state to the event handler
    const fn = options.onClick ?? Effect.fn(function* (event: MouseEvent & { checked: boolean }) {});
    yield* fn(Object.assign(event, { checked: newChecked }));
  });

  const onUpdate = Effect.fn(function* (_self: CheckboxElement) {
    const fn = options.onUpdate ?? Effect.fn(function* (_self: CheckboxElement) {});
    yield* fn(_self);
    // set dimensions of the checkbox based on the text
    const text = yield* Ref.get(checkboxText);
    const fullText = `[ ] ${text}`;
    const textWidth = fullText.length + (options.padding ?? DEFAULTS.padding) * 2;
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
    setChecked,
    getChecked,
    destroy,
  };
});
