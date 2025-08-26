import { Effect, Ref } from "effect";
import { MissingRenderContext } from "../../errors";
import type { SelectionState } from "../../types";
import { asciifont } from "./asciifont";
import type { BaseElement } from "./base";
import { box } from "./box";
import { framebuffer } from "./framebuffer";
import { group } from "./group";
import { root } from "./root";
import { text } from "./text";
import { type RemoveBindsFromArgs, type RenderContextInterface } from "./utils";

export class Elements extends Effect.Service<Elements>()("Elements", {
  dependencies: [],
  effect: Effect.gen(function* () {
    const cachedGlobalSelection = yield* Ref.make<SelectionState | null>(null);

    const renderables = yield* Ref.make<BaseElement<any, any>[]>([]);

    const context = yield* Ref.make<RenderContextInterface | null>(null);

    const _root = Effect.fn(function* (ctx: RenderContextInterface) {
      yield* Ref.set(context, ctx);
      const r = yield* root();
      yield* Ref.update(renderables, (es) => {
        es.push(r);
        return es;
      });
      return r;
    });

    const _group = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof group>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = group.bind(group, { context: context as Ref.Ref<RenderContextInterface>, cachedGlobalSelection });
      const r = yield* fn(...args);
      yield* Ref.update(renderables, (es) => {
        es.push(r);
        return es;
      });
      return r;
    });

    const _framebuffer = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof framebuffer>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = framebuffer.bind(framebuffer, {
        context: context as Ref.Ref<RenderContextInterface>,
        cachedGlobalSelection,
      });
      const r = yield* fn(...args);
      yield* Ref.update(renderables, (es) => {
        es.push(r);
        return es;
      });
      return r;
    });

    const _asciifont = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof asciifont>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = asciifont.bind(asciifont, {
        context: context as Ref.Ref<RenderContextInterface>,
        cachedGlobalSelection,
      });
      const r = yield* fn(...args);
      yield* Ref.update(renderables, (es) => {
        es.push(r);
        return es;
      });
      return r;
    });

    const _text = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof text>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = text.bind(text, { context: context as Ref.Ref<RenderContextInterface>, cachedGlobalSelection });
      const r = yield* fn(...args);
      yield* Ref.update(renderables, (es) => {
        es.push(r);
        return es;
      });
      const initialLocation = yield* Ref.get(r.location);
      const initialDimensions = yield* Ref.get(r.dimensions);

      yield* ctx.addToHitGrid(
        initialLocation.x,
        initialLocation.y,
        initialDimensions.widthValue,
        initialDimensions.heightValue,
        r.num,
      );
      return r;
    });

    const _box = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof box>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = box.bind(box, { context: context as Ref.Ref<RenderContextInterface>, cachedGlobalSelection });
      const r = yield* fn(...args);
      yield* Ref.update(renderables, (es) => {
        es.push(r);
        return es;
      });
      const initialLocation = yield* Ref.get(r.location);
      const initialDimensions = yield* Ref.get(r.dimensions);

      yield* ctx.addToHitGrid(
        initialLocation.x,
        initialLocation.y,
        initialDimensions.widthValue,
        initialDimensions.heightValue,
        r.num,
      );
      return r;
    });

    const getRenderable = Effect.fn(function* (id: number) {
      const elements = yield* Ref.get(renderables);
      return elements.find((e) => e.num === id);
    });

    const destroy = Effect.fn(function* () {
      yield* Ref.set(renderables, []);
    });

    return {
      box: _box,
      root: _root,
      group: _group,
      text: _text,
      asciifont: _asciifont,
      framebuffer: _framebuffer,
      renderables,
      getRenderable,
      destroy,
    };
  }),
}) {}

export const ElementsLive = Elements.Default;

export type MethodsObj = Omit<
  Elements,
  "updateContext" | "_tag" | "root" | "renderables" | "getRenderable" | "destroy"
>;

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
