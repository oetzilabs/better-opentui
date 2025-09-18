import { type Pointer } from "bun:ffi";
import { Effect, Ref, Schema } from "effect";
import { Input } from "../../colors";
import type { RendererFailedToAddToHitGrid } from "../../errors";
import type { Library } from "../../lib";
import type { SelectionState, WidthMethod } from "../../types";
import type { LayoutOptions } from "../utils/layout";
import type { BaseElement } from "./base";
import { group } from "./group";
import { text } from "./text";
import type { Content } from "./types";

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

export const ColorsThemeRecord = Schema.Record({ key: Schema.String, value: Input });

export type ElementOptions<T extends string, E> = Partial<LayoutOptions> & {
  visible?: boolean;
  focused?: boolean;
  selectable?: boolean;
  colors?: typeof ColorsThemeRecord.Type;
  overflow?: "visible" | "hidden" | "scroll";
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

export const calculateContentDimensions: (
  content: Content,
) => Effect.Effect<[width: number, height: number], never, Library> = Effect.fn(function* (content: Content) {
  let width = 0;
  let height = 0;
  if (typeof content === "string") {
    width = content.length;
    height = 1;
  } else if (Array.isArray(content)) {
    const contentDimensions = yield* Effect.all(
      content.map((c) => Effect.suspend(() => calculateContentDimensions(c))),
    );
    width = contentDimensions.reduce((acc, [w]) => acc + w, 0);
    height = contentDimensions.reduce((acc, [, h]) => acc + h, 0);
  } else {
    const dims = yield* Ref.get(content.dimensions);
    width = dims.widthValue;
    height = dims.heightValue;
  }
  return [width, height];
});

export const convertToElement: (
  content: Content,
  binds: Binds,
  parentElement: BaseElement<any, any>,
) => Effect.Effect<BaseElement<any, any>, Error, Library> = Effect.fn(function* (
  content: Content,
  binds: Binds,
  parentElement: BaseElement<any, any>,
) {
  if (typeof content === "string") {
    return yield* text(binds, content, { selectable: false }, parentElement);
  } else if (Array.isArray(content)) {
    const g = yield* group(binds, {}, parentElement);
    for (const c of content) {
      const cc = yield* Effect.suspend(() => convertToElement(c, binds, g));
      yield* g.add(cc);
    }
    return g;
  } else {
    return content;
  }
});
