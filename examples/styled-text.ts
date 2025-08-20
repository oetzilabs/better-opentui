import { BunContext, BunRuntime } from "@effect/platform-bun";
import * as Colors from "@opentuee/core/src/colors";
import { CliRenderer, CliRendererLive, type ShutdownReason } from "@opentuee/core/src/renderer/cli";
import { LibraryLive } from "@opentuee/core/src/zig";
import { Cause, Console, Deferred, Duration, Effect, Fiber, Logger, Ref, Schedule } from "effect";

const program = Effect.gen(function* () {
  const shutdownSignal = yield* Deferred.make<ShutdownReason, never>();
  const cli = yield* CliRenderer;
  yield* Effect.addFinalizer((exit) =>
    Effect.gen(function* () {
      yield* cli.stop();
      yield* cli.destroy();
      process.exit();
    }).pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
  );
  yield* cli.setupTerminal(shutdownSignal);
  yield* cli.setBackgroundColor(Colors.Black.make("#000000"));
  yield* cli.start();

  const parentContainer = yield* cli.createElement("group");
  const text = yield* cli.createElement("text", "Hello World", { left: 2, top: 2 });
  const text2 = yield* cli.createElement("text", "Hello World 2", { left: 5, top: 5 });

  yield* parentContainer.add(text);
  yield* parentContainer.add(text2);
  yield* cli.add(parentContainer);

  return yield* Deferred.await(shutdownSignal);
}).pipe(
  Effect.provide([CliRendererLive]),
  Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause))),
  Effect.provide([LibraryLive, Logger.pretty]),
  Effect.provide(BunContext.layer),
  Effect.scoped,
);

if (import.meta.main) {
  BunRuntime.runMain(program);
}
