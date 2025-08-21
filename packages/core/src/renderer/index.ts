import { EventEmitter as EE } from "events";
import { BunRuntime } from "@effect/platform-bun";
import { type Pointer } from "bun:ffi";
import { Console, Duration, Effect, Fiber, Layer, pipe, Schedule, Scope } from "effect";
import {
  DisableAnyEventTracking,
  DisableButtonEventTracking,
  DisableMouseTracking,
  DisableSGRMouseMode,
  EnableAnyEventTracking,
  EnableButtonEventTracking,
  EnableMouseTracking,
  EnableSGRMouseMode,
  moveCursor,
  moveCursorAndClear,
  QueryPixelSize,
  ResetBackground,
  ResetCursorColor,
  SaveCursorState,
  scrollDown,
  scrollUp,
  setRgbBackground,
  ShowCursor,
  SwitchToAlternateScreen,
  SwitchToMainScreen,
} from "../ansi";
import { OptimizedBuffer } from "../buffer/optimized";
import { CaptureLive, CaptureService } from "../capture";
import * as Colors from "../colors";
import { RenderContext, type RenderContextInterface } from "../context";
import type { Style } from "../cursor-style";
import { FrameCallbackError, RendererFailedToRender } from "../errors";
import { EventEmitter } from "../event-emitter";
import {
  isLeftMouseButton,
  isMouseScroll,
  LeftMouseButton,
  MouseDragEnd,
  MouseDrop,
  MouseEventType,
  MouseOut,
  MouseOver,
  MouseParser,
  type RawMouseEvent,
  type ScrollInfo,
} from "../inputs/mouse";
import { RGBA, type SelectionState } from "../types";
import { parseColor } from "../utils";
import { DebugOverlayCorner, Library, LibraryLive } from "../zig";
import type { BaseElement } from "./elements";
import { Renderable } from "./renderable-3";
import { Root } from "./root";
import { Selection } from "./selection";
import type { PixelResolution } from "./utils";

export enum CliRenderEvents {
  DEBUG_OVERLAY_TOGGLE = "debugOverlay:toggle",
}

export interface CliRendererConfig {
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  exitOnCtrlC?: boolean;
  debounceDelay?: number;
  targetFps?: number;
  memorySnapshotInterval?: number;
  useThread?: boolean;
  gatherStats?: boolean;
  maxStatSamples?: number;
  consoleOptions?: ConsoleOptions;
  postProcessFns?: ((buffer: OptimizedBuffer, deltaTime: number) => void)[];
  enableMouseMovement?: boolean;
  useMouse?: boolean;
  useAlternateScreen?: boolean;
  useConsole?: boolean;
  experimental_splitHeight?: number;
}

export class CliRenderer {
  static animationFrameId = 0;
  public rendererPtr: Pointer;
  private stdin: NodeJS.ReadStream;
  private stdout: NodeJS.WriteStream;
  private exitOnCtrlC: boolean;
  private isDestroyed: boolean = false;
  private isShuttingDown: boolean = false;
  public nextRenderBuffer: OptimizedBuffer | null = null;
  public currentRenderBuffer: OptimizedBuffer | null = null;
  private _isRunning: boolean = false;
  private targetFps: number = 30;
  private memorySnapshotInterval: number;
  private memorySnapshotTimer: Timer | null = null;
  private lastMemorySnapshot: { heapUsed: number; heapTotal: number; arrayBuffers: number } = {
    heapUsed: 0,
    heapTotal: 0,
    arrayBuffers: 0,
  };
  public readonly root: Root;
  public width: number;
  public height: number;
  private _useThread: boolean = false;
  private gatherStats: boolean = false;
  private frameTimes: number[] = [];
  private maxStatSamples: number = 300;
  private postProcessFns: ((buffer: OptimizedBuffer, deltaTime: number) => void)[] = [];
  private backgroundColor: RGBA = RGBA.fromInts(0, 0, 0, 255);
  private waitingForPixelResolution: boolean = false;

  private rendering: boolean = false;
  private renderingNative: boolean = false;
  private renderFiber: Fiber.RuntimeFiber<Duration.Duration, Error> | null = null;
  private lastTime: number = 0;
  private frameCount: number = 0;
  private lastFpsTime: number = 0;
  private currentFps: number = 0;
  private targetFrameTime: number = 0;
  private immediateRerenderRequested: boolean = false;
  private updateScheduled: boolean = false;

  private frameCallbacks: ((deltaTime: number) => Promise<void>)[] = [];
  private renderStats: {
    frameCount: number;
    fps: number;
    renderTime?: number;
    frameCallbackTime: number;
  } = {
    frameCount: 0,
    fps: 0,
    renderTime: 0,
    frameCallbackTime: 0,
  };
  public debugOverlay = {
    enabled: false,
    corner: DebugOverlayCorner.bottomRight,
  };

  // private _console: TerminalConsole;
  private _resolution: PixelResolution | null = null;

  private animationRequest: Map<number, FrameRequestCallback> = new Map();

  private resizeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private resizeDebounceDelay: number = 100;

