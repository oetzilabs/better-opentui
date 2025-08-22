import { Effect, Ref } from "effect";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import type { SelectionState } from "../../types";
import { base, type BaseElement } from "./base";
import type { Binds } from "./utils";

export const group = Effect.fn(function* (binds: Binds) {
  const b = yield* base("group");

  const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});
  const onKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {});

  const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
    yield* onMouseEvent(event);
    if (!event.defaultPrevented) {
      const es = yield* Ref.get(b.renderables);
      yield* Effect.all(es.map((e) => Effect.suspend(() => e.processMouseEvent(event))));
    }
  });

  const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
    return false;
  });

  const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
    return false;
  });

  const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
    yield* onKeyboardEvent(event);
  });

  const destroy = Effect.fn(function* () {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(
      elements.map((element) => Effect.suspend(() => element.destroy())),
      { concurrency: "unbounded" }
    );
    yield* b.destroy();
  });

  return {
    ...b,
    shouldStartSelection,
    onSelectionChanged,
    processMouseEvent,
    processKeyboardEvent,
    destroy,
  };
});
