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
import type { Binds, ColorsThemeRecord, ElementOptions } from "./utils";

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
  minHeight?: number;
  maxHeight?: number;
  maxWidth?: number;
  onUpdate?: (self: TextareaElement) => Effect.Effect<void, Collection, Library>;
  onChange?: (text: string) => Effect.Effect<void, Collection, Library>;
  validate?: (value: string) => boolean;
};

const DEFAULTS = {
  placeholder: "",
  maxLength: 10000,
  value: "",
  autoHeight: false,
  minHeight: 3,
};

export const textarea = Effect.fn(function* (
  binds: Binds,
  options: TextareaOptions,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;

  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  const { cli } = yield* Ref.get(binds.context);

  if ((options.autoHeight ?? DEFAULTS.autoHeight) && options.maxHeight !== undefined) {
    return yield* Effect.fail(new Error("autoHeight and maxHeight cannot be used together"));
  }

  const lastValue = yield* Ref.make(options.value ?? DEFAULTS.value);

  const b = yield* base<"textarea", TextareaElement>(
    "textarea",
    binds,
    {
      ...options,
      selectable: true,
      width: options.width ?? "auto",
      height:
        options.height ??
        (options.autoHeight
          ? Math.max(options.minHeight ?? DEFAULTS.minHeight, (options.value ?? DEFAULTS.value).split("\n").length)
          : 5),
      ...(options.colors ? { colors: options.colors } : {}),
    },
    parentElement,
  );

  const framebuffer_buffer = yield* b.createFrameBuffer();

  const value = yield* Ref.make(options.value ?? DEFAULTS.value);
  const cursorPosition = yield* Ref.make({ row: 0, col: 0 });
  const placeholder = yield* Ref.make(options.placeholder ?? DEFAULTS.placeholder);
  const maxLength = yield* Ref.make(options.maxLength ?? DEFAULTS.maxLength);
  const autoHeight = yield* Ref.make(options.autoHeight ?? DEFAULTS.autoHeight);
  const minHeight = yield* Ref.make(options.minHeight ?? DEFAULTS.minHeight);
  const maxHeight = yield* Ref.make(options.maxHeight);
  const maxWidth = yield* Ref.make(options.maxWidth);

  // Scroll state
  const verticalScrollOffset = yield* Ref.make(0);
  const horizontalScrollOffset = yield* Ref.make(0);

  const lastCommittedValue = yield* Ref.make(options.value ?? DEFAULTS.value);

  // Track if height needs updating for autoHeight
  const needsHeightUpdate = yield* Ref.make(false);

  // Helper functions
  const updateAutoHeight = Effect.fn(function* () {
    const needsUpdate = yield* Ref.get(needsHeightUpdate);
    if (!needsUpdate) return;

    const ah = yield* Ref.get(autoHeight);
    if (!ah) {
      yield* Ref.set(needsHeightUpdate, false);
      return;
    }

    const lines = yield* getLines();
    const lineCount = lines.length;
    const minH = yield* Ref.get(minHeight);
    const effectiveHeight = Math.max(minH, lineCount);
    const dims = yield* Ref.get(b.dimensions);

    if (dims.heightValue !== effectiveHeight) {
      yield* Ref.update(b.dimensions, (d) => ({ ...d, heightValue: effectiveHeight, height: effectiveHeight }));
      // Update the Yoga layout node to reflect the new height
      yield* b.layoutNode.setHeight(effectiveHeight);
    }

    // Reset the flag
    yield* Ref.set(needsHeightUpdate, false);
  });

  const getLines = Effect.fn(function* () {
    const v = yield* Ref.get(value);
    return v.split("\n");
  });

  const getLineCount = Effect.fn(function* () {
    const lines = yield* getLines();
    return lines.length;
  });

  const getContentDimensions = Effect.fn(function* () {
    const lines = yield* getLines();
    const contentHeight = lines.length;
    const contentWidth = lines.reduce((max, line) => Math.max(max, line.length), 0);
    return { contentHeight, contentWidth };
  });

  const getVisibleDimensions = Effect.fn(function* () {
    const dims = yield* Ref.get(b.dimensions);
    const mh = yield* Ref.get(maxHeight);
    const mw = yield* Ref.get(maxWidth);
    const ah = yield* Ref.get(autoHeight);

    let visibleHeight = mh ?? dims.heightValue;
    let visibleWidth = mw ?? dims.widthValue;

    // If maxHeight/maxWidth is not set, use the textarea dimensions
    if (!mh) {
      visibleHeight = dims.heightValue;
    }
    if (!mw) {
      visibleWidth = dims.widthValue;
    }

    // Ensure we have valid dimensions (fallback to reasonable defaults)
    visibleHeight = Math.max(1, visibleHeight);
    visibleWidth = Math.max(1, visibleWidth);

    return { visibleHeight, visibleWidth };
  });

  const shouldShowVerticalScrollbar = Effect.fn(function* () {
    const { contentHeight } = yield* getContentDimensions();
    const { visibleHeight } = yield* getVisibleDimensions();
    const ah = yield* Ref.get(autoHeight);
    const mh = yield* Ref.get(maxHeight);

    // Show scrollbar if content exceeds visible height, and either maxHeight is set or not autoHeight
    return contentHeight > visibleHeight && (!ah || mh !== undefined);
  });

  const shouldShowHorizontalScrollbar = Effect.fn(function* () {
    const { contentWidth } = yield* getContentDimensions();
    const { visibleWidth } = yield* getVisibleDimensions();

    // Show scrollbar if content exceeds visible width
    return contentWidth > visibleWidth;
  });

  const clampScrollOffsets = Effect.fn(function* () {
    const { contentHeight, contentWidth } = yield* getContentDimensions();
    const { visibleHeight, visibleWidth } = yield* getVisibleDimensions();

    const currentVOffset = yield* Ref.get(verticalScrollOffset);
    const currentHOffset = yield* Ref.get(horizontalScrollOffset);

    const maxVOffset = Math.max(0, contentHeight - visibleHeight);
    const maxHOffset = Math.max(0, contentWidth - visibleWidth);

    const clampedVOffset = Math.max(0, Math.min(currentVOffset, maxVOffset));
    const clampedHOffset = Math.max(0, Math.min(currentHOffset, maxHOffset));

    if (clampedVOffset !== currentVOffset) {
      yield* Ref.set(verticalScrollOffset, clampedVOffset);
    }
    if (clampedHOffset !== currentHOffset) {
      yield* Ref.set(horizontalScrollOffset, clampedHOffset);
    }
  });

  const updateCursorPosition = Effect.fn(function* () {
    const focused = yield* Ref.get(b.focused);
    if (!focused) return;
    const colors = yield* Ref.get(b.colors);
    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const curPos = yield* Ref.get(cursorPosition);
    const lines = yield* getLines();
    const vOffset = yield* Ref.get(verticalScrollOffset);
    const hOffset = yield* Ref.get(horizontalScrollOffset);

    // Clamp cursor position to valid boundaries
    const clampedRow = Math.max(0, Math.min(curPos.row, lines.length - 1));
    const line = lines[clampedRow] || "";
    const clampedCol = Math.max(0, Math.min(curPos.col, line.length));

    // Update cursor position if it was out of bounds
    if (clampedRow !== curPos.row || clampedCol !== curPos.col) {
      yield* Ref.set(cursorPosition, { row: clampedRow, col: clampedCol });
    }

    // Calculate scrollbar visibility
    const { contentHeight, contentWidth } = yield* getContentDimensions();
    const { visibleHeight: fullVisibleHeight, visibleWidth: fullVisibleWidth } = yield* getVisibleDimensions();
    const ah = yield* Ref.get(autoHeight);
    const mh = yield* Ref.get(maxHeight);

    const showVScrollbar = contentHeight > fullVisibleHeight && (!ah || mh !== undefined);
    const showHScrollbar = contentWidth > fullVisibleWidth;
    const visibleWidth = w - (showVScrollbar ? 1 : 0);
    const visibleHeight = h - (showHScrollbar ? 1 : 0);

    // Adjust for scrolling
    const visibleRow = clampedRow - vOffset;
    const visibleCol = clampedCol - hOffset;

    // Auto-scroll if cursor is outside visible area
    let newVOffset = vOffset;
    let newHOffset = hOffset;

    if (visibleRow < 0) {
      newVOffset = Math.max(0, clampedRow);
    } else if (visibleRow >= visibleHeight) {
      newVOffset = Math.max(0, clampedRow - visibleHeight + 1);
    }

    if (visibleCol < 0) {
      newHOffset = Math.max(0, clampedCol);
    } else if (visibleCol >= visibleWidth) {
      newHOffset = Math.max(0, clampedCol - visibleWidth + 1);
    }

    // Clamp scroll offsets to valid ranges
    const maxVOffset = Math.max(0, contentHeight - visibleHeight);
    const maxHOffset = Math.max(0, contentWidth - visibleWidth);
    newVOffset = Math.max(0, Math.min(newVOffset, maxVOffset));
    newHOffset = Math.max(0, Math.min(newHOffset, maxHOffset));

    // Update scroll offsets if they changed
    if (newVOffset !== vOffset) {
      yield* Ref.set(verticalScrollOffset, newVOffset);
    }
    if (newHOffset !== hOffset) {
      yield* Ref.set(horizontalScrollOffset, newHOffset);
    }

    const finalVisibleRow = clampedRow - newVOffset;
    const finalVisibleCol = clampedCol - newHOffset;

    const absoluteCursorX = loc.x + finalVisibleCol + 1;
    const absoluteCursorY = loc.y + finalVisibleRow + 1;

    const parsedCC = yield* parseColor(colors.cursorColor);

    yield* lib.setCursorPosition(cli, absoluteCursorX, absoluteCursorY, true);
    yield* lib.setCursorColor(cli, parsedCC);
  });

  b.setFocused = Effect.fn(function* (focused: boolean) {
    yield* Ref.set(b.focused, focused);
    if (focused) {
      const colors = yield* Ref.get(b.colors);
      const parsedCC = yield* parseColor(colors.cursorColor);
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
    yield* updateAutoHeight();
    yield* clampScrollOffsets();
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
    const textColorParsed = yield* parseColor(isPlaceholder ? colors.placeholderColor : baseTextColor);

    const lines = displayText.split("\n");
    const vOffset = yield* Ref.get(verticalScrollOffset);
    const hOffset = yield* Ref.get(horizontalScrollOffset);

    // Calculate scrollbar visibility based on full dimensions
    const { contentHeight, contentWidth } = yield* getContentDimensions();
    const { visibleHeight: fullVisibleHeight, visibleWidth: fullVisibleWidth } = yield* getVisibleDimensions();
    const ah = yield* Ref.get(autoHeight);
    const mh = yield* Ref.get(maxHeight);

    const showVScrollbar = contentHeight > fullVisibleHeight && (!ah || mh !== undefined);
    const showHScrollbar = contentWidth > fullVisibleWidth;

    const visibleWidth = w - (showVScrollbar ? 1 : 0);
    const visibleHeight = h - (showHScrollbar ? 1 : 0);

    // Ensure visible dimensions are at least 1
    const safeVisibleWidth = Math.max(1, visibleWidth);
    const safeVisibleHeight = Math.max(1, visibleHeight);

    const maxVisibleLines = Math.min(lines.length - vOffset, safeVisibleHeight);

    for (let i = 0; i < maxVisibleLines; i++) {
      const lineIndex = i + vOffset;
      if (lineIndex < lines.length) {
        const line = lines[lineIndex];
        const visibleText = line.substring(hOffset, hOffset + safeVisibleWidth);
        if (visibleText) {
          yield* framebuffer_buffer.drawText(visibleText, 0, i, textColorParsed);
        }
      }
    }

    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);

    // Render scrollbars if needed
    if (showVScrollbar) {
      // Render vertical scrollbar
      const scrollbarX = loc.x + safeVisibleWidth;
      const scrollbarY = loc.y;
      const scrollbarHeight = safeVisibleHeight;

      // Render scrollbar track
      yield* buffer.fillRect(scrollbarX, scrollbarY, 1, scrollbarHeight, yield* parseColor(Colors.Custom("#333333")));

      // Render scrollbar indicator
      if (contentHeight > safeVisibleHeight) {
        const thumbHeight = Math.max(1, Math.floor((safeVisibleHeight / contentHeight) * scrollbarHeight));
        const scrollRatio = vOffset / Math.max(1, contentHeight - safeVisibleHeight);
        const thumbStart = scrollbarY + Math.floor(scrollRatio * Math.max(0, scrollbarHeight - thumbHeight));
        yield* buffer.fillRect(scrollbarX, thumbStart, 1, thumbHeight, yield* parseColor(Colors.Custom("#666666")));
      }
    }

    if (showHScrollbar) {
      // Render horizontal scrollbar
      const scrollbarX = loc.x;
      const scrollbarY = loc.y + safeVisibleHeight;
      const scrollbarWidth = safeVisibleWidth;

      // Render scrollbar track
      yield* buffer.fillRect(scrollbarX, scrollbarY, scrollbarWidth, 1, yield* parseColor(Colors.Custom("#333333")));

      // Render scrollbar indicator
      if (contentWidth > safeVisibleWidth) {
        const thumbWidth = Math.max(1, Math.floor((safeVisibleWidth / contentWidth) * scrollbarWidth));
        const scrollRatio = hOffset / Math.max(1, contentWidth - safeVisibleWidth);
        const thumbStart = scrollbarX + Math.floor(scrollRatio * Math.max(0, scrollbarWidth - thumbWidth));
        yield* buffer.fillRect(thumbStart, scrollbarY, thumbWidth, 1, yield* parseColor(Colors.Custom("#666666")));
      }
    }
  });

  // Setters/getters
  const setValue = Effect.fn(function* (val: string) {
    const maxLen = yield* Ref.get(maxLength);
    const newValue = val.substring(0, maxLen);
    yield* Ref.set(value, newValue);

    const lines = newValue.split("\n");
    const lastLine = lines[lines.length - 1] || "";
    yield* Ref.set(cursorPosition, { row: lines.length - 1, col: lastLine.length });

    // Reset scroll offsets when value changes
    yield* Ref.set(verticalScrollOffset, 0);
    yield* Ref.set(horizontalScrollOffset, 0);

    // Mark that height may need updating for autoHeight
    yield* Ref.set(needsHeightUpdate, true);

    // Clamp scroll offsets and update cursor position
    yield* clampScrollOffsets();
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

    // Mark that height may need updating for autoHeight
    yield* Ref.set(needsHeightUpdate, true);

    // Clamp scroll offsets to valid ranges after content change
    yield* clampScrollOffsets();
    yield* updateCursorPosition();
  });

  const setMaxLength = Effect.fn(function* (len: number) {
    yield* Ref.set(maxLength, len);
    const v = yield* Ref.get(value);
    if (v.length > len) {
      yield* Ref.set(value, v.substring(0, len));
      // Clamp scroll offsets and update cursor position after content change
      yield* clampScrollOffsets();
      yield* updateCursorPosition();
    }
  });

  const setTextColor = b.setForegroundColor;

  const setPlaceholderColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(b.colors, (c) => ({ ...c, placeholderColor: color(c.placeholderColor) }));
    } else {
      yield* Ref.update(b.colors, (c) => ({ ...c, placeholderColor: color }));
    }
  });

  const setCursorColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(b.colors, (c) => ({ ...c, cursorColor: color(c.cursorColor) }));
    } else {
      yield* Ref.update(b.colors, (c) => ({ ...c, cursorColor: color }));
    }
  });

  // Key handling

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

    // Mark that height may need updating for autoHeight
    yield* Ref.set(needsHeightUpdate, true);

    // Clamp scroll offsets to valid ranges after content change
    yield* clampScrollOffsets();
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

    // Mark that height may need updating for autoHeight
    yield* Ref.set(needsHeightUpdate, true);

    // Clamp scroll offsets to valid ranges after content change
    yield* clampScrollOffsets();
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
        "pageup",
        Effect.fn(function* () {
          const { visibleHeight } = yield* getVisibleDimensions();
          const cp = yield* Ref.get(cursorPosition);
          const newRow = Math.max(0, cp.row - visibleHeight);
          yield* setCursorPosition(newRow, cp.col);
          return true;
        }),
      ),
      Match.when(
        "pagedown",
        Effect.fn(function* () {
          const { visibleHeight } = yield* getVisibleDimensions();
          const cp = yield* Ref.get(cursorPosition);
          const lines = yield* getLines();
          const newRow = Math.min(lines.length - 1, cp.row + visibleHeight);
          yield* setCursorPosition(newRow, cp.col);
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

    // Update autoHeight if needed
    yield* updateAutoHeight();

    // const ctx = yield* Ref.get(binds.context);
    // const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);

    // Check scrollbar visibility for both hit grid and framebuffer sizing
    const { contentHeight: contentHeightUpdate, contentWidth: contentWidthUpdate } = yield* getContentDimensions();
    const { visibleHeight: fullVisibleHeightUpdate, visibleWidth: fullVisibleWidthUpdate } =
      yield* getVisibleDimensions();
    const ahUpdate = yield* Ref.get(autoHeight);
    const mhUpdate = yield* Ref.get(maxHeight);

    const showVScrollbarUpdate = contentHeightUpdate > fullVisibleHeightUpdate && (!ahUpdate || mhUpdate !== undefined);
    const showHScrollbarUpdate = contentWidthUpdate > fullVisibleWidthUpdate;

    // Add full area including scrollbars to hit grid
    // const fullWidth = w + (showVScrollbarUpdate ? 1 : 0);
    // const fullHeight = h + (showHScrollbarUpdate ? 1 : 0);
    // yield* ctx.addToHitGrid(x, y, fullWidth, fullHeight, b.num);

    const focused = yield* Ref.get(b.focused);
    if (focused) {
      yield* updateCursorPosition();
    }

    // Resize framebuffer to content area (excluding scrollbar space)
    const contentWidth = Math.max(1, w - (showVScrollbarUpdate ? 1 : 0));
    const contentHeight = Math.max(1, h - (showHScrollbarUpdate ? 1 : 0));
    yield* framebuffer_buffer.resize(contentWidth, contentHeight);
  });

  const onChange: TextareaElement["onChange"] = Effect.fn(function* (text: string) {
    const fn = options.onChange ?? Effect.fn(function* (text: string) {});
    yield* fn(text);
    yield* Ref.set(lastValue, text);
  });

  b.onMouseEvent = Effect.fn(function* (event) {
    const fn = options.onMouseEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (!event.defaultPrevented) {
      // Handle mouse events for scrolling
      if (event.type === "scroll" && event.scroll) {
        const { direction, delta } = event.scroll;
        const amount = Math.abs(delta) > 100 ? 3 : 1;

        if (direction === "up") {
          const currentOffset = yield* Ref.get(verticalScrollOffset);
          yield* Ref.set(verticalScrollOffset, Math.max(0, currentOffset - amount));
          yield* updateCursorPosition();
          event.preventDefault();
        } else if (direction === "down") {
          const currentOffset = yield* Ref.get(verticalScrollOffset);
          const { contentHeight } = yield* getContentDimensions();
          const { visibleHeight } = yield* getVisibleDimensions();
          const maxOffset = Math.max(0, contentHeight - visibleHeight);
          yield* Ref.set(verticalScrollOffset, Math.min(maxOffset, currentOffset + amount));
          yield* updateCursorPosition();
          event.preventDefault();
        } else if (direction === "left") {
          const currentOffset = yield* Ref.get(horizontalScrollOffset);
          yield* Ref.set(horizontalScrollOffset, Math.max(0, currentOffset - amount));
          yield* updateCursorPosition();
          event.preventDefault();
        } else if (direction === "right") {
          const currentOffset = yield* Ref.get(horizontalScrollOffset);
          const { contentWidth } = yield* getContentDimensions();
          const { visibleWidth } = yield* getVisibleDimensions();
          const maxOffset = Math.max(0, contentWidth - visibleWidth);
          yield* Ref.set(horizontalScrollOffset, Math.min(maxOffset, currentOffset + amount));
          yield* updateCursorPosition();
          event.preventDefault();
        }
      }
    }
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
