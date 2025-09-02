import { Colors } from "@better-opentui/core/src/colors";
import { PositionRelative } from "@better-opentui/core/src/renderer/utils/position";
import { run } from "@better-opentui/core/src/run";
import { parseColor } from "@better-opentui/core/src/utils";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const listElement = yield* parentContainer.create("list", {
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
        items: [
          { id: "1", display: "Apple" },
          { id: "2", display: "Banana" },
          { id: "3", display: "Cherry" },
          { id: "4", display: "Date" },
          { id: "5", display: "Elderberry" },
          { id: "6", display: "Fig" },
          { id: "7", display: "Grape" },
          { id: "8", display: "Honeydew" },
          { id: "9", display: "Kiwi" },
          { id: "10", display: "Lemon" },
          { id: "11", display: "Mango" },
          { id: "12", display: "Orange" },
        ],
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
