import { PositionRelative } from "@better-opentui/core/src/renderer/utils/position";
import { run } from "@better-opentui/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    setup: Effect.fn("run.setup")(function* (cli) {
      const parentContainer = yield* cli.createElement("group");

      const styledText = yield* parentContainer.create(
        "text",
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec tempus placerat erat. In tincidunt cursus purus ac porttitor. Sed eget efficitur enim. Nunc luctus lorem quis vehicula dapibus. Etiam vehicula vestibulum bibendum. Fusce lobortis rutrum sapien id mattis. Quisque arcu libero, placerat sit amet facilisis in, tempus quis leo. Proin interdum neque ex, eget finibus velit gravida id.",
        {},
      );

      yield* parentContainer.add(styledText);

      yield* cli.add(parentContainer);
    }),
  });
}
