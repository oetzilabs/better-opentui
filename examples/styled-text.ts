import { BunContext, BunRuntime } from "@effect/platform-bun";
import * as Colors from "@opentuee/core/src/colors";
import { CliRenderer, CliRendererLive } from "@opentuee/core/src/renderer/cli";
import { LibraryLive } from "@opentuee/core/src/zig";
import { Cause, Console, Duration, Effect, Fiber, Logger, Ref, Schedule } from "effect";

const program = Effect.gen(function* () {
  const cli = yield* CliRenderer;
  yield* cli.setBackgroundColor(Colors.Black.make("#000000"));

  const parentContainer = yield* cli.createElement("group");
  const text = yield* cli.createElement("text", "Hello World", { left: 2, top: 2 });
  const text2 = yield* cli.createElement("text", "Hello World 2", { left: 5, top: 5 });

  yield* parentContainer.add(text);
  yield* parentContainer.add(text2);
  yield* cli.add(parentContainer);
  yield* cli.start();
  const counter = yield* Ref.make(0);

  const fiber = yield* Effect.forkScoped(
    Effect.gen(function* () {
      const c = yield* Ref.updateAndGet(counter, (c) => c + 1);
      yield* text2.setContent(`Hello World ${c}`);
    }).pipe(Effect.repeat(Schedule.fixed(Duration.millis(1000)))),
  );

  yield* Effect.addFinalizer((exit) =>
    Effect.gen(function* () {
      yield* Fiber.interrupt(fiber);
      yield* cli.stop();
      yield* cli.destroy();
    }).pipe(Effect.catchAllCause((cause) => Console.log(Cause.pretty(cause)))),
  );

  return yield* Effect.never;
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
