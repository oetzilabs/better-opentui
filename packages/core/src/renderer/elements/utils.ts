import { Effect, Ref } from "effect";
import type { Input } from "../../colors";
import type { RendererFailedToAddToHitGrid } from "../../errors";
import type { SelectionState } from "../../types";
import type { Library } from "../../zig";
import type { LayoutOptions } from "../utils/layout";
import type { BaseElement } from "./base";

export interface RenderContextInterface {
  addToHitGrid: (
    x: number,
    y: number,
    width: number,
    height: number,
    id: number,
  ) => Effect.Effect<void, RendererFailedToAddToHitGrid, Library>;
  width: () => Effect.Effect<number>;
  height: () => Effect.Effect<number>;
}

export class ElementCounter extends Effect.Service<ElementCounter>()("ElementCounter", {
  dependencies: [],
  effect: Effect.gen(function* () {
    const counter = yield* Ref.make(0);
    return {
      getNext: Effect.fn(function* () {
        return yield* Ref.updateAndGet(counter, (c) => c + 1);
      }),
    };
  }),
}) {}

export const ElementCounterLive = ElementCounter.Default;

export type ElementOptions<T extends string, E> = Partial<LayoutOptions> & {
  visible?: boolean;
  focused?: boolean;
  selectable?: boolean;
  colors?: {
    fg?: Input;
    bg?: Input;
    selectableFg?: Input;
    selectableBg?: Input;
  };
  attributes?: number;
  onMouseEvent?: BaseElement<T, E>["onMouseEvent"];
  onKeyboardEvent?: BaseElement<T, E>["onKeyboardEvent"];
  onUpdate?: BaseElement<T, E>["onUpdate"];
};

export interface Binds {
  context: Ref.Ref<RenderContextInterface>;
  cachedGlobalSelection: Ref.Ref<SelectionState | null>;
}
// usually the binds are the first argument, so we remove them from the args
export type RemoveBindsFromArgs<T extends any[]> = T extends [infer Head, ...infer Tail]
  ? Head extends Binds
    ? RemoveBindsFromArgs<Tail> // skip it
    : [Head, ...Tail]
  : T;

export type BindsToArgs<T extends any[]> = T extends [infer Head, ...infer Tail]
  ? [Head extends Binds ? Binds : Head, ...BindsToArgs<Tail>]
  : [];
