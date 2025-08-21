import { BunContext } from "@effect/platform-bun";
import * as Errors from "@opentuee/core/src/errors";
import { CliRenderer, CliRendererLive, type HookFunction, type ShutdownReason } from "@opentuee/core/src/renderer/cli";
import { Library, LibraryLive } from "@opentuee/core/src/zig";
import { Cause, Console, Deferred, Effect, Exit, Logger, Match } from "effect";
import { Colors } from "./colors";

export type SetupFunction = () => Effect.Effect<void, Errors.Collection, Library | CliRenderer>;

export interface RunnerEventMap {
  start: [];
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
    const shutdownSignal = yield* Deferred.make<ShutdownReason, never>();
    const _cli = yield* CliRenderer;

    let onPanic: HookFunction<"panic"> = Effect.fn(function* (cause: Cause.Cause<unknown>) {});

    yield* _cli.setBackgroundColor(Colors.White);
    yield* options.setup();

    const hooks = {
      on: options.on,
      off: options.off,
    } as const;

    const finalizer = Effect.fn(
      function* (exit: Exit.Exit<unknown, unknown>) {
        yield* _cli.stop();
        yield* _cli.destroy();
        if (hooks && hooks.on && hooks.on.exit) {
          yield* hooks.on.exit({ type: "exit", code: 0, cause: exit });
        }
        return process.exit(0);
      },
      (effect) => effect.pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
    );

    yield* _cli.setupTerminal(shutdownSignal, hooks);

    if (hooks && hooks.on && hooks.on.panic) {
      yield* Effect.log("Setting up panic handler");
      onPanic = hooks.on.panic;
    }

    yield* _cli.start().pipe(Effect.catchAllCause((cause) => onPanic(cause)));

    yield* Effect.addFinalizer((exit) => finalizer(exit));

    return yield* Deferred.await(shutdownSignal);
  }).pipe(
    Effect.provide([CliRendererLive]),
    Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause))),
    Effect.provide([LibraryLive, Logger.pretty]),
    Effect.provide(BunContext.layer),
    Effect.scoped,
  );
