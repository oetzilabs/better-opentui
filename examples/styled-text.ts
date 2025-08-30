import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import type { SelectOption } from "@opentuee/core/src/renderer/elements/select";
import type { TabSelectElement, TabSelectOption } from "@opentuee/core/src/renderer/elements/tabselect";
import { PositionRelative } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      // debug: true,
      setup: Effect.fn("run.setup")(function* (cli) {
        yield* cli.setBackgroundColor(Colors.Transparent);
        const parentContainer = yield* cli.createElement("group");

        const tabSelect = yield* parentContainer.create("tabselect", {
          focused: true,
          position: PositionRelative.make(1),
          left: 0,
          top: 0,
          width: 70,
          options: [
            { name: "Option 1", value: "1", description: "ASDF" },
            { name: "Option 2", value: "2", description: "ASDF 2" },
          ],
          tabWidth: 20,
          wrapSelection: true,
          showDescription: true,
          showUnderline: true,
          showScrollArrows: true,
          colors: {
            bg: Colors.Transparent,
            fg: Colors.White,
            selectedBg: Colors.Custom("#334455"),
            selectedFg: Colors.Yellow,
            focusedBg: Colors.Custom("#1a1a1a"),
            focusedFg: Colors.White,
            selectedDescriptionColor: Colors.Gray,
          },
          onSelect: Effect.fn("styled-text.onSelect")(function* (option) {
            const value = option?.value;
            yield* Effect.annotateCurrentSpan("styled-text.onSelect", value);
          }),
        });

        yield* parentContainer.add(tabSelect);

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
