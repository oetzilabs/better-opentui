import { Colors } from "@better-opentui/core/src/colors";
import { run } from "@better-opentui/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const statusText = yield* parentContainer.create("text", "Status: Unchecked", {
        colors: {
          bg: Colors.Custom("#444444"),
          fg: Colors.White,
        },
      });

      const checkbox1 = yield* parentContainer.create("checkbox", {
        top: 1,
        text: "Enable Feature",
        checked: true, // Starts checked
        colors: {
          bg: Colors.Custom("#444444"),
          hoverBg: Colors.Custom("#666666"),
        },
        onClick: Effect.fn(function* (event) {
          const status = event.checked ? "Checked" : "Unchecked";
          const color = event.checked ? Colors.Custom("#57cc99") : Colors.Custom("#D62828");
          yield* statusText.setContent(`Feature: ${status}`);
          yield* statusText.setForegroundColor(color);
        }),
      });

      const checkbox2 = yield* parentContainer.create("checkbox", {
        top: 3,
        text: "Debug Mode",
        checked: false, // Starts unchecked (default)
        colors: {
          bg: Colors.Custom("#444444"),
          hoverBg: Colors.Custom("#666666"),
        },
        onClick: Effect.fn(function* (event) {
          const debugText = event.checked ? "ON" : "OFF";
          yield* statusText.setContent(`Debug: ${debugText}`);
        }),
      });

      yield* parentContainer.add(statusText);
      yield* parentContainer.add(checkbox1);
      yield* parentContainer.add(checkbox2);

      yield* cli.add(parentContainer);
    }),
  });
}
