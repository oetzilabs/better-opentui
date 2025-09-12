import { Effect } from "effect";
import { Colors } from "../packages/core/src/colors";
import { PositionRelative } from "../packages/core/src/renderer/utils/position";
import { run } from "../packages/core/src/run";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const textareaElement = yield* parentContainer.create("textarea", {
        position: PositionRelative.make(1),
        width: 50,
        visible: true,
        focused: true,
        autoHeight: false,
        minHeight: 3,
        maxHeight: 10,
        value:
          "This is a multi-line\ntextarea component.\n\nTry adding/removing lines!\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\nLine 11\nLine 12\n",
        placeholder: "Start typing...",
        colors: {
          bg: Colors.Black,
          fg: Colors.White,
          focusedBg: Colors.Custom("#1a1a1a"),
          focusedFg: Colors.White,
          placeholderColor: Colors.Gray,
          cursorColor: Colors.White,
        },
        onChange: (text) =>
          Effect.gen(function* () {
            // console.log(`Textarea content changed: ${text.length} characters`);
          }),
      });

      yield* parentContainer.add(textareaElement);

      // Create a status text below the textarea
      const statusText = yield* parentContainer.create(
        "text",
        "Use arrow keys to navigate, Enter for new lines, Backspace/Delete to edit",
        {
          position: PositionRelative.make(1),
          top: 15,
          textWrap: true,
          colors: {
            fg: Colors.Yellow,
          },
        },
      );

      yield* parentContainer.add(statusText);

      yield* cli.add(parentContainer);
    }),
  });
}
