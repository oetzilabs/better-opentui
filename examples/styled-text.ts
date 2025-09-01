import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const styledText = yield* parentContainer.create("text", "Hello World", {});

      yield* parentContainer.add(styledText);

      yield* cli.add(parentContainer);
    }),
    on: {
      start: Effect.fn("styled-text.start")(function* (cli) {}),
      resize: Effect.fn(function* (width, height) {}),
      exit: Effect.fn(function* (reason) {}),
      panic: Effect.fn(function* (err) {}),
    },
  });
}
