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

        const box = yield* cli.createElement("box", {
          selectable: false,
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
        });

        const text = yield* cli.createElement("text", "Hello World", {
          selectable: true,
          position: PositionAbsolute.make(2),
          left: 1,
          top: 1,
          width: "auto",
          height: "auto",
          zIndex: 1,
          colors: {
            fg: Colors.Red,
            bg: Colors.Transparent,
            selectableBg: Colors.Green,
            selectableFg: Colors.Blue,
          },
        });

        // const text2 = yield* cli.createElement("text", "", {
        //   selectable: false,
        //   position: PositionAbsolute.make(2),
        //   left: 5,
        //   top: 5,
        //   width: "auto",
        //   height: "auto",
        //   colors: {
        //     fg: Colors.Red,
        //     bg: Colors.Transparent,
        //     selectableBg: Colors.Green,
        //     selectableFg: Colors.Blue,
        //   },
        //   zIndex: 1,
        //   onUpdate: Effect.fn("text.onUpdate")(function* (self: TextElement) {
        //     const elementCount = yield* cli.getElementCount();
        //     const hasSelection = yield* cli.hasSelection();
        //     if (hasSelection) {
        //       const text = yield* cli.getSelectionText();
        //       yield* self.setContent(`${elementCount} Elements -> ${text}`);
        //     } else {
        //       yield* self.setContent(`${elementCount} Elements`);
        //     }
        //   }),
        // });

        // yield* parentContainer.add(box);
        yield* parentContainer.add(text);
        // yield* parentContainer.add(text2);

        // const tinyHello = yield* cli.createElement("asciifont", {
        //   left: 5,
        //   top: 5,
        //   text: "Hello World",
        // });

        const bigHello = yield* cli.createElement("asciifont", {
          left: 20,
          top: 20,
          text: "Hello World",
          font: "tiny",
        });

        // const input = yield* cli.createElement("input", {
        //   visible: false,
        //   // focused: true,
        //   colors: {
        //     bg: Colors.Custom("#001122"),
        //     fg: Colors.White,
        //     cursorColor: Colors.Teal,
        //     placeholderColor: Colors.Custom("#666666"),
        //   },
        //   position: PositionAbsolute.make(2),
        //   left: 5,
        //   top: 5,
        //   width: 70,
        //   height: 1,
        //   value: "",
        //   padding: 1,
        //   placeholder: "Enter text",
        //   maxLength: 50,
        //   onUpdate: Effect.fn("input.onUpdate")(function* (self: InputElement) {
        //     const value = yield* self.getValue();
        //     yield* bigHello.setText(value);
        //   }),
        // });

        const select = yield* cli.createElement("select", {
          position: PositionAbsolute.make(2),
          left: 1,
          top: 5,
          width: 40,
          height: 10,
          options: [
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
          ],
          description: "Select option",
          showDescription: true,
          selectedIndex: 0,
          onSelect: Effect.fn(function* (option) {
            if (!option) return;
            yield* bigHello.setText(option.value ?? "");
          }),
        });

        // yield* parentContainer.add(tinyHello);
        yield* parentContainer.add(bigHello);
        // yield* parentContainer.add(input);
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
