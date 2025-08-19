import util from "util";
import { FileSystem, Path } from "@effect/platform";
import { Config, Console, Effect, Logger, Schema } from "effect";
import type { CliRenderer } from ".";
import { OptimizedBuffer } from "../buffer/optimized";
import * as Colors from "../colors";
import { EventEmitter } from "../event-emitter";
import { RGBA } from "../types";

interface DisplayLine {
  text: string;
  level: LogLevel;
  indent: boolean;
}
const LogLevel = {
  LOG: "LOG",
  INFO: "INFO",
  WARN: "WARN",
  ERROR: "ERROR",
  DEBUG: "DEBUG",
} as const;
type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

const CallerInfoSchema = Schema.Struct({
  functionName: Schema.String,
  fullPath: Schema.String,
  fileName: Schema.String,
  lineNumber: Schema.Number,
  columnNumber: Schema.Number,
});
type CallerInfo = typeof CallerInfoSchema.Type;

const getCallerInfo = Effect.gen(function* () {
  const err = new Error();
  const stackLines = err.stack?.split("\n").slice(5) || [];
  if (!stackLines.length) return null;

  const callerLine = stackLines[0].trim();

  const regex = /at\s+(?:([\w$.<>]+)\s+\()?((?:\/|[A-Za-z]:\\)[^:]+):(\d+):(\d+)\)?/;
  const match = callerLine.match(regex);

  if (!match) return null;

  // Extract details from the match.
  const functionName = match[1] || "<anonymous>";
  const fullPath = match[2];
  const fileName = fullPath.split(/[\\/]/).pop() || "<unknown>";
  const lineNumber = parseInt(match[3], 10) || 0;
  const columnNumber = parseInt(match[4], 10) || 0;

  return CallerInfoSchema.make({ functionName, fullPath, fileName, lineNumber, columnNumber });
});

export enum ConsolePosition {
  TOP = "top",
  BOTTOM = "bottom",
  LEFT = "left",
  RIGHT = "right",
}
export interface ConsoleOptions {
  position?: ConsolePosition;
  sizePercent?: number;
  zIndex?: number;
  colorInfo?: Colors.Input;
  colorWarn?: Colors.Input;
  colorError?: Colors.Input;
  colorDebug?: Colors.Input;
  colorDefault?: Colors.Input;
  backgroundColor?: RGBA;
  startInDebugMode?: boolean;
  title?: string;
  titleBarColor?: RGBA;
  titleBarTextColor?: Colors.Input;
  cursorColor?: Colors.Input;
  maxStoredLogs?: number;
  maxDisplayLines?: number;
}

const DEFAULT_CONSOLE_OPTIONS: Required<ConsoleOptions> = {
  position: ConsolePosition.BOTTOM,
  sizePercent: 30,
  zIndex: Infinity,
  colorInfo: Colors.Cyan.make("#00FFFF"), // Cyan
  colorWarn: Colors.Yellow.make("#FFFF00"), // Yellow
  colorError: Colors.Red.make("#FF0000"), // Red
  colorDebug: Colors.Gray.make("#808080"), // Gray
  colorDefault: Colors.White.make("#FFFFFF"), // White
  backgroundColor: RGBA.fromValues(0.1, 0.1, 0.1, 0.7),
  startInDebugMode: false,
  title: "Console",
  titleBarColor: RGBA.fromValues(0.05, 0.05, 0.05, 0.7),
  titleBarTextColor: Colors.White.make("#FFFFFF"),
  cursorColor: Colors.Custom.make("#00A0FF"),
  maxStoredLogs: 2000,
  maxDisplayLines: 3000,
};

const INDENT_WIDTH = 2;

