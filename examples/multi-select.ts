import type { SelectOption } from "@opentuee/core/src/renderer/elements/multi-select";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const multiSelectElement = yield* parentContainer.create("multi-select", {
        visible: true,
        focused: true,
        options: [
          { name: "Apple", id: "apple", value: "apple", description: "A red or green fruit" },
          { name: "Banana", id: "banana", value: "banana", description: "A yellow curved fruit" },
          { name: "Cherry", id: "cherry", value: "cherry", description: "A small red fruit" },
          { name: "Date", id: "date", value: "date", description: "A sweet brown fruit" },
          { name: "Elderberry", id: "elderberry", value: "elderberry", description: "A dark purple berry" },
          { name: "Fig", id: "fig", value: "fig", description: "A soft pear-shaped fruit" },
          { name: "Grape", id: "grape", value: "grape", description: "A small round fruit" },
          { name: "Honeydew", id: "honeydew", value: "honeydew", description: "A large green melon" },
        ],
        selectedIds: ["apple", "cherry"], // Pre-select Apple and Cherry
        searchable: true,
        showDescription: false,
        // headerText: "Selected Fruits",
        width: "auto",
        height: 10,
        onSelect: Effect.fn(function* (options) {
          if (options && Array.isArray(options)) {
            console.log(
              "Selected options:",
              options.map((opt) => opt.name),
            );
          }
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
