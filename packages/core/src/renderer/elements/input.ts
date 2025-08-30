import { Effect, Match, Ref } from "effect";
import type { OptimizedBuffer } from "../../buffer/optimized";
// import { CliRenderer } from "../../cli";
import { Colors, Input } from "../../colors";
import { Block } from "../../cursor-style";
import type { Collection } from "../../errors";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import type { Binds, ElementOptions } from "./utils";

export interface InputElement extends BaseElement<"input", InputElement> {
  setValue: (value: string) => Effect.Effect<void, Collection, Library>;
  getValue: () => Effect.Effect<string, Collection, Library>;
  setPlaceholder: (value: string) => Effect.Effect<void, Collection, Library>;
  setCursorPosition: (pos: number) => Effect.Effect<void, Collection, Library>;
  setMaxLength: (len: number) => Effect.Effect<void, Collection, Library>;
  setTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setPlaceholderColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setCursorColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library>;
  onUpdate: (self: InputElement) => Effect.Effect<void, Collection, Library>;
}

export type InputOptions = ElementOptions<"input", InputElement> & {
  colors: FrameBufferOptions<InputElement>["colors"] & {
    placeholderColor?: Input;
    cursorColor?: Input;
  };
  // width: number;
  // height: number;
  respectAlpha?: boolean;
  placeholder?: string;
  maxLength?: number;
  value?: string;
  onUpdate?: (self: InputElement) => Effect.Effect<void, Collection, Library>;
  validate?: (value: string) => boolean;
};

const DEFAULTS = {
  colors: {
    bg: Colors.Transparent,
    fg: Colors.White,
    selectableBg: Colors.Custom("#1a1a1a"),
    selectableFg: Colors.White,
    placeholderColor: Colors.Custom("#666666"),
    cursorColor: Colors.White,
    focusedBg: Colors.Custom("#1a1a1a"),
    focusedFg: Colors.White,
  },
  placeholder: "",
  maxLength: 1000,
  value: "",
};

