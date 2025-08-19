// https://github.com/sst/opentui/blob/main/src/ansi.ts
// converted to Effect-Schema
import { Effect, Schema } from "effect";

export const SwitchToAlternateScreen = Schema.Literal("\x1b[?1049h").pipe(Schema.brand("SwitchToAlternateScreen"));
export const SwitchToMainScreen = Schema.Literal("\x1b[?1049l").pipe(Schema.brand("SwitchToMainScreen"));
export const Reset = Schema.Literal("\x1b[0m").pipe(Schema.brand("Reset"));
export const HideCursor = Schema.Literal("\x1b[?25l").pipe(Schema.brand("HideCursor"));
export const ShowCursor = Schema.Literal("\x1b[?25h").pipe(Schema.brand("ShowCursor"));

export const ResetCursorColor = Schema.Literal("\x1b]12;default\x07").pipe(Schema.brand("ResetCursorColor"));
export const SaveCursorState = Schema.Literal("\x1b[s").pipe(Schema.brand("SaveCursorState"));
export const RestoreCursorState = Schema.Literal("\x1b[u").pipe(Schema.brand("RestoreCursorState"));

export const QueryPixelSize = Schema.Literal("\u001b[14t").pipe(Schema.brand("QueryPixelSize"));

export const ScrollDown = Schema.Literal("\x1b[T").pipe(Schema.brand("ScrollDown"));
export const ScrollUp = Schema.Literal("\x1b[S").pipe(Schema.brand("ScrollUp"));

export const MoveCursor = Schema.Literal("\x1b[H").pipe(Schema.brand("MoveCursor"));
export const MoveCursorAndClear = Schema.Literal("\x1b[J").pipe(Schema.brand("MoveCursorAndClear"));
export const ClearFromCursor = Schema.Literal("\x1b[J").pipe(Schema.brand("ClearFromCursor"));

export const SetRgbBackground = Schema.Literal("\x1b[48;2;0;0;0m").pipe(Schema.brand("SetRgbBackground"));
export const ResetBackground = Schema.Literal("\x1b[49m").pipe(Schema.brand("ResetBackground"));

export const EnableMouseTracking = Schema.Literal("\x1b[?1000h").pipe(Schema.brand("EnableMouseTracking"));
export const DisableMouseTracking = Schema.Literal("\x1b[?1000l").pipe(Schema.brand("DisableMouseTracking"));
export const EnableButtonEventTracking = Schema.Literal("\x1b[?1002h").pipe(Schema.brand("EnableButtonEventTracking"));
export const DisableButtonEventTracking = Schema.Literal("\x1b[?1002l").pipe(
  Schema.brand("DisableButtonEventTracking"),
);
export const EnableAnyEventTracking = Schema.Literal("\x1b[?1003h").pipe(Schema.brand("EnableAnyEventTracking"));
export const DisableAnyEventTracking = Schema.Literal("\x1b[?1003l").pipe(Schema.brand("DisableAnyEventTracking"));
export const EnableSGRMouseMode = Schema.Literal("\x1b[?1006h").pipe(Schema.brand("EnableSGRMouseMode"));
export const DisableSGRMouseMode = Schema.Literal("\x1b[?1006l").pipe(Schema.brand("DisableSGRMouseMode"));

export const ExitOnCtrlC = Schema.Literal("\u0003").pipe(Schema.brand("ExitOnCtrlC"));
export const isExitOnCtrlC = Schema.is(ExitOnCtrlC);

export const scrollDown = Effect.fn(function* (lines: number) {
  return `\x1b[${lines}T`;
});

export const scrollUp = Effect.fn(function* (lines: number) {
  return `\x1b[${lines}S`;
});

export const moveCursor = Effect.fn(function* (x: number, y: number) {
  return `\x1b[${y};${x}H`;
});

export const moveCursorAndClear = Effect.fn(function* (x: number, y: number) {
  return `\x1b[${y};${x}f`;
});

export const setRgbBackground = Effect.fn(function* (r: number, g: number, b: number) {
  return `\x1b[48;2;${r};${g};${b}m`;
});

export const makeRoomForRenderer = Effect.fn(function* (height: number) {
  return `\x1b[${height}A`;
});

export const clearRendererSpace = Effect.fn(function* (height: number) {
  return `\x1b[${height}A\x1b[1G\x1b[J`;
});
