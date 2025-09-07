import type { SelectOption } from "@better-opentui/core/src/renderer/elements/multi-select";
import { PositionRelative } from "@better-opentui/core/src/renderer/utils/position";
import { run } from "@better-opentui/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const multiSelectElement = yield* parentContainer.create("multi-select", {
        position: PositionRelative.make(1),
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
        search: { enabled: true, location: "bottom" },
        showDescription: true,
        width: "100%",
        height: "auto",
        onSelect: (options) => Effect.gen(function* () {}),
      });

      yield* parentContainer.add(multiSelectElement);

      yield* cli.add(parentContainer);
    }),
  });
}
