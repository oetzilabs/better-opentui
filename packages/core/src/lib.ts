import { FileSystem, Path } from "@effect/platform";
import { dlopen, suffix } from "bun:ffi";
import { Config, Effect } from "effect";
import { OpenTueeLibraryNotFound, OpenTueeLibraryNotLoaded } from "./errors";
import { getPlatformTarget } from "./utils";

export const findLibrary = Effect.gen(function* () {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const target = yield* getPlatformTarget;
  const dn = path.dirname(import.meta.url.replace("file:", ""));
  const libDir = path.join(dn, "zig", "lib");

  // First try target-specific directory
  const [arch, os] = target.split("-");
  const isWindows = os === "windows";
  const libraryName = isWindows ? "opentui" : "libopentui";
  const targetLibPath = path.join(libDir, target, `${libraryName}.${suffix}`);
  const exists = yield* fs.exists(targetLibPath);
  if (exists) {
    return targetLibPath;
  }

  return yield* Effect.fail(new OpenTueeLibraryNotFound());
});

export class OpenTUI extends Effect.Service<OpenTUI>()("OpenTUI", {
  effect: Effect.gen(function* () {
    const defaultLibPath = yield* findLibrary;

    const resolvedLibPath = yield* Config.string("OPENTUI_LIB_PATH").pipe(Config.withDefault(defaultLibPath));

    const lib = yield* Effect.try({
      try: () =>
        dlopen(resolvedLibPath, {
          // Renderer management
          createRenderer: {
            args: ["u32", "u32"],
            returns: "ptr",
          },
          destroyRenderer: {
            args: ["ptr", "bool", "u32"],
            returns: "void",
          },
          setUseThread: {
            args: ["ptr", "bool"],
            returns: "void",
          },
          setBackgroundColor: {
            args: ["ptr", "ptr"],
            returns: "void",
          },
          setRenderOffset: {
            args: ["ptr", "u32"],
            returns: "void",
          },
          updateStats: {
            args: ["ptr", "f64", "u32", "f64"],
            returns: "void",
          },
          updateMemoryStats: {
            args: ["ptr", "u32", "u32", "u32"],
            returns: "void",
          },
          render: {
            args: ["ptr", "bool"],
            returns: "void",
          },
          getNextBuffer: {
            args: ["ptr"],
            returns: "ptr",
          },
          getCurrentBuffer: {
            args: ["ptr"],
            returns: "ptr",
          },

          createOptimizedBuffer: {
            args: ["u32", "u32", "bool", "u8"],
            returns: "ptr",
          },
          destroyOptimizedBuffer: {
            args: ["ptr"],
            returns: "void",
          },

          drawFrameBuffer: {
            args: ["ptr", "i32", "i32", "ptr", "u32", "u32", "u32", "u32"],
            returns: "void",
          },
          getBufferWidth: {
            args: ["ptr"],
            returns: "u32",
          },
          getBufferHeight: {
            args: ["ptr"],
            returns: "u32",
          },
          bufferClear: {
            args: ["ptr", "ptr"],
            returns: "void",
          },
          bufferGetCharPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          bufferGetFgPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          bufferGetBgPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          bufferGetAttributesPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          bufferGetRespectAlpha: {
            args: ["ptr"],
            returns: "bool",
          },
          bufferSetRespectAlpha: {
            args: ["ptr", "bool"],
            returns: "void",
          },

          bufferDrawText: {
            args: ["ptr", "ptr", "u32", "u32", "u32", "ptr", "ptr", "u8"],
            returns: "void",
          },
          bufferSetCellWithAlphaBlending: {
            args: ["ptr", "u32", "u32", "u32", "ptr", "ptr", "u8"],
            returns: "void",
          },
          bufferFillRect: {
            args: ["ptr", "u32", "u32", "u32", "u32", "ptr"],
            returns: "void",
          },
          bufferResize: {
            args: ["ptr", "u32", "u32"],
            returns: "void",
          },

          resizeRenderer: {
            args: ["ptr", "u32", "u32"],
            returns: "void",
          },

          // Cursor functions (now renderer-scoped)
          setCursorPosition: {
            args: ["ptr", "i32", "i32", "bool"],
            returns: "void",
          },
          setCursorStyle: {
            args: ["ptr", "ptr", "u32", "bool"],
            returns: "void",
          },
          setCursorColor: {
            args: ["ptr", "ptr"],
            returns: "void",
          },

          // Debug overlay
          setDebugOverlay: {
            args: ["ptr", "bool", "u8"],
            returns: "void",
          },

          // Terminal control
          clearTerminal: {
            args: ["ptr"],
            returns: "void",
          },
          setTerminalTitle: {
            args: ["ptr", "ptr", "usize"],
            returns: "void",
          },

          bufferDrawSuperSampleBuffer: {
            args: ["ptr", "u32", "u32", "ptr", "usize", "u8", "u32"],
            returns: "void",
          },
          bufferDrawPackedBuffer: {
            args: ["ptr", "ptr", "usize", "u32", "u32", "u32", "u32"],
            returns: "void",
          },
          bufferDrawBox: {
            args: ["ptr", "i32", "i32", "u32", "u32", "ptr", "u32", "ptr", "ptr", "ptr", "u32"],
            returns: "void",
          },

          addToHitGrid: {
            args: ["ptr", "i32", "i32", "u32", "u32", "u32"],
            returns: "void",
          },
          checkHit: {
            args: ["ptr", "u32", "u32"],
            returns: "u32",
          },
          dumpHitGrid: {
            args: ["ptr"],
            returns: "void",
          },
          dumpBuffers: {
            args: ["ptr", "i64"],
            returns: "void",
          },
          dumpStdoutBuffer: {
            args: ["ptr", "i64"],
            returns: "void",
          },
          enableMouse: {
            args: ["ptr", "bool"],
            returns: "void",
          },
          disableMouse: {
            args: ["ptr"],
            returns: "void",
          },
          enableKittyKeyboard: {
            args: ["ptr", "u8"],
            returns: "void",
          },
          disableKittyKeyboard: {
            args: ["ptr"],
            returns: "void",
          },
          setupTerminal: {
            args: ["ptr", "bool"],
            returns: "void",
          },

          // TextBuffer functions
          createTextBuffer: {
            args: ["u32", "u8"],
            returns: "ptr",
          },
          destroyTextBuffer: {
            args: ["ptr"],
            returns: "void",
          },
          textBufferGetCharPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          textBufferGetFgPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          textBufferGetBgPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          textBufferGetAttributesPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          textBufferGetLength: {
            args: ["ptr"],
            returns: "u32",
          },
          textBufferSetCell: {
            args: ["ptr", "u32", "u32", "ptr", "ptr", "u16"],
            returns: "void",
          },
          textBufferConcat: {
            args: ["ptr", "ptr"],
            returns: "ptr",
          },
          textBufferResize: {
            args: ["ptr", "u32"],
            returns: "void",
          },
          textBufferReset: {
            args: ["ptr"],
            returns: "void",
          },
          textBufferSetSelection: {
            args: ["ptr", "u32", "u32", "ptr", "ptr"],
            returns: "void",
          },
          textBufferResetSelection: {
            args: ["ptr"],
            returns: "void",
          },
          textBufferSetDefaultFg: {
            args: ["ptr", "ptr"],
            returns: "void",
          },
          textBufferSetDefaultBg: {
            args: ["ptr", "ptr"],
            returns: "void",
          },
          textBufferSetDefaultAttributes: {
            args: ["ptr", "ptr"],
            returns: "void",
          },
          textBufferResetDefaults: {
            args: ["ptr"],
            returns: "void",
          },
          textBufferWriteChunk: {
            args: ["ptr", "ptr", "u32", "ptr", "ptr", "ptr"],
            returns: "u32",
          },
          textBufferGetCapacity: {
            args: ["ptr"],
            returns: "u32",
          },
          textBufferFinalizeLineInfo: {
            args: ["ptr"],
            returns: "void",
          },
          textBufferGetLineStartsPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          textBufferGetLineWidthsPtr: {
            args: ["ptr"],
            returns: "ptr",
          },
          textBufferGetLineCount: {
            args: ["ptr"],
            returns: "u32",
          },
          bufferDrawTextBuffer: {
            args: ["ptr", "ptr", "i32", "i32", "i32", "i32", "u32", "u32", "bool"],
            returns: "void",
          },

          // Terminal capability functions
          getTerminalCapabilities: {
            args: ["ptr", "ptr"],
            returns: "void",
          },
          processCapabilityResponse: {
            args: ["ptr", "ptr", "usize"],
            returns: "void",
          },
        }),
      catch: (e) => new OpenTueeLibraryNotLoaded({ cause: e }),
    });

    return lib;
  }),
}) {}

export const OpenTUILive = OpenTUI.Default;
