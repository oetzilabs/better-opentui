import { Colors } from "@better-opentui/core/src/colors";
import { run } from "@better-opentui/core/src/run";
import { Effect } from "effect";

if (import.meta.main) {
  run({
    // debug: true,
    scenes: {
      main: Effect.fn("run.scenes.main")(function* (scene) {
        const parentContainer = yield* scene.createElement("group");

        const counter = yield* parentContainer.create("counter", 999, {
          colors: { bg: Colors.Transparent },
        });

        const button = yield* parentContainer.create("button", {
          content: counter,
        });

        const increment = yield* parentContainer.create("button", {
          top: 1,
          content: "+1",
          colors: {
            bg: Colors.Custom("#57cc99"),
            hoverBg: Colors.Custom("#4baf84"),
            focusedBg: Colors.Custom("#3e9b73"),
          },
          onClick: Effect.fn(function* () {
            yield* counter.increment();
          }),
          onPress: Effect.fn(function* () {
            yield* counter.increment();
          }),
        });

        const decrement = yield* parentContainer.create("button", {
          top: 2,
          content: "-1",
          colors: {
            bg: Colors.Custom("#D62828"),
            hoverBg: Colors.Custom("#c12222"),
            focusedBg: Colors.Custom("#b21e1e"),
          },
          onClick: Effect.fn(function* () {
            yield* counter.decrement();
          }),
          onPress: Effect.fn(function* () {
            yield* counter.decrement();
          }),
        });

        yield* parentContainer.add(button);
        yield* parentContainer.add(increment);
        yield* parentContainer.add(decrement);

        return parentContainer;
      }),
    },
  });
}
