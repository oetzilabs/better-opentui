import { BunContext } from "@effect/platform-bun";
import { Cause, Console, Effect, Exit, Logger } from "effect";
import { ClearFromCursor, ShowCursor, SwitchToMainScreen } from "./ansi";
import * as Errors from "./errors";
import { createOtelLayer } from "./otel";
import { CliRenderer, CliRendererLive, type HookFunction, type ShutdownReason } from "./renderer/cli";
import { Shutdown, ShutdownLive } from "./renderer/latch/shutdown";
import { Library, LibraryLive } from "./zig";

export type SetupFunction = (
  cli: CliRenderer,
) => Effect.Effect<void, Errors.Collection | TypeError, Library | CliRenderer>;

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
export type RunOptions = RunnerHooks & {
  setup: SetupFunction;
  debug?: boolean;
};

export const run = (options: RunOptions) =>
  Effect.gen(function* () {
    const shutdown = yield* Shutdown;
    const cli = yield* CliRenderer;
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

    yield* options.setup(cli);

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
    Effect.provide([CliRendererLive]),
    Effect.catchAllCause((cause) => {
      process.stdin.write(SwitchToMainScreen.make("\u001B[?1049l"));
      process.stdin.write(ShowCursor.make("\u001B[?25h"));
      process.stdin.write(ClearFromCursor.make("\u001B[J"));

      process.stdin.setRawMode(false);
      return Console.log(Cause.pretty(cause));
    }),
    Effect.provide([ShutdownLive, LibraryLive, Logger.pretty, createOtelLayer("opentuee")]),
    Effect.provide(BunContext.layer),
    Effect.scoped,
  );
