import { Config, Effect, Ref } from "effect";
import { DebugBottomRight, DebugOverlayCorner } from "./types";

export class OpenTuiConfig extends Effect.Service<OpenTuiConfig>()("OpenTuiConfig", {
  effect: Effect.gen(function* () {
    const defaultConfig = {
      width: process.stdout.columns,
      height: process.stdout.rows,
      targetFps: yield* Config.number("OPENTUI_TARGET_FPS").pipe(Config.withDefault(60)),
      exitOnCtrlC: yield* Config.boolean("OPENTUI_EXIT_ON_CTRL_C").pipe(Config.withDefault(true)),
      useThread: yield* Config.boolean("OPENTUI_USE_THREAD").pipe(Config.withDefault(process.platform !== "linux")),
      memorySnapshotInterval: yield* Config.number("OPENTUI_MEMORY_SNAPSHOT_INTERVAL").pipe(Config.withDefault(1000)),
      debugOverlay: {
        enabled: false,
        corner: DebugBottomRight.make(3),
      },
      log_level: yield* Config.string("LOG_LEVEL").pipe(Config.withDefault("info")),
      enableMouseMovement: true,
    };

    const config = yield* Ref.make<typeof defaultConfig>({
      ...defaultConfig,
    });

    return {
      get: Effect.fn(function* () {
        return yield* Ref.get(config);
      }),
      update: Effect.fn(function* (
        key: keyof typeof defaultConfig,
        value: (typeof defaultConfig)[typeof key] | ((c: typeof defaultConfig) => typeof defaultConfig),
      ) {
        if (typeof value === "function") {
          return yield* Ref.updateAndGet(config, value);
        }
        return yield* Ref.updateAndGet(config, (config) => {
          return Object.assign(config, { [key]: value });
        });
      }),
    };
  }),
}) {}

export const OpenTuiConfigLive = OpenTuiConfig.Default;
