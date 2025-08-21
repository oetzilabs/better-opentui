import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import { CliRenderer } from "@opentuee/core/src/renderer/cli";
import { PositionAbsolute } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Console, Effect } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      setup: Effect.fn(function* (cli) {
        const parentContainer = yield* cli.createElement("group");

        const text = yield* cli.createElement("text", "Hello World", {
          position: PositionAbsolute.make(2),
          left: 2,
          top: 2,
          width: "auto",
          height: "auto",
          fg: Colors.Red,
          bg: Colors.Transparent,
        });

        const text2 = yield* cli.createElement("text", "Hello World 2", {
          position: PositionAbsolute.make(2),
          left: 5,
          top: 5,
          width: "auto",
          height: "auto",
          fg: Colors.Red,
          bg: Colors.Transparent,
        });

        yield* parentContainer.add(text);
        yield* parentContainer.add(text2);

        yield* cli.add(parentContainer);
      }),
      on: {
        start: Effect.fn(function* () {}),
        resize: Effect.fn(function* (width, height) {}),
        exit: Effect.fn(function* (reason) {
          process.exit(0);
        }),
        panic: Effect.fn(function* (err) {}),
      },
    }),
  );
}