class TerminalConsoleCache {
  private originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
  };
  private _cachedLogs: [Date, LogLevel, any[], CallerInfo | null][] = [];
  private readonly MAX_CACHE_SIZE = 1000;
  private _collectCallerInfo: boolean = false;
  private _cachingEnabled: boolean = true;

  get cachedLogs(): [Date, LogLevel, any[], CallerInfo | null][] {
    return this._cachedLogs;
  }

  constructor() {
    this.originalConsole = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
  }

  public initialize = () =>
    Effect.gen(this, function* () {
      const skip = yield* Config.boolean("SKIP_CONSOLE_CACHE").pipe(Config.withDefault(false));
      if (!skip) {
        yield* this.activate();
      }
    });

  public activate = () =>
    Effect.gen(this, function* () {
      yield* this.overrideConsoleMethods();
    });

  public setCollectCallerInfo(enabled: boolean): void {
    this._collectCallerInfo = enabled;
  }

  public clearConsole(): void {
    this._cachedLogs = [];
  }

  public setCachingEnabled(enabled: boolean): void {
    this._cachingEnabled = enabled;
  }

  public deactivate(): void {
    console.log = this.originalConsole.log;
    console.info = this.originalConsole.info;
    console.warn = this.originalConsole.warn;
    console.error = this.originalConsole.error;
    console.debug = this.originalConsole.debug;
  }

  private overrideConsoleMethods = () =>
    Effect.gen(this, function* () {
      console.log = (...args: any[]) => {
        yield * this.appendToConsole(LogLevel.LOG, ...args);
      };

      console.info = (...args: any[]) => {
        yield * this.appendToConsole(LogLevel.INFO, ...args);
      };

      console.warn = (...args: any[]) => {
        yield * this.appendToConsole(LogLevel.WARN, ...args);
      };

      console.error = (...args: any[]) => {
        yield * this.appendToConsole(LogLevel.ERROR, ...args);
      };

      console.debug = (...args: any[]) => {
        yield * this.appendToConsole(LogLevel.DEBUG, ...args);
      };
    });

  public addLogEntry = (level: LogLevel, ...args: any[]) =>
    Effect.gen(this, function* () {
      const callerInfo = this._collectCallerInfo ? yield* getCallerInfo : null;
      const logEntry: [Date, LogLevel, any[], CallerInfo | null] = [new Date(), level, args, callerInfo];

      if (this._cachingEnabled) {
        if (this._cachedLogs.length >= this.MAX_CACHE_SIZE) {
          this._cachedLogs.shift();
        }
        this._cachedLogs.push(logEntry);
      }

      return logEntry;
    });

  private appendToConsole = (level: LogLevel, ...args: any[]) =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      if (this._cachedLogs.length >= this.MAX_CACHE_SIZE) {
        this._cachedLogs.shift();
      }
      const entry = yield* this.addLogEntry(level, ...args);
      ee.emit("terminalconsole:entry", entry);
    });

  public destroy(): void {
    this.deactivate();
  }
}

// const terminalConsoleCache = new TerminalConsoleCache();

export class TerminalConsole {
  private isVisible: boolean = false;
  private isFocused: boolean = false;
  private renderer: CliRenderer;
  private stdinHandler: (...args: any[]) => void;
  private options: Required<ConsoleOptions>;
  private _debugModeEnabled: boolean = false;

  private frameBuffer: OptimizedBuffer | null = null;
  private consoleX: number = 0;
  private consoleY: number = 0;
  private consoleWidth: number = 0;
  private consoleHeight: number = 0;
  private scrollTopIndex: number = 0;
  private isScrolledToBottom: boolean = true;
  private currentLineIndex: number = 0;
  private _displayLines: DisplayLine[] = [];
  private _allLogEntries: [Date, LogLevel, any[], CallerInfo | null][] = [];
  private _needsFrameBufferUpdate: boolean = false;

  private markNeedsUpdate = () =>
    Effect.gen(this, function* () {
      this._needsFrameBufferUpdate = true;
      yield* this.renderer.needsUpdate();
    });

  private _rgbaInfo: RGBA | null = null;
  private _rgbaWarn: RGBA | null = null;
  private _rgbaError: RGBA | null = null;
  private _rgbaDebug: RGBA | null = null;
  private _rgbaDefault: RGBA | null = null;
  private backgroundColor: RGBA | null = null;
  private _rgbaTitleBar: RGBA | null = null;
  private _rgbaTitleBarText: RGBA | null = null;
  private _title: string = "";
  private _rgbaCursor: RGBA | null = null;

