import { Effect } from "effect";
import { Colors } from "../packages/core/src/colors";
import { PositionRelative } from "../packages/core/src/renderer/utils/position";
import { run } from "../packages/core/src/run";

if (import.meta.main) {
  run({
    debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group", {
        focused: true,
      });

      // Temporarily disable scrollbars to test if they're causing the CTRL+C issue

      const content = yield* parentContainer.create("group", {
        position: PositionRelative.make(1),
        width: "100%",
        height: 300,
        visible: true,
      });

      const asciitext = yield* content.create("asciifont", {
        position: PositionRelative.make(1),
        visible: true,
        font: "tiny",
        text: "Hello World!",
      });

      const asciitext2 = yield* content.create("asciifont", {
        position: PositionRelative.make(1),
        visible: true,
        font: "tiny",
        text: "Hello World2!",
      });

      yield* content.add(asciitext);
      yield* content.add(asciitext2);

      const scrollable = yield* parentContainer.create("scrollable", content, {
        position: PositionRelative.make(1),
        focused: true,
        visible: true,
        axis: { vertical: true, horizontal: true },
        colors: {
          bg: Colors.Transparent,
          indicator: Colors.Custom("#FFFFFF"),
        },
      });

      yield* parentContainer.add(scrollable);

      yield* cli.add(parentContainer);
    }),
    on: {
      start: Effect.fn("scrollbar.start")(function* (cli) {}),
      resize: Effect.fn(function* (_width, _height) {}),
      exit: Effect.fn(function* (_reason) {}),
      panic: Effect.fn(function* (_err) {}),
    },
  });
}
