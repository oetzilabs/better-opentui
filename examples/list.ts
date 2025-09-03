import { collection } from "@better-opentui/core/src/renderer/utils/collection";
import { Effect, Order } from "effect";
import { Colors } from "../packages/core/src/colors";
import { PositionRelative } from "../packages/core/src/renderer/utils/position";
import { run } from "../packages/core/src/run";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const item_collection = yield* collection([
        { id: "1", display: "Apple (1)", value: 1 },
        { id: "2", display: "Banana (2)", value: 2 },
        { id: "3", display: "Cherry (3)", value: 3 },
        // intentionally placed, to show that sorting works
        { id: "12", display: "Orange (12)", value: 12 },
        { id: "4", display: "Date (4)", value: 4 },
        { id: "5", display: "Elderberry (5)", value: 5 },
        // same value different display, to show that sorting for the same value works as expected
        { id: "6", display: "Fig (6)", value: 6 },
        { id: "6", display: "Fig (6) 2", value: 6 },
        { id: "6", display: "Fig (6) 3", value: 6 },
        { id: "6", display: "Fig (6) 4", value: 6 },
        { id: "7", display: "Grape (7)", value: 7 },
        { id: "8", display: "Honeydew (8)", value: 8 },
        { id: "9", display: "Kiwi (9)", value: 9 },
        { id: "10", display: "Lemon (10)", value: 10 },
        { id: "11", display: "Mango (11)", value: 11 },
      ]);

      yield* item_collection.addSort(
        {
          direction: "asc",
          key: "value",
          fn: Order.number,
        },
        {
          direction: "desc",
          key: "display",
          fn: Order.string,
        },
      );

      const listElement = yield* parentContainer.create("list", item_collection, {
        position: PositionRelative.make(1),
        width: "100%",
        height: 10,
        visible: true,
        focused: true,
        showScrollIndicator: true,
        colors: {
          bg: Colors.Black,
          fg: Colors.White,
          focusedBg: Colors.Blue,
          focusedFg: Colors.Yellow,
          selectedBg: Colors.Green,
          selectedFg: Colors.Black,
          scrollIndicator: Colors.Gray,
        },
        displayKey: "display",
        onSelect: (item) =>
          Effect.gen(function* () {
            if (item) console.log(`Selected: ${item.display}`);
          }),
      });

      yield* parentContainer.add(listElement);

      yield* cli.add(parentContainer);
    }),
    on: {
      start: Effect.fn("list.start")(function* (cli) {}),
      resize: Effect.fn(function* (_width, _height) {}),
      exit: Effect.fn(function* (_reason) {}),
      panic: Effect.fn(function* (_err) {}),
    },
  });
}
