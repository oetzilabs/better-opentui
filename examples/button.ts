import { Colors } from "@better-opentui/core/src/colors";
import { run } from "@better-opentui/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const button = yield* parentContainer.create("button", {
        text: `999`,
      });

      const increment = yield* parentContainer.create("button", {
        top: 1,
        text: "+1",
        colors: {
          bg: Colors.Custom("#57cc99"),
        },
        onClick: Effect.fn(function* () {
          const text = yield* button.getText();
          const newText = parseInt(text) + 1;
          yield* button.setText(newText.toString());
        }),
        onPress: Effect.fn(function* () {
          const text = yield* button.getText();
          const newText = parseInt(text) + 1;
          yield* button.setText(newText.toString());
        }),
      });

      const decrement = yield* parentContainer.create("button", {
        top: 2,
        text: "-1",
        colors: {
          bg: Colors.Custom("#D62828"),
        },
        onClick: Effect.fn(function* () {
          const text = yield* button.getText();
          const newText = parseInt(text) - 1;
          yield* button.setText(newText.toString());
        }),
        onPress: Effect.fn(function* () {
          const text = yield* button.getText();
          const newText = parseInt(text) - 1;
          yield* button.setText(newText.toString());
        }),
      });

      yield* parentContainer.add(button);
      yield* parentContainer.add(increment);
      yield* parentContainer.add(decrement);

      yield* cli.add(parentContainer);
    }),
  });
}
