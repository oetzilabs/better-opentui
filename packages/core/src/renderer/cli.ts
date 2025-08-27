import { DevTools } from "@effect/experimental";
import { BunSocket } from "@effect/platform-bun";
import { toRequest } from "@effect/platform-bun/BunHttpServerRequest";
import { Cause, Context, Duration, Effect, Exit, Fiber, Layer, Mailbox, Ref, Schedule, Schema } from "effect";
import type { NoSuchElementException } from "effect/Cause";
import {
  isDumpBuffersCommand,
  isDumpHitGridCommand,
  isExitOnCtrlC,
  makeRoomForRenderer,
  moveCursor,
  moveCursorAndClear,
  QueryPixelSize,
  ResetBackground,
  ResetCursorColor,
  SaveCursorState,
  setRgbBackground,
  ShowCursor,
  SwitchToAlternateScreen,
  SwitchToMainScreen,
} from "../ansi";
import { OptimizedBuffer } from "../buffer/optimized";
import { Colors, Input } from "../colors";
import { OpenTuiConfig, OpenTuiConfigLive } from "../config";
import type { Style } from "../cursor-style";
import {
  NextBufferNotAvailable,
  WritingToBufferError,
  type Collection,
  type RendererFailedToCheckHit,
} from "../errors";
import { KeyboardEvent } from "../events/keyboard";
import { MouseEvent } from "../events/mouse";
import { ParsedKey, parse as parseKey } from "../inputs/keyboard";
import {
  isLeftMouseButton,
  isMouseDown,
  isMouseDrag,
  isMouseMove,
  isMouseScroll,
  isMouseUp,
  MouseDragEnd,
  MouseDrop,
  MouseOut,
  MouseOver,
  MouseParser,
  MouseParserLive,
} from "../inputs/mouse";
import type { RunnerEvent, RunnerEventMap, RunnerHooks } from "../run";
import type { SelectionState } from "../types";
import { parseColor } from "../utils";
import { Library } from "../zig";
import { Elements, ElementsLive, type ElementElement, type MethodParameters, type Methods } from "./elements";
import type { BaseElement } from "./elements/base";
import { Shutdown } from "./latch/shutdown";
import type { PixelResolution } from "./utils";
import { PositionAbsolute, PositionRelative } from "./utils/position";
import { Selection } from "./utils/selection";

const DevToolsLive = DevTools.layerWebSocket().pipe(Layer.provide(BunSocket.layerWebSocketConstructor));

export type ShutdownReason =
  | {
      type: "exit";
      code: number;
      cause?: Exit.Exit<any, any>;
    }
  | {
      type: "ctrl-c";
    }
  | {
      type: "signal";
      signal: NodeJS.Signals;
    };

class AnimationFrameClass {
  private static animationFrameId = 0;
  public getNext() {
    const id = AnimationFrameClass.animationFrameId++;
    return id;
  }
}

class AnimationFrame extends Context.Tag("AnimationFrame")<AnimationFrame, AnimationFrameClass>() {}

const AnimationFrameLive = Layer.succeed(AnimationFrame, new AnimationFrameClass());

type HookRecord<E extends RunnerEvent> = {
  on?: HookFunction<E>;
  off?: HookFunction<E>;
};

type HookMap = {
  [E in RunnerEvent]: HookRecord<E>;
};

export type HookFunction<Event extends RunnerEvent, R = void> = (
  ...args: RunnerEventMap[Event]
) => Effect.Effect<R, Collection, Library>;

export type CapturedOutput = {
  stream: "stdout" | "stderr";
  output: string;
};

