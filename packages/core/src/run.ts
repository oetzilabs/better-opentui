import { BunContext } from "@effect/platform-bun";
import * as Errors from "@opentuee/core/src/errors";
import { CliRenderer, CliRendererLive, type HookFunction, type ShutdownReason } from "@opentuee/core/src/renderer/cli";
import { Library, LibraryLive } from "@opentuee/core/src/zig";
import { Cause, Console, Deferred, Effect, Logger } from "effect";

export type SetupFunction = (cli: CliRenderer) => Effect.Effect<void, Errors.Collection, Library>;

export interface RunnerEventMap {
  start: [];
  exit: [];
  error: [err: Error];
  shutdown: [];
  resize: [width: number, height: number];
  panic: [err: Error];
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
export type RunOptions =
  | (RunnerHooks & {
      setup: SetupFunction;
    })
  | SetupFunction;

export const run = Effect.fn(
  function* (options: RunOptions) {
    const shutdownSignal = yield* Deferred.make<ShutdownReason, never>();
    const _cli = yield* CliRenderer;

    if (typeof options === "function") {
      yield* Effect.addFinalizer((exit) =>
        Effect.gen(function* () {
          yield* _cli.stop();
          yield* _cli.destroy();
          process.exit();
        }).pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
      );
      yield* _cli.setupTerminal(shutdownSignal);
      yield* options(_cli);
    } else {
      yield* options.setup(_cli);
      const hooks = {
        on: options.on,
        off: options.off,
      };
      yield* Effect.addFinalizer((exit) =>
        Effect.gen(function* () {
          yield* _cli.stop();
          yield* _cli.destroy();
          if (hooks && hooks.on && hooks.on.exit) {
            yield* hooks.on.exit();
          }
          process.exit();
        }).pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
      );
      yield* _cli.setupTerminal(shutdownSignal, hooks);
    }

    yield* _cli.start();

    return yield* Deferred.await(shutdownSignal);
  },
  (effect) =>
    effect.pipe(
      Effect.provide([CliRendererLive]),
      Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause))),
      Effect.provide([LibraryLive, Logger.pretty]),
      Effect.provide(BunContext.layer),
      Effect.scoped,
    ),
);
