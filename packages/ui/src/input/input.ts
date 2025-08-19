import * as Colors from "@opentuee/core/src/colors";
import * as Cursor from "@opentuee/core/src/cursor-style";
import type { RendererFailedToSetCursorPosition } from "@opentuee/core/src/errors";
import { EventEmitter } from "@opentuee/core/src/event-emitter";
import type { ParsedKey } from "@opentuee/core/src/inputs/keyboard";
import { CliRenderer } from "@opentuee/core/src/renderer";
import { RGBAClass } from "@opentuee/core/src/types";
import * as Renderables from "@opentuee/ui/src/components/renderables";
import { Context, Effect, Match, Ref, Schema } from "effect";
import { makeBufferedElement, type BufferedElementOptions, type BufferedElementService } from "../bufferedelement";

export type InputElementOptions = BufferedElementOptions & {
  placeholder?: string;
  placeholderColor?: Colors.Input;
  cursorColor?: Colors.Input;
  maxLength?: number;
  value?: string;
};

export const Input = Schema.Literal("input").pipe(Schema.brand("InputInput"));
export type Input = typeof Input.Type;

export const Change = Schema.Literal("change").pipe(Schema.brand("InputChange"));
export type Change = typeof Change.Type;

export const Enter = Schema.Literal("enter").pipe(Schema.brand("InputEnter"));
export type Enter = typeof Enter.Type;

export const Events = Schema.Union(Input, Change, Enter).pipe(Schema.brand("InputEvents"));
export type Events = typeof Events.Type;

export type InputService = Effect.Effect.Success<ReturnType<typeof makeInputElement>>;

export class InputElement extends Context.Tag("Input")<InputElement, InputService>() {}

