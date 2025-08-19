import { Effect, Match, Ref, Schema } from "effect";

export const LeftMouseButton = Schema.Literal(0).pipe(Schema.brand("LeftMouseButton"));
export type LeftMouseButton = typeof LeftMouseButton.Type;
export const isLeftMouseButton = Schema.is(LeftMouseButton);
export const RightMouseButton = Schema.Literal(1).pipe(Schema.brand("RightMouseButton"));
export type RightMouseButton = typeof RightMouseButton.Type;
const isRightMouseButton = Schema.is(RightMouseButton);
export const MiddleMouseButton = Schema.Literal(2).pipe(Schema.brand("MiddleMouseButton"));
export type MiddleMouseButton = typeof MiddleMouseButton.Type;
const isMiddleMouseButton = Schema.is(MiddleMouseButton);
export const MouseWheelUp = Schema.Literal(3).pipe(Schema.brand("MouseWheelUp"));
export type MouseWheelUp = typeof MouseWheelUp.Type;
const isMouseWheelUp = Schema.is(MouseWheelUp);
export const MouseWheelDown = Schema.Literal(4).pipe(Schema.brand("MouseWheelDown"));
export type MouseWheelDown = typeof MouseWheelDown.Type;
export const isMouseWheelDown = Schema.is(MouseWheelDown);

export const MouseButton = Schema.Union(
  LeftMouseButton,
  RightMouseButton,
  MiddleMouseButton,
  MouseWheelUp,
  MouseWheelDown,
);
export type MouseButton = typeof MouseButton.Type;

// Mouse event types
export const MouseDown = Schema.Literal("down").pipe(Schema.brand("mousedown"));
export const isMouseDown = Schema.is(MouseDown);
export const MouseUp = Schema.Literal("up").pipe(Schema.brand("mouseup"));
export const isMouseUp = Schema.is(MouseUp);
export const MouseMove = Schema.Literal("move").pipe(Schema.brand("mousemove"));
export const isMouseMove = Schema.is(MouseMove);
export const MouseDrag = Schema.Literal("drag").pipe(Schema.brand("mousedrag"));
export const isMouseDrag = Schema.is(MouseDrag);
export const MouseDragEnd = Schema.Literal("drag-end").pipe(Schema.brand("mousedragend"));
export const isMouseDragEnd = Schema.is(MouseDragEnd);
export const MouseDrop = Schema.Literal("drop").pipe(Schema.brand("mousedrop"));
export const isMouseDrop = Schema.is(MouseDrop);
export const MouseOver = Schema.Literal("over").pipe(Schema.brand("mouseover"));
export const isMouseOver = Schema.is(MouseOver);
export const MouseOut = Schema.Literal("out").pipe(Schema.brand("mouseout"));
export const isMouseOut = Schema.is(MouseOut);
export const MouseScroll = Schema.Literal("scroll").pipe(Schema.brand("scroll"));
export const isMouseScroll = Schema.is(MouseScroll);

export interface ScrollInfo {
  direction: "up" | "down" | "left" | "right";
  delta: number;
}

export type RawMouseEvent = {
  type: MouseEventType;
  button: number;
  x: number;
  y: number;
  modifiers: { shift: boolean; alt: boolean; ctrl: boolean };
  scroll?: ScrollInfo;
};

export const MouseEventType = Schema.Union(
  MouseDown,
  MouseUp,
  MouseMove,
  MouseDrag,
  MouseDragEnd,
  MouseDrop,
  MouseOver,
  MouseOut,
  MouseScroll,
);
export type MouseEventType = typeof MouseEventType.Type;

// Parsed mouse event schema
export const ParsedMouseEvent = Schema.Struct({
  type: MouseEventType,
  button: Schema.Number,
  x: Schema.mutable(Schema.Number),
  y: Schema.mutable(Schema.Number),
  modifiers: Schema.Struct({
    shift: Schema.Boolean,
    alt: Schema.Boolean,
    ctrl: Schema.Boolean,
  }),
  raw: Schema.String,
}).pipe(Schema.mutable);
export type ParsedMouseEvent = typeof ParsedMouseEvent.Type;

const sgrRe = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/;
const basicRe = /^\x1b\[M(.{3})/;

export class MouseParser extends Effect.Service<MouseParser>()("@opentuee/mouse-parser", {
  dependencies: [],
  scoped: Effect.gen(function* () {
    // Internal mouse button state
    const mouseButtonsPressed = yield* Ref.make(new Set<number>());

    //  const resetMouseButtons = () => mouseButtonsPressed.clear();
    const reset = Effect.fn(function* () {
      yield* Ref.update(mouseButtonsPressed, (set) => {
        set.clear();
        return set;
      });
    });
    const parse = Effect.fn(function* (input: Buffer | string) {
      const str = typeof input === "string" ? input : input.toString();

      // SGR mouse mode
      const sgrMatch = str.match(sgrRe);
      if (sgrMatch) {
        const [, buttonCode, x, y, pressRelease] = sgrMatch;
        const rawButtonCode = parseInt(buttonCode, 10);
        const button = rawButtonCode & 3;
        const isMotion = (rawButtonCode & 32) !== 0;
        const modifiers = {
          shift: (rawButtonCode & 4) !== 0,
          alt: (rawButtonCode & 8) !== 0,
          ctrl: (rawButtonCode & 16) !== 0,
        };

        let type: MouseEventType;
        if (isMotion) {
          const mp = yield* Ref.get(mouseButtonsPressed);
          const isDragging = mp.size > 0;
          if (button === 3) {
            type = MouseMove.make("move");
          } else if (isDragging) {
            type = MouseDrag.make("drag");
          } else {
            type = MouseMove.make("move");
          }
        } else {
          type = pressRelease === "M" ? MouseDown.make("down") : MouseUp.make("up");
          if (type === "down" && button !== 3) {
            yield* Ref.update(mouseButtonsPressed, (set) => {
              set.add(button);
              return set;
            });
          } else if (type === "up") {
            yield* Ref.update(mouseButtonsPressed, (set) => {
              set.clear();
              return set;
            });
          }
        }

        return {
          type,
          button: button === 3 ? 0 : button,
          x: parseInt(x, 10) - 1,
          y: parseInt(y, 10) - 1,
          modifiers,
          raw: str,
        } satisfies ParsedMouseEvent;
      }

      // Basic mouse mode
      if (str.startsWith("\x1b[M") && str.length >= 6) {
        const buttonByte = str.charCodeAt(3) - 32;
        const x = str.charCodeAt(4) - 33;
        const y = str.charCodeAt(5) - 33;
        const button = buttonByte & 3;
        const modifiers = {
          shift: (buttonByte & 4) !== 0,
          alt: (buttonByte & 8) !== 0,
          ctrl: (buttonByte & 16) !== 0,
        };
        const type = button === 3 ? MouseUp.make("up") : MouseDown.make("down");
        const actualButton = button === 3 ? 0 : button;

        if (type === "down" && actualButton !== 0) {
          yield* Ref.update(mouseButtonsPressed, (set) => {
            set.add(actualButton);
            return set;
          });
        } else if (type === "up") {
          yield* Ref.update(mouseButtonsPressed, (set) => {
            set.clear();
            return set;
          });
        }

        return {
          type,
          button: actualButton,
          x,
          y,
          modifiers,
          raw: str,
        } satisfies ParsedMouseEvent;
      }

      return null;
    });

    return {
      reset,
      parse,
    };
  }),
}) {}

export const MouseParserLive = MouseParser.Default;
