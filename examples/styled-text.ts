import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      setup: Effect.fn(function* (cli) {
        yield* cli.setBackgroundColor(Colors.White);
        const parentContainer = yield* cli.createElement("group");
        const text = yield* cli.createElement("text", "Hello World", { left: 2, top: 2 });
        const text2 = yield* cli.createElement("text", "Hello World 2", { left: 5, top: 5 });

        yield* parentContainer.add(text);
        yield* parentContainer.add(text2);
        yield* cli.add(parentContainer);
      }),
      on: {
        start: Effect.fn(function* () {}),
        resize: Effect.fn(function* (width, height) {
          yield* Effect.log("resize", width, height);
        }),
        exit: Effect.fn(function* () {
          yield* Effect.log("Goodbye!");
        }),
        panic: Effect.fn(function* (err) {
          yield* Effect.log("panic", err);
        }),
      },
    }),
  );
}