export const makeInputElement = (id: string, options: InputElementOptions) =>
  Effect.gen(function* () {
    const ee = yield* EventEmitter;
    const cliRenderer = yield* CliRenderer;
    const renderable = yield* makeBufferedElement(id, {
      ...options,
      type: Renderables.Input.make("Input"),
    });
    const placeholder = yield* Ref.make(options.placeholder || "");
    const value = yield* Ref.make(options.value || "");
    const lastCommittedValue = yield* Ref.make(options.value || "");
    const cursorPosition = yield* Ref.make((options.value || "").length);
    const maxLength = yield* Ref.make(options.maxLength || 1000);
    const placeholderColor = yield* Ref.make(options.placeholderColor || Colors.Custom.make("#666666"));
    const cursorColor = yield* Ref.make(options.cursorColor || Colors.White.make("#FFFFFF"));

    const updateCursorPosition = Effect.fn(function* () {
      const f = yield* Ref.get(renderable.focused);
      if (!f) return;
      const border = yield* Ref.get(renderable.border);
      const w = yield* Ref.get(renderable.width);
      const h = yield* Ref.get(renderable.height);
      const contentX = border !== false ? 1 : 0;
      const contentY = border !== false ? 1 : 0;
      const contentWidth = border !== false ? w - 2 : w;

      const maxVisibleChars = contentWidth - 1;
      let displayStartIndex = 0;
      const cp = yield* Ref.get(cursorPosition);

      if (cp >= maxVisibleChars) {
        displayStartIndex = cp - maxVisibleChars + 1;
      }

      const cursorDisplayX = cp - displayStartIndex;
      const x = yield* Ref.get(renderable.x);
      const y = yield* Ref.get(renderable.y);

      if (cursorDisplayX >= 0 && cursorDisplayX < contentWidth) {
        const absoluteCursorX = x + contentX + cursorDisplayX + 1;
        const absoluteCursorY = y + contentY + 1;

        yield* cliRenderer.setCursorPosition(absoluteCursorX, absoluteCursorY, true);
        const cc = yield* Ref.get(cursorColor);
        const cc2 = yield* RGBAClass.fromHex(cc);
        yield* cliRenderer.setCursorColor(cc2);
      }
    });

    const focus = Effect.fn(function* () {
      yield* renderable.focus();
      const cc = yield* Ref.get(cursorColor);
      const cc2 = yield* RGBAClass.fromHex(cc);
      yield* cliRenderer.setCursorStyle(Cursor.Block.make("block"), true);
      yield* cliRenderer.setCursorColor(cc2);
      yield* updateCursorPosition();
      yield* Ref.set(renderable.needsRefresh, true);
    });

    const blur = Effect.fn(function* () {
      yield* renderable.blur();
      yield* cliRenderer.setCursorPosition(0, 0, false);
      const v = yield* Ref.get(value);
      const lcv = yield* Ref.get(lastCommittedValue);
      if (v !== lcv) {
        yield* Ref.set(lastCommittedValue, v);
        ee.emit(Change.make("change"), v);
      }

      yield* Ref.set(renderable.needsRefresh, true);
    });

    const refreshContent = Effect.fn(function* (
      contentX: number,
      contentY: number,
      contentWidth: number,
      contentHeight: number,
    ) {
      const v = yield* Ref.get(value);
      const ph = yield* Ref.get(placeholder);
      const displayText = v || ph;
      const isPlaceholder = !v && ph;
      const phc = yield* Ref.get(placeholderColor);
      const tc = yield* Ref.get(renderable.textColor);
      const textC = isPlaceholder ? phc : tc;

      const maxVisibleChars = contentWidth - 1;
      let displayStartIndex = 0;

      const cp = yield* Ref.get(cursorPosition);
      if (cp >= maxVisibleChars) {
        displayStartIndex = cp - maxVisibleChars + 1;
      }

      const visibleText = displayText.substring(displayStartIndex, displayStartIndex + maxVisibleChars);
      if (visibleText) {
        const textC2 = yield* RGBAClass.fromHex(textC);
        yield* renderable.frameBuffer.drawText(visibleText, contentX, contentY, textC2);
      }
      const f = yield* Ref.get(renderable.focused);
      if (f) {
        yield* updateCursorPosition();
      }
    });

    const setValue = Effect.fn(function* (newV: string) {
      const ml = yield* Ref.get(maxLength);
      const newValue = newV.substring(0, ml);
      const v = yield* Ref.get(value);
      if (v !== newValue) {
        yield* Ref.set(value, newValue);
        yield* Ref.update(cursorPosition, (cp) => Math.min(cp, newValue.length));
        yield* Ref.set(renderable.needsRefresh, true);
        yield* updateCursorPosition();
        ee.emit(Input.make("input"), newValue);
      }
    });

    const getValue = Effect.fn(function* () {
      return yield* Ref.get(value);
    });

    const getPlaceholder = Effect.fn(function* () {
      return yield* Ref.get(placeholder);
    });

    const setPlaceholder = Effect.fn(function* (newPlaceholder: string) {
      const ph = yield* Ref.get(placeholder);
      if (ph !== newPlaceholder) {
        yield* Ref.set(placeholder, newPlaceholder);
        yield* Ref.set(renderable.needsRefresh, true);
      }
    });

    const getCursorPosition = Effect.fn(function* () {
      return yield* Ref.get(cursorPosition);
    });

    const setCursorPosition = Effect.fn(function* (newPosition: number) {
      const cp = yield* Ref.get(cursorPosition);
      if (cp !== newPosition) {
        yield* Ref.set(cursorPosition, newPosition);
        yield* Ref.set(renderable.needsRefresh, true);
        yield* updateCursorPosition();
      }
    });

    const insertText = Effect.fn(function* (text: string) {
      const v = yield* Ref.get(value);
      const ml = yield* Ref.get(maxLength);
      if (v.length + text.length > ml) {
        return;
      }
      const cp = yield* Ref.get(cursorPosition);
      const beforeCursor = v.substring(0, cp);
      const afterCursor = v.substring(cp);
      const concat = beforeCursor + text + afterCursor;
      yield* setValue(concat);
      yield* Ref.update(cursorPosition, (cp) => cp + text.length);
      yield* Ref.set(renderable.needsRefresh, true);
      yield* updateCursorPosition();
      ee.emit(Input.make("input"), concat);
    });

    const deleteCharacter = Effect.fn(function* (direction: "backward" | "forward") {
      const cp = yield* Ref.get(cursorPosition);
      const v = yield* Ref.get(value);

      if (direction === "backward" && cp > 0) {
        const beforeCursor = v.substring(0, cp - 1);
        const afterCursor = v.substring(cp);
        const concat = beforeCursor + afterCursor;
        yield* setValue(concat);
        yield* Ref.update(cursorPosition, (cp) => cp - 1);
        yield* Ref.set(renderable.needsRefresh, true);
        yield* updateCursorPosition();
        ee.emit(Input.make("input"), concat);
      } else if (direction === "forward" && cp < v.length) {
        const beforeCursor = v.substring(0, cp);
        const afterCursor = v.substring(cp + 1);
        const concat = beforeCursor + afterCursor;
        yield* setValue(concat);
        yield* Ref.update(cursorPosition, (cp) => cp + 1);
        yield* Ref.set(renderable.needsRefresh, true);
        yield* updateCursorPosition();
        ee.emit(Input.make("input"), concat);
      }
    });

    const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
      const keyName = key.name;
      const keySequence = key.sequence;
      const x = yield* Match.value(keyName).pipe(
        Match.when(
          "left",
          Effect.fn(function* () {
            yield* Ref.get(cursorPosition);
            return true;
          }),
        ),
        Match.when(
          "right",
          Effect.fn(function* () {
            yield* Ref.update(cursorPosition, (cp) => cp + 1);
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
          "enter",
          "return",
          Effect.fn(function* () {
            const v = yield* Ref.get(value);
            const lcv = yield* Ref.get(lastCommittedValue);
            if (v !== lcv) {
              yield* Ref.set(lastCommittedValue, v);
              ee.emit(Change.make("change"), v);
            }
            ee.emit(Enter.make("enter"), v);
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
            } else {
              return false;
            }
          }),
        ),
      );
      return x;
    });

    const getMaxLength = Effect.fn(function* () {
      return yield* Ref.get(maxLength);
    });

    const setMaxLength = Effect.fn(function* (newMaxLength: number) {
      yield* Ref.set(maxLength, newMaxLength);
      const v = yield* Ref.get(value);
      if (v.length > newMaxLength) {
        yield* setValue(v.substring(0, newMaxLength));
      }
    });

    const destroySelf = Effect.fn(function* () {
      const f = yield* Ref.get(renderable.focused);
      if (f) {
        yield* cliRenderer.setCursorPosition(0, 0, false);
      }
      yield* renderable.destroySelf();
    });

    return {
      updateCursorPosition,
      focus,
      blur,
      refreshContent,
      setValue,
      getValue,
      getPlaceholder,
      setPlaceholder,
      insertText,
      deleteCharacter,
      getCursorPosition,
      setCursorPosition,
      handleKeyPress,
      getMaxLength,
      setMaxLength,
      destroySelf,
    };
  });