  private renderContext: RenderContextInterface = {
    addToHitGrid: (x: number, y: number, width: number, height: number, id: number) =>
      Effect.gen(this, function* () {
        const lib = yield* Library;
        if (id !== this.capturedRenderable?.num) {
          yield* lib.addToHitGrid(this.rendererPtr, x, y, width, height, id);
        }
      }),
    width: Effect.gen(this, function* () {
      return this.width;
    }),
    height: Effect.gen(this, function* () {
      return this.height;
    }),
    needsUpdate: () =>
      Effect.gen(this, function* () {
        yield* this.needsUpdate();
      }),
  };

  private enableMouseMovement: boolean = false;
  private _useMouse: boolean = true;
  private _useAlternateScreen: boolean = true;
  private capturedRenderable?: Renderable;
  private lastOverRenderableNum: number = 0;
  private lastOverRenderable?: Renderable;

  private currentSelection: Selection | null = null;
  private selectionState: SelectionState | null = null;
  private selectionContainers: Renderable[] = [];

  private _splitHeight: number = 0;
  private renderOffset: number = 0;

  private _terminalWidth: number = 0;
  private _terminalHeight: number = 0;

  private realStdoutWrite: (chunk: any, encoding?: any, callback?: any) => boolean;
  private captureCallback = () =>
    Effect.gen(this, function* () {
      if (this._splitHeight > 0) {
        yield* this.needsUpdate();
      }
    });

  private _useConsole: boolean = true;
  private sigwinchHandler:
    | (() => Effect.Effect<void, Error, EventEmitter | Library | Scope.Scope | MouseParser>)
    | null = null;

  constructor(
    rendererPtr: Pointer,
    stdin: NodeJS.ReadStream,
    stdout: NodeJS.WriteStream,
    width: number,
    height: number,
    config: CliRendererConfig = {},
  ) {
    this.stdin = stdin;
    this.stdout = stdout;
    this.realStdoutWrite = stdout.write;
    this._terminalWidth = stdout.columns;
    this._terminalHeight = stdout.rows;
    this.width = width;
    this.height = height;
    this._useThread = config.useThread === undefined ? false : config.useThread;
    this._splitHeight = config.experimental_splitHeight || 0;

    this.rendererPtr = rendererPtr;
    this.exitOnCtrlC = config.exitOnCtrlC === undefined ? true : config.exitOnCtrlC;
    this.resizeDebounceDelay = config.debounceDelay || 100;
    this.targetFps = config.targetFps || 30;
    this.memorySnapshotInterval = config.memorySnapshotInterval || 5000;
    this.gatherStats = config.gatherStats || false;
    this.maxStatSamples = config.maxStatSamples || 300;
    this.enableMouseMovement = config.enableMouseMovement || true;
    this._useMouse = config.useMouse ?? true;
    this._useAlternateScreen = config.useAlternateScreen ?? true;
    this.postProcessFns = config.postProcessFns || [];

    this.root = new Root(this.width, this.height);

    // Handle terminal resize
    this.sigwinchHandler = () =>
      Effect.gen(this, function* () {
        if (this.isShuttingDown) return;
        const width = this.stdout.columns || 80;
        const height = this.stdout.rows || 24;
        yield* this.handleResize(width, height);
      });
    process.on("SIGWINCH", this.sigwinchHandler);

    // const handleError = (error: Error) => {
    //   yield* this.stop();

    //   new Promise((resolve) => {
    //     setTimeout(() => {
    //       resolve(true);
    //     }, 100);
    //   }).then(() => {
    //     this.realStdoutWrite.call(this.stdout, "\n=== FATAL ERROR OCCURRED ===\n");
    //     this.realStdoutWrite.call(this.stdout, "Console cache:\n");
    //     this.realStdoutWrite.call(this.stdout, this.console.getCachedLogs());
    //     this.realStdoutWrite.call(this.stdout, "\nCaptured output:\n");
    //     const capturedOutput = capture.claimOutput();
    //     if (capturedOutput) {
    //       this.realStdoutWrite.call(this.stdout, capturedOutput + "\n");
    //     }
    //     this.realStdoutWrite.call(this.stdout, "\nError details:\n");
    //     this.realStdoutWrite.call(this.stdout, error.message || "unknown error");
    //     this.realStdoutWrite.call(this.stdout, "\n");
    //     this.realStdoutWrite.call(this.stdout, error.stack || error.toString());
    //     this.realStdoutWrite.call(this.stdout, "\n");

    //     process.exit(1);
    //   });
    // };

    // process.on("uncaughtException", handleError);
    // process.on("unhandledRejection", handleError);
    // process.on("exit", (code: number) => {
    //   this.stop();
    //   this.destroy();
    // });

    // this._console = new TerminalConsole(this, config.consoleOptions);
    // this.useConsole = config.useConsole ?? true;

    global.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const id = CliRenderer.animationFrameId++;
      this.animationRequest.set(id, callback);
      return id;
    };
    global.cancelAnimationFrame = (handle: number) => {
      this.animationRequest.delete(handle);
    };

    const window = global.window;
    if (!window) {
      global.window = {} as Window & typeof globalThis;
    }
    global.window.requestAnimationFrame = requestAnimationFrame;

