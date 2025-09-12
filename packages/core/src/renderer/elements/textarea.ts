import type { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Ref } from "effect";
import type { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, type Input } from "../../colors";
import { parseColor } from "../../colors/utils";
import { Block } from "../../cursor-style";
import type { Collection } from "../../errors";
import type { ParsedKey } from "../../inputs/keyboard";
import { Library } from "../../lib";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import type { Binds, ElementOptions } from "./utils";

export interface TextareaElement extends BaseElement<"textarea", TextareaElement> {
  setValue: (value: string) => Effect.Effect<void, Collection, Library>;
  getValue: () => Effect.Effect<string, Collection, Library>;
  setPlaceholder: (value: string) => Effect.Effect<void, Collection, Library>;
  setCursorPosition: (row: number, col: number) => Effect.Effect<void, Collection, Library>;
  setMaxLength: (len: number) => Effect.Effect<void, Collection, Library>;
  setTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setPlaceholderColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setCursorColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library>;
  onUpdate: (self: TextareaElement) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onChange: (text: string) => Effect.Effect<void, Collection, Library>;
}

export type TextareaOptions = ElementOptions<"textarea", TextareaElement> & {
  colors: FrameBufferOptions<TextareaElement>["colors"] & {
    placeholderColor?: Input;
    cursorColor?: Input;
  };
  respectAlpha?: boolean;
  placeholder?: string;
  maxLength?: number;
  value?: string;
  autoHeight?: boolean;
  onUpdate?: (self: TextareaElement) => Effect.Effect<void, Collection, Library>;
  onChange?: (text: string) => Effect.Effect<void, Collection, Library>;
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
  maxLength: 10000,
  value: "",
  autoHeight: false,
};

