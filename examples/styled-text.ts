import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import { PositionRelative } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      // debug: true,
      setup: Effect.fn("run.setup")(function* (cli) {
        yield* cli.setBackgroundColor(Colors.Transparent);
        const parentContainer = yield* cli.createElement("group");

        const styledText = yield* parentContainer.create("text", "Hello World", {});

        yield* parentContainer.add(styledText);

        yield* cli.add(parentContainer);
      }),
      on: {
        start: Effect.fn("styled-text.start")(function* (cli) {
          const elements = yield* cli.getElementCount();
          yield* Effect.annotateCurrentSpan("elements", elements);
        }),
        resize: Effect.fn(function* (width, height) {}),
        exit: Effect.fn(function* (reason) {}),
        panic: Effect.fn(function* (err) {}),
      },
    }),
  );
}