    this.queryPixelResolution();
  }

  public initialize() {
    return Effect.gen(this, function* () {
      const lib = yield* Library;
      const ee = yield* EventEmitter;
      // const mm = this.interceptStdoutWrite.bind(this);
      // this.stdout.write = mm;
      this.takeMemorySnapshot(lib, ee);
      if (this.memorySnapshotInterval > 0) {
        yield* this.startMemorySnapshotTimer();
      }
      const nextRenderBufferAttributes = yield* lib.getNextBuffer(this.rendererPtr);
      this.nextRenderBuffer = new OptimizedBuffer(
        nextRenderBufferAttributes.bufferPtr,
        nextRenderBufferAttributes.buffers,
        nextRenderBufferAttributes.width,
        nextRenderBufferAttributes.height,
        {},
      );
      const currentRenderBufferAttributes = yield* lib.getCurrentBuffer(this.rendererPtr);
      this.currentRenderBuffer = new OptimizedBuffer(
        currentRenderBufferAttributes.bufferPtr,
        currentRenderBufferAttributes.buffers,
        currentRenderBufferAttributes.width,
        currentRenderBufferAttributes.height,
        {},
      );
      if (this._splitHeight > 0) {
        const capture = yield* CaptureService;
        capture.ee.on("write", this.captureCallback);
        this.renderOffset = this.height - this._splitHeight;
        this.height = this._splitHeight;
        yield* lib.setRenderOffset(this.rendererPtr, this.renderOffset);
      }
      yield* this.root.initialize();
      yield* this.setupTerminal();
      return this.renderContext;
    }).pipe(Effect.provide([Layer.succeed(RenderContext, this.renderContext), CaptureLive]));
  }

  private writeOut(chunk: any, encoding?: any, callback?: any): boolean {
    return this.realStdoutWrite.call(this.stdout, chunk, encoding, callback);
  }

  public needsUpdate = () =>
    Effect.gen(this, function* () {
      if (!this.updateScheduled && !this._isRunning) {
        this.updateScheduled = true;
        // yield* this.loop();
        this.updateScheduled = false;
      }
    });

  public getUseConsole(): boolean {
    return this._useConsole;
  }

  public setUseConsole(value: boolean) {
    this._useConsole = value;
    if (value) {
      // this.console.activate();
    } else {
      // this.console.deactivate();
    }
  }

  public isRunning(): boolean {
    return this._isRunning;
  }

  public getResolution(): PixelResolution | null {
    return this._resolution;
  }

  // public getConsole(): TerminalConsole {
  //   return this._console;
  // }

  public getTerminalWidth(): number {
    return this._terminalWidth;
  }

  public getTerminalHeight(): number {
    return this._terminalHeight;
  }

  public getUseThread(): boolean {
    return this._useThread;
  }

  public getUseMouse(): boolean {
    return this._useMouse;
  }

  public setUseMouse = (useMouse: boolean) =>
    Effect.gen(this, function* () {
      if (this._useMouse === useMouse) return; // No change needed

      this._useMouse = useMouse;

      if (useMouse) {
        yield* this.enableMouse();
      } else {
        yield* this.disableMouse();
      }
    });

  public get experimental_splitHeight(): number {
    return this._splitHeight;
  }

  public setExperimental_splitHeight = (splitHeight: number) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      const capture = yield* CaptureService;
      const ee = yield* EventEmitter;
      if (splitHeight < 0) splitHeight = 0;

      const prevSplitHeight = this._splitHeight;

      if (splitHeight > 0) {
        this._splitHeight = splitHeight;
        this.renderOffset = this._terminalHeight - this._splitHeight;
        this.height = this._splitHeight;

        if (prevSplitHeight === 0) {
          // this.useConsole = false;
          capture.ee.on("write", this.captureCallback);
          const freedLines = this._terminalHeight - this._splitHeight;
          const scrollDown2 = yield* scrollDown(freedLines);
          this.writeOut(scrollDown2);
        } else if (prevSplitHeight > this._splitHeight) {
          const freedLines = prevSplitHeight - this._splitHeight;
          const scrollDown2 = yield* scrollDown(freedLines);
          this.writeOut(scrollDown2);
        } else if (prevSplitHeight < this._splitHeight) {
          const additionalLines = this._splitHeight - prevSplitHeight;
          const scrollUp2 = yield* scrollUp(additionalLines);
          this.writeOut(scrollUp2);
        }
      } else {
        if (prevSplitHeight > 0) {
          yield* this.flushStdoutCache(this._terminalHeight, true);

          capture.ee.off("write", this.captureCallback);
          // this.useConsole = true;
        }

        this._splitHeight = 0;
        this.renderOffset = 0;
        this.height = this._terminalHeight;
      }

      this.width = this._terminalWidth;
      yield* lib.setRenderOffset(this.rendererPtr, this.renderOffset);
      yield* lib.resizeRenderer(this.rendererPtr, this.width, this.height);
      const nrba = yield* lib.getNextBuffer(this.rendererPtr);
      this.nextRenderBuffer = new OptimizedBuffer(nrba.bufferPtr, nrba.buffers, nrba.width, nrba.height, {});

      // this._console.resize(this.width, this.height);
      yield* this.root.resize(this.width, this.height);
      ee.emit("resize", this.width, this.height);
      yield* this.needsUpdate();
    });

  // TODO: We gotta find a way to run this generator function in the stdout.write somehow....
  private interceptStdoutWrite = (chunk: any, encoding?: any, callback?: any) =>
    Effect.gen(this, function* () {
      const text = chunk.toString(encoding);
      const capture = yield* CaptureService;

      yield* capture.write("stdout", text);
      if (this._splitHeight > 0) {
        yield* this.needsUpdate();
      }

      if (typeof callback === "function") {
        process.nextTick(callback);
      }

      return true;
    });

  private disableStdoutInterception = () =>
    Effect.gen(this, function* () {
      yield* this.flushStdoutCache(this._splitHeight);
      this.stdout.write = this.realStdoutWrite;
    });

  private flushStdoutCache = (space: number, force: boolean = false) =>
    Effect.gen(this, function* () {
      const capture = yield* CaptureService;
      const s = yield* capture.size();
      if (s === 0 && !force) return false;

      const output = capture.claimOutput();

      const rendererStartLine = this._terminalHeight - this._splitHeight;
      const flush = yield* moveCursorAndClear(rendererStartLine, 1);

      const outputLine = this._terminalHeight - this._splitHeight;
      const move = yield* moveCursor(outputLine, 1);

      const backgroundColor = this.backgroundColor.toInts();
      const newlines = " ".repeat(this.width) + "\n".repeat(space);
      const sbg = yield* setRgbBackground(backgroundColor[0], backgroundColor[1], backgroundColor[2]);
      const clear = sbg + newlines + ResetBackground.make("\u001B[49m");

      this.writeOut(flush + move + output + clear);

      return true;
    });

  private enableMouse = () =>
    Effect.gen(this, function* () {
      this.writeOut(EnableSGRMouseMode.make("\u001B[?1006h"));
      this.writeOut(EnableMouseTracking.make("\u001B[?1000h"));
      this.writeOut(EnableButtonEventTracking.make("\u001B[?1002h"));

      if (this.enableMouseMovement) {
        this.writeOut(EnableAnyEventTracking.make("\u001B[?1003h"));
      }
    });

  private disableMouse = () =>
    Effect.gen(this, function* () {
      const mouseParser = yield* MouseParser;
      if (this.enableMouseMovement) {
        this.writeOut(DisableAnyEventTracking.make("\u001B[?1003l"));
      }
      this.writeOut(DisableButtonEventTracking.make("\u001B[?1002l"));
      this.writeOut(DisableMouseTracking.make("\u001B[?1000l"));
      this.writeOut(DisableSGRMouseMode.make("\u001B[?1006l"));

      this.capturedRenderable = undefined;

      yield* mouseParser.reset();
    });

  public setUseThread = (useThread: boolean) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      this._useThread = useThread;
      yield* lib.setUseThread(this.rendererPtr, useThread);
    });

  public setTerminalSize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      yield* this.handleResize(width, height);
    });

  private setupTerminal = () =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      this.writeOut(SaveCursorState.make("\u001B[s"));
      if (this.stdin.setRawMode) {
        this.stdin.setRawMode(true);
      }
      this.stdin.resume();
      this.stdin.setEncoding("utf8");

      if (this._useMouse) {
        yield* this.enableMouse();
      }

      this.stdin.on("data", (data: Buffer) => {
        const str = data.toString();
        if (this.waitingForPixelResolution && /\x1b\[4;\d+;\d+t/.test(str)) {
          const match = str.match(/\x1b\[4;(\d+);(\d+)t/);
          if (match) {
            const resolution: PixelResolution = {
              width: parseInt(match[2]),
              height: parseInt(match[1]),
            };

            this._resolution = resolution;
            this.waitingForPixelResolution = false;
            return;
          }
        }

        if (this.exitOnCtrlC && str === "\u0003") {
          process.nextTick(() => {
            process.exit(0);
          });
          return;
        }

        if (this._useMouse && this.handleMouseData(data)) {
          return;
        }

        ee.emit("key", data);
      });

      if (this._useAlternateScreen) {
        this.writeOut(SwitchToAlternateScreen.make("\u001B[?1049h"));
      }
      yield* this.setCursorPosition(0, 0, false);
    });

  private handleMouseData = (data: Buffer) =>
    Effect.gen(this, function* () {
      const mouseParser = yield* MouseParser;
      const lib = yield* Library;
      const mouseEvent = yield* mouseParser.parse(data);

      if (mouseEvent) {
        if (this._splitHeight > 0) {
          if (mouseEvent.y < this.renderOffset) {
            return false;
          }
          mouseEvent.y -= this.renderOffset;
        }

        if (isMouseScroll(mouseEvent.type)) {
          const maybeRenderableId = yield* lib.checkHit(this.rendererPtr, mouseEvent.x, mouseEvent.y);
          const maybeRenderable = Renderable.renderablesByNumber.get(maybeRenderableId);

          if (maybeRenderable) {
            const event = new MouseEvent(maybeRenderable, mouseEvent);
            maybeRenderable.processMouseEvent(event);
          }
          return true;
        }

        const maybeRenderableId = yield* lib.checkHit(this.rendererPtr, mouseEvent.x, mouseEvent.y);
        const sameElement = maybeRenderableId === this.lastOverRenderableNum;
        this.lastOverRenderableNum = maybeRenderableId;
        const maybeRenderable = Renderable.renderablesByNumber.get(maybeRenderableId);

        if (mouseEvent.type === "down" && isLeftMouseButton(mouseEvent.button)) {
          if (
            maybeRenderable &&
            maybeRenderable.selectable &&
            maybeRenderable.shouldStartSelection(mouseEvent.x, mouseEvent.y)
          ) {
            yield* this.startSelection(maybeRenderable, mouseEvent.x, mouseEvent.y);
            return true;
          }
        }

        if (mouseEvent.type === "drag" && this.selectionState?.isSelecting) {
          yield* this.updateSelection(maybeRenderable, mouseEvent.x, mouseEvent.y);
          return true;
        }

        if (mouseEvent.type === "up" && this.selectionState?.isSelecting) {
          yield* this.finishSelection();
          return true;
        }

        if (mouseEvent.type === "down" && isLeftMouseButton(mouseEvent.button) && this.selectionState) {
          yield* this.clearSelection();
        }

        if (!sameElement && (mouseEvent.type === "drag" || mouseEvent.type === "move")) {
          if (this.lastOverRenderable && this.lastOverRenderable !== this.capturedRenderable) {
            const event = new MouseEvent(this.lastOverRenderable, { ...mouseEvent, type: MouseOut.make("out") });
            this.lastOverRenderable.processMouseEvent(event);
          }
          this.lastOverRenderable = maybeRenderable;
          if (maybeRenderable) {
            const event = new MouseEvent(maybeRenderable, {
              ...mouseEvent,
              type: MouseOver.make("over"),
              source: this.capturedRenderable,
            });
            maybeRenderable.processMouseEvent(event);
          }
        }

        if (this.capturedRenderable && mouseEvent.type !== "up") {
          const event = new MouseEvent(this.capturedRenderable, mouseEvent);
          this.capturedRenderable.processMouseEvent(event);
          return true;
        }

        if (this.capturedRenderable && mouseEvent.type === "up") {
          const event = new MouseEvent(this.capturedRenderable, { ...mouseEvent, type: MouseDragEnd.make("drag-end") });
          this.capturedRenderable.processMouseEvent(event);
          if (maybeRenderable) {
            const event = new MouseEvent(maybeRenderable, {
              ...mouseEvent,
              type: MouseDrop.make("drop"),
              source: this.capturedRenderable,
            });
            maybeRenderable.processMouseEvent(event);
          }
          this.lastOverRenderable = this.capturedRenderable;
          this.lastOverRenderableNum = this.capturedRenderable.num;
          this.capturedRenderable = undefined;
        }

        if (maybeRenderable) {
          if (mouseEvent.type === "down" && isLeftMouseButton(mouseEvent.button)) {
            this.capturedRenderable = maybeRenderable;
          } else {
            this.capturedRenderable = undefined;
          }
          const event = new MouseEvent(maybeRenderable, mouseEvent);
          maybeRenderable.processMouseEvent(event);
          return true;
        }

        this.capturedRenderable = undefined;
        this.lastOverRenderable = undefined;
        return true;
      }

      return false;
    });

  private takeMemorySnapshot = (lib: Library, ee: EE) => {
    const memoryUsage = process.memoryUsage();
    this.lastMemorySnapshot = {
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      arrayBuffers: memoryUsage.arrayBuffers,
    };

    lib.updateMemoryStats(
      this.rendererPtr,
      this.lastMemorySnapshot.heapUsed,
      this.lastMemorySnapshot.heapTotal,
      this.lastMemorySnapshot.arrayBuffers,
    );

    ee.emit("memory:snapshot", this.lastMemorySnapshot);
  };

  private startMemorySnapshotTimer = () =>
    Effect.gen(this, function* () {
      if (this.memorySnapshotTimer) {
        clearInterval(this.memorySnapshotTimer);
      }

      const lib = yield* Library;
      const ee = yield* EventEmitter;
      this.memorySnapshotTimer = setInterval(() => {
        this.takeMemorySnapshot(lib, ee);
      }, this.memorySnapshotInterval);
    });

  public setMemorySnapshotInterval = (interval: number) =>
    Effect.gen(this, function* () {
      this.memorySnapshotInterval = interval;

      if (this._isRunning && interval > 0) {
        yield* this.startMemorySnapshotTimer();
      } else if (interval <= 0 && this.memorySnapshotTimer) {
        clearInterval(this.memorySnapshotTimer);
        this.memorySnapshotTimer = null;
      }
    });

  private handleResize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      if (this.isShuttingDown) return;
      if (this._splitHeight > 0) {
        yield* this.processResize(width, height);
        return;
      }

      if (this.resizeTimeoutId !== null) {
        clearTimeout(this.resizeTimeoutId);
        this.resizeTimeoutId = null;
      }

      yield* Effect.scheduleForked(
        Effect.gen(this, function* () {
          yield* this.processResize(width, height);
        }),
        Schedule.duration(Duration.millis(this.resizeDebounceDelay)),
      );
    });

  private queryPixelResolution() {
    this.waitingForPixelResolution = true;
    this.writeOut(QueryPixelSize.make("\u001B[14t"));
  }

  private processResize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      if (width === this._terminalWidth && height === this._terminalHeight) return;
      const mouseParser = yield* MouseParser;
      const lib = yield* Library;
      const ee = yield* EventEmitter;

      const prevWidth = this._terminalWidth;

      this._terminalWidth = width;
      this._terminalHeight = height;
      this.queryPixelResolution();

      this.capturedRenderable = undefined;
      yield* mouseParser.reset();

      if (this._splitHeight > 0) {
        // TODO: Handle resizing split mode properly
        if (width < prevWidth) {
          const start = this._terminalHeight - this._splitHeight * 2;
          const flush = yield* moveCursorAndClear(start, 1);
          this.writeOut(flush);
        }
        this.renderOffset = height - this._splitHeight;
        this.width = width;
        this.height = this._splitHeight;
        const c = yield* RGBA.fromHex(Colors.Black.make("#000000"));
        yield* this.currentRenderBuffer!.clearLocal(c, "\u0a00");
        yield* lib.setRenderOffset(this.rendererPtr, this.renderOffset);
      } else {
        this.width = width;
        this.height = height;
      }

      yield* lib.resizeRenderer(this.rendererPtr, this.width, this.height);
      const nrba = yield* lib.getNextBuffer(this.rendererPtr);

      this.nextRenderBuffer = new OptimizedBuffer(nrba.bufferPtr, nrba.buffers, nrba.width, nrba.height, {});
      const crba = yield* lib.getCurrentBuffer(this.rendererPtr);
      this.currentRenderBuffer = new OptimizedBuffer(crba.bufferPtr, crba.buffers, crba.width, crba.height, {});
      // this._console.resize(this.width, this.height);
      yield* this.root.resize(this.width, this.height);
      ee.emit("resize", this.width, this.height);
      yield* this.needsUpdate();
    });

  public setBackgroundColor = (color: Colors.Input) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      const parsedColor = yield* parseColor(color);
      yield* lib.setBackgroundColor(this.rendererPtr, parsedColor);
      this.backgroundColor = parsedColor;
      yield* this.nextRenderBuffer!.clear(parsedColor);
      yield* this.needsUpdate();
    });

  public toggleDebugOverlay = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      const ee = yield* EventEmitter;
      this.debugOverlay.enabled = !this.debugOverlay.enabled;
      yield* lib.setDebugOverlay(this.rendererPtr, this.debugOverlay.enabled, this.debugOverlay.corner);
      ee.emit(CliRenderEvents.DEBUG_OVERLAY_TOGGLE, this.debugOverlay.enabled);
      yield* this.needsUpdate();
    });

  public configureDebugOverlay = (options: { enabled?: boolean; corner?: DebugOverlayCorner }) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      this.debugOverlay.enabled = options.enabled ?? this.debugOverlay.enabled;
      this.debugOverlay.corner = options.corner ?? this.debugOverlay.corner;
      yield* lib.setDebugOverlay(this.rendererPtr, this.debugOverlay.enabled, this.debugOverlay.corner);
      yield* this.needsUpdate();
    });

  public clearTerminal = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.clearTerminal(this.rendererPtr);
    });

  public dumpHitGrid = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.dumpHitGrid(this.rendererPtr);
    });

  public dumpBuffers = (timestamp?: number) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.dumpBuffers(this.rendererPtr, timestamp);
    });

  public dumpStdoutBuffer = (timestamp?: number) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.dumpStdoutBuffer(this.rendererPtr, timestamp);
    });

  public static setCursorPosition = (x: number, y: number, visible: boolean = true) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.setCursorPosition(x, y, visible);
    });

  public static setCursorStyle = (style: Style, blinking: boolean = false, color?: RGBA) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.setCursorStyle(style, blinking);
      if (color) {
        yield* lib.setCursorColor(color);
      }
    });

  public static setCursorColor = (color: RGBA) =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      yield* lib.setCursorColor(color);
    });

  public setCursorPosition = (x: number, y: number, visible: boolean = true) =>
    CliRenderer.setCursorPosition(x, y, visible);

  public setCursorStyle = (style: Style, blinking: boolean = false, color?: RGBA) =>
    CliRenderer.setCursorStyle(style, blinking, color);

  public setCursorColor = (color: RGBA) => CliRenderer.setCursorColor(color);

  public addPostProcessFn(processFn: (buffer: OptimizedBuffer, deltaTime: number) => void): void {
    this.postProcessFns.push(processFn);
  }

  public removePostProcessFn(processFn: (buffer: OptimizedBuffer, deltaTime: number) => void): void {
    this.postProcessFns = this.postProcessFns.filter((fn) => fn !== processFn);
  }

  public clearPostProcessFns(): void {
    this.postProcessFns = [];
  }

  public setFrameCallback(callback: (deltaTime: number) => Promise<void>): void {
    this.frameCallbacks.push(callback);
  }

  public removeFrameCallback(callback: (deltaTime: number) => Promise<void>): void {
    this.frameCallbacks = this.frameCallbacks.filter((cb) => cb !== callback);
  }

  public clearFrameCallbacks(): void {
    this.frameCallbacks = [];
  }

  public start = () =>
    Effect.gen(this, function* () {
      if (!this._isRunning && !this.isDestroyed) {
        this._isRunning = true;

        if (this.memorySnapshotInterval > 0) {
          yield* this.startMemorySnapshotTimer();
        }

        yield* this.startRenderLoop();
      }
    });

  public pause(): void {
    this._isRunning = false;
  }

  public stop = () =>
    Effect.gen(this, function* () {
      if (this.isShuttingDown) return;
      this._isRunning = false;
      this.isShuttingDown = true;

      this.waitingForPixelResolution = false;

      if (this.sigwinchHandler) {
        process.removeListener("SIGWINCH", this.sigwinchHandler);
        this.sigwinchHandler = null;
      }

      // this._console.deactivate();
      yield* this.disableStdoutInterception();

      if (this.renderFiber) {
        yield* Fiber.interrupt(this.renderFiber);
        this.renderFiber = null;
      }

      if (this.memorySnapshotTimer) {
        clearInterval(this.memorySnapshotTimer);
        this.memorySnapshotTimer = null;
      }

      if (this._splitHeight > 0) {
        const consoleEndLine = this._terminalHeight - this._splitHeight;
        const move = yield* moveCursor(consoleEndLine, 1);
        this.writeOut(move);
      }

      this.capturedRenderable = undefined;

      if (this._useMouse) {
        yield* this.disableMouse();
      }
      this.writeOut(ResetCursorColor.make("\u001B]12;default\u0007"));
      this.writeOut(ShowCursor.make("\u001B[?25h"));

      if (this._useAlternateScreen) {
        this.writeOut(SwitchToMainScreen.make("\u001B[?1049l"));
      }
    });

  public destroy = () =>
    Effect.gen(this, function* () {
      if (this.isDestroyed) return;
      const lib = yield* Library;
      // yield* this.root.destroy();
      yield* lib.destroyRenderer(this.rendererPtr);
      this.isDestroyed = true;
    });

  private startRenderLoop = () =>
    Effect.gen(this, function* () {
      if (!this._isRunning) return;

      this.lastTime = Date.now();
      this.frameCount = 0;
      this.lastFpsTime = this.lastTime;
      this.currentFps = 0;
      this.targetFrameTime = 1000 / this.targetFps;

      yield* this.loop();
    });

  private loop: () => Effect.Effect<void, Error | RendererFailedToRender, Library | CaptureService> = () =>
    Effect.gen(this, function* () {
      if (this.rendering) return;
      this.rendering = true;
      if (this.renderFiber) {
        yield* Fiber.interrupt(this.renderFiber);
        this.renderFiber = null;
      }

      const now = Date.now();
      const elapsed = now - this.lastTime;

      const deltaTime = elapsed;
      this.lastTime = now;

      this.frameCount++;
      if (now - this.lastFpsTime >= 1000) {
        this.currentFps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsTime = now;
      }

      this.renderStats.frameCount++;
      this.renderStats.fps = this.currentFps;
      const overallStart = performance.now();

      const frameRequests = this.animationRequest.values();
      this.animationRequest.clear();
      const animationRequestStart = performance.now();
      frameRequests.forEach((callback) => callback(deltaTime));
      const animationRequestEnd = performance.now();
      const animationRequestTime = animationRequestEnd - animationRequestStart;

      const start = performance.now();
      yield* Effect.all(
        this.frameCallbacks.map((frameCallback) =>
          Effect.tryPromise({
            try: () => frameCallback(deltaTime),
            catch: (error) => new FrameCallbackError({ cause: error }),
          }),
        ),
      );

      const end = performance.now();
      this.renderStats.frameCallbackTime = end - start;

      // Render the renderable tree
      yield* this.root.render(this.nextRenderBuffer!, deltaTime);

      for (const postProcessFn of this.postProcessFns) {
        postProcessFn(this.nextRenderBuffer!, deltaTime);
      }

      // yield* this._console.renderToBuffer(this.nextRenderBuffer!);

      yield* this.renderNative();

      const overallFrameTime = performance.now() - overallStart;
      // TODO: Add animationRequestTime to stats
      const lib = yield* Library;
      yield* lib.updateStats(
        this.rendererPtr,
        overallFrameTime,
        this.renderStats.fps,
        this.renderStats.frameCallbackTime,
      );

      if (this.gatherStats) {
        this.collectStatSample(overallFrameTime);
      }

      if (this._isRunning) {
        const delay = Math.max(1, this.targetFrameTime - Math.floor(overallFrameTime));
        const innerLoop = Effect.suspend(() => this.loop());
        const scheduled = Effect.schedule(innerLoop, Schedule.duration(Duration.millis(delay)));
        const forked = yield* Effect.forkScoped(scheduled).pipe(Effect.scoped);
        this.renderFiber = forked;
      }

      this.rendering = false;
      if (this.immediateRerenderRequested) {
        this.immediateRerenderRequested = false;
        yield* Effect.suspend(() => this.loop());
      }
    }).pipe(Effect.provide(Layer.succeed(RenderContext, this.renderContext)));

  public intermediateRender = () =>
    Effect.gen(this, function* () {
      // if (!this._isRunning) return
      this.immediateRerenderRequested = true;
      yield* this.loop();
    });

  private renderNative = () =>
    Effect.gen(this, function* () {
      const lib = yield* Library;
      if (this.renderingNative) {
        yield* Console.error("Rendering called concurrently");
        return yield* Effect.fail(new Error("Rendering called concurrently"));
      }

      let force = false;
      if (this._splitHeight > 0) {
        // TODO: Flickering could maybe be even more reduced by moving the flush to the native layer,
        // to output the flush with the buffered writer, after the render is done.
        force = yield* this.flushStdoutCache(this._splitHeight);
      }

      this.renderingNative = true;
      yield* lib.render(this.rendererPtr, force);
      this.renderingNative = false;
    });

  private collectStatSample(frameTime: number): void {
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > this.maxStatSamples) {
      this.frameTimes.shift();
    }
  }

  public getStats(): {
    fps: number;
    frameCount: number;
    frameTimes: number[];
    averageFrameTime: number;
    minFrameTime: number;
    maxFrameTime: number;
  } {
    const frameTimes = [...this.frameTimes];
    const sum = frameTimes.reduce((acc, time) => acc + time, 0);
    const avg = frameTimes.length ? sum / frameTimes.length : 0;
    const min = frameTimes.length ? Math.min(...frameTimes) : 0;
    const max = frameTimes.length ? Math.max(...frameTimes) : 0;

    return {
      fps: this.renderStats.fps,
      frameCount: this.renderStats.frameCount,
      frameTimes,
      averageFrameTime: avg,
      minFrameTime: min,
      maxFrameTime: max,
    };
  }

  public resetStats(): void {
    this.frameTimes = [];
    this.renderStats.frameCount = 0;
  }

  public setGatherStats(enabled: boolean): void {
    this.gatherStats = enabled;
    if (!enabled) {
      this.frameTimes = [];
    }
  }

  public getSelection(): Selection | null {
    return this.currentSelection;
  }

  public getSelectionContainer(): Renderable | null {
    return this.selectionContainers.length > 0 ? this.selectionContainers[this.selectionContainers.length - 1] : null;
  }

  public hasSelection(): boolean {
    return this.currentSelection !== null;
  }

  public clearSelection = () =>
    Effect.gen(this, function* () {
      if (this.selectionState) {
        this.selectionState = null;
        yield* this.notifySelectablesOfSelectionChange();
      }
      this.currentSelection = null;
      this.selectionContainers = [];
    });

  private startSelection = (startRenderable: Renderable, x: number, y: number) =>
    Effect.gen(this, function* () {
      yield* this.clearSelection();
      this.selectionContainers.push(startRenderable.parent || this.root);

      this.selectionState = {
        anchor: { x, y },
        focus: { x, y },
        isActive: true,
        isSelecting: true,
      };

      this.currentSelection = new Selection({ x, y }, { x, y });
      yield* this.notifySelectablesOfSelectionChange();
    });

  private updateSelection = (currentRenderable: Renderable | undefined, x: number, y: number) =>
    Effect.gen(this, function* () {
      if (this.selectionState) {
        this.selectionState.focus = { x, y };

        if (this.selectionContainers.length > 0) {
          const currentContainer = this.selectionContainers[this.selectionContainers.length - 1];

          if (!currentRenderable || !this.isWithinContainer(currentRenderable, currentContainer)) {
            const parentContainer = currentContainer.parent || this.root;
            this.selectionContainers.push(parentContainer);
          } else if (currentRenderable && this.selectionContainers.length > 1) {
            let containerIndex = this.selectionContainers.indexOf(currentRenderable);

            if (containerIndex === -1) {
              const immediateParent = currentRenderable.parent || this.root;
              containerIndex = this.selectionContainers.indexOf(immediateParent);
            }

            if (containerIndex !== -1 && containerIndex < this.selectionContainers.length - 1) {
              this.selectionContainers = this.selectionContainers.slice(0, containerIndex + 1);
            }
          }
        }

        if (this.currentSelection) {
          this.currentSelection = new Selection(this.selectionState.anchor, this.selectionState.focus);
        }

        yield* this.notifySelectablesOfSelectionChange();
      }
    });

  private isWithinContainer(renderable: Renderable, container: Renderable): boolean {
    let current: Renderable | null = renderable;
    while (current) {
      if (current === container) return true;
      current = current.parent;
    }
    return false;
  }

  private finishSelection = () =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      if (this.selectionState) {
        this.selectionState.isSelecting = false;
        ee.emit("selection", this.currentSelection);
      }
    });

  private notifySelectablesOfSelectionChange = () =>
    Effect.gen(this, function* () {
      let normalizedSelection: SelectionState | null = null;
      if (this.selectionState) {
        normalizedSelection = { ...this.selectionState };

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

      const selectedRenderables: Renderable[] = [];

      for (const [, renderable] of Renderable.renderablesByNumber) {
        if (renderable._visible && renderable.selectable) {
          const currentContainer =
            this.selectionContainers.length > 0 ? this.selectionContainers[this.selectionContainers.length - 1] : null;
          let hasSelection = false;
          if (!currentContainer || this.isWithinContainer(renderable, currentContainer)) {
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

      if (this.currentSelection) {
        this.currentSelection.updateSelectedRenderables(selectedRenderables);
      }
    });
}
