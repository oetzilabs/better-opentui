import { collection } from "@better-opentui/core/src/renderer/utils/collection";
import { ThemeManager } from "@better-opentui/core/src/themes/manager";
import { Effect, Order } from "effect";
import { Colors } from "../packages/core/src/colors";
import { PositionRelative } from "../packages/core/src/renderer/utils/position";
import { run } from "../packages/core/src/run";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (terminal) {
      // yield* terminal.setBackgroundColor(Colors.White);
    }),
    scenes: {
      main: Effect.fn("run.scenes.main")(function* (scene) {
        const parentContainer = yield* scene.createElement("group");

        const themeManager = yield* ThemeManager;
        const themes = yield* themeManager.list();
        const themeCollection = themes.map((theme) => ({
          display: theme,
          id: theme,
          value: theme,
        }));

        const input = yield* parentContainer.create("input", {
          position: PositionRelative.make(1),
          top: 0,
          visible: true,
          focused: false,
          placeholder: "this is a placeholder for the input",
        });

        const col = yield* collection(themeCollection);

        yield* col.addSort({
          id: "display",
          direction: "asc",
          key: "display",
          fn: Order.string,
        });

        const list = yield* parentContainer.create("list", col, {
          position: PositionRelative.make(1),
          top: 1,
          width: "100%",
          height: 5,
          visible: true,
          focused: true,
          showScrollIndicator: true,
          onSelect: (item) =>
            Effect.gen(function* () {
              yield* themeManager.load(item.value);
            }),
        });

        const button = yield* parentContainer.create("button", {
          position: PositionRelative.make(1),
          top: 7,
          visible: true,
          focused: false,
          content: "switch to second",
          onClick: () =>
            Effect.gen(function* () {
              yield* scene.switchTo("second");
            }),
        });

        const multiSelect = yield* parentContainer.create("multi-select", {
          position: PositionRelative.make(1),
          top: 8,
          width: "100%",
          height: "auto",
          visible: true,
          focused: false,
          options: [
            { name: "Apple", id: "apple", value: "apple", description: "A red or green fruit" },
            { name: "Banana", id: "banana", value: "banana", description: "A yellow curved fruit" },
            { name: "Cherry", id: "cherry", value: "cherry", description: "A small red fruit" },
            { name: "Date", id: "date", value: "date", description: "A sweet brown fruit" },
            { name: "Elderberry", id: "elderberry", value: "elderberry", description: "A dark purple berry" },
            { name: "Fig", id: "fig", value: "fig", description: "A soft pear-shaped fruit" },
            { name: "Grape", id: "grape", value: "grape", description: "A small round fruit" },
            { name: "Honeydew", id: "honeydew", value: "honeydew", description: "A large green melon" },
          ],
          selectedIds: ["apple", "cherry"], // Pre-select Apple and Cherry
          search: { enabled: true, location: "bottom" },
          showDescription: true,
        });

        const textareaElement = yield* parentContainer.create("textarea", {
          position: PositionRelative.make(1),
          top: 8,
          width: 50,
          visible: true,
          focused: false,
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

        yield* parentContainer.add(input);
        yield* parentContainer.add(list);
        yield* parentContainer.add(button);
        yield* parentContainer.add(textareaElement);
        yield* parentContainer.add(multiSelect);

        return parentContainer;
      }),
      second: Effect.fn("run.scenes.second")(function* (scene) {
        const parentContainer = yield* scene.createElement("group");

        const fileSelectElement = yield* parentContainer.create("file-select", {
          position: PositionRelative.make(1),
          top: 0,
          width: "100%",
          height: 10,
          visible: true,
          focused: true,
          lookup_path: process.cwd(),
          search: { enabled: true },
          statusBar: { enabled: true },
          showScrollIndicator: true,
          layout: [
            //
            "path",
            "search",
            "file-list",
            "status-bar",
          ],
          onSelect: (files) => Effect.gen(function* () {}),
        });

        const button = yield* parentContainer.create("button", {
          position: PositionRelative.make(1),
          top: 30,
          visible: true,
          focused: false,
          content: "switch to main",
          onClick: () =>
            Effect.gen(function* () {
              yield* scene.switchTo("main");
            }),
        });

        yield* parentContainer.add(fileSelectElement);
        yield* parentContainer.add(button);

        return parentContainer;
      }),
    },
  });
}
