import { BunRuntime } from "@effect/platform-bun";
import { Colors } from "@opentuee/core/src/colors";
import { isMouseOver } from "@opentuee/core/src/inputs/mouse";
import { PositionAbsolute } from "@opentuee/core/src/renderer/utils/position";
import { run } from "@opentuee/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  BunRuntime.runMain(
    run({
      setup: Effect.fn(function* (cli) {
        yield* cli.setBackgroundColor(Colors.Transparent);
        const parentContainer = yield* cli.createElement("group", {});

        const text = yield* cli.createElement("text", "Hello World", {
          position: PositionAbsolute.make(2),
          left: 0,
          top: 0,
          width: "auto",
          height: "auto",
          zIndex: 1,
          colors: {
            fg: Colors.Red,
            bg: Colors.Yellow,
          },
          onMouseEvent: Effect.fn("text.onMouseEvent")(function* (event) {
            yield* Effect.log("AAAA".repeat(10000));
            // event.preventDefault();
            if (isMouseOver(event.type)) {
              yield* cli.setBackgroundColor((c) => {
                if (Colors.is("Yellow", c)) {
                  return Colors.Red;
                } else {
                  return Colors.Yellow;
                }
              });
            }
          }),
        });

        // const text2 = yield* cli.createElement("text", "Hello World 2", {
        //   position: PositionAbsolute.make(2),
        //   left: 5,
        //   top: 5,
        //   width: "auto",
        //   height: "auto",
        //   colors: {
        //     fg: Colors.Red,
        //     bg: Colors.Transparent,
        //     selectableBg: Colors.Green,
        //   },
        //   zIndex: 1,
        // });

        yield* parentContainer.add(text);
        // yield* parentContainer.add(text2);

        yield* cli.add(parentContainer);
      }),
      on: {
        start: Effect.fn(function* (cli) {}),
        resize: Effect.fn(function* (width, height) {}),
        exit: Effect.fn(function* (reason) {}),
        panic: Effect.fn(function* (err) {}),
      },
    }),
  );
}