export const input = Effect.fn(function* (
  binds: Binds,
  options: InputOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;
  const { cli } = yield* Ref.get(binds.context);
  const b = yield* base<"input", InputElement>(
    "input",
    binds,
    {
      ...options,
      selectable: true,
      width: options.width ?? "auto",
      height: options.height ?? "auto",
      colors: {
        ...options.colors,
        bg: options.colors.bg ?? DEFAULTS.colors.bg,
        fg: options.colors.fg ?? DEFAULTS.colors.fg,
        selectableBg: options.colors.selectableBg ?? DEFAULTS.colors.selectableBg,
        selectableFg: options.colors.selectableFg ?? DEFAULTS.colors.selectableFg,
        focusedBg: options.colors.focusedBg ?? DEFAULTS.colors.focusedBg,
        focusedFg: options.colors.focusedFg ?? DEFAULTS.colors.focusedFg,
      },
    },
    parentElement,
  );

  const framebuffer_buffer = yield* b.createFrameBuffer();

  const value = yield* Ref.make(options.value ?? DEFAULTS.value);
  const cursorPosition = yield* Ref.make((options.value ?? DEFAULTS.value).length);
  const placeholder = yield* Ref.make(options.placeholder ?? DEFAULTS.placeholder);
  const maxLength = yield* Ref.make(options.maxLength ?? DEFAULTS.maxLength);

  const placeholderColor = yield* Ref.make(options.colors.placeholderColor ?? DEFAULTS.colors.placeholderColor);
  const cursorColor = yield* Ref.make(options.colors.cursorColor ?? DEFAULTS.colors.cursorColor);

  const lastCommittedValue = yield* Ref.make(options.value ?? DEFAULTS.value);

  // Cursor rendering
  const updateCursorPosition = Effect.fn(function* () {
    const focused = yield* Ref.get(b.focused);
    if (!focused) return;
    const loc = yield* Ref.get(b.location);
    const { widthValue: w } = yield* Ref.get(b.dimensions);
    const curPos = yield* Ref.get(cursorPosition);

    const maxVisibleChars = w - 1;
    let displayStartIndex = 0;
    if (curPos >= maxVisibleChars) {
      displayStartIndex = curPos - maxVisibleChars + 1;
    }
    const cursorDisplayX = curPos - displayStartIndex;
    if (cursorDisplayX >= 0 && cursorDisplayX < w) {
      const absoluteCursorX = loc.x + cursorDisplayX + 1;
      const absoluteCursorY = loc.y + 1;
      const cc = yield* Ref.get(cursorColor);
      const parsedCC = yield* parseColor(cc);

      yield* lib.setCursorPosition(cli, absoluteCursorX, absoluteCursorY, true);
      yield* lib.setCursorColor(cli, parsedCC);
    }
  });

  b.setFocused = Effect.fn(function* (focused: boolean) {
    yield* Ref.set(b.focused, focused);
    if (focused) {
      const cc = yield* Ref.get(cursorColor);
      const parsedCC = yield* parseColor(cc);
      yield* lib.setCursorColor(cli, parsedCC);
      yield* lib.setCursorStyle(cli, Block.make("block"), true);
      yield* updateCursorPosition();
    } else {
      yield* lib.setCursorPosition(cli, 0, 0, false);
      const v = yield* Ref.get(value);
      const last = yield* Ref.get(lastCommittedValue);
      if (v !== last) {
        yield* Ref.set(lastCommittedValue, v);
        // emit change event here if needed
      }
    }
  });

  b.onResize = Effect.fn(function* (width: number, height: number) {
    yield* updateCursorPosition();
  });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, _dt: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;

    const loc = yield* Ref.get(b.location);
    const { widthValue: w } = yield* Ref.get(b.dimensions);
    const focused = yield* Ref.get(b.focused);
    const colors = yield* Ref.get(b.colors);
    const bgColor = yield* parseColor(focused ? colors.focusedBg : colors.bg);
    yield* framebuffer_buffer.clear(bgColor);
    const val = yield* Ref.get(value);
    const ph = yield* Ref.get(placeholder);
    const displayText = val || ph;
    const isPlaceholder = !val && !!ph;
    const baseTextColor = focused ? colors.focusedFg : colors.fg;
    const phc = yield* Ref.get(placeholderColor);
    const textColorParsed = yield* parseColor(isPlaceholder ? phc : baseTextColor);

    const maxVisibleChars = w - 1;
    const curPos = yield* Ref.get(cursorPosition);
    let displayStartIndex = 0;
    if (curPos >= maxVisibleChars) {
      displayStartIndex = curPos - maxVisibleChars + 1;
    }
    const visibleText = displayText.substring(displayStartIndex, displayStartIndex + maxVisibleChars);

    // yield* b.render(buffer, _dt);

    if (visibleText) {
      yield* framebuffer_buffer.drawText(visibleText, 0, 0, textColorParsed);
    }
    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
  });

  // Setters/getters
  const setValue = Effect.fn(function* (val: string) {
    const maxLen = yield* Ref.get(maxLength);
    const newValue = val.substring(0, maxLen);
    yield* Ref.set(value, newValue);
    yield* Ref.update(cursorPosition, (pos) => Math.min(pos, newValue.length));
    yield* updateCursorPosition();
    // emit input event here if needed
  });

  const getValue = Effect.fn(function* () {
    return yield* Ref.get(value);
  });

  const setPlaceholder = Effect.fn(function* (val: string) {
    yield* Ref.set(placeholder, val);
  });

  const setCursorPosition = Effect.fn(function* (pos: number) {
    const v = yield* Ref.get(value);
    const newPos = Math.max(0, Math.min(pos, v.length));
    yield* Ref.set(cursorPosition, newPos);
    yield* updateCursorPosition();
  });

  const setMaxLength = Effect.fn(function* (len: number) {
    yield* Ref.set(maxLength, len);
    const v = yield* Ref.get(value);
    if (v.length > len) {
      yield* Ref.set(value, v.substring(0, len));
    }
  });

  const setTextColor = b.setForegroundColor;

  const setPlaceholderColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(placeholderColor, (c) => color(c));
    } else {
      yield* Ref.set(placeholderColor, color);
    }
  });

  const setCursorColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(cursorColor, (c) => color(c));
    } else {
      yield* Ref.set(cursorColor, color);
    }
  });

  // Key handling
  const insertText = Effect.fn(function* (text: string) {
    const v = yield* Ref.get(value);
    const curPos = yield* Ref.get(cursorPosition);
    const maxLen = yield* Ref.get(maxLength);
    if (v.length + text.length > maxLen) return;
    const beforeCursor = v.substring(0, curPos);
    const afterCursor = v.substring(curPos);
    const newValue = beforeCursor + text + afterCursor;
    yield* Ref.set(value, newValue);
    yield* Ref.set(cursorPosition, curPos + text.length);
    yield* updateCursorPosition();
    // emit input event here if needed
  });

  const deleteCharacter = Effect.fn(function* (direction: "backward" | "forward") {
    const v = yield* Ref.get(value);
    const curPos = yield* Ref.get(cursorPosition);
    if (direction === "backward" && curPos > 0) {
      const beforeCursor = v.substring(0, curPos - 1);
      const afterCursor = v.substring(curPos);
      const newValue = beforeCursor + afterCursor;
      yield* Ref.set(value, newValue);
      yield* Ref.set(cursorPosition, curPos - 1);
      yield* updateCursorPosition();
      // emit input event here if needed
    } else if (direction === "forward" && curPos < v.length) {
      const beforeCursor = v.substring(0, curPos);
      const afterCursor = v.substring(curPos + 1);
      const newValue = beforeCursor + afterCursor;
      yield* Ref.set(value, newValue);
      yield* updateCursorPosition();
      // emit input event here if needed
    }
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const keySequence = typeof key === "string" ? key : key.sequence;

    return yield* Match.value(key.name).pipe(
      Match.when(
        "left",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          yield* setCursorPosition(cp - 1);
          return true;
        }),
      ),
      Match.when(
        "right",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          yield* setCursorPosition(cp + 1);
          return true;
        }),
      ),
      Match.when(
        "home",
        Effect.fn(function* () {
          yield* setCursorPosition(0);
          return true;
        }),
      ),
      Match.when(
        "end",
        Effect.fn(function* () {
          const v = yield* Ref.get(value);
          yield* setCursorPosition(v.length);
          return true;
        }),
      ),
      Match.when(
        "backspace",
        Effect.fn(function* () {
          yield* deleteCharacter("backward");
          return true;
        }),
      ),
      Match.when(
        "delete",
        Effect.fn(function* () {
          yield* deleteCharacter("forward");
          return true;
        }),
      ),
      Match.whenOr(
        "return",
        "enter",
        Effect.fn(function* () {
          const v = yield* Ref.get(value);
          const last = yield* Ref.get(lastCommittedValue);
          if (v !== last) {
            yield* Ref.set(lastCommittedValue, v);
            // emit change event here if needed
          }
          // emit enter event here if needed
          return true;
        }),
      ),
      Match.orElse(
        Effect.fn(function* () {
          if (
            keySequence &&
            keySequence.length === 1 &&
            keySequence.charCodeAt(0) >= 32 &&
            keySequence.charCodeAt(0) <= 126
          ) {
            yield* insertText(keySequence);
            return true;
          }
          return false;
        }),
      ),
    );
  });

  b.onResize = Effect.fn(function* (width: number, height: number) {
    yield* updateCursorPosition();
  });

  const onUpdate: InputElement["onUpdate"] = Effect.fn(function* (self) {
    const fn = options.onUpdate ?? Effect.fn(function* (self) {});
    yield* fn(self);
    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, b.num);

    const focused = yield* Ref.get(b.focused);
    if (focused) {
      yield* updateCursorPosition();
    }

    yield* b.updateFromLayout();
    yield* framebuffer_buffer.resize(w, h);
  });

  b.onKeyboardEvent = Effect.fn(function* (event) {
    const fn = options.onKeyboardEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    yield* handleKeyPress(event.parsedKey);
  });

  const destroy = Effect.fn(function* () {
    const focused = yield* Ref.get(b.focused);
    if (focused) {
      yield* lib.setCursorPosition(cli, 0, 0, false);
    }
    yield* framebuffer_buffer.destroy;
    yield* b.destroy();
  });

  return {
    ...b,
    onUpdate,
    render,
    setValue,
    getValue,
    setPlaceholder,
    setCursorPosition,
    setMaxLength,
    setTextColor,
    setPlaceholderColor,
    setCursorColor,
    handleKeyPress,
    destroy,
  } satisfies InputElement;
});
