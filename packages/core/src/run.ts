import { BunContext } from "@effect/platform-bun";
import * as Errors from "@opentuee/core/src/errors";
import { CliRenderer, CliRendererLive, type HookFunction, type ShutdownReason } from "@opentuee/core/src/renderer/cli";
import { Library, LibraryLive } from "@opentuee/core/src/zig";
import { Cause, Console, Deferred, Duration, Effect, Exit, Fiber, Logger } from "effect";
import { Colors } from "./colors";

export type SetupFunction = (cli: CliRenderer) => Effect.Effect<void, Errors.Collection, Library | CliRenderer>;

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
};

export const run = (options: RunOptions) =>
  Effect.gen(function* () {
    const cli = yield* CliRenderer;
    const latch = yield* Effect.makeLatch();
    let onPanic: HookFunction<"panic"> = Effect.fn(function* (_cause: Cause.Cause<unknown>) {});
    yield* cli.setBackgroundColor(Colors.White);

    yield* cli.setupTerminal(latch, {
      on: options.on,
      off: options.off,
    });

    if (options.on && options.on.panic) {
      onPanic = options.on.panic;
    }

    yield* options.setup(cli);
    yield* cli.start().pipe(Effect.catchAllCause((cause) => onPanic(cause)));

    const start = options.on?.start ? options.on.start : Effect.fn(function* (cli: CliRenderer) {});

    yield* start(cli);

    const finalizer = Effect.fn(
      function* (exit: Exit.Exit<unknown, unknown>) {
        if (options.on && options.on.exit) {
          yield* options.on.exit({ type: "exit", code: 0, cause: exit });
        }
      },
      (effect) => effect.pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
    );

    yield* Effect.addFinalizer((exit) => finalizer(exit));

    const exitTrigger = yield* Effect.gen(function* () {
      yield* cli.stop();
      yield* cli.destroy();
      process.exit(0);
    }).pipe(latch.whenOpen, Effect.fork);

    yield* exitTrigger.await;

    // return yield* Effect.never;
  }).pipe(
    Effect.provide([CliRendererLive]),
    Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause))),
    Effect.provide([LibraryLive, Logger.pretty]),
    Effect.provide(BunContext.layer),
    Effect.scoped,
  );
