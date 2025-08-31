import { Effect, Ref } from "effect";
import { MissingRenderContext } from "../../errors";
import type { SelectionState } from "../../types";
import type { Library } from "../../zig";
import { asciifont } from "./asciifont";
import type { BaseElement } from "./base";
import { box } from "./box";
import { framebuffer } from "./framebuffer";
import { group } from "./group";
import { input } from "./input";
import { multiSelect } from "./multi-select";
import { root } from "./root";
import { select } from "./select";
import { tabselect } from "./tabselect";
import { text } from "./text";
import { type RemoveBindsFromArgs, type RenderContextInterface } from "./utils";

export class Elements extends Effect.Service<Elements>()("Elements", {
  dependencies: [],
  effect: Effect.gen(function* () {
    const cachedGlobalSelection = yield* Ref.make<SelectionState | null>(null);

    const renderables = yield* Ref.make<BaseElement<any, any>[]>([]);

    const context = yield* Ref.make<RenderContextInterface | null>(null);

    const _root = Effect.fn(function* (initial: { width: number; height: number }, ctx: RenderContextInterface) {
      yield* Ref.set(context, ctx);
      const r = yield* root({ context: context as Ref.Ref<RenderContextInterface>, cachedGlobalSelection }, initial);
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

    const _input = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof input>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = input.bind(input, {
        context: context as Ref.Ref<RenderContextInterface>,
        cachedGlobalSelection,
      });
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

    const _select = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof select>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = select.bind(select, {
        context: context as Ref.Ref<RenderContextInterface>,
        cachedGlobalSelection,
      });
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

    const _multiSelect = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof multiSelect>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = multiSelect.bind(multiSelect, {
        context: context as Ref.Ref<RenderContextInterface>,
        cachedGlobalSelection,
      });
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

    const _tabselect = Effect.fn(function* (...args: RemoveBindsFromArgs<Parameters<typeof tabselect>>) {
      const ctx = yield* Ref.get(context);
      if (!ctx) {
        return yield* Effect.fail(new MissingRenderContext());
      }
      const fn = tabselect.bind(tabselect, {
        context: context as Ref.Ref<RenderContextInterface>,
        cachedGlobalSelection,
      });
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

    const element_functions = {
      root: _root,
      box: _box,
      group: _group,
      text: _text,
      asciifont: _asciifont,
      framebuffer: _framebuffer,
      input: _input,
      select: _select,
      "multi-select": _multiSelect,
      tabselect: _tabselect,
    } as const;

    const _create_non_parent = Effect.fn(function* <T extends Methods>(
      type: T,
      ...args: [...MethodParameters[T], BaseElement<any, any> | null] | MethodParameters[T]
    ) {
      const fn = element_functions[type];
      // @ts-ignore: we know that the type is correct
      const element = yield* fn(...args);
      return yield* Effect.succeed(element as ElementElement<T>);
    });

    type CreateElement = {
      // First call (no parent)
      <T extends Methods>(
        type: T,
        ...args: MethodParameters[T]
      ): Effect.Effect<
        ElementElement<T> & {
          create: CreateElementBound;
        },
        TypeError,
        Library
      >;

      // With explicit parent (still supported, but not needed)
      <T extends Methods>(
        parent: BaseElement<any, any>,
        type: T,
        ...args: [...MethodParameters[T], BaseElement<any, any> | null] | MethodParameters[T]
      ): Effect.Effect<
        ElementElement<T> & {
          create: CreateElementBound;
        },
        TypeError,
        Library
      >;
    };

    // Once bound to a parent, we no longer accept "parent" explicitly
    type CreateElementBound = <T extends Methods>(
      type: T,
      ...args: MethodParameters[T]
    ) => Effect.Effect<
      ElementElement<T> & {
        create: CreateElementBound;
      },
      TypeError,
      Library
    >;

    const _create: CreateElement = <T extends Methods>(
      a: BaseElement<any, any> | T,
      b?: T | MethodParameters[T],
      ...args: [...MethodParameters[T], BaseElement<any, any> | null] | MethodParameters[T]
    ) =>
      Effect.gen(function* () {
        let element;
        if (typeof a !== "string") {
          // case: create(parent, type, ...args)
          const parent = a as BaseElement<any, any>;

          const type = b as T;
          const args2 = [...args, parent] as [...MethodParameters[T], BaseElement<any, any> | null];
          const child_element = yield* _create_non_parent(type, ...args2);

          const createFn: CreateElementBound = <T extends Methods>(t: T, ...as: MethodParameters[T]) => {
            const args3 = [...as, child_element] as unknown as [...MethodParameters[T], BaseElement<any, any> | null];
            return Effect.suspend(() => _create(child_element, t, ...args3));
          };

          element = {
            ...child_element,
            create: createFn,
          } satisfies ElementElement<T> & {
            create: CreateElementBound;
          };
        } else {
          // case: create(type, ...args) -- first call
          const type = a as T;
          // @ts-ignore: we know that the type is correct
          const args2 = [b, ...args] as MethodParameters[T];
          const parent_element = yield* _create_non_parent(type, ...args2);

          // const createFn: CreateElementBound = (t, ...as) => Effect.suspend(() => _create(parent_element, t, ...as));
          const createFn: CreateElementBound = <T extends Methods>(t: T, ...as: MethodParameters[T]) => {
            const args3 = [...as, parent_element] as unknown as [...MethodParameters[T], BaseElement<any, any> | null];
            return Effect.suspend(() => _create(parent_element, t, ...args3));
          };

          element = {
            ...parent_element,
            create: createFn,
          } satisfies ElementElement<T> & {
            create: CreateElementBound;
          };
        }
        yield* Ref.update(renderables, (es) => {
          es.push(element);
          return es;
        });

        return element;
      });

    return {
      ...element_functions,
      create: _create,
      renderables,
      getRenderable,
      destroy,
    };
  }),
}) {}

export const ElementsLive = Elements.Default;

export type MethodsObj = Omit<
  Elements,
  "updateContext" | "_tag" | "renderables" | "getRenderable" | "destroy" | "create"
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
