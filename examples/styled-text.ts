import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import { isMouseOver } from "@opentuee/core/src/inputs/mouse";
import type { BaseElement } from "@opentuee/core/src/renderer/elements/base";
import type { TextElement } from "@opentuee/core/src/renderer/elements/text";
import { PositionAbsolute } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      debug: true,
      setup: Effect.fn("run.setup")(function* (cli) {
        yield* cli.setBackgroundColor(Colors.Transparent);
        const parentContainer = yield* cli.createElement("group");

        const box = yield* cli.createElement("box", {
          title: "Hello World Box",
          left: 10,
          top: 10,
          width: 40,
          height: 10,
          colors: {
            bg: Colors.Gray,
          },
          border: true,
          borderStyle: "rounded",
          borderColor: Colors.Maroon,
          focusedBorderColor: Colors.Red,
          zIndex: 2,
          onMouseEvent: Effect.fn("text.onMouseEvent")(function* (event) {
            event.preventDefault();
            if (isMouseOver(event.type) && event.source) {
              yield* event.source.setBackgroundColor((c) => {
                if (Colors.is("Yellow", c)) {
                  return Colors.Fuchsia;
                } else {
                  return Colors.Yellow;
                }
              });
            }
          }),
        });

        const text = yield* cli.createElement("text", "Hello World", {
          position: PositionAbsolute.make(2),
          left: 1,
          top: 1,
          width: "auto",
          height: "auto",
          zIndex: 1,
          colors: {
            fg: Colors.Red,
            bg: Colors.Yellow,
            selectableBg: Colors.Green,
          },
        });

        const text2 = yield* cli.createElement("text", "Hello World 2", {
          position: PositionAbsolute.make(2),
          left: 5,
          top: 5,
          width: "auto",
          height: "auto",
          colors: {
            fg: Colors.Red,
            bg: Colors.Transparent,
            selectableBg: Colors.Green,
          },
          zIndex: 1,
          onUpdate: Effect.fn("text.onUpdate")(function* (self: TextElement) {
            const elementCount = yield* cli.getElementCount();
            const selection = yield* cli.getSelection();
            yield* self.setContent(
              `Amount of elements: ${elementCount - 1} (root is not counted), selection: ${selection}`,
            );
          }),
        });

        yield* parentContainer.add(box);
        yield* parentContainer.add(text);
        yield* parentContainer.add(text2);

        yield* cli.add(parentContainer);
      }),
      on: {
        start: Effect.fn("styled-text.start")(function* (cli) {
          const elements = yield* cli.getElementCount();
          yield* Effect.annotateCurrentSpan("elements", elements);
        }),
        resize: Effect.fn(function* (width, height) {}),
        exit: Effect.fn(function* (reason) {}),
        panic: Effect.fn(function* (err) {}),
      },
    }),
  );
}