export const textarea = Effect.fn(function* (
  binds: Binds,
  options: TextareaOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;
  const { cli } = yield* Ref.get(binds.context);

  const lastValue = yield* Ref.make(options.value ?? DEFAULTS.value);

  const b = yield* base<"textarea", TextareaElement>(
    "textarea",
    binds,
    {
      ...options,
      selectable: true,
      width: options.width ?? "auto",
      height: options.height ?? (options.autoHeight ? "auto" : 5),
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
  const cursorPosition = yield* Ref.make({ row: 0, col: 0 });
  const placeholder = yield* Ref.make(options.placeholder ?? DEFAULTS.placeholder);
  const maxLength = yield* Ref.make(options.maxLength ?? DEFAULTS.maxLength);
  const autoHeight = yield* Ref.make(options.autoHeight ?? DEFAULTS.autoHeight);

  const placeholderColor = yield* Ref.make(options.colors.placeholderColor ?? DEFAULTS.colors.placeholderColor);
  const cursorColor = yield* Ref.make(options.colors.cursorColor ?? DEFAULTS.colors.cursorColor);

  const lastCommittedValue = yield* Ref.make(options.value ?? DEFAULTS.value);

  // Helper functions
  const getLines = Effect.fn(function* () {
    const v = yield* Ref.get(value);
    return v.split("\n");
  });

  const getLineCount = Effect.fn(function* () {
    const lines = yield* getLines();
    return lines.length;
  });

  const updateCursorPosition = Effect.fn(function* () {
    const focused = yield* Ref.get(b.focused);
    if (!focused) return;
    const loc = yield* Ref.get(b.location);
    const { widthValue: w } = yield* Ref.get(b.dimensions);
    const curPos = yield* Ref.get(cursorPosition);
    const lines = yield* getLines();

    if (curPos.row >= lines.length) return;

    const line = lines[curPos.row];
    const cursorCol = Math.min(curPos.col, line.length);

    const absoluteCursorX = loc.x + cursorCol + 1;
    const absoluteCursorY = loc.y + curPos.row + 1;

    const cc = yield* Ref.get(cursorColor);
    const parsedCC = yield* parseColor(cc);

    yield* lib.setCursorPosition(cli, absoluteCursorX, absoluteCursorY, true);
    yield* lib.setCursorColor(cli, parsedCC);
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
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
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

    const lines = displayText.split("\n");
    const maxVisibleLines = h - 1;

    for (let i = 0; i < Math.min(lines.length, maxVisibleLines); i++) {
      const line = lines[i];
      const visibleText = line.substring(0, w - 1);
      if (visibleText) {
        yield* framebuffer_buffer.drawText(visibleText, 0, i, textColorParsed);
      }
    }

    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
  });

  // Setters/getters
  const setValue = Effect.fn(function* (val: string) {
    const maxLen = yield* Ref.get(maxLength);
    const newValue = val.substring(0, maxLen);
    yield* Ref.set(value, newValue);

    const lines = newValue.split("\n");
    const lastLine = lines[lines.length - 1] || "";
    yield* Ref.set(cursorPosition, { row: lines.length - 1, col: lastLine.length });

    const ah = yield* Ref.get(autoHeight);
    if (ah) {
      const lineCount = lines.length;
      const dims = yield* Ref.get(b.dimensions);
      if (dims.heightValue !== lineCount) {
        yield* Ref.update(b.dimensions, (d) => ({ ...d, heightValue: lineCount, height: lineCount }));
      }
    }

    yield* updateCursorPosition();
  });

  const getValue = Effect.fn(function* () {
    return yield* Ref.get(value);
  });

  const setPlaceholder = Effect.fn(function* (val: string) {
    yield* Ref.set(placeholder, val);
  });

  const setCursorPosition = Effect.fn(function* (row: number, col: number) {
    const lines = yield* getLines();
    const clampedRow = Math.max(0, Math.min(row, lines.length - 1));
    const line = lines[clampedRow] || "";
    const clampedCol = Math.max(0, Math.min(col, line.length));
    yield* Ref.set(cursorPosition, { row: clampedRow, col: clampedCol });
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

    const lines = v.split("\n");
    const line = lines[curPos.row] || "";
    const beforeCursor = line.substring(0, curPos.col);
    const afterCursor = line.substring(curPos.col);
    lines[curPos.row] = beforeCursor + text + afterCursor;

    const newValue = lines.join("\n");
    yield* Ref.set(value, newValue);
    yield* Ref.update(cursorPosition, (pos) => ({ ...pos, col: pos.col + text.length }));
    yield* updateCursorPosition();
  });

  const insertNewLine = Effect.fn(function* () {
    const v = yield* Ref.get(value);
    const curPos = yield* Ref.get(cursorPosition);
    const maxLen = yield* Ref.get(maxLength);
    if (v.length + 1 > maxLen) return;

    const lines = v.split("\n");
    const line = lines[curPos.row] || "";
    const beforeCursor = line.substring(0, curPos.col);
    const afterCursor = line.substring(curPos.col);

    lines[curPos.row] = beforeCursor;
    lines.splice(curPos.row + 1, 0, afterCursor);

    const newValue = lines.join("\n");
    yield* Ref.set(value, newValue);
    yield* Ref.set(cursorPosition, { row: curPos.row + 1, col: 0 });

    const ah = yield* Ref.get(autoHeight);
    if (ah) {
      const lineCount = lines.length;
      const dims = yield* Ref.get(b.dimensions);
      if (dims.heightValue !== lineCount) {
        yield* Ref.update(b.dimensions, (d) => ({ ...d, heightValue: lineCount, height: lineCount }));
      }
    }

    yield* updateCursorPosition();
  });

  const deleteCharacter = Effect.fn(function* (direction: "backward" | "forward") {
    const v = yield* Ref.get(value);
    const curPos = yield* Ref.get(cursorPosition);

    if (direction === "backward") {
      if (curPos.col > 0) {
        // Delete within line
        const lines = v.split("\n");
        const line = lines[curPos.row];
        const beforeCursor = line.substring(0, curPos.col - 1);
        const afterCursor = line.substring(curPos.col);
        lines[curPos.row] = beforeCursor + afterCursor;
        const newValue = lines.join("\n");
        yield* Ref.set(value, newValue);
        yield* Ref.update(cursorPosition, (pos) => ({ ...pos, col: pos.col - 1 }));
      } else if (curPos.row > 0) {
        // Join with previous line
        const lines = v.split("\n");
        const prevLine = lines[curPos.row - 1];
        const currentLine = lines[curPos.row];
        lines[curPos.row - 1] = prevLine + currentLine;
        lines.splice(curPos.row, 1);
        const newValue = lines.join("\n");
        yield* Ref.set(value, newValue);
        yield* Ref.set(cursorPosition, { row: curPos.row - 1, col: prevLine.length });
      }
    } else if (direction === "forward") {
      const lines = v.split("\n");
      const line = lines[curPos.row] || "";
      if (curPos.col < line.length) {
        // Delete within line
        const beforeCursor = line.substring(0, curPos.col);
        const afterCursor = line.substring(curPos.col + 1);
        lines[curPos.row] = beforeCursor + afterCursor;
        const newValue = lines.join("\n");
        yield* Ref.set(value, newValue);
      } else if (curPos.row < lines.length - 1) {
        // Join with next line
        const nextLine = lines[curPos.row + 1];
        lines[curPos.row] = line + nextLine;
        lines.splice(curPos.row + 1, 1);
        const newValue = lines.join("\n");
        yield* Ref.set(value, newValue);
      }
    }

    const ah = yield* Ref.get(autoHeight);
    if (ah) {
      const lines = v.split("\n");
      const lineCount = lines.length;
      const dims = yield* Ref.get(b.dimensions);
      if (dims.heightValue !== lineCount) {
        yield* Ref.update(b.dimensions, (d) => ({ ...d, heightValue: lineCount, height: lineCount }));
      }
    }

    yield* updateCursorPosition();
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const focused = yield* Ref.get(b.focused);
    if (!focused) return false;
    const keySequence = typeof key === "string" ? key : key.sequence;

    return yield* Match.value(key.name).pipe(
      Match.when(
        "left",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          if (cp.col > 0) {
            yield* setCursorPosition(cp.row, cp.col - 1);
          } else if (cp.row > 0) {
            const lines = yield* getLines();
            const prevLine = lines[cp.row - 1] || "";
            yield* setCursorPosition(cp.row - 1, prevLine.length);
          }
          return true;
        }),
      ),
      Match.when(
        "right",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          const lines = yield* getLines();
          const line = lines[cp.row] || "";
          if (cp.col < line.length) {
            yield* setCursorPosition(cp.row, cp.col + 1);
          } else if (cp.row < lines.length - 1) {
            yield* setCursorPosition(cp.row + 1, 0);
          }
          return true;
        }),
      ),
      Match.when(
        "up",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          if (cp.row > 0) {
            yield* setCursorPosition(cp.row - 1, cp.col);
          }
          return true;
        }),
      ),
      Match.when(
        "down",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          const lines = yield* getLines();
          if (cp.row < lines.length - 1) {
            yield* setCursorPosition(cp.row + 1, cp.col);
          }
          return true;
        }),
      ),
      Match.when(
        "home",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          yield* setCursorPosition(cp.row, 0);
          return true;
        }),
      ),
      Match.when(
        "end",
        Effect.fn(function* () {
          const cp = yield* Ref.get(cursorPosition);
          const lines = yield* getLines();
          const line = lines[cp.row] || "";
          yield* setCursorPosition(cp.row, line.length);
          return true;
        }),
      ),
      Match.when(
        "backspace",
        Effect.fn(function* () {
          yield* deleteCharacter("backward");
          const v = yield* Ref.get(value);
          yield* onChange(v);
          return true;
        }),
      ),
      Match.when(
        "delete",
        Effect.fn(function* () {
          yield* deleteCharacter("forward");
          const v = yield* Ref.get(value);
          yield* onChange(v);
          return true;
        }),
      ),
      Match.whenOr(
        "return",
        "enter",
        Effect.fn(function* () {
          yield* insertNewLine();
          const v = yield* Ref.get(value);
          yield* onChange(v);
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
            const v = yield* Ref.get(value);
            yield* onChange(v);
            return true;
          }
          return false;
        }),
      ),
    );
  });

  const onUpdate: TextareaElement["onUpdate"] = Effect.fn(function* (self) {
    yield* b.onUpdate(self);
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

    yield* framebuffer_buffer.resize(w, h);
  });

  const onChange: TextareaElement["onChange"] = Effect.fn(function* (text: string) {
    const fn = options.onChange ?? Effect.fn(function* (text: string) {});
    yield* fn(text);
    yield* Ref.set(lastValue, text);
  });

  b.onKeyboardEvent = Effect.fn(function* (event) {
    const fn = options.onKeyboardEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (!event.defaultPrevented) {
      yield* handleKeyPress(event.parsedKey);
    }
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
    onChange,
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
  };
});
