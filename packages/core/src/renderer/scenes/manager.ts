import type { FileSystem, Path } from "@effect/platform";
import { Context, Effect, Layer, Ref } from "effect";
import type { Scene } from ".";
import type { OptimizedBuffer } from "../../buffer/optimized";
import type { Collection } from "../../errors";
import type { Library } from "../../lib";
import type { BaseElement } from "../elements/base";
import { SceneNotFound } from "./errors";

export const makeSceneManager = Effect.fn(function* () {
  const scenes = yield* Ref.make<Map<string, Scene>>(new Map());
  const currentScene = yield* Ref.make<string | null>(null);
  const history = yield* Ref.make<
    {
      name: string;
      active: boolean;
    }[]
  >([]);

  const switchTo = Effect.fn(function* (key: string) {
    const s = yield* Ref.get(scenes);
    const scene = s.get(key);
    if (!scene) {
      return yield* Effect.fail(new SceneNotFound({ name: key }));
    }
    const hist = yield* Ref.get(history);

    const cs = yield* Ref.get(currentScene);
    if (cs) {
      const currentIndex = hist.findIndex((h) => h.name === cs);
      if (currentIndex !== -1) {
        if (currentIndex < hist.length - 1) {
          if (currentIndex === 0) {
            // [cIndex, <new history item>]
            hist[currentIndex].active = false;
            hist.push({ name: key, active: true });
          } else {
            // currentIndex > 0
            const nextIndex = hist.findIndex((h) => h.name === key);
            if (nextIndex !== -1 && nextIndex > currentIndex) {
              hist[currentIndex].active = false;
              hist[nextIndex].active = true;
            } else {
              if (nextIndex === -1) {
                hist[currentIndex].active = false;
                hist.push({ name: key, active: true });
              } else {
                hist[currentIndex].active = false;
                hist[nextIndex].active = true;
              }
            }
          }
        }
      } else {
        hist.push({ name: key, active: true });
      }
    } else {
      hist.push({ name: key, active: true });
    }
    yield* Ref.set(currentScene, key);
    yield* Ref.set(history, hist);
  });

  const back = Effect.fn(function* () {
    const hist = yield* Ref.get(history);
    if (hist.length === 0) return;
    const last = hist[hist.length - 1];
    yield* switchTo(last.name);
  });

  const forward = Effect.fn(function* () {
    const hist = yield* Ref.get(history);
    if (hist.length === 0) return;
    const cs = yield* Ref.get(currentScene);
    const currentIndex = hist.findIndex((h) => h.name === cs);
    if (currentIndex === -1) return;
    if (currentIndex === hist.length - 1) return;
    const next = hist[currentIndex + 1];
    yield* switchTo(next.name);
  });

  const add = Effect.fn(function* (key: string, value: Scene) {
    yield* Ref.update(scenes, (scs) => scs.set(key, value));
  });

  const getCurrentScene = Effect.fn(function* () {
    const s = yield* Ref.get(scenes);
    const cs = yield* Ref.get(currentScene);
    if (!cs) return null;
    const scene = s.get(cs);
    if (!scene) return null;
    return scene;
  });

  const clear = Effect.fn(function* () {
    yield* Ref.set(scenes, new Map());
    yield* Ref.set(currentScene, null);
    yield* Ref.set(history, []);
  });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const cs = yield* Ref.get(currentScene);
    if (!cs) return;
    const scs = yield* Ref.get(scenes);
    const scene = scs.get(cs);
    if (!scene) return;
    yield* scene.doRender(buffer, deltaTime);
  });

  const update = Effect.fn(function* () {
    const scs = yield* Ref.get(scenes);
    yield* Effect.all(
      Array.from(scs.values()).map((scs) => scs.update()),
      { concurrency: 10 },
    );
  });

  const getTreeInfo = Effect.fn(function* () {
    const cs = yield* Ref.get(currentScene);
    if (!cs) return "";
    const scs = yield* Ref.get(scenes);
    const scene = scs.get(cs);
    if (!scene) return "";
    return yield* scene.getTreeInfo();
  });

  const destroy = Effect.fn(function* () {
    const cs = yield* Ref.get(currentScene);
    if (!cs) return;
    const scs = yield* Ref.get(scenes);
    const scene = scs.get(cs);
    if (!scene) return;
    yield* scene.destroy();
    yield* clear();
    yield* Ref.set(scenes, new Map());
    yield* Ref.set(currentScene, null);
    yield* Ref.set(history, []);
  });

  const focus = Effect.fn(function* (direction: "next" | "previous") {
    const cs = yield* Ref.get(currentScene);
    if (!cs) return null;
    const scs = yield* Ref.get(scenes);
    const scene = scs.get(cs);
    if (!scene) return null;
    return yield* scene.focusNext(direction);
  });

  return {
    add,
    getCurrentScene,
    switchTo,
    back,
    forward,
    clear,
    render,
    update,
    getTreeInfo,
    destroy,
    focus,
  } as const;
});

export interface SceneManagerInterface {
  add: (key: string, value: Scene) => Effect.Effect<void, Collection>;
  update: () => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  getCurrentScene: () => Effect.Effect<Scene | null, Collection>;
  switchTo: (key: string) => Effect.Effect<void, SceneNotFound>;
  back: () => Effect.Effect<void, Collection>;
  forward: () => Effect.Effect<void, Collection>;
  clear: () => Effect.Effect<void, Collection>;
  render: (
    buffer: OptimizedBuffer,
    deltaTime: number,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  getTreeInfo: () => Effect.Effect<string, Collection>;
  destroy: () => Effect.Effect<void, Collection, Library>;
  focus: (
    direction: "next" | "previous",
  ) => Effect.Effect<BaseElement<any, any> | null, Collection, Library | Path.Path | FileSystem.FileSystem>;
}

export class SceneManager extends Context.Tag("SceneManager")<SceneManager, SceneManagerInterface>() {}

export const SceneManagerLive = Layer.effect(SceneManager, makeSceneManager());