export class CliRenderer extends Effect.Service<CliRenderer>()("CliRenderer", {
  dependencies: [OpenTuiConfigLive, MouseParserLive, ElementsLive, DevToolsLive, AnimationFrameLive],
  scoped: Effect.gen(function* () {
    const shutdown = yield* Shutdown;
    const cfg = yield* OpenTuiConfig;
    const animationFrame = yield* AnimationFrame;
    const config = yield* cfg.get();

    const outputCache = yield* Ref.make<CapturedOutput[]>([]);

    const _isRunning = yield* Ref.make(false);
    const _isShuttingDown = yield* Ref.make(false);
    const _isDestroyed = yield* Ref.make(false);
    const _isWaitingForPixelResolution = yield* Ref.make(false);
    const internalHooks = yield* Ref.make(new Map<RunnerEvent, HookMap[RunnerEvent]>());

    const updateFiber = yield* Ref.make<Fiber.RuntimeFiber<number, Error> | null>(null);
    const renderFiber = yield* Ref.make<Fiber.RuntimeFiber<number, Error> | null>(null);
    const memorySnapshotTimer = yield* Ref.make<Fiber.RuntimeFiber<number, Error> | null>(null);
    const lastMemorySnapshot = yield* Ref.make<{ heapUsed: number; heapTotal: number; arrayBuffers: number }>({
      heapUsed: 0,
      heapTotal: 0,
      arrayBuffers: 0,
    });

    const _splitHeight = yield* Ref.make(0);
    const _width = yield* Ref.make(config.width);
    const _height = yield* Ref.make(config.height);
    const _terminalWidth = yield* Ref.make(0);
    const _terminalHeight = yield* Ref.make(0);
    const _renderOffset = yield* Ref.make(0);

    const _useAlternateScreen = yield* Ref.make(true);
    const _useMouse = yield* Ref.make(true);

    const lastTime = yield* Ref.make(0);
    const frameCount = yield* Ref.make(0);
    const lastFpsTime = yield* Ref.make(0);
    const currentFps = yield* Ref.make(0);
    const targetFrameTime = yield* Ref.make(0);

    const mouseParser = yield* MouseParser;
    const _enableMouseMovement = yield* Ref.make(config.enableMouseMovement);

    const elements = yield* Elements;

    const buffers = yield* Ref.make<{
      next: OptimizedBuffer | null;
      current: OptimizedBuffer | null;
    }>({
      next: null,
      current: null,
    });

    const targetFps = yield* Ref.make(config.targetFps);

    const lib = yield* Library;

    const memorySnapshotInterval = yield* Ref.make(config.memorySnapshotInterval);

    const renderer = yield* lib.createRenderer(config.width, config.height);
    const debug = yield* Ref.make(config.debugOverlay.enabled);

    const capturedRenderable = yield* Ref.make<BaseElement<any, any> | null>(null);

    const rendering = yield* Ref.make(false);
    const renderStats = yield* Ref.make({
      frameCount: 0,
      fps: 0,
      renderTime: 0,
      frameCallbackTime: 0,
    });
    const animationRequest = new Map<number, FrameRequestCallback>();
    const frameCallbacks = yield* Ref.make<((deltaTime: number) => Effect.Effect<void>)[]>([]);

    const postProcessFns = yield* Ref.make<((buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void>)[]>([]);

    const gatherStats = yield* Ref.make(false);
    const frameTimes = yield* Ref.make<number[]>([]);
    const maxStatSamples = yield* Ref.make(300);

    const resizeFiber = yield* Ref.make<Fiber.RuntimeFiber<number, Error> | null>(null);

    const errors = yield* Ref.make<Set<Cause.Cause<unknown> | Collection | NoSuchElementException>>(new Set());

    const lastOverRenderableNum = yield* Ref.make(0);

    const selectionState = yield* Ref.make<SelectionState | null>(null);
    const currentSelection = yield* Ref.make<Selection | null>(null);
    const selectionContainers = yield* Ref.make<Array<BaseElement<any, any>>>([]);
    const lastOverRenderable = yield* Ref.make<BaseElement<any, any> | undefined>(undefined);

    const _useConsole = yield* Ref.make(false);
    const _resolution = yield* Ref.make<PixelResolution | null>(null);
    const _useThread = yield* Ref.make(config.useThread);
    yield* lib.setUseThread(renderer, config.useThread);

    const backgroundColor = yield* Ref.make<Input>(Colors.Transparent);
    const terminalInputFork = yield* Ref.make<Fiber.RuntimeFiber<
      void,
      Collection | Cause.NoSuchElementException
    > | null>(null);
    const resizeFork = yield* Ref.make<Fiber.RuntimeFiber<never, Error | NoSuchElementException> | null>(null);
    const signalWatcherFork = yield* Ref.make<Fiber.RuntimeFiber<never, Error | NoSuchElementException> | null>(null);

    const stdin = process.stdin;
    const stdout = process.stdout;
    const realStdoutWrite = stdout.write;

    const root = yield* elements.root({
      width: Effect.fn(function* () {
        return yield* Ref.get(_width);
      }),
      height: Effect.fn(function* () {
        return yield* Ref.get(_height);
      }),
      addToHitGrid: Effect.fn(function* (x: number, y: number, width: number, height: number, id: number) {
        const cr = yield* Ref.get(capturedRenderable);
        if (id !== cr?.num) {
          yield* lib.addToHitGrid(renderer, x, y, width, height, id);
        }
      }),
    });

    const debugBox = yield* elements.text("N", {
      focused: false,
      selectable: false,
      visible: false,
      position: PositionAbsolute.make(2),
      width: "auto",
      height: "auto",
      colors: {
        fg: Colors.Red,
        bg: Colors.Transparent,
      },
    });

    const errorBox = yield* elements.box({
      // zIndex: Number.MAX_SAFE_INTEGER - 100,
      visible: true,
      title: "Error",
      left: 0,
      top: 0,
      width: "auto",
      height: "auto",
      colors: {
        bg: Colors.Transparent,
      },
    });

    const start = Effect.fn(function* () {
      const ir = yield* Ref.get(_isRunning);
      const isD = yield* Ref.get(_isDestroyed);
      if (ir || isD) return;
      yield* Ref.set(_isRunning, true);
      const msl = yield* Ref.get(memorySnapshotInterval);
      if (msl > 0) {
        yield* startMemorySnapshotTimer();
      }
      yield* Effect.all([startUpdateLoop(), startRenderLoop()], {
        concurrency: "unbounded",
        concurrentFinalizers: true,
      });
    });

    const writeOut = Effect.fn(function* (chunk: string, encoding: BufferEncoding = "utf8") {
      const buffer = Buffer.from(chunk);
      const sent = yield* Effect.async<boolean, WritingToBufferError>((resume) => {
        const sent = realStdoutWrite.call(stdout, buffer, encoding, (err) => {
          if (err) {
            return resume(Effect.fail(new WritingToBufferError({ cause: err })));
          } else {
            return resume(Effect.succeed(true));
          }
        });
        return resume(Effect.succeed(sent));
      });
      return yield* Effect.succeed(sent);
    });

    const getUseConsole = Effect.fn(function* () {
      return yield* Ref.get(_useConsole);
    });

    const setUseConsole = Effect.fn(function* (value: boolean) {
      yield* Ref.set(_useConsole, value);
    });

    const isRunning = Effect.fn(function* () {
      return yield* Ref.get(_isRunning);
    });

    const getResolution = Effect.fn(function* () {
      return yield* Ref.get(_resolution);
    });

    const getTerminalWidth = Effect.fn(function* () {
      return yield* Ref.get(_terminalWidth);
    });

    const getTerminalHeight = Effect.fn(function* () {
      return yield* Ref.get(_terminalHeight);
    });

    const getUseThread = Effect.fn(function* () {
      return yield* Ref.get(_useThread);
    });

    const getUseMouse = Effect.fn(function* () {
      return yield* Ref.get(_useMouse);
    });

    const setUseMouse = Effect.fn(function* (useMouse: boolean) {
      yield* Ref.set(_useMouse, useMouse);
    });

    const disableStdoutInterception = Effect.fn(function* () {});

    const flushStdoutCache = Effect.fn(function* (space: number, force: boolean = false) {
      // if (capture.size === 0 && !force) return false;

      // const output = capture.claimOutput();
      const th = yield* Ref.get(_terminalHeight);
      const sh = yield* Ref.get(_splitHeight);
      const rendererStartLine = th - sh;
      const output = "";
      const flush = yield* moveCursorAndClear(rendererStartLine, 1);

      const outputLine = th - sh;
      const move = yield* moveCursor(outputLine, 1);

      const bgc = yield* Ref.get(backgroundColor);
      const bgColor = yield* parseColor(bgc);
      const bgcInts = bgColor.toInts();
      const w = yield* Ref.get(_width);
      const newlines = " ".repeat(w) + "\n".repeat(space);
      const sbg = yield* setRgbBackground(bgcInts[0], bgcInts[1], bgcInts[2]);
      const clear = sbg + newlines + ResetBackground.make("\u001B[49m");

      yield* writeOut(flush + move + output + clear);

      return true;
    });

    const enableMouse = Effect.fn(function* () {
      const emm = yield* Ref.get(_enableMouseMovement);
      yield* lib.enableMouse(renderer, emm);
    });

    const disableMouse = Effect.fn(function* () {
      yield* lib.disableMouse(renderer);
    });

    const setUseThread = Effect.fn(function* () {});

    const setTerminalSize = Effect.fn(function* (width: number, height: number) {
      yield* Ref.set(_width, width);
      yield* Ref.set(_height, height);
    });

    function setHook<E extends RunnerEvent>(
      map: Map<RunnerEvent, HookMap[RunnerEvent]>,
      event: E,
      hook: HookRecord<E>,
    ) {
      const existing = map.get(event) as HookRecord<E> | undefined;
      map.set(event, {
        ...existing,
        ...hook,
      } as HookRecord<E>);
      return map;
    }

    const getHook = Effect.fn(function* (event: RunnerEvent) {
      const hooks = yield* Ref.get(internalHooks);
      const hook = hooks.get(event);
      return hook as HookRecord<RunnerEvent>;
    });

    const getElementCount = Effect.fn(function* () {
      const elements = yield* root.getElementsCount();
      return elements;
    });

    const setupTerminal = Effect.fn("cli.setupTerminal")(function* (
      latch: Effect.Latch,
      options?: {
        debug?: boolean;
        hooks?: RunnerHooks;
      },
    ) {
      yield* writeOut(SaveCursorState.make("\u001B[s"));
      yield* cfg.update("debugOverlay", (cfg) => ({
        ...cfg,
        enabled: options?.debug ?? false,
      }));

      if (options?.debug) {
        yield* debugBox.setVisible(true);
      }

      const um = yield* getUseMouse();
      if (um) {
        yield* enableMouse();
      } else {
        yield* disableMouse();
      }
      if (options && options.hooks) {
        const hooks = options.hooks;
        yield* Ref.update(internalHooks, (hs) => {
          let copy = new Map<RunnerEvent, HookMap[RunnerEvent]>(hs);

          (Object.keys(hooks.on ?? {}) as RunnerEvent[]).forEach((event) => {
            const on = hooks.on?.[event] as HookFunction<keyof RunnerEventMap> | undefined;
            if (on) {
              copy = setHook<typeof event>(copy, event, { on });
            }
          });

          (Object.keys(hooks.off ?? {}) as RunnerEvent[]).forEach((event) => {
            const off = hooks.off?.[event] as HookFunction<keyof RunnerEventMap> | undefined;
            if (off) {
              copy = setHook<typeof event>(copy, event, { off });
            }
          });

          return copy;
        });
      }

      const readResize = Effect.gen(function* () {
        const mailbox = yield* Mailbox.make<{ width: number; height: number }>();

        const handleResizeEvt = () => {
          const width = process.stdout.columns || 80;
          const height = process.stdout.rows || 24;
          mailbox.unsafeOffer({ width, height });
        };

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            process.off("SIGWINCH", handleResizeEvt);
          }),
        );

        process.on("SIGWINCH", handleResizeEvt);

        return mailbox as Mailbox.ReadonlyMailbox<{ width: number; height: number }>;
      });

      const rsmb = yield* readResize;
      const rsf = yield* rsmb.take.pipe(
        Effect.tap(({ width, height }) =>
          Effect.gen(function* () {
            yield* handleResize(width, height);
            const resize = yield* getHook("resize");
            if (resize && resize.on) {
              yield* resize.on(width, height);
            }
          }),
        ),
        Effect.forever,
        Effect.fork,
      );
      yield* Ref.set(resizeFork, rsf);

      if (stdin.setRawMode) {
        stdin.setRawMode(true);
      }
      stdin.resume();
      stdin.setEncoding("utf8");

      const readData = Effect.gen(function* () {
        const mailbox = yield* Mailbox.make<Buffer>();
        const handleData = (data: Buffer) => {
          mailbox.unsafeOffer(data);
          if (isExitOnCtrlC(data.toString())) {
            mailbox.unsafeDone(Exit.void);
          }
        };
        const handleEnd = () => {
          mailbox.unsafeDone(Exit.void);
        };
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            stdin.off("data", handleData);
            stdin.off("end", handleEnd);
          }),
        );
        stdin.on("data", handleData);
        stdin.on("end", handleEnd);
        return mailbox as Mailbox.ReadonlyMailbox<Buffer>;
      });

      const mb = yield* readData;
      const f = yield* mb.take.pipe(
        Effect.tap(
          Effect.fn("cli.setupTerminal.readData.tap")(function* (data) {
            const ir = yield* Ref.get(_isRunning);
            const isD = yield* Ref.get(_isDestroyed);
            if (!ir || isD) return;
            const str = data.toString();
            const wfpr = yield* Ref.get(_isWaitingForPixelResolution);
            const numberParser = Schema.decodeUnknown(Schema.Int);
            if (wfpr && /\x1b\[4;\d+;\d+t/.test(str)) {
              const match = str.match(/\x1b\[4;(\d+);(\d+)t/);
              if (match) {
                const resolution: PixelResolution = {
                  width: yield* numberParser(match[2]).pipe(
                    Effect.catchTags({
                      ParseError: () => Effect.succeed(config.width),
                    }),
                  ),
                  height: yield* numberParser(match[1]).pipe(
                    Effect.catchTags({
                      ParseError: () => Effect.succeed(config.height),
                    }),
                  ),
                };
                yield* Ref.set(_resolution, resolution);
                // yield* handleResize(resolution.width, resolution.height);
                yield* Ref.set(_isWaitingForPixelResolution, false);
                const resize = yield* getHook("resize");
                if (resize && resize.on) {
                  yield* resize.on(resolution.width, resolution.height);
                }
                return;
              }
            }

            const parsedKey = yield* parseKey(data);
            yield* Effect.annotateCurrentSpan("parsedKey", parsedKey);
            if (parsedKey) {
              if (isExitOnCtrlC(parsedKey.raw)) {
                return yield* shutdown.run;
              }
              if (isDumpHitGridCommand(parsedKey.raw)) {
                yield* lib.dumpHitGrid(renderer).pipe(
                  Effect.catchAll((cause) =>
                    Effect.gen(function* () {
                      yield* Ref.update(errors, (errors) => errors.add(cause));
                      return yield* Effect.void;
                    }),
                  ),
                );
                return true;
              }
              if (isDumpBuffersCommand(parsedKey.raw)) {
                yield* lib.dumpBuffers(renderer).pipe(
                  Effect.catchAll((cause) =>
                    Effect.gen(function* () {
                      yield* Ref.update(errors, (errors) => errors.add(cause));
                      return yield* Effect.void;
                    }),
                  ),
                );
                return true;
              }
            }

            const keyboardHandler = Effect.gen(function* () {
              if (parsedKey) {
                const hkb = yield* handleKeyboardData(parsedKey).pipe(
                  Effect.catchAll((cause) =>
                    Effect.gen(function* () {
                      yield* Ref.update(errors, (errors) => errors.add(cause));
                      return yield* Effect.succeed(false);
                    }),
                  ),
                );
                yield* Effect.annotateCurrentSpan("handleKeyboardData", hkb);
                return hkb;
              }
              return false;
            });

            const mouseHandler = Effect.gen(function* () {
              const um = yield* getUseMouse();
              if (um) {
                // yield* Effect.log(data.toString());
                const hm = yield* handleMouseData(data).pipe(
                  Effect.catchAll((cause) =>
                    Effect.gen(function* () {
                      yield* Ref.update(errors, (errors) => errors.add(cause));
                      return yield* Effect.succeed(false);
                    }),
                  ),
                );
                yield* Effect.annotateCurrentSpan("handleMouseData", hm);
                return hm;
              } else {
                return yield* Effect.succeed(false);
              }
            });

            const handlerResults = yield* Effect.all([keyboardHandler, mouseHandler], {
              concurrency: "unbounded",
              concurrentFinalizers: true,
            });

            yield* Effect.annotateCurrentSpan("handlerResults", handlerResults);
          }),
        ),
        Effect.forever,
        Effect.tapError((cause) => Ref.update(errors, (errs) => errs.add(cause))),
        Effect.retry(Schedule.recurs(10)),
        Effect.fork,
      );
      yield* Ref.set(terminalInputFork, f);

      const signals = ["SIGINT", "SIGTERM", "SIGQUIT", "SIGABRT", "SIGHUP"] as const;

      const readSignals = Effect.gen(function* () {
        const mailbox = yield* Mailbox.make<NodeJS.Signals>();

        const handlers = signals.map((signal) => {
          const handler = () => mailbox.unsafeOffer(signal);
          process.on(signal, handler);
          return [signal, handler] as const;
        });

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            for (const [signal, handler] of handlers) {
              process.off(signal, handler);
            }
          }),
        );

        return mailbox as Mailbox.ReadonlyMailbox<NodeJS.Signals>;
      });

      const signalmb = yield* readSignals;
      const signalFork = yield* signalmb.take.pipe(
        Effect.tap(
          Effect.fn(function* (signal) {
            const isD = yield* Ref.get(_isDestroyed);
            if (!isD) return;
            const ih = yield* Ref.get(internalHooks);
            const exit = ih.get("exit") as HookFunction<"exit"> | undefined;
            if (exit) {
              yield* exit({ type: "signal", signal });
            }
          }),
        ),
        Effect.forever,
        Effect.fork,
      );
      yield* Ref.set(signalWatcherFork, signalFork);

      global.requestAnimationFrame = (callback: FrameRequestCallback) => {
        const id = animationFrame.getNext();
        animationRequest.set(id, callback);
        return id;
      };
      global.cancelAnimationFrame = (handle: number) => {
        animationRequest.delete(handle);
      };

      const window = global.window;
      if (!window) {
        global.window = {} as Window & typeof globalThis;
      }
      global.window.requestAnimationFrame = requestAnimationFrame;

      yield* queryPixelResolution();

      const uas = yield* Ref.get(_useAlternateScreen);
      if (uas) {
        yield* writeOut(SwitchToAlternateScreen.make("\u001B[?1049h"));
      } else {
        const h = yield* Ref.get(_height);
        yield* writeOut(yield* makeRoomForRenderer(h - 1));
      }
      yield* setCursorPosition(0, 0, false);
    });

    const handleMouseData = Effect.fn("cli.handleMouseData")(function* (data: Buffer) {
      const mouseEvent = yield* mouseParser.parse(data);

      yield* Effect.annotateCurrentSpan("cli.handleMouseData.mouseEvent", mouseEvent);
      if (mouseEvent) {
        const sh = yield* Ref.get(_splitHeight);
        if (sh > 0) {
          const ro = yield* Ref.get(_renderOffset);
          if (mouseEvent.y < ro) {
            return false;
          }
          mouseEvent.y -= ro;
        }

        yield* debugBox.setLocation({ x: mouseEvent.x, y: mouseEvent.y });

        const maybeRenderableId = yield* lib.checkHit(renderer, mouseEvent.x, mouseEvent.y);
        const maybeRenderable = yield* elements.getRenderable(maybeRenderableId);

        if (isMouseScroll(mouseEvent.type)) {
          yield* Effect.annotateCurrentSpan("cli.handleMouseData.mouseScroll", mouseEvent);
          // yield* debugBox.setContent(`MScroll (${maybeRenderableId}`);

          if (maybeRenderable) {
            const event = new MouseEvent(maybeRenderable, mouseEvent);
            yield* maybeRenderable.processMouseEvent(event);
          }
          return true;
        }

        const lrn = yield* Ref.get(lastOverRenderableNum);
        const sameElement = maybeRenderableId === lrn;
        yield* Ref.set(lastOverRenderableNum, maybeRenderableId);
        if (isMouseDown(mouseEvent.type) && isLeftMouseButton(mouseEvent.button)) {
          // yield* debugBox.setForegroundColor(Colors.White);
          yield* Effect.annotateCurrentSpan("cli.handleMouseData.mouseDown", mouseEvent);
          if (maybeRenderable) {
            // yield* debugBox.setContent(`MDo (${maybeRenderableId})`);
            const sel = yield* Ref.get(maybeRenderable.selectable);
            if (sel) {
              const sss = yield* maybeRenderable.shouldStartSelection(mouseEvent.x, mouseEvent.y);
              if (sss) {
                yield* startSelection(maybeRenderable, mouseEvent.x, mouseEvent.y);
                return true;
              }
            }
          }
        }
        const cs = yield* Ref.get(selectionState);
        if (isMouseDrag(mouseEvent.type) && cs?.isSelecting && maybeRenderable) {
          yield* updateSelection(maybeRenderable, mouseEvent.x, mouseEvent.y);
          return true;
        }

        if (isMouseUp(mouseEvent.type) && cs?.isSelecting) {
          yield* Effect.annotateCurrentSpan("mouseUp", mouseEvent);
          yield* finishSelection();
          return true;
        }

        if (isMouseDown(mouseEvent.type) && isLeftMouseButton(mouseEvent.button) && cs) {
          yield* Effect.annotateCurrentSpan("cli.handleMouseData.mouseDown", mouseEvent);
          yield* clearSelection();
        }

        if (!sameElement && (isMouseDrag(mouseEvent.type) || isMouseMove(mouseEvent.type))) {
          yield* Effect.annotateCurrentSpan("cli.handleMouseData.mouseDrag|cli.handleMouseData.mouseMove", mouseEvent);
          const lor = yield* Ref.get(lastOverRenderable);
          const cr = yield* Ref.get(capturedRenderable);
          if (lor && lor !== cr) {
            const event = new MouseEvent(lor, { ...mouseEvent, type: MouseOut.make("out") });
            yield* lor.processMouseEvent(event);
          }
          yield* Ref.set(lastOverRenderable, maybeRenderable);
          if (maybeRenderable) {
            const event = new MouseEvent(maybeRenderable, {
              ...mouseEvent,
              type: MouseOver.make("over"),
              source: cr,
            });
            yield* maybeRenderable.processMouseEvent(event);
          }
        }

        let cr = yield* Ref.get(capturedRenderable);
        if (cr && !isMouseUp(mouseEvent.type)) {
          yield* Effect.annotateCurrentSpan("cli.handleMouseData.not.mouseUp", mouseEvent);
          const event = new MouseEvent(cr, mouseEvent);
          yield* cr.processMouseEvent(event);
          return true;
        }

        if (cr && isMouseUp(mouseEvent.type)) {
          yield* Effect.annotateCurrentSpan("cli.handleMouseData.mouseUp", mouseEvent);
          const event = new MouseEvent(cr, { ...mouseEvent, type: MouseDragEnd.make("drag-end") });
          yield* cr.processMouseEvent(event);
          yield* cr.processMouseEvent(new MouseEvent(cr, mouseEvent));
          if (maybeRenderable) {
            const event = new MouseEvent(maybeRenderable, {
              ...mouseEvent,
              type: MouseDrop.make("drop"),
              source: cr,
            });
            yield* maybeRenderable.processMouseEvent(event);
          }
          yield* Ref.set(lastOverRenderable, cr);
          yield* Ref.set(lastOverRenderableNum, cr.num);
          yield* Ref.set(capturedRenderable, null);
        }

        if (maybeRenderable) {
          if (isMouseDrag(mouseEvent.type) && isLeftMouseButton(mouseEvent.button)) {
            yield* Ref.set(capturedRenderable, maybeRenderable);
          } else {
            yield* Ref.set(capturedRenderable, null);
          }
          const event = new MouseEvent(maybeRenderable, mouseEvent);
          yield* maybeRenderable.processMouseEvent(event);
          return true;
        }

        yield* Ref.set(capturedRenderable, null);
        yield* Ref.set(lastOverRenderable, undefined);
        return true;
      }

      return false;
    });

    const handleKeyboardData = Effect.fn("cli.handleKeyboardData")(function* (parsedKey: ParsedKey) {
      const keyboardEvent = new KeyboardEvent(root, {
        ...parsedKey,
        source: root,
        type: "keydown",
      });

      yield* root.processKeyboardEvent(keyboardEvent);

      return true;
    });

    const takeMemorySnapshot = Effect.fn("cli.takeMemorySnapshot")(function* () {
      const memoryUsage = process.memoryUsage();
      const lms = {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        arrayBuffers: memoryUsage.arrayBuffers,
      };
      yield* Ref.set(lastMemorySnapshot, lms);

      yield* lib.updateMemoryStats(renderer, lms.heapUsed, lms.heapTotal, lms.arrayBuffers);
      yield* Effect.annotateCurrentSpan("renderer.takeMemorySnapshot", lms);
      // const humanlyReadable = {
      //   heapUsed: (lms.heapUsed / 1024 / 1024).toFixed(2) + "MB",
      //   heapTotal: (lms.heapTotal / 1024 / 1024).toFixed(2) + "MB",
      //   arrayBuffers: (lms.arrayBuffers / 1024 / 1024).toFixed(2) + "MB",
      // };

      // const text = `${humanlyReadable.heapUsed} | ${humanlyReadable.heapTotal} | ${humanlyReadable.arrayBuffers}`;
    });

    const startMemorySnapshotTimer = Effect.fn("cli.startMemorySnapshotTimer")(function* () {
      const mst = yield* Ref.get(memorySnapshotTimer);
      if (mst) {
        yield* Fiber.interrupt(mst);
      }

      const msi = yield* Ref.get(memorySnapshotInterval);
      const duration = Duration.millis(msi);
      const fiber = yield* Effect.fork(takeMemorySnapshot().pipe(Effect.repeat(Schedule.spaced(duration))));
      yield* Ref.set(memorySnapshotTimer, fiber);
    });

    const setMemorySnapshotInterval = Effect.fn("cli.setMemorySnapshotInterval")(function* (interval: number) {
      yield* Ref.set(memorySnapshotInterval, interval);
      const ir = yield* Ref.get(_isRunning);
      const mst = yield* Ref.get(memorySnapshotTimer);
      if (ir && interval > 0) {
        yield* startMemorySnapshotTimer();
      } else if (interval <= 0 && mst) {
        yield* Fiber.interrupt(mst);
        yield* Ref.set(memorySnapshotTimer, null);
      }
    });

    const handleResize = Effect.fn("cli.handleResize")(function* (width: number, height: number) {
      const isD = yield* Ref.get(_isShuttingDown);
      if (isD) return;
      // const sh = yield* Ref.get(_splitHeight);
      // if (sh > 0) {
      //   return yield* processResize(width, height);
      // }
      // yield* Effect.logWithLevel(LogLevel.Debug, "Resize", width, height);

      return yield* processResize(width, height);
    });

    const queryPixelResolution = Effect.fn("cli.queryPixelResolution")(function* () {
      yield* Ref.set(_isWaitingForPixelResolution, true);
      yield* writeOut(QueryPixelSize.make("\u001B[14t"));
    });

    const processResize = Effect.fn("cli.processResize")(function* (width: number, height: number) {
      let tw = yield* Ref.get(_terminalWidth);
      let th = yield* Ref.get(_terminalHeight);
      if (width === tw && height === th) return;

      const prevWidth = tw;

      tw = yield* Ref.updateAndGet(_terminalWidth, (tw) => width);
      th = yield* Ref.updateAndGet(_terminalHeight, (th) => height);
      // yield* queryPixelResolution();

      yield* Ref.set(capturedRenderable, null);
      yield* mouseParser.reset();
      const sh = yield* Ref.get(_splitHeight);
      if (sh > 0) {
        if (width < prevWidth) {
          const start = th - sh * 2;
          const flush = yield* moveCursorAndClear(start, 1);
          yield* writeOut(flush);
        }
        // this.renderOffset = h - sh;
        const ro = yield* Ref.updateAndGet(_renderOffset, (x) => height - sh);
        yield* Ref.set(_width, width);

        yield* Ref.set(_height, sh);
        const c = yield* parseColor(Colors.Black);
        const buf = yield* Ref.get(buffers);
        if (!buf.current) return;
        yield* buf.current.clearLocal(c, "\u0a00");
        yield* lib.setRenderOffset(renderer, ro);
      } else {
        yield* Ref.update(_width, (w) => width);
        yield* Ref.update(_height, (h) => height);
      }
      const w = yield* Ref.get(_width);
      const h = yield* Ref.get(_height);

      yield* lib.resizeRenderer(renderer, w, h);

      const nrba = yield* lib.getNextBuffer(renderer);
      const nextRenderBuffer = new OptimizedBuffer(nrba.bufferPtr, nrba.buffers, nrba.width, nrba.height, {});

      const crba = yield* lib.getCurrentBuffer(renderer);
      const currentRenderBuffer = new OptimizedBuffer(crba.bufferPtr, crba.buffers, crba.width, crba.height, {});

      yield* Ref.set(buffers, {
        next: nextRenderBuffer,
        current: currentRenderBuffer,
      });

      yield* root.onResize(w, h);
    });

    // running the processResize once.
    yield* processResize(config.width, config.height);

    const setBackgroundColor = Effect.fn("cli.setBackgroundColor")(function* (
      option: ((oldColor: Input) => Input) | Input,
    ) {
      if (typeof option !== "function") {
        const parsedColor = yield* parseColor(option);
        yield* lib.setBackgroundColor(renderer, parsedColor);
        yield* Ref.set(backgroundColor, option);
        const buf = yield* Ref.get(buffers);
        if (!buf.next) return;
        yield* buf.next.clear(parsedColor);
      } else {
        const oldColor = yield* Ref.get(backgroundColor);
        const newColor = option(oldColor);
        const parsedNewColor = yield* parseColor(newColor);
        yield* lib.setBackgroundColor(renderer, parsedNewColor);
        yield* Ref.update(backgroundColor, option);
        const buf = yield* Ref.get(buffers);
        if (!buf.next) return;
        yield* buf.next.clear(parsedNewColor);
      }
    });

    const toggleDebugOverlay = Effect.fn("cli.toggleDebugOverlay")(function* () {
      const updatedConfig = yield* cfg.update("debugOverlay", (cfg) => ({
        ...cfg,
        debugOverlay: {
          ...cfg.debugOverlay,
          enabled: !cfg.debugOverlay.enabled,
        },
      }));
    });

    const configureDebugOverlay = Effect.fn("cli.configureDebugOverlay")(function* () {
      yield* lib.setDebugOverlay(renderer, config.debugOverlay.enabled, config.debugOverlay.corner);
    });

    const clearTerminal = Effect.fn("cli.clearTerminal")(function* () {
      yield* lib.clearTerminal(renderer);
    });

    const dumpHitGrid = Effect.fn("cli.dumpHitGrid")(function* () {
      yield* lib.dumpHitGrid(renderer);
    });

    const dumpBuffers = Effect.fn("cli.dumpBuffers")(function* (timestamp?: number) {
      yield* lib.dumpBuffers(renderer, timestamp);
    });

    const dumpStdoutBuffer = Effect.fn("cli.dumpStdoutBuffer")(function* (timestamp?: number) {
      yield* lib.dumpStdoutBuffer(renderer, timestamp);
    });

    const setCursorPosition = Effect.fn("cli.setCursorPosition")(function* (
      x: number,
      y: number,
      visible: boolean = true,
    ) {
      yield* lib.setCursorPosition(x, y, visible);
    });

    const setCursorStyle = Effect.fn("cli.setCursorStyle")(function* (
      style: Style,
      blinking: boolean = false,
      color?: Input,
    ) {
      yield* lib.setCursorStyle(style, blinking);
      if (color) {
        const parsedColor = yield* parseColor(color);
        yield* lib.setCursorColor(parsedColor);
      }
    });

    const setCursorColor = Effect.fn("cli.setCursorColor")(function* (color: Input) {
      const parsedColor = yield* parseColor(color);
      yield* lib.setCursorColor(parsedColor);
    });

    const addPostProcessFn = Effect.fn("cli.addPostProcessFn")(function* (
      processFn: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void>,
    ) {
      yield* Ref.update(postProcessFns, (fns) => {
        fns.push(processFn);
        return fns;
      });
    });

    const removePostProcessFn = Effect.fn("cli.removePostProcessFn")(function* (
      processFn: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void>,
    ) {
      yield* Ref.update(postProcessFns, (fns) => fns.filter((fn) => fn !== processFn));
    });

    const clearPostProcessFns = Effect.fn("cli.clearPostProcessFns")(function* () {
      yield* Ref.set(postProcessFns, []);
    });

    const setFrameCallback = Effect.fn("cli.setFrameCallback")(function* (
      callback: (deltaTime: number) => Effect.Effect<void>,
    ) {
      yield* Ref.update(frameCallbacks, (fcbs) => {
        fcbs.push(callback);
        return fcbs;
      });
    });

    const removeFrameCallback = Effect.fn("cli.removeFrameCallback")(function* (
      callback: (deltaTime: number) => Effect.Effect<void>,
    ) {
      yield* Ref.update(frameCallbacks, (fcbs) => fcbs.filter((fcb) => fcb !== callback));
    });

    const clearFrameCallbacks = Effect.fn("cli.clearFrameCallbacks")(function* () {
      yield* Ref.set(frameCallbacks, []);
    });

    const pause = Effect.fn("cli.pause")(function* () {
      yield* Ref.set(_isRunning, false);
    });

    const stop = Effect.fn("cli.stop")(function* () {
      const isd = yield* Ref.get(_isShuttingDown);
      const ir = yield* Ref.get(_isRunning);
      if (isd && ir) return;
      yield* Ref.set(_isRunning, false);
      yield* Ref.set(_isShuttingDown, true);
      yield* Ref.set(_isWaitingForPixelResolution, false);

      yield* disableStdoutInterception();

      const tif = yield* Ref.get(terminalInputFork);
      if (tif) {
        yield* Fiber.interrupt(tif);
        yield* Ref.set(terminalInputFork, null);
      }

      const rf = yield* Ref.get(renderFiber);
      if (rf) {
        yield* Fiber.interrupt(rf);
        yield* Ref.set(renderFiber, null);
      }

      const uf = yield* Ref.get(updateFiber);
      if (uf) {
        yield* Fiber.interrupt(uf);
        yield* Ref.set(updateFiber, null);
      }

      const mst = yield* Ref.get(memorySnapshotTimer);
      if (mst) {
        yield* Fiber.interrupt(mst);
        yield* Ref.set(memorySnapshotTimer, null);
      }

      const rsf = yield* Ref.get(resizeFiber);
      if (rsf) {
        yield* Fiber.interrupt(rsf);
        yield* Ref.set(resizeFiber, null);
      }

      const sh = yield* Ref.get(_splitHeight);
      if (sh > 0) {
        const th = yield* Ref.get(_terminalHeight);
        const consoleEndLine = th - sh;
        const move = yield* moveCursor(consoleEndLine, 1);
        yield* writeOut(move);
      }
      yield* Ref.set(capturedRenderable, null);

      const um = yield* getUseMouse();
      if (um) {
        yield* disableMouse();
      }
      const uas = yield* Ref.get(_useAlternateScreen);
      if (uas) {
        yield* writeOut(SwitchToMainScreen.make("\u001B[?1049l"));
      }
      yield* writeOut(ResetCursorColor.make("\u001B]12;default\u0007"));
      yield* writeOut(ShowCursor.make("\u001B[?25h"));
      yield* writeOut(yield* moveCursorAndClear(0, 0));
      stdin.setRawMode(false);
      stdin.removeAllListeners("data");
    });

    const destroy = Effect.fn("cli.destroy")(function* () {
      const isD = yield* Ref.get(_isDestroyed);
      if (isD) return;
      yield* root.destroy();
      yield* elements.destroy();
      yield* lib.destroyRenderer(renderer);
      yield* Ref.set(_isDestroyed, true);
    });

    const startUpdateLoop = Effect.fn("cli.startUpdateLoop")(function* () {
      const ir = yield* Ref.get(_isRunning);
      if (!ir) return;
      const l = updateLoop();
      const tfps = yield* Ref.get(targetFps);
      const fiber = yield* Effect.fork(
        l.pipe(
          // We need to repeat the loop to keep the fiber alive
          // Effect.forever,
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              console.debug("Error in root.update", err.toString());
              yield* Ref.update(errors, (errors) => errors.add(err));
            }),
          ),
          Effect.repeat(Schedule.fixed(Duration.millis(1000 / tfps))),
          // Effect.retry(Schedule.recurs(10)),
        ),
      );
      yield* Ref.set(updateFiber, fiber);
    });

    const startRenderLoop = Effect.fn("cli.startRenderLoop")(function* () {
      const ir = yield* Ref.get(_isRunning);
      if (!ir) return;
      const now = Date.now();
      yield* Ref.set(lastTime, now);
      yield* Ref.set(frameCount, 0);
      yield* Ref.set(lastFpsTime, now);
      yield* Ref.set(currentFps, 0);
      const tfps = yield* Ref.get(targetFps);
      yield* Ref.set(targetFrameTime, 1000 / tfps);
      const l = loop();
      const fiber = yield* Effect.fork(l.pipe(Effect.repeat(Schedule.fixed(Duration.millis(1000 / tfps)))));

      yield* Ref.set(renderFiber, fiber);
    });

    const errorRenderer = Effect.fn("cli.errorRenderer")(function* (nextBuffer: OptimizedBuffer, deltaTime: number) {
      const es = yield* Ref.get(errors);
      const errs = Array.from(es);
      yield* Effect.annotateCurrentSpan(
        "renderer.errorRenderer",
        errs.map((e) => e.toString()),
      );
      if (errs.length === 0) {
        return;
      }
      // return yield* Effect.dieMessage(es.map((e) => e.toString()).join("\n"));
    });

    const updateLoop = Effect.fn("cli.updateLoop")(function* () {
      const errs = yield* Ref.get(errors);
      const errsArr = Array.from(errs);
      const alreadyAdded = yield* Ref.get(errorBox.renderables);
      if (errsArr.length > 0 && alreadyAdded.length !== errsArr.length) {
        for (let i = 0; i < errsArr.length; i++) {
          const err = errsArr[i];
          const errBoxHolder = yield* elements.text(err.toString(), {
            position: PositionRelative.make(1),
            left: 1,
            top: i + 1,
            width: "auto",
            height: "auto",
            colors: {
              fg: Colors.Red,
              bg: Colors.Transparent,
            },
          });
          yield* errorBox.add(errBoxHolder);
        }
        yield* errorBox.setVisible(true);
      } else {
        yield* errorBox.setVisible(false);
        yield* errorBox.empty();
      }

      yield* root.update();
      return yield* Effect.void;
    });

    const loop = Effect.fn("cli.loop")(function* () {
      // const r = yield* Ref.get(rendering);
      // const isD = yield* Ref.get(_isDestroyed);
      // if (r || isD) return;
      yield* Ref.set(rendering, true);

      const now = Date.now();
      const lt = yield* Ref.get(lastTime);
      const elapsed = now - lt;

      const deltaTime = elapsed;
      yield* Ref.set(lastTime, now);

      const lfc = yield* Ref.updateAndGet(frameCount, (fc) => fc + 1);
      const lfpst = yield* Ref.get(lastFpsTime);
      if (now - lfpst >= 1000) {
        yield* Ref.set(currentFps, lfc);
        yield* Ref.set(frameCount, 0);
        yield* Ref.set(lastFpsTime, now);
      }

      let rs = yield* Ref.updateAndGet(renderStats, (rs) => ({
        ...rs,
        frameCount: rs.frameCount + 1,
        fps: rs.frameCount,
      }));

      const overallStart = performance.now();

      const frameRequests = animationRequest.values();
      animationRequest.clear();

      const animationRequestStart = performance.now();
      yield* Effect.all(
        Array.from(frameRequests).map((callback) => Effect.sync(() => callback(deltaTime))),
        { concurrency: "unbounded", concurrentFinalizers: true },
      );
      const animationRequestEnd = performance.now();
      const animationRequestTime = animationRequestEnd - animationRequestStart;

      const start = performance.now();
      const fcbs = yield* Ref.get(frameCallbacks);
      yield* Effect.all(
        fcbs.map((frameCallback) => frameCallback(deltaTime)),
        { concurrency: "unbounded", concurrentFinalizers: true },
      );

      const end = performance.now();
      yield* Ref.updateAndGet(renderStats, (rs) => ({
        ...rs,
        frameCallbackTime: end - start,
      }));

      // Render the renderable tree
      const buf = yield* Ref.get(buffers);
      const nextBuffer = buf.next;
      if (!nextBuffer) {
        return yield* Effect.fail(new NextBufferNotAvailable());
      }
      yield* root.render(nextBuffer, deltaTime);
      if (config.debugOverlay?.enabled) {
        yield* debugBox.render(nextBuffer, deltaTime);
      }
      const visibleErrors = yield* Ref.get(errorBox.visible);
      if (visibleErrors) {
        yield* errorBox.render(nextBuffer, deltaTime);
      }

      // yield* errorRenderer(nextBuffer, deltaTime);

      const ppfns = yield* Ref.get(postProcessFns);

      yield* Effect.all(
        ppfns.map((postProcessFn) => postProcessFn(buf.next!, deltaTime)),
        { concurrency: "unbounded", concurrentFinalizers: true },
      );

      // yield* this._console.renderToBuffer(this.nextRenderBuffer!);

      yield* renderNative();

      const overallFrameTime = performance.now() - overallStart;
      // TODO: Add animationRequestTime to stats
      rs = yield* Ref.get(renderStats);
      yield* lib.updateStats(renderer, overallFrameTime, rs.fps, rs.frameCallbackTime);
      const gs = yield* Ref.get(gatherStats);
      if (gs) {
        yield* collectStatSample(overallFrameTime);
      }

      yield* Ref.set(rendering, false);

      return yield* Effect.void;
    });

    const intermediateRender = Effect.fn("cli.intermediateRender")(function* () {});

    const renderingNative = yield* Ref.make(false);

    const renderNative = Effect.fn("cli.renderNative")(function* () {
      let force = false;
      const sh = yield* Ref.get(_splitHeight);
      if (sh > 0) {
        // TODO: Flickering could maybe be even more reduced by moving the flush to the native layer,
        // to output the flush with the buffered writer, after the render is done.
        force = yield* flushStdoutCache(sh);
      }

      yield* Ref.set(renderingNative, false);
      yield* lib.render(renderer, true);
      yield* Ref.set(renderingNative, true);
    });

    const collectStatSample = Effect.fn("cli.collectStatSample")(function* (overallFrameTime: number) {
      const mss = yield* Ref.get(maxStatSamples);
      yield* Ref.update(frameTimes, (frameTimes) => {
        frameTimes.push(overallFrameTime);
        if (frameTimes.length > mss) {
          frameTimes.shift();
        }
        return frameTimes;
      });
    });

    const getStats = Effect.fn("cli.getStats")(function* () {
      const stats = yield* Ref.get(renderStats);
      return stats;
    });

    const resetStats = Effect.fn("cli.resetStats")(function* () {
      yield* Ref.set(frameTimes, []);
      yield* Ref.set(renderStats, {
        frameCount: 0,
        fps: 0,
        renderTime: 0,
        frameCallbackTime: 0,
      });
    });

    const setGatherStats = Effect.fn("cli.setGatherStats")(function* (b: boolean) {
      yield* Ref.set(gatherStats, b);
    });

    const getSelection = Effect.fn("cli.getSelection")(function* () {
      const cs = yield* Ref.get(selectionState);
      return cs;
    });

    const getSelectionContainer = Effect.fn("cli.getSelectionContainer")(function* () {
      const scs = yield* Ref.get(selectionContainers);
      return scs.length > 0 ? scs[scs.length - 1] : null;
    });

    const hasSelection = Effect.fn("cli.hasSelection")(function* () {
      const cs = yield* Ref.get(selectionState);
      return cs !== null;
    });

    const getSelectionText = Effect.fn("cli.getSelectionText")(function* () {
      const hs = yield* hasSelection();
      if (hs) {
        const scs = yield* Ref.get(selectionContainers);
        const allSelectedText = yield* Effect.all(
          scs.map((sc) => sc.getSelectedText()),
          { concurrency: "unbounded", concurrentFinalizers: true },
        );
        return allSelectedText.join("\n");
      }
      return "";
    });

    const startSelection = Effect.fn("cli.startSelection")(function* (
      startRenderable: BaseElement<any, any>,
      x: number,
      y: number,
    ) {
      yield* clearSelection();
      const p = yield* Ref.get(startRenderable.parent);
      yield* Ref.update(selectionContainers, (containers) => {
        containers.push(p || root);
        return containers;
      });
      yield* Ref.set(selectionState, {
        anchor: { x, y },
        focus: { x, y },
        isActive: true,
        isSelecting: true,
      });
      yield* Ref.set(currentSelection, new Selection({ x, y }, { x, y }));

      yield* notifySelectablesOfSelectionChange();
    });

    const clearSelection = Effect.fn("cli.clearSelection")(function* () {
      const ss = yield* Ref.get(selectionState);
      if (ss) {
        yield* Ref.set(selectionState, null);
        yield* notifySelectablesOfSelectionChange();
      }
      yield* Ref.set(currentSelection, null);
      yield* Ref.set(selectionContainers, []);
    });

    const updateSelection = Effect.fn("cli.updateSelection")(function* (
      currentRenderable: BaseElement<any, any> | undefined,
      x: number,
      y: number,
    ) {
      let ss = yield* Ref.get(selectionState);
      if (ss) {
        ss = (yield* Ref.updateAndGet(selectionState, (ss2) => ({
          ...ss!,
          focus: { x, y },
        })))!;
        let scs = yield* Ref.get(selectionContainers);
        if (scs.length > 0) {
          const currentContainer = scs[scs.length - 1];

          if (!currentRenderable || !(yield* isWithinContainer(currentRenderable, currentContainer))) {
            const p = yield* Ref.get(currentContainer.parent);
            const parentContainer = p || root;
            scs = yield* Ref.updateAndGet(selectionContainers, (containers) => {
              containers.push(parentContainer);
              return containers;
            });
          } else if (currentRenderable && scs.length > 1) {
            let containerIndex = scs.findIndex((c) => c.id === currentRenderable.id);

            if (containerIndex === -1) {
              const p = yield* Ref.get(currentRenderable.parent);
              const immediateParent = p || root;
              containerIndex = scs.indexOf(immediateParent);
            }

            if (containerIndex !== -1 && containerIndex < scs.length - 1) {
              scs = yield* Ref.updateAndGet(selectionContainers, (containers) => {
                containers.splice(0, containerIndex + 1);
                return containers;
              });
            }
          }
        }
        const cs = yield* Ref.get(currentSelection);
        if (cs) {
          yield* Ref.set(currentSelection, new Selection(ss.anchor, ss.focus));
        }
      }

      yield* notifySelectablesOfSelectionChange();
    });

    const isWithinContainer = Effect.fn("cli.isWithinContainer")(function* (
      renderable: BaseElement<any, any>,
      container: BaseElement<any, any>,
    ) {
      let current: BaseElement<any, any> | null = renderable;
      while (current) {
        if (current.id === container.id) return true;
        current = yield* Ref.get(current.parent);
      }
      return false;
    });

    const finishSelection = Effect.fn("cli.finishSelection")(function* () {
      const ss = yield* Ref.get(selectionState);
      if (ss) {
        yield* Ref.update(selectionState, (ss2) => ({
          ...ss,
          isSelecting: false,
        }));
      }
    });

    const notifySelectablesOfSelectionChange = Effect.fn("cli.notifySelectablesOfSelectionChange")(function* () {
      let normalizedSelection: SelectionState | null = null;
      const ss = yield* Ref.get(selectionState);
      if (ss) {
        normalizedSelection = { ...ss };

        if (
          normalizedSelection.anchor.y > normalizedSelection.focus.y ||
          (normalizedSelection.anchor.y === normalizedSelection.focus.y &&
            normalizedSelection.anchor.x > normalizedSelection.focus.x)
        ) {
          const temp = normalizedSelection.anchor;
          normalizedSelection.anchor = normalizedSelection.focus;
          normalizedSelection.focus = {
            x: temp.x + 1,
            y: temp.y,
          };
        }
      }

      const selectedRenderables: BaseElement<any, any>[] = [];

      const renderables = yield* Ref.get(elements.renderables);

      const scs = yield* Ref.get(selectionContainers);

      for (const renderable of renderables) {
        const v = yield* Ref.get(renderable.visible);
        const s = yield* Ref.get(renderable.selectable);
        if (v && s) {
          const currentContainer = scs.length > 0 ? scs[scs.length - 1] : null;
          let hasSelection = false;
          if (!currentContainer || (yield* isWithinContainer(renderable, currentContainer))) {
            hasSelection = yield* renderable.onSelectionChanged(normalizedSelection);
          } else {
            hasSelection = yield* renderable.onSelectionChanged(
              normalizedSelection ? { ...normalizedSelection, isActive: false } : null,
            );
          }

          if (hasSelection) {
            selectedRenderables.push(renderable);
          }
        }
      }
      const cs = yield* Ref.get(currentSelection);
      if (cs) {
        cs.updateSelectedRenderables(selectedRenderables);
      }
    });

    const add = Effect.fn(function* (container: BaseElement<any, any>, index?: number) {
      yield* root.add(container, index);
    });

    const createElement = Effect.fn(function* <T extends Methods>(type: T, ...args: MethodParameters[T]) {
      const fn = elements[type];
      // @ts-ignore: we know that the type is correct
      const element = yield* fn(...args);
      return yield* Effect.succeed(element as ElementElement<T>);
    });

    const getErrors = Effect.fn(function* () {
      return yield* Ref.get(errors);
    });

    return {
      getErrors,
      getSelectionText,
      getElementCount,
      createElement,
      add,
      start,
      getUseConsole,
      setUseConsole,
      isRunning,
      getResolution,
      getTerminalWidth,
      getTerminalHeight,
      setTerminalSize,
      getUseThread,
      setUseThread,
      getUseMouse,
      setUseMouse,
      setMemorySnapshotInterval,
      setBackgroundColor,
      toggleDebugOverlay,
      configureDebugOverlay,
      clearTerminal,
      dumpHitGrid,
      dumpBuffers,
      dumpStdoutBuffer,
      setCursorPosition,
      setCursorStyle,
      setCursorColor,
      addPostProcessFn,
      removePostProcessFn,
      clearPostProcessFns,
      setFrameCallback,
      removeFrameCallback,
      clearFrameCallbacks,
      pause,
      stop,
      destroy,
      intermediateRender,
      getStats,
      resetStats,
      setGatherStats,
      getSelection,
      getSelectionContainer,
      hasSelection,
      clearSelection,
      setupTerminal,
    } as const;
  }),
}) {}

export const CliRendererLive = CliRenderer.Default;
