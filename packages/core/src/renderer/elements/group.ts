import { Effect, Ref } from "effect";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import type { SelectionState } from "../../types";
import { base, type BaseElement } from "./base";
import type { Binds } from "./utils";

export const group = Effect.fn(function* (binds: Binds) {
  const b = yield* base("group");
  const parent = yield* Ref.make<BaseElement<any> | null>(null);

  const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});
  const onKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {});

  const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
    yield* onMouseEvent(event);
    const p = yield* Ref.get(parent);
    if (p && !event.defaultPrevented) {
      yield* Effect.suspend(() => p.processMouseEvent(event));
    }
  });

  const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
    return false;
  });

  const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
    return false;
  });

  const setContent = Effect.fn(function* (value: BaseElement<any>) {
    yield* Ref.set(b.renderables, [value]);
  });

  const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
    yield* onKeyboardEvent(event);
    const p = yield* Ref.get(b.parent);
    if (p && !event.defaultPrevented) {
      yield* Effect.suspend(() => p.processKeyboardEvent(event));
    }
  });

  const destroy = Effect.fn(function* () {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(
      elements.map((element) => Effect.suspend(() => element.destroy())),
      { concurrency: "unbounded" },
    );
    yield* b.destroy();
  });

  return {
    ...b,
    shouldStartSelection,
    onSelectionChanged,
    processMouseEvent,
    processKeyboardEvent,
    setContent,
    destroy,
  };
});
