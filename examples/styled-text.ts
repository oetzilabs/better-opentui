import { BunRuntime } from "@effect/platform-bun";
import * as Colors from "@opentuee/core/src/colors";
import { setup } from "@opentuee/core/src/setup";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  return yield* setup(
    Effect.fn(function* (cli) {
      yield* cli.setBackgroundColor(Colors.White.make("#FFFFFF"));
      const parentContainer = yield* cli.createElement("group");
      const text = yield* cli.createElement("text", "Hello World", { left: 2, top: 2 });
      const text2 = yield* cli.createElement("text", "Hello World 2", { left: 5, top: 5 });

      yield* parentContainer.add(text);
      yield* parentContainer.add(text2);
      yield* cli.add(parentContainer);
    }),
  );
});

if (import.meta.main) {
  BunRuntime.runMain(program);
}
