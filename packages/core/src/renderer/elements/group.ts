import { Effect, Ref } from "effect";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import { isMouseDown, isMouseDrag, isMouseUp } from "../../inputs/mouse";
import type { SelectionState } from "../../types";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions } from "./utils";

export interface GroupOptions extends ElementOptions<"group"> {
  onMouseEvent?: BaseElement<"group">["onMouseEvent"];
  onKeyboardEvent?: BaseElement<"group">["onKeyboardEvent"];
}

export const group = Effect.fn(function* (
  binds: Binds,
  options: GroupOptions = {
    visible: true,
    selectable: true,
  },
) {
  const b = yield* base("group", {
    ...options,
  });

  b.onMouseEvent = Effect.fn("group.onMouseEvent")(function* (event) {
    yield* Effect.annotateCurrentSpan("group.onMouseEvent", event);
    const fn = options.onMouseEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);

    if (event.source) {
      if (event.source.id === b.id && !event.defaultPrevented) {
        if (isMouseDown(event.type) || isMouseDrag(event.type) || isMouseUp(event.type)) {
          yield* event.source.setFocused(true);
        } else {
          yield* event.source.setFocused(false);
        }
        // propagate to children
        const es = yield* Ref.get(b.renderables);
        yield* Effect.all(
          es.map((e) => Effect.suspend(() => e.onMouseEvent(event)), {
            concurrency: "unbounded",
            concurrentFinalizers: true,
          }),
        );
      }
    }
  });

  const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
    return false;
  });

  const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
    return false;
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
    destroy,
  };
});
