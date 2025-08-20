import { reallyExit } from "node:process";
import * as readline from "node:readline";
import { Terminal } from "@effect/platform";
import { BunRuntime } from "@effect/platform-bun";
import {
  Channel,
  Chunk,
  Console,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  LogLevel,
  Mailbox,
  Option,
  Predicate,
  PubSub,
  Queue,
  RcRef,
  Ref,
  Schedule,
  Schema,
  Stream,
  Take,
} from "effect";
import type { NoSuchElementException } from "effect/Cause";
import {
  ClearFromCursor,
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
import * as Colors from "../colors";
import { OpenTuiConfig, OpenTuiConfigLive } from "../config";
import type { Style } from "../cursor-style";
import type { RendererFailedToCheckHit } from "../errors";
import { KeyboardEvent } from "../events/keyboard";
import { MouseEvent } from "../events/mouse";
import { ParsedKey, parse as parseKey } from "../inputs/keyboard";
import {
  isLeftMouseButton,
  isMouseDown,
  isMouseDrag,
  isMouseMove,
  isMouseUp,
  MouseDown,
  MouseDragEnd,
  MouseDrop,
  MouseOut,
  MouseParser,
  MouseParserLive,
} from "../inputs/mouse";
import { parseColor } from "../utils";
import { Library } from "../zig";
import { Elements, ElementsLive, type Element, type MethodParameters } from "./elements";
import { Selection, SelectionLive } from "./selection";
import type { PixelResolution } from "./utils";

export type ShutdownReason =
  | {
      type: "exit";
      code: number;
    }
  | {
      type: "ctrl-c";
    }
  | {
      type: "signal";
      signal: NodeJS.Signals;
    };

let animationFrameId = 0;

export class CliRenderer extends Effect.Service<CliRenderer>()("CliRenderer", {
  dependencies: [OpenTuiConfigLive, SelectionLive, MouseParserLive, ElementsLive],
  scoped: Effect.gen(function* () {
    const cfg = yield* OpenTuiConfig;
    const config = yield* cfg.get();

    const _isRunning = yield* Ref.make(false);
    const _isShuttingDown = yield* Ref.make(false);
    const _isDestroyed = yield* Ref.make(false);
    const _isWaitingForPixelResolution = yield* Ref.make(false);

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

    const needsUpdate = Effect.fn(function* () {});
    const capturedRenderable = yield* Ref.make<Element | null>(null);

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

    const lastOverRenderableNum = yield* Ref.make(0);

    const currentSelection = yield* Selection;
    const selectionContainers = yield* Ref.make<Array<Element | null>>([]);
    const lastOverRenderable = yield* Ref.make<Element | undefined>(undefined);

    const _useConsole = yield* Ref.make(false);
    const _resolution = yield* Ref.make<PixelResolution | null>(null);
    const _useThread = yield* Ref.make(config.useThread);
    yield* lib.setUseThread(renderer, config.useThread);

    const backgroundColor = yield* Ref.make<Colors.Input>(Colors.Black.make("#000000"));
    const terminalInputFork = yield* Ref.make<Fiber.RuntimeFiber<
      never,
      Error | RendererFailedToCheckHit | NoSuchElementException
    > | null>(null);
    const resizeFork = yield* Ref.make<Fiber.RuntimeFiber<never, Error | NoSuchElementException> | null>(null);
    const signalWatcherFork = yield* Ref.make<Fiber.RuntimeFiber<never, Error | NoSuchElementException> | null>(null);

    const stdin = process.stdin;
    const stdout = process.stdout;
    const realStdoutWrite = stdout.write;

    const root = yield* elements.root({
      width: Effect.fn(function* () {
        return config.width;
      }),
      height: Effect.fn(function* () {
        return config.height;
      }),
      addToHitGrid: Effect.fn(function* (x: number, y: number, width: number, height: number, id: number) {
        const cr = yield* Ref.get(capturedRenderable);
        if (id !== cr?.id) {
          yield* lib.addToHitGrid(renderer, x, y, width, height, id);
        }
      }),
      needsUpdate,
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
      yield* startRenderLoop();
    });

    const writeOut = Effect.fn(function* (chunk: string, encoding: BufferEncoding = "utf8") {
      const buffer = Buffer.from(chunk);
      const sent = yield* Effect.async<boolean, Error>((resume) => {
        const sent = realStdoutWrite.call(stdout, buffer, encoding, (err) => {
          if (err) {
            return resume(Effect.fail(err));
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

    const setTerminalSize = Effect.fn(function* () {});

    const setupTerminal = Effect.fn(function* (shutdown: Deferred.Deferred<ShutdownReason, never>) {
      yield* writeOut(SaveCursorState.make("\u001B[s"));

      const um = yield* getUseMouse();
      if (um) {
        yield* enableMouse();
      } else {
        yield* disableMouse();
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
        Effect.tap(({ width, height }) => handleResize(width, height)),
        Effect.forever,
        Effect.forkScoped,
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
          Effect.fn(function* (data) {
            const ir = yield* Ref.get(_isRunning);
            if (!ir) return;
            const str = data.toString();
            const wfpr = yield* Ref.get(_isWaitingForPixelResolution);
            if (wfpr && /\x1b\[4;\d+;\d+t/.test(str)) {
              const match = str.match(/\x1b\[4;(\d+);(\d+)t/);
              if (match) {
                const resolution: PixelResolution = {
                  width: parseInt(match[2]),
                  height: parseInt(match[1]),
                };
                yield* Ref.set(_resolution, resolution);
                yield* Ref.set(_isWaitingForPixelResolution, false);
                return;
              }
            }
            const um = yield* getUseMouse();
            if (um) {
              const hmd = yield* handleMouseData(data);
              if (hmd) {
                return;
              }
            }

            const parsedKey = yield* parseKey(data);
            yield* Effect.log("Parsed key", JSON.stringify(parsedKey, null, 2));
            if (isExitOnCtrlC(parsedKey.raw)) {
              yield* Effect.log("Ctrl+C", "WE HAVE TO EXIT".repeat(10));
              return yield* Deferred.succeed(shutdown, {
                type: "ctrl-c",
              });
            }
            if (parsedKey.name !== "unknown") {
              yield* handleKeyboardData(parsedKey);
            } else {
              yield* Effect.log("Unknown key: " + str);
            }
          }),
        ),
        Effect.forever,
        Effect.forkScoped,
      );
      yield* Ref.set(terminalInputFork, f);

      const signals = ["SIGINT", "SIGTERM", "SIGQUIT", "SIGABRT", "SIGHUP", "SIGWINCH"] as const;

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
            return yield* Deferred.succeed(shutdown, {
              type: "signal",
              signal,
            });
          }),
        ),
        Effect.forever,
        Effect.forkScoped,
      );
      yield* Ref.set(signalWatcherFork, signalFork);

      global.requestAnimationFrame = (callback: FrameRequestCallback) => {
        const id = animationFrameId++;
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

    const handleMouseData = Effect.fn(function* (data: Buffer) {
      const mouseEvent = yield* mouseParser.parse(data);

      if (mouseEvent) {
        const sh = yield* Ref.get(_splitHeight);
        if (sh > 0) {
          const ro = yield* Ref.get(_renderOffset);
          if (mouseEvent.y < ro) {
            return false;
          }
          mouseEvent.y -= ro;
        }

        const maybeRenderableId = yield* lib.checkHit(renderer, mouseEvent.x, mouseEvent.y);
        const lrn = yield* Ref.get(lastOverRenderableNum);
        const sameElement = maybeRenderableId === lrn;
        yield* Ref.set(lastOverRenderableNum, maybeRenderableId);
        const maybeRenderable = yield* root.getRenderable(maybeRenderableId);
        if (mouseEvent.type === "down" && isLeftMouseButton(mouseEvent.button)) {
          if (maybeRenderable) {
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
        let isS = yield* currentSelection.isSelecting();
        if (mouseEvent.type === "drag" && isS) {
          yield* updateSelection(maybeRenderable!, mouseEvent.x, mouseEvent.y);
          return true;
        }

        if (mouseEvent.type === "up" && isS) {
          yield* finishSelection();
          return true;
        }
        if (mouseEvent.type === "down" && isLeftMouseButton(mouseEvent.button) && isS) {
          yield* clearSelection();
        }

        if (!sameElement && (isMouseDrag(mouseEvent.type) || isMouseMove(mouseEvent.type))) {
          const lor = yield* Ref.get(lastOverRenderable);
          const cr = yield* Ref.get(capturedRenderable);
          if (lor && lor !== cr) {
            const event = new MouseEvent(lor, { ...mouseEvent, type: MouseOut.make("out") });
            yield* lor.processMouseEvent(event);
          }
          yield* Ref.set(lastOverRenderable, maybeRenderable);
          if (maybeRenderable) {
            const cr = yield* Ref.get(capturedRenderable);
            const event = new MouseEvent(maybeRenderable, {
              ...mouseEvent,
              type: MouseDown.make("down"),
              source: cr!,
            });
            yield* maybeRenderable.processMouseEvent(event);
          }
        }
        const cr = yield* Ref.get(capturedRenderable);
        if (cr && isMouseUp(mouseEvent.type)) {
          const event = new MouseEvent(cr, mouseEvent);
          yield* cr.processMouseEvent(event);
          return true;
        }

        if (cr && isMouseUp(mouseEvent.type)) {
          const event = new MouseEvent(cr, { ...mouseEvent, type: MouseDragEnd.make("drag-end") });
          yield* cr.processMouseEvent(event);
          if (maybeRenderable) {
            const event = new MouseEvent(maybeRenderable, {
              ...mouseEvent,
              type: MouseDrop.make("drop"),
              source: cr,
            });
            yield* maybeRenderable.processMouseEvent(event);
          }
          yield* Ref.set(lastOverRenderable, cr);
          yield* Ref.set(lastOverRenderableNum, cr.id);
          yield* Ref.set(capturedRenderable, null);
        }

        if (maybeRenderable) {
          if (isMouseDown(mouseEvent.type) && isLeftMouseButton(mouseEvent.button)) {
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

    const handleKeyboardData = Effect.fn(function* (parsedKey: ParsedKey) {
      const keyboardEvent = new KeyboardEvent(root, {
        ...parsedKey,
        source: root,
        type: "keydown",
      });

      yield* root.processKeyboardEvent(keyboardEvent);

      return true;
    });

    const takeMemorySnapshot = Effect.fn(function* () {
      const memoryUsage = process.memoryUsage();
      const lms = {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        arrayBuffers: memoryUsage.arrayBuffers,
      };
      yield* Ref.set(lastMemorySnapshot, lms);

      yield* lib.updateMemoryStats(renderer, lms.heapUsed, lms.heapTotal, lms.arrayBuffers);
      // const humanlyReadable = {
      //   heapUsed: (lms.heapUsed / 1024 / 1024).toFixed(2) + "MB",
      //   heapTotal: (lms.heapTotal / 1024 / 1024).toFixed(2) + "MB",
      //   arrayBuffers: (lms.arrayBuffers / 1024 / 1024).toFixed(2) + "MB",
      // };

      // const text = `${humanlyReadable.heapUsed} | ${humanlyReadable.heapTotal} | ${humanlyReadable.arrayBuffers}`;
    });

    const startMemorySnapshotTimer = Effect.fn(function* () {
      const mst = yield* Ref.get(memorySnapshotTimer);
      if (mst) {
        yield* Fiber.interrupt(mst);
      }

      const msi = yield* Ref.get(memorySnapshotInterval);
      const duration = Duration.millis(msi);
      const fiber = yield* Effect.forkScoped(takeMemorySnapshot().pipe(Effect.repeat(Schedule.spaced(duration))));
      yield* Ref.set(memorySnapshotTimer, fiber);
    });

    const setMemorySnapshotInterval = Effect.fn(function* (interval: number) {
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

    const handleResize = Effect.fn(function* (width: number, height: number) {
      const isD = yield* Ref.get(_isShuttingDown);
      if (isD) return;
      // const sh = yield* Ref.get(_splitHeight);
      // if (sh > 0) {
      //   return yield* processResize(width, height);
      // }
      // yield* Effect.logWithLevel(LogLevel.Debug, "Resize", width, height);

      yield* processResize(width, height);
    });

    const queryPixelResolution = Effect.fn(function* () {
      yield* Ref.set(_isWaitingForPixelResolution, true);
      yield* writeOut(QueryPixelSize.make("\u001B[14t"));
    });

    const processResize = Effect.fn(function* (width: number, height: number) {
      let w = yield* Ref.get(_width);
      let h = yield* Ref.get(_height);
      let tw = yield* Ref.get(_terminalWidth);
      let th = yield* Ref.get(_terminalHeight);
      if (w === tw && h === th) return;

      const prevWidth = tw;

      tw = yield* Ref.updateAndGet(_terminalWidth, (tw) => w);
      // this._terminalHeight = height;
      th = yield* Ref.updateAndGet(_terminalHeight, (th) => h);

      // this.capturedRenderable = undefined;
      yield* Ref.set(capturedRenderable, null);
      yield* mouseParser.reset();
      const sh = yield* Ref.get(_splitHeight);
      if (sh > 0) {
        // TODO: Handle resizing split mode properly
        if (w < prevWidth) {
          const start = th - sh * 2;
          const flush = yield* moveCursorAndClear(start, 1);
          yield* writeOut(flush);
        }
        // this.renderOffset = h - sh;
        const ro = yield* Ref.updateAndGet(_renderOffset, (x) => h - sh);
        yield* Ref.set(_width, w);

        yield* Ref.set(_height, sh);
        const c = yield* parseColor(Colors.Black.make("#000000"));
        const buf = yield* Ref.get(buffers);
        if (!buf.current) return;
        yield* buf.current.clearLocal(c, "\u0a00");
        yield* lib.setRenderOffset(renderer, ro);
      } else {
        // this.width = width;
        // this.height = height;
        w = yield* Ref.updateAndGet(_width, (w) => width);
        h = yield* Ref.updateAndGet(_height, (h) => height);
      }

      yield* lib.resizeRenderer(renderer, w, h);
      const nrba = yield* lib.getNextBuffer(renderer);

      const nextRenderBuffer = new OptimizedBuffer(nrba.bufferPtr, nrba.buffers, nrba.width, nrba.height, {});
      const crba = yield* lib.getCurrentBuffer(renderer);
      const currentRenderBuffer = new OptimizedBuffer(crba.bufferPtr, crba.buffers, crba.width, crba.height, {});
      yield* Ref.set(buffers, {
        next: nextRenderBuffer,
        current: currentRenderBuffer,
      });
      yield* root.resize(w, h);
      yield* needsUpdate();
    });

    const setBackgroundColor = Effect.fn(function* (color: Colors.Input) {
      const parsedColor = yield* parseColor(color);
      yield* lib.setBackgroundColor(renderer, parsedColor);
      yield* Ref.set(backgroundColor, color);
      const buf = yield* Ref.get(buffers);
      if (!buf.next) return;
      yield* buf.next.clear(parsedColor);
      yield* needsUpdate();
    });

    const toggleDebugOverlay = Effect.fn(function* () {
      const updatedConfig = yield* cfg.update("debugOverlay", (cfg) => ({
        ...cfg,
        debugOverlay: {
          ...cfg.debugOverlay,
          enabled: !cfg.debugOverlay.enabled,
        },
      }));
      yield* needsUpdate();
    });

    const configureDebugOverlay = Effect.fn(function* () {
      yield* lib.setDebugOverlay(renderer, config.debugOverlay.enabled, config.debugOverlay.corner);
    });

    const clearTerminal = Effect.fn(function* () {
      yield* lib.clearTerminal(renderer);
    });

    const dumpHitGrid = Effect.fn(function* () {
      yield* lib.dumpHitGrid(renderer);
    });

    const dumpBuffers = Effect.fn(function* (timestamp?: number) {
      yield* lib.dumpBuffers(renderer, timestamp);
    });

    const dumpStdoutBuffer = Effect.fn(function* (timestamp?: number) {
      yield* lib.dumpStdoutBuffer(renderer, timestamp);
    });

    const setCursorPosition = Effect.fn(function* (x: number, y: number, visible: boolean = true) {
      yield* lib.setCursorPosition(x, y, visible);
    });

    const setCursorStyle = Effect.fn(function* (style: Style, blinking: boolean = false, color?: Colors.Input) {
      yield* lib.setCursorStyle(style, blinking);
      if (color) {
        const parsedColor = yield* parseColor(color);
        yield* lib.setCursorColor(parsedColor);
      }
    });

    const setCursorColor = Effect.fn(function* (color: Colors.Input) {
      const parsedColor = yield* parseColor(color);
      yield* lib.setCursorColor(parsedColor);
    });

    const addPostProcessFn = Effect.fn(function* (
      processFn: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void>,
    ) {
      yield* Ref.update(postProcessFns, (fns) => {
        fns.push(processFn);
        return fns;
      });
    });

    const removePostProcessFn = Effect.fn(function* (
      processFn: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void>,
    ) {
      yield* Ref.update(postProcessFns, (fns) => fns.filter((fn) => fn !== processFn));
    });

    const clearPostProcessFns = Effect.fn(function* () {
      yield* Ref.set(postProcessFns, []);
    });

    const setFrameCallback = Effect.fn(function* (callback: (deltaTime: number) => Effect.Effect<void>) {
      yield* Ref.update(frameCallbacks, (fcbs) => {
        fcbs.push(callback);
        return fcbs;
      });
    });

    const removeFrameCallback = Effect.fn(function* (callback: (deltaTime: number) => Effect.Effect<void>) {
      yield* Ref.update(frameCallbacks, (fcbs) => fcbs.filter((fcb) => fcb !== callback));
    });

    const clearFrameCallbacks = Effect.fn(function* () {
      yield* Ref.set(frameCallbacks, []);
    });

    const pause = Effect.fn(function* () {
      yield* Ref.set(_isRunning, false);
    });

    const stop = Effect.fn(function* () {
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

      const mst = yield* Ref.get(memorySnapshotTimer);
      if (mst) {
        yield* Fiber.interrupt(mst);
        yield* Ref.set(memorySnapshotTimer, null);
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
      yield* writeOut(ResetCursorColor.make("\u001B]12;default\u0007"));
      yield* writeOut(ShowCursor.make("\u001B[?25h"));
      yield* writeOut(ClearFromCursor.make("\u001B[J"));
      yield* writeOut(yield* moveCursorAndClear(0, 0));
      const uas = yield* Ref.get(_useAlternateScreen);
      if (uas) {
        yield* writeOut(SwitchToMainScreen.make("\u001B[?1049l"));
      }
      stdin.setRawMode(false);
      console.clear();
    });

    const destroy = Effect.fn(function* () {
      const isD = yield* Ref.get(_isDestroyed);
      if (isD) return;
      // yield* this.root.destroy();
      yield* lib.destroyRenderer(renderer);
      yield* Ref.set(_isDestroyed, true);
    });

    const startRenderLoop = Effect.fn(function* () {
      const ir = yield* Ref.get(_isRunning);
      if (!ir) return;
      const now = Date.now();
      yield* Ref.set(lastTime, now);
      yield* Ref.set(frameCount, 0);
      yield* Ref.set(lastFpsTime, now);
      yield* Ref.set(currentFps, 0);
      const tfps = yield* Ref.get(targetFps);
      yield* Ref.set(targetFrameTime, 1000 / tfps);

      const fiber = yield* Effect.forkScoped(
        loop().pipe(
          // We need to repeat the loop to keep the fiber alive
          Effect.repeat(Schedule.fixed(Duration.millis(1000 / tfps))),
        ),
      );

      yield* Ref.set(renderFiber, fiber);
    });

    const loop = Effect.fn(function* () {
      const r = yield* Ref.get(rendering);
      if (r) return;
      yield* Ref.set(rendering, true);

      const now = Date.now();
      const lt = yield* Ref.get(lastTime);
      const elapsed = now - lt;

      const deltaTime = elapsed;
      // this.lastTime = now;
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
        frameRequests.map((callback) => Effect.sync(() => callback(deltaTime))),
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

      yield* root.render(buf.next!, deltaTime);

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
    });

    const intermediateRender = Effect.fn(function* () {});

    const renderingNative = yield* Ref.make(false);

    const renderNative = Effect.fn(function* () {
      let force = false;
      const sh = yield* Ref.get(_splitHeight);
      if (sh > 0) {
        // TODO: Flickering could maybe be even more reduced by moving the flush to the native layer,
        // to output the flush with the buffered writer, after the render is done.
        force = yield* flushStdoutCache(sh);
      }

      yield* Ref.set(renderingNative, false);
      yield* lib.render(renderer, force);
      yield* Ref.set(renderingNative, true);
    });

    const collectStatSample = Effect.fn(function* (overallFrameTime: number) {
      const mss = yield* Ref.get(maxStatSamples);
      yield* Ref.update(frameTimes, (frameTimes) => {
        frameTimes.push(overallFrameTime);
        if (frameTimes.length > mss) {
          frameTimes.shift();
        }
        return frameTimes;
      });
    });

    const getStats = Effect.fn(function* () {});

    const resetStats = Effect.fn(function* () {});

    const setGatherStats = Effect.fn(function* () {});

    const getSelection = Effect.fn(function* () {});
    const getSelectionContainer = Effect.fn(function* () {});

    const hasSelection = Effect.fn(function* () {});

    const startSelection = Effect.fn(function* (startRenderable: Element, x: number, y: number) {
      yield* clearSelection();
      const p = yield* Ref.get(startRenderable.parent);
      yield* Ref.update(selectionContainers, (containers) => {
        // @ts-ignore
        containers.push(p || root);
        return containers;
      });
      yield* currentSelection.enable();
      yield* currentSelection.setSelecting(true);
      yield* currentSelection.setAnchor({ x, y });
      yield* currentSelection.setFocus({ x, y });

      yield* currentSelection.setAnchor({ x, y });
      yield* currentSelection.setFocus({ x, y });
      yield* notifySelectablesOfSelectionChange();
    });

    const clearSelection = Effect.fn(function* () {
      yield* currentSelection.disable();
      yield* notifySelectablesOfSelectionChange();
      yield* Ref.set(selectionContainers, []);
    });

    const updateSelection = Effect.fn(function* (currentRenderable: Element | undefined, x: number, y: number) {
      yield* currentSelection.setFocus({ x, y });
      const scs = yield* Ref.get(selectionContainers);

      if (scs.length > 0) {
        const currentContainer = scs[scs.length - 1];
        const iwc = yield* isWithinContainer(currentRenderable!, currentContainer!);
        if (!currentRenderable || iwc) {
          const p = yield* Ref.get(currentContainer!.parent);
          const parentContainer = p || root;
          yield* Ref.update(selectionContainers, (containers) => {
            containers.push(parentContainer as Element);
            return containers;
          });
        } else if (currentRenderable && scs.length > 1) {
          let containerIndex = scs.indexOf(currentRenderable);

          if (containerIndex === -1) {
            const p = yield* Ref.get(currentRenderable.parent);
            // @ts-ignore
            const immediateParent = p || root;
            containerIndex = scs.indexOf(immediateParent as Element);
          }

          if (containerIndex !== -1 && containerIndex < scs.length - 1) {
            yield* Ref.update(selectionContainers, (containers) => {
              containers.splice(0, containerIndex + 1);
              return containers;
            });
          }
        }
      }

      yield* notifySelectablesOfSelectionChange();
    });

    const isWithinContainer = Effect.fn(function* (renderable: Element, container: Element) {
      let current: Element | null = renderable;
      while (current) {
        if (current === container) return true;
        current = yield* Ref.get(current.parent);
      }
      return false;
    });

    const finishSelection = Effect.fn(function* () {});

    const notifySelectablesOfSelectionChange = Effect.fn(function* () {});

    const add = Effect.fn(function* (container: Element, index?: number) {
      yield* root.add(container, index);
    });

    const createElement = Effect.fn(function* <T extends keyof MethodParameters>(
      type: T,
      ...args: MethodParameters[T]
    ) {
      const fn = elements[type];
      // @ts-ignore
      const element = yield* fn(...args);
      return element as Effect.Effect.Success<ReturnType<typeof fn>>;
    });

    return {
      createElement,
      add,
      start,
      needsUpdate,
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
