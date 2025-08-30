import { Effect, Ref } from "effect";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import { isMouseDown, isMouseDrag, isMouseUp } from "../../inputs/mouse";
import type { SelectionState } from "../../types";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions } from "./utils";

export interface GroupElement extends BaseElement<"group", GroupElement> {}

export interface GroupOptions extends ElementOptions<"group", GroupElement> {
  onMouseEvent?: BaseElement<"group", GroupElement>["onMouseEvent"];
  onKeyboardEvent?: BaseElement<"group", GroupElement>["onKeyboardEvent"];
}

export const group = Effect.fn(function* (
  binds: Binds,
  options: GroupOptions = {
    visible: true,
    selectable: false,
  },
  parentElement: BaseElement<any, any> | null = null,
) {
  const b = yield* base(
    "group",
    binds,
    {
      ...options,
      width: "auto",
      height: "auto",
      visible: true,
      selectable: false,
      position: PositionRelative.make(1),
    },
    parentElement,
  );

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
        // Note: processMouseEvent already handles recursive processing of children
        // No need to do it here to avoid double-processing
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
      { concurrency: 10 },
    );
    yield* b.destroy();
  });

  return {
    ...b,
    shouldStartSelection,
    onSelectionChanged,
    destroy,
  } satisfies GroupElement;
});
