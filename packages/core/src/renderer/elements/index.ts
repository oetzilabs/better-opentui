import { Effect, Ref } from "effect";
import type { SelectionState } from "../../types";
import { group } from "./group";
import { root } from "./root";
import { text } from "./text";
import { ElementCounterLive, type RemoveBindsFromArgs, type RenderContextInterface } from "./utils";

export class Elements extends Effect.Service<Elements>()("Elements", {
  dependencies: [ElementCounterLive],
  effect: Effect.gen(function* () {
    const cachedGlobalSelection = yield* Ref.make<SelectionState | null>(null);

    const context = yield* Ref.make<RenderContextInterface>({
      width: Effect.fn(function* () {
        return 0;
      }),
      height: Effect.fn(function* () {
        return 0;
      }),
      addToHitGrid: Effect.fn(function* (x: number, y: number, width: number, height: number, id: number) {}),
      needsUpdate: Effect.fn(function* () {}),
    });

    const updateContext = Effect.fn(function* (ctx: RenderContextInterface) {
      yield* Ref.set(context, ctx);
    });

    const _root = Effect.fn(
      function* (ctx: RenderContextInterface) {
        yield* Ref.set(context, ctx);
        const r = yield* root();
        return r;
      },
      (effect) => effect.pipe(Effect.provide([ElementCounterLive])),
    );

    const _group = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof group>>) {
      const fn = group.bind(group, { context, cachedGlobalSelection });
      return yield* fn(...args).pipe(Effect.provide([ElementCounterLive]));
    });
    const _text = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof text>>) {
      const fn = text.bind(text, { context, cachedGlobalSelection });
      return yield* fn(...args).pipe(Effect.provide([ElementCounterLive]));
    });

    return {
      updateContext,
      root: _root,
      group: _group,
      text: _text,
    };
  }),
}) {}

export const ElementsLive = Elements.Default;

export type MethodsObj = Omit<Elements, "updateContext" | "_tag" | "root">;

export type Methods = keyof MethodsObj;

// type Effects = Effect.Effect.Success<ReturnType<Elements[Methods]>>;

type SuccessType<T> = T extends Effect.Effect<infer R, unknown, unknown> ? R : never;

type ElementByMethod = {
  [M in Methods]: SuccessType<ReturnType<Elements[M]>>;
};

export type ElementElement<X extends Methods> = ElementByMethod[X];

export type MethodParameters = {
  [key in Methods]: RemoveBindsFromArgs<Parameters<Elements[key]>>;
};
