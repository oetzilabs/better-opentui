import { Effect, Ref } from "effect";
import type { SelectionState } from "../types";

export class Selection extends Effect.Service<Selection>()("Selection", {
  effect: Effect.gen(function* () {
    const _active = yield* Ref.make(false);
    const _selecting = yield* Ref.make(false);
    const anchorRef = yield* Ref.make({ x: 0, y: 0 });
    const focusRef = yield* Ref.make({ x: 0, y: 0 });
    const selectedRenderablesRef = yield* Ref.make<Element[]>([]);
    const selectionState = yield* Ref.make<SelectionState | null>(null);

    const anchor = Effect.fn(function* () {
      return yield* Ref.get(anchorRef);
    });

    const focus = Effect.fn(function* () {
      return yield* Ref.get(focusRef);
    });

    const bounds = Effect.fn(function* () {
      const a = yield* Ref.get(anchorRef);
      const f = yield* Ref.get(focusRef);
      return {
        startX: Math.min(a.x, f.x),
        startY: Math.min(a.y, f.y),
        endX: Math.max(a.x, f.x),
        endY: Math.max(a.y, f.y),
      };
    });

    const updateSelectedRenderables = Effect.fn(function* (selected: Element[]) {
      yield* Ref.set(selectedRenderablesRef, selected);
    });

    const enable = Effect.fn(function* () {
      yield* Ref.set(_active, true);
    });

    const disable = Effect.fn(function* () {
      yield* Ref.set(_active, false);
    });

    const isActive = Effect.fn(function* () {
      return yield* Ref.get(_active);
    });

    const isSelecting = Effect.fn(function* () {
      return yield* Ref.get(_selecting);
    });

    const setSelecting = Effect.fn(function* (selecting: boolean) {
      yield* Ref.set(_selecting, selecting);
    });

    const getSelectedText = Effect.gen(function* () {
      const selectedRenderables = yield* Ref.get(selectedRenderablesRef);

      // Gather {x,y,id} for each renderable by running its getX/getY Effects.
      // Support two common shapes:
      // 1) renderable.getX is a function returning an Effect (call it)
      // 2) renderable.getX is itself an Effect (yield it directly)
      const sortedSelectedTexts = yield* Effect.all(
        selectedRenderables.map(
          Effect.fn(function* (renderable: Element) {
            const getXProp = (renderable as any).getX;
            const getYProp = (renderable as any).getY;

            const x = typeof getXProp === "function" ? yield* getXProp() : yield* getXProp;
            const y = typeof getYProp === "function" ? yield* getYProp() : yield* getYProp;

            return { x, y, id: renderable.id };
          }),
        ),
      );

      const selectedTexts = sortedSelectedTexts.sort((a, b) => {
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });

      const selectedTexts2 = selectedTexts
        .map((r) => selectedRenderables.find((el) => el.id === r.id)!)
        .filter((t) => Boolean(t));

      // The original code returns selected elements joined with "\n".
      // If Element has a text property or toString, adjust here accordingly.
      // We assume Element implements meaningful toString(), or replace with .text
      return selectedTexts2.join("\n");
    });

    const setAnchor = Effect.fn(function* (a: { x: number; y: number }) {
      yield* Ref.set(anchorRef, { ...a });
    });

    const setFocus = Effect.fn(function* (f: { x: number; y: number }) {
      yield* Ref.set(focusRef, { ...f });
    });

    const create = Effect.fn(function* (_anchor: { x: number; y: number }, _focus: { x: number; y: number }) {
      yield* setAnchor(_anchor);
      yield* setFocus(_focus);
    });

    return {
      create,
      anchor,
      focus,
      bounds,
      updateSelectedRenderables,
      getSelectedText,
      setAnchor,
      setFocus,
      isActive,
      isSelecting,
      setSelecting,
      enable,
      disable,
    } as const;
  }),
}) {}

export const SelectionLive = Selection.Default;
