import { type Pointer } from "bun:ffi";
import { Effect, Ref } from "effect";
import type { Input } from "../../colors";
import type { RendererFailedToAddToHitGrid } from "../../errors";
import type { SelectionState, WidthMethod } from "../../types";
import type { Library } from "../../zig";
import type { LayoutOptions } from "../utils/layout";
import type { BaseElement } from "./base";

export interface RenderContextInterface {
  cli: Pointer;
  addToHitGrid: (
    x: number,
    y: number,
    width: number,
    height: number,
    id: number,
  ) => Effect.Effect<void, RendererFailedToAddToHitGrid, Library>;
  width: () => Effect.Effect<number>;
  height: () => Effect.Effect<number>;
  widthMethod: WidthMethod;
}

export type ElementOptions<T extends string, E> = Partial<LayoutOptions> & {
  visible?: boolean;
  focused?: boolean;
  selectable?: boolean;
  colors?: {
    fg?: Input;
    bg?: Input;
    selectableFg?: Input;
    selectableBg?: Input;
    focusedBorderColor?: Input;
    focusedBg?: Input;
    focusedFg?: Input;
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