  private _positions: ConsolePosition[] = [
    ConsolePosition.TOP,
    ConsolePosition.RIGHT,
    ConsolePosition.BOTTOM,
    ConsolePosition.LEFT,
  ];

  constructor(renderer: CliRenderer, options: ConsoleOptions = {}) {
    this.renderer = renderer;
    this.options = { ...DEFAULT_CONSOLE_OPTIONS, ...options };
    this.stdinHandler = this.handleStdin.bind(this);
    this._debugModeEnabled = this.options.startInDebugMode;
    // terminalConsoleCache.setCollectCallerInfo(this._debugModeEnabled);

    this._scrollToBottom(true);
  }

  public initialize = () =>
    Effect.gen(this, function* () {
      const ee = yield* EventEmitter;
      // yield* terminalConsoleCache.initialize();
      ee.on("terminalconsole:entry", (logEntry: [Date, LogLevel, any[], CallerInfo | null]) =>
        Effect.gen(this, function* () {
          yield* this._handleNewLog(logEntry);
        }),
      );
      this._rgbaInfo = yield* RGBA.fromHex(this.options.colorInfo);
      this._rgbaWarn = yield* RGBA.fromHex(this.options.colorWarn);
      this._rgbaError = yield* RGBA.fromHex(this.options.colorError);
      this._rgbaDebug = yield* RGBA.fromHex(this.options.colorDebug);
      this._rgbaDefault = yield* RGBA.fromHex(this.options.colorDefault);
      this.backgroundColor = this.options.backgroundColor;
      this._rgbaTitleBar = this.options.titleBarColor;
      this._rgbaTitleBarText = yield* RGBA.fromHex(this.options.titleBarTextColor || this.options.colorDefault);
      this._title = this.options.title;
      this._rgbaCursor = yield* RGBA.fromHex(this.options.cursorColor);
      const showConsole = yield* Config.boolean("SHOW_CONSOLE").pipe(Config.withDefault(false));
      if (showConsole) {
        yield* this.show();
      }
      yield* this._updateConsoleDimensions();
    });

  public activate = () =>
    Effect.gen(this, function* () {
      // yield* terminalConsoleCache.activate();
    });

  public deactivate(): void {
    // terminalConsoleCache.deactivate();
  }

  // Handles a single new log entry *while the console is visible*
  private _handleNewLog = (logEntry: [Date, LogLevel, any[], CallerInfo | null]) =>
    Effect.gen(this, function* () {
      if (!this.isVisible) return;

      this._allLogEntries.push(logEntry);

      if (this._allLogEntries.length > this.options.maxStoredLogs) {
        this._allLogEntries.splice(0, this._allLogEntries.length - this.options.maxStoredLogs);
      }

      const newDisplayLines = this._processLogEntry(logEntry);
      this._displayLines.push(...newDisplayLines);

      if (this._displayLines.length > this.options.maxDisplayLines) {
        this._displayLines.splice(0, this._displayLines.length - this.options.maxDisplayLines);
        const linesRemoved = this._displayLines.length - this.options.maxDisplayLines;
        this.scrollTopIndex = Math.max(0, this.scrollTopIndex - linesRemoved);
      }

      if (this.isScrolledToBottom) {
        this._scrollToBottom();
      }
      yield* this.markNeedsUpdate();
    });

