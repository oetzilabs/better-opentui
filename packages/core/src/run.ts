import type { FileSystem, Path } from "@effect/platform";
import { BunContext, BunRuntime } from "@effect/platform-bun";
import { Cause, Console, Effect, Exit, Logger } from "effect";
import * as Errors from "./errors";
import { Library, LibraryLive } from "./lib";
import { createOtelLayer } from "./otel";
import { CliRenderer, CliRendererLive, type HookFunction, type ShutdownReason } from "./renderer/cli";
import type { BaseElement } from "./renderer/elements/base";
import { Shutdown, ShutdownLive } from "./renderer/latch/shutdown";
import type { SceneNotFound } from "./renderer/scenes/errors";
import { SceneManager, SceneManagerLive } from "./renderer/scenes/manager";
import { ThemeManager, ThemeManagerLive } from "./themes/manager";

export type TerminalFunctions = {
  setBackgroundColor: CliRenderer["setBackgroundColor"];
};

export type SetupFunction = (
  terminal: TerminalFunctions,
) => Effect.Effect<
  void,
  Errors.Collection | TypeError,
  Library | CliRenderer | FileSystem.FileSystem | Path.Path | ThemeManager
>;

export type SceneSetup<CurrentKey extends string, AllKeys extends string = string> = {
  createElement: CliRenderer["createElement"];
  switchTo: (key: Exclude<AllKeys, CurrentKey>) => Effect.Effect<void, SceneNotFound>;
};

export type SceneSetupFunction<CurrentKey extends string, AllKeys extends string = string> = (
  scene: SceneSetup<CurrentKey, AllKeys>,
) => Effect.Effect<
  BaseElement<any, any>[] | BaseElement<any, any>,
  Errors.Collection | TypeError | SceneNotFound,
  Library | CliRenderer | FileSystem.FileSystem | Path.Path | ThemeManager
>;

export type ScenesSetup<Keys extends string = string> = {
  [K in Keys]: SceneSetupFunction<K, Keys>;
};

export interface RunnerEventMap {
  start: [cli: CliRenderer];
  exit: [reason: ShutdownReason];
  error: [err: Error];
  shutdown: [];
  resize: [width: number, height: number];
  panic: [err: Cause.Cause<unknown>];
}
export type RunnerEvent = keyof RunnerEventMap;
export type RunnerHooks = {
  on?: {
    [E in RunnerEvent]?: HookFunction<E>;
  };
  off?: {
    [E in RunnerEvent]?: HookFunction<E>;
  };
};
export type RunOptions<Keys extends string = string> = RunnerHooks & {
  setup?: SetupFunction;
  scenes?: ScenesSetup<Keys>;
  debug?: boolean;
};

export const run = <Keys extends string = string>(options: RunOptions<Keys>) =>
  Effect.gen(function* () {
    const shutdown = yield* Shutdown;
    const cli = yield* CliRenderer;
    const sceneManager = yield* SceneManager;
    const latch = yield* Effect.makeLatch();
    let onPanic: HookFunction<"panic"> = Effect.fn(function* (_cause: Cause.Cause<unknown>) {});

    yield* cli.setupTerminal(latch, {
      debug: options.debug && options.debug,
      hooks: {
        on: options.on,
        off: options.off,
      },
    });

    if (options.on && options.on.panic) {
      onPanic = options.on.panic;
    }

    const cliSetupFunctions = {
      setBackgroundColor: cli.setBackgroundColor,
    };

    const optionsSetup = options.setup ?? Effect.fn(function* (terminal: TerminalFunctions) {});

    yield* optionsSetup(cliSetupFunctions);

    const optionsScenes = options.scenes ?? ({} as ScenesSetup<Keys>);

    yield* cli.setScenes(optionsScenes);

    const finalizer = Effect.fn(
      function* (exit: Exit.Exit<unknown, unknown>) {
        if (options.on && options.on.exit) {
          yield* options.on.exit({ type: "exit", code: 0, cause: exit });
        }
      },
      (effect) => effect.pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
    );

    yield* Effect.addFinalizer((exit) => finalizer(exit));

    yield* cli.start().pipe(Effect.catchAllCause((cause) => onPanic(cause)));

    const start = options.on?.start ? options.on.start : Effect.fn(function* (cli: CliRenderer) {});

    yield* start(cli);

    const exitTrigger = yield* Effect.gen(function* () {
      yield* cli.stop();
      yield* cli.destroy();
      process.exit(0);
    }).pipe(shutdown.listen, Effect.fork);

    yield* exitTrigger.await;

    // return yield* Effect.never;
  }).pipe(
    Effect.provide([CliRendererLive, SceneManagerLive, ThemeManagerLive]),
    Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause))),
    Effect.provide([ShutdownLive, LibraryLive, Logger.pretty, createOtelLayer("better-opentui")]),
    Effect.provide(BunContext.layer),
    Effect.scoped,
    BunRuntime.runMain,
  );
