import { Effect, Ref } from "effect";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import type { SelectionState } from "../../types";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions } from "./utils";

export interface GroupOptions extends ElementOptions {
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
  const b = yield* base("group", options);

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