  private _updateConsoleDimensions = () =>
    Effect.gen(this, function* () {
      const termWidth = this.renderer.getTerminalWidth();
      const termHeight = this.renderer.getTerminalHeight();
      const sizePercent = this.options.sizePercent / 100;

      switch (this.options.position) {
        case ConsolePosition.TOP:
          this.consoleX = 0;
          this.consoleY = 0;
          this.consoleWidth = termWidth;
          this.consoleHeight = Math.max(1, Math.floor(termHeight * sizePercent));
          break;
        case ConsolePosition.BOTTOM:
          this.consoleHeight = Math.max(1, Math.floor(termHeight * sizePercent));
          this.consoleWidth = termWidth;
          this.consoleX = 0;
          this.consoleY = termHeight - this.consoleHeight;
          break;
        case ConsolePosition.LEFT:
          this.consoleWidth = Math.max(1, Math.floor(termWidth * sizePercent));
          this.consoleHeight = termHeight;
          this.consoleX = 0;
          this.consoleY = 0;
          break;
        case ConsolePosition.RIGHT:
          this.consoleWidth = Math.max(1, Math.floor(termWidth * sizePercent));
          this.consoleHeight = termHeight;
          this.consoleY = 0;
          this.consoleX = termWidth - this.consoleWidth;
          break;
      }
      this.currentLineIndex = Math.max(0, Math.min(this.currentLineIndex, this.consoleHeight - 1));
    });

  private handleStdin = (data: Buffer) =>
    Effect.gen(this, function* () {
      const key = data.toString();

      let needsRedraw = false;
      const displayLineCount = this._displayLines.length;
      const logAreaHeight = Math.max(1, this.consoleHeight - 1);
      const maxScrollTop = Math.max(0, displayLineCount - logAreaHeight);
      const currentPositionIndex = this._positions.indexOf(this.options.position);

      switch (key) {
        case "\u001b": // ESC key
          this.blur();
          break;
        case "\u001b[1;2A": // Shift+UpArrow - Scroll to top
          if (this.scrollTopIndex > 0 || this.currentLineIndex > 0) {
            this.scrollTopIndex = 0;
            this.currentLineIndex = 0;
            this.isScrolledToBottom = this._displayLines.length <= Math.max(1, this.consoleHeight - 1);
            needsRedraw = true;
          }
          break;
        case "\u001b[1;2B": // Shift+DownArrow - Scroll to bottom
          const logAreaHeightForScroll = Math.max(1, this.consoleHeight - 1);
          const maxScrollPossible = Math.max(0, this._displayLines.length - logAreaHeightForScroll);
          if (this.scrollTopIndex < maxScrollPossible || !this.isScrolledToBottom) {
            this._scrollToBottom(true);
            needsRedraw = true;
          }
          break;
        case "\u001b[A": // Up arrow
          if (this.currentLineIndex > 0) {
            this.currentLineIndex--;
            needsRedraw = true;
          } else if (this.scrollTopIndex > 0) {
            this.scrollTopIndex--;
            this.isScrolledToBottom = false;
            needsRedraw = true;
          }
          break;
        case "\u001b[B": // Down arrow
          const canCursorMoveDown =
            this.currentLineIndex < logAreaHeight - 1 &&
            this.scrollTopIndex + this.currentLineIndex < displayLineCount - 1;

          if (canCursorMoveDown) {
            this.currentLineIndex++;
            needsRedraw = true;
          } else if (this.scrollTopIndex < maxScrollTop) {
            this.scrollTopIndex++;
            this.isScrolledToBottom = this.scrollTopIndex === maxScrollTop;
            needsRedraw = true;
          }
          break;
        case "\u0010": // Ctrl+p (Previous position)
          const prevIndex = (currentPositionIndex - 1 + this._positions.length) % this._positions.length;
          this.options.position = this._positions[prevIndex];
          this.resize(this.renderer.getTerminalWidth(), this.renderer.getTerminalHeight());
          break;
        case "\u000f": // Ctrl+o (Next/Other position)
          const nextIndex = (currentPositionIndex + 1) % this._positions.length;
          this.options.position = this._positions[nextIndex];
          this.resize(this.renderer.getTerminalWidth(), this.renderer.getTerminalHeight());
          break;
        case "+":
          this.options.sizePercent = Math.min(100, this.options.sizePercent + 5);
          this.resize(this.renderer.getTerminalWidth(), this.renderer.getTerminalHeight());
          break;
        case "-":
          this.options.sizePercent = Math.max(10, this.options.sizePercent - 5);
          this.resize(this.renderer.getTerminalWidth(), this.renderer.getTerminalHeight());
          break;
        case "\u0013": // Ctrl+s (Save logs)
          this.saveLogsToFile();
          break;
      }

      if (needsRedraw) {
        yield* this.markNeedsUpdate();
      }
    });

