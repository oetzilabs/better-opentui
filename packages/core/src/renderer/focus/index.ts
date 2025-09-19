import { Effect, Ref } from "effect";
import type { BaseElement } from "../elements/base";

export interface FocusManagerInterface {
  next: (
    elements: BaseElement<any, any>[],
    direction: "next" | "previous",
  ) => Effect.Effect<BaseElement<any, any> | null>;
  reset: () => Effect.Effect<void>;
  setFocused: (id: string | null) => Effect.Effect<void>;
  currentFocused: Ref.Ref<string | null>;
}

export const makeFocusManager = Effect.fn(function* () {
  const focusedHistory = yield* Ref.make<string[]>([]);
  const currentFocused = yield* Ref.make<string | null>(null);

  const getFocusableElements = Effect.fn(function* (elements: BaseElement<any, any>[]) {
    const result: BaseElement<any, any>[] = [];
    const visited = new Set<string>();

    const traverse: (elements: BaseElement<any, any>[]) => Effect.Effect<void> = Effect.fn(function* (
      elements: BaseElement<any, any>[],
    ) {
      for (const element of elements) {
        if (visited.has(element.id)) continue;
        visited.add(element.id);
        const isFocusable = yield* Ref.get(element.focusable);
        if (isFocusable) {
          result.push(element);
        }
        const renderables = yield* Ref.get(element.renderables);
        yield* Effect.suspend(() => traverse(renderables));
      }
    });

    yield* traverse(elements);
    return result;
  });

  const next: (
    elements: BaseElement<any, any>[],
    direction: "next" | "previous",
  ) => Effect.Effect<BaseElement<any, any> | null> = Effect.fn(function* (
    elements: BaseElement<any, any>[],
    direction: "next" | "previous",
  ) {
    const focusables = yield* getFocusableElements(elements);
    if (focusables.length === 0) return null;

    const current = yield* Ref.get(currentFocused);
    let currentIndex = -1;
    if (current) {
      currentIndex = focusables.findIndex((e) => e.id === current);
    }

    let nextIndex;
    if (direction === "previous") {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : focusables.length - 1;
    } else {
      nextIndex = currentIndex < focusables.length - 1 ? currentIndex + 1 : 0;
    }

    const nextElement = focusables[nextIndex];
    yield* Ref.update(focusedHistory, (es) => [...es, nextElement.id]);
    yield* Ref.set(currentFocused, nextElement.id);
    return nextElement;
  });

  const reset = Effect.fn(function* () {
    yield* Ref.set(focusedHistory, []);
    yield* Ref.set(currentFocused, null);
  });

  const setFocused = Effect.fn(function* (id: string | null) {
    if (id) {
      yield* Ref.update(focusedHistory, (es) => [...es, id]);
      yield* Ref.set(currentFocused, id);
      return;
    }
    // If no id is provided, we reset the focus history
    yield* reset();
  });

  return {
    next,
    reset,
    setFocused,
    currentFocused,
  } satisfies FocusManagerInterface;
});

// export class FocusManager extends Context.Tag("FocusManager")<FocusManager, FocusManagerInterface>() {}

// export const FocusManagerLive = (root: BaseElement<any, any>) => Layer.effect(FocusManager, makeFocusManager(root));
