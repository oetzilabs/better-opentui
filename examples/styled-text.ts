import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import { PositionAbsolute } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      setup: Effect.fn(function* (cli) {
        yield* cli.setBackgroundColor(Colors.White);
        const parentContainer = yield* cli.createElement("group");

        const text = yield* cli.createElement("text", "Hello World", {
          position: PositionAbsolute.make(2),
          left: 0,
          top: 0,
          width: "auto",
          height: "auto",
          zIndex: 1,
          colors: {
            fg: Colors.Red,
            bg: Colors.Yellow,
          },
        });

        const text2 = yield* cli.createElement("text", "Hello World 2", {
          position: PositionAbsolute.make(2),
          left: 5,
          top: 5,
          width: "auto",
          height: "auto",
          colors: {
            fg: Colors.Red,
            bg: Colors.Transparent,
          },
          zIndex: 1,
        });

        yield* parentContainer.add(text);
        yield* parentContainer.add(text2);

        yield* cli.add(parentContainer);
      }),
      on: {
        start: Effect.fn(function* (cli) {}),
        resize: Effect.fn(function* (width, height) {}),
        exit: Effect.fn(function* (reason) {}),
        panic: Effect.fn(function* (err) {}),
      },
    }),
  );
}