  private attachStdin(): void {
    if (this.isFocused) return;
    process.stdin.on("data", this.stdinHandler);
    this.isFocused = true;
  }

  private detachStdin(): void {
    if (!this.isFocused) return;
    process.stdin.off("data", this.stdinHandler);
    this.isFocused = false;
  }

  private formatTimestamp(date: Date): string {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  private formatArguments(args: any[]): string {
    return args
      .map((arg) => {
        if (arg instanceof Error) {
          const errorProps = arg;
          return `Error: ${errorProps.message}\n` + (errorProps.stack ? `${errorProps.stack}\n` : "");
        }
        if (typeof arg === "object" && arg !== null) {
          try {
            return util.inspect(arg, { depth: 2 });
          } catch (e) {
            return String(arg);
          }
        }
        try {
          return util.inspect(arg, { depth: 2 });
        } catch (e) {
          return String(arg);
        }
      })
      .join(" ");
  }

  public resize = (width: number, height: number) =>
    Effect.gen(this, function* () {
      yield* this._updateConsoleDimensions();

      if (this.frameBuffer) {
        yield* this.frameBuffer.resize(this.consoleWidth, this.consoleHeight);

        const displayLineCount = this._displayLines.length;
        const logAreaHeight = Math.max(1, this.consoleHeight - 1);
        const maxScrollTop = Math.max(0, displayLineCount - logAreaHeight);
        this.scrollTopIndex = Math.min(this.scrollTopIndex, maxScrollTop);
        this.isScrolledToBottom = this.scrollTopIndex === maxScrollTop;
        const visibleLineCount = Math.min(logAreaHeight, displayLineCount - this.scrollTopIndex);
        this.currentLineIndex = Math.max(0, Math.min(this.currentLineIndex, visibleLineCount - 1));

        if (this.isVisible) {
          yield* this.markNeedsUpdate();
        }
      }
    });

  public clear = () =>
    Effect.gen(this, function* () {
      // terminalConsoleCache.clearConsole();
      yield* Console.clear;
      this._allLogEntries = [];
      this._displayLines = [];
      yield* this.markNeedsUpdate();
    });

  public toggle = () =>
    Effect.gen(this, function* () {
      if (this.isVisible) {
        if (this.isFocused) {
          yield* this.hide();
        } else {
          yield* this.focus();
        }
      } else {
        yield* this.show();
      }
      if (!this.renderer.isRunning) {
        yield* this.renderer.needsUpdate();
      }
    });

  public focus = () =>
    Effect.gen(this, function* () {
      this.attachStdin();
      this._scrollToBottom(true);
      yield* this.markNeedsUpdate();
    });

  public blur = () =>
    Effect.gen(this, function* () {
      this.detachStdin();
      yield* this.markNeedsUpdate();
    });

  public show = () =>
    Effect.gen(this, function* () {
      if (!this.isVisible) {
        this.isVisible = true;
        this._processCachedLogs();
        // terminalConsoleCache.setCachingEnabled(false);

        if (!this.frameBuffer) {
          this.frameBuffer = yield* OptimizedBuffer.create(this.consoleWidth, this.consoleHeight, {
            respectAlpha: this.backgroundColor!.a < 1,
          });
        }
        const logCount = terminalConsoleCache.cachedLogs.length;
        const visibleLogLines = Math.min(this.consoleHeight, logCount);
        this.currentLineIndex = Math.max(0, visibleLogLines - 1);
        this.scrollTopIndex = 0;
        this._scrollToBottom(true);

        yield* this.focus();
        yield* this.markNeedsUpdate();
      }
    });

  public hide = () =>
    Effect.gen(this, function* () {
      if (this.isVisible) {
        this.isVisible = false;
        yield* this.blur();
        // terminalConsoleCache.setCachingEnabled(true);
      }
    });

  // public getCachedLogs(): string {
  //   return terminalConsoleCache.cachedLogs
  //     .map((logEntry) => logEntry[0].toISOString() + " " + logEntry.slice(1).join(" "))
  //     .join("\n");
  // }

  private updateFrameBuffer = () =>
    Effect.gen(this, function* () {
      if (!this.frameBuffer) return;

      yield* this.frameBuffer.clear(this.backgroundColor!);

      const displayLines = this._displayLines;
      const displayLineCount = displayLines.length;
      const logAreaHeight = Math.max(1, this.consoleHeight - 1);

      // --- Draw Title Bar ---
      yield* this.frameBuffer.fillRect(0, 0, this.consoleWidth, 1, this._rgbaTitleBar!);
      const dynamicTitle = `${this._title}${this.isFocused ? " (Focused)" : ""}`;
      const titleX = Math.max(0, Math.floor((this.consoleWidth - dynamicTitle.length) / 2));
      yield* this.frameBuffer.drawText(dynamicTitle, titleX, 0, this._rgbaTitleBarText!, this._rgbaTitleBar!);

      const startIndex = this.scrollTopIndex;
      const endIndex = Math.min(startIndex + logAreaHeight, displayLineCount);
      const visibleDisplayLines = displayLines.slice(startIndex, endIndex);

      let lineY = 1;
      for (const displayLine of visibleDisplayLines) {
        if (lineY >= this.consoleHeight) break;

        let levelColor = this._rgbaDefault!;
        switch (displayLine.level) {
          case LogLevel.INFO:
            levelColor = this._rgbaInfo!;
            break;
          case LogLevel.WARN:
            levelColor = this._rgbaWarn!;
            break;
          case LogLevel.ERROR:
            levelColor = this._rgbaError!;
            break;
          case LogLevel.DEBUG:
            levelColor = this._rgbaDebug!;
            break;
        }

        const linePrefix = displayLine.indent ? " ".repeat(INDENT_WIDTH) : "";
        const textToDraw = displayLine.text;
        const textAvailableWidth = this.consoleWidth - 1 - (displayLine.indent ? INDENT_WIDTH : 0);
        const showCursor = this.isFocused && lineY - 1 === this.currentLineIndex;

        if (showCursor) {
          yield* this.frameBuffer.drawText(">", 0, lineY, this._rgbaCursor!, this.backgroundColor!);
        } else {
          yield* this.frameBuffer.drawText(" ", 0, lineY, this._rgbaDefault!, this.backgroundColor!);
        }

        yield* this.frameBuffer.drawText(
          `${linePrefix}${textToDraw.substring(0, textAvailableWidth)}`,
          1,
          lineY,
          levelColor,
        );

        lineY++;
      }
    });

  public renderToBuffer = (buffer: OptimizedBuffer) =>
    Effect.gen(this, function* () {
      if (!this.isVisible || !this.frameBuffer) return;

      if (this._needsFrameBufferUpdate) {
        yield* this.updateFrameBuffer();
        this._needsFrameBufferUpdate = false;
      }

      yield* buffer.drawFrameBuffer(this.consoleX, this.consoleY, this.frameBuffer);
    });

  public setDebugMode = (enabled: boolean) =>
    Effect.gen(this, function* () {
      this._debugModeEnabled = enabled;
      // terminalConsoleCache.setCollectCallerInfo(enabled);
      if (this.isVisible) {
        yield* this.markNeedsUpdate();
      }
    });

  public toggleDebugMode = () =>
    Effect.gen(this, function* () {
      yield* this.setDebugMode(!this._debugModeEnabled);
    });

  private _scrollToBottom(forceCursorToLastLine: boolean = false): void {
    const displayLineCount = this._displayLines.length;
    const logAreaHeight = Math.max(1, this.consoleHeight - 1);
    const maxScrollTop = Math.max(0, displayLineCount - logAreaHeight);
    this.scrollTopIndex = maxScrollTop;
    this.isScrolledToBottom = true;

    const visibleLineCount = Math.min(logAreaHeight, displayLineCount - this.scrollTopIndex);
    if (forceCursorToLastLine || this.currentLineIndex >= visibleLineCount) {
      this.currentLineIndex = Math.max(0, visibleLineCount - 1);
    }
  }

  private _processLogEntry(logEntry: [Date, LogLevel, any[], CallerInfo | null]): DisplayLine[] {
    const [date, level, args, callerInfo] = logEntry;
    const displayLines: DisplayLine[] = [];

    const timestamp = this.formatTimestamp(date);
    const callerSource = callerInfo ? `${callerInfo.fileName}:${callerInfo.lineNumber}` : "unknown";
    const prefix = `[${timestamp}] [${level}]` + (this._debugModeEnabled ? ` [${callerSource}]` : "") + " ";

    const formattedArgs = this.formatArguments(args);
    const initialLines = formattedArgs.split("\n");

    for (let i = 0; i < initialLines.length; i++) {
      const lineText = initialLines[i];
      const isFirstLineOfEntry = i === 0;
      const availableWidth = this.consoleWidth - 1 - (isFirstLineOfEntry ? 0 : INDENT_WIDTH);
      const linePrefix = isFirstLineOfEntry ? prefix : " ".repeat(INDENT_WIDTH);
      const textToWrap = isFirstLineOfEntry ? linePrefix + lineText : lineText;

      let currentPos = 0;
      while (currentPos < textToWrap.length || (isFirstLineOfEntry && currentPos === 0 && textToWrap.length === 0)) {
        const segment = textToWrap.substring(currentPos, currentPos + availableWidth);
        const isFirstSegmentOfLine = currentPos === 0;

        displayLines.push({
          text: isFirstSegmentOfLine && !isFirstLineOfEntry ? linePrefix + segment : segment,
          level: level,
          indent: !isFirstLineOfEntry || !isFirstSegmentOfLine,
        });

        currentPos += availableWidth;
        if (isFirstLineOfEntry && currentPos === 0 && textToWrap.length === 0) break;
      }
    }

    return displayLines;
  }

  // private _processCachedLogs = () =>
  //   Effect.gen(this, function* () {
  //     // Logger.withLeveledConsole
  //     // const logsToProcess = [...terminalConsoleCache.cachedLogs];
  //     // terminalConsoleCache.clearConsole();

  //     // this._allLogEntries.push(...logsToProcess);

  //     if (this._allLogEntries.length > this.options.maxStoredLogs) {
  //       this._allLogEntries.splice(0, this._allLogEntries.length - this.options.maxStoredLogs);
  //     }

  //     for (const logEntry of logsToProcess) {
  //       const processed = this._processLogEntry(logEntry);
  //       this._displayLines.push(...processed);
  //     }

  //     if (this._displayLines.length > this.options.maxDisplayLines) {
  //       this._displayLines.splice(0, this._displayLines.length - this.options.maxDisplayLines);
  //     }
  //   });

  // private saveLogsToFile = () =>
  //   Effect.gen(this, function* () {
  //     const fs = yield* FileSystem.FileSystem;
  //     const path = yield* Path.Path;
  //     const timestamp = Date.now();
  //     const filename = `_console_${timestamp}.log`;
  //     const filepath = path.join(process.cwd(), filename);

  //     // const allLogEntries = [...this._allLogEntries, ...terminalConsoleCache.cachedLogs];

  //     const logLines: string[] = [];

  //     for (const [date, level, args, callerInfo] of allLogEntries) {
  //       const timestampStr = this.formatTimestamp(date);
  //       const callerSource = callerInfo ? `${callerInfo.fileName}:${callerInfo.lineNumber}` : "unknown";
  //       const prefix = `[${timestampStr}] [${level}]` + (this._debugModeEnabled ? ` [${callerSource}]` : "") + " ";
  //       const formattedArgs = this.formatArguments(args);
  //       logLines.push(prefix + formattedArgs);
  //     }

  //     const content = logLines.join("\n");
  //     yield* fs.writeFileString(filepath, content);

  //     console.info(`Console logs saved to: ${filename}`);
  //   });
}
