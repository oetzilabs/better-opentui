import type { SelectOption } from "@opentuee/core/src/renderer/elements/multi-select";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const multiSelectElement = yield* parentContainer.create("multi-select", {
        focused: true,
        options: [
          { name: "Apple", value: "apple", description: "A red or green fruit" },
          { name: "Banana", value: "banana", description: "A yellow curved fruit" },
          { name: "Cherry", value: "cherry", description: "A small red fruit" },
          { name: "Date", value: "date", description: "A sweet brown fruit" },
          { name: "Elderberry", value: "elderberry", description: "A dark purple berry" },
          { name: "Fig", value: "fig", description: "A soft pear-shaped fruit" },
          { name: "Grape", value: "grape", description: "A small round fruit" },
          { name: "Honeydew", value: "honeydew", description: "A large green melon" },
        ],
        selectedIndices: [0, 2], // Pre-select Apple and Cherry
        searchable: true,
        showDescription: true,
        showHeader: true,
        headerText: "Selected Fruits",
        width: 40,
        height: 10,
        onSelect: Effect.fn(function* (options: SelectOption<string>[]) {
          if (options && Array.isArray(options)) {
            // console.log(
            //   "Selected options:",
            //   options.map((opt) => opt.name),
            // );
          }
          return Effect.succeed(undefined);
        }),
      });

      yield* parentContainer.add(multiSelectElement);

      yield* cli.add(parentContainer);
    }),
    on: {
      start: Effect.fn("multi-select.start")(function* (cli) {
        const elements = yield* cli.getElementCount();
        yield* Effect.annotateCurrentSpan("elements", elements);
        console.log("Multi-select example started.");
        console.log("Navigation: Arrow keys to move, Space to select/deselect, Enter to confirm");
        console.log("Search: Tab to focus search input, type to filter, Tab again to return to list");
      }),
      resize: Effect.fn(function* (_width, _height) {}),
      exit: Effect.fn(function* (_reason) {}),
      panic: Effect.fn(function* (_err) {}),
    },
  });
}
