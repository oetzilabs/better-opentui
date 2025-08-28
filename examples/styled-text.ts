import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import { isMouseDown, isMouseDrag, isMouseOver, isMouseUp } from "@opentuee/core/src/inputs/mouse";
import type { BaseElement } from "@opentuee/core/src/renderer/elements/base";
import type { InputElement } from "@opentuee/core/src/renderer/elements/input";
import type { SelectElement, SelectOption } from "@opentuee/core/src/renderer/elements/select";
import type { TextElement } from "@opentuee/core/src/renderer/elements/text";
import { PositionAbsolute } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Effect, Ref } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      // debug: true,
      setup: Effect.fn("run.setup")(function* (cli) {
        yield* cli.setBackgroundColor(Colors.Transparent);
        const parentContainer = yield* cli.createElement("group");
        console.debug("parentContainer", parentContainer.num);

        const bigHello = yield* parentContainer.create("asciifont", {
          left: 20,
          top: 20,
          text: "Hello World",
          font: "tiny",
        });

        const options = [
          { name: "Option 1", value: "1" },
          { name: "Option 2", value: "2" },
          { name: "Option 3", value: "3" },
          { name: "Option 4", value: "4", description: "ASDF" },
          { name: "Option 5", value: "5" },
          { name: "Option 6", value: "6" },
          { name: "Option 7", value: "7" },
          { name: "Option 8", value: "8" },
          { name: "Option 9", value: "9" },
          { name: "Option 10", value: "10" },
        ] as SelectOption<string>[];

        const select = yield* parentContainer.create("select", {
          focused: true,
          searchable: true,
          zIndex: 3,
          position: PositionAbsolute.make(2),
          left: 1,
          top: 6,
          options,
          showDescription: true,
          selectedIndex: 0,
          width: 70,
          height: 7,
          onSelect: Effect.fn(function* (option) {
            if (!option) return;
            const value = option.value as string;
            yield* bigHello.setText(value);
          }),
        });

        yield* parentContainer.add(bigHello);
        yield* parentContainer.add(select);

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
