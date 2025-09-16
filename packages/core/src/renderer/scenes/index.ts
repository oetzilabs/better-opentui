import { Effect, Ref } from "effect";
import type { OptimizedBuffer } from "../../buffer/optimized";
import type { BaseElement } from "../elements/base";

export const makeScene = Effect.fn(function* (name: string, ...elements: BaseElement<any, any>[]) {
  const renderables = yield* Ref.make(elements);

  const doRender = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const rs = yield* Ref.get(renderables);
    yield* Effect.all(
      rs.map((r) => r.doRender()(buffer, deltaTime)),
      { concurrency: 10 },
    );
  });

  const update = Effect.fn(function* () {
    const rs = yield* Ref.get(renderables);
    yield* Effect.all(
      rs.map((r) => r.update()),
      { concurrency: 10 },
    );
  });

  const treeInfo: (indent: string, elements: BaseElement<any, any>) => Effect.Effect<string> = Effect.fn(function* (
    indent: string,
    element: BaseElement<any, any>,
  ) {
    const loc = yield* Ref.get(element.location);
    const dims = yield* Ref.get(element.dimensions);
    const info = `${indent}${element.type} (${element.id}:${element.num}): x=${loc.x}, y=${loc.y}, w=${dims.widthValue}, h=${dims.heightValue}\n`;
    const renderables = yield* Ref.get(element.renderables);
    let childInfo = "";
    for (const child of renderables) {
      childInfo += yield* Effect.suspend(() => treeInfo(indent + "  ", child));
    }
    return info + childInfo;
  });

  const getTreeInfoRecursive: (indent: string, elements: Ref.Ref<BaseElement<any, any>[]>) => Effect.Effect<string> =
    Effect.fn(function* (indent: string, elements: Ref.Ref<BaseElement<any, any>[]>) {
      const es = yield* Ref.get(elements);
      const tInfo = yield* Effect.all(
        es.map((e) => Effect.suspend(() => treeInfo(indent, e))),
        { concurrency: 10 },
      );
      return tInfo.join("\n");
    });

  const getTreeInfo: BaseElement<any, any>["getTreeInfo"] = Effect.fn(function* (self: Scene) {
    const me = `scene (${self.name})`;
    const gti = yield* getTreeInfoRecursive("  ", self.renderables);
    return `${me}\n${gti}`;
  });

  const destroy = Effect.fn(function* () {
    const es = yield* Ref.get(renderables);
    yield* Effect.all(
      es.map((e) => Effect.suspend(() => e.destroy())),
      { concurrency: 10, concurrentFinalizers: true },
    );
  });

  return {
    type: "scene" as const,
    getTreeInfo: function (this) {
      return getTreeInfo(this as Scene);
    },
    update,
    doRender,
    name,
    renderables,
    destroy,
  } as const;
});

export type Scene = Effect.Effect.Success<ReturnType<typeof makeScene>>;
