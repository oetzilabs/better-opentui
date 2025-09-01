import { PositionRelative } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const fileSelectElement = yield* parentContainer.create("file-select", {
        position: PositionRelative.make(1),
        visible: true,
        focused: true,
        lookup_path: ".", // Start in current directory
        search: { enabled: true },
        showScrollIndicator: true,
        width: "100%",
        height: 15,
        onSelect: (files) =>
          Effect.gen(function* () {
            console.log(
              "Selected files:",
              files.map((f) => f.path),
            );
          }),
      });

      yield* parentContainer.add(fileSelectElement);

      yield* cli.add(parentContainer);
    }),
    on: {
      start: Effect.fn("file-select.start")(function* (cli) {}),
      resize: Effect.fn(function* (_width, _height) {}),
      exit: Effect.fn(function* (_reason) {}),
      panic: Effect.fn(function* (_err) {}),
    },
  });
}
