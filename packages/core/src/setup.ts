import { BunContext } from "@effect/platform-bun";
import * as Errors from "@opentuee/core/src/errors";
import { CliRenderer, CliRendererLive, type ShutdownReason } from "@opentuee/core/src/renderer/cli";
import { Library, LibraryLive } from "@opentuee/core/src/zig";
import { Cause, Console, Deferred, Effect, Logger } from "effect";

export const setup = Effect.fn(
  function* (fn: <E extends any = never>(cli: CliRenderer) => Effect.Effect<void, Errors.Collection, Library>) {
    const shutdownSignal = yield* Deferred.make<ShutdownReason, never>();
    const _cli = yield* CliRenderer;
    yield* Effect.addFinalizer((exit) =>
      Effect.gen(function* () {
        yield* _cli.stop();
        yield* _cli.destroy();
        process.exit();
      }).pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
    );
    yield* _cli.setupTerminal(shutdownSignal);

    yield* fn(_cli);

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
