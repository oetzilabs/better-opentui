import { EventEmitter } from "@opentuee/core/src/event-emitter";
import { Context, Effect, Ref } from "effect";
import { type Node as YogaNode } from "yoga-layout";
import type { MissingChildLayoutNode } from "../components/errors";
import type { NodeMetadata } from "../types";
import {
  FailedToFreeYogaNode,
  FailedToInsertChildTrackNode,
  FailedToSetTrackedNodeWidthAndHeight,
  ParentTrackedNodeDestroyed,
  TrackedNodeDestroyed,
} from "./errors";

export interface TrackedNodeService<T extends NodeMetadata = NodeMetadata> {
  id: string;
  yogaNode: YogaNode;
  metadata: Ref.Ref<T>;
  zIndex: Ref.Ref<number>;
  properties: Ref.Ref<TrackedNodeProperties>;
  parseWidth: (
    width: number | "auto" | `${number}%`,
  ) => Effect.Effect<number | "auto", TrackedNodeDestroyed | ParentTrackedNodeDestroyed>;
  parseHeight: (
    height: number | "auto" | `${number}%`,
  ) => Effect.Effect<number | "auto", TrackedNodeDestroyed | ParentTrackedNodeDestroyed>;
  setWidth: (
    width: number | "auto" | `${number}%`,
  ) => Effect.Effect<void, TrackedNodeDestroyed | ParentTrackedNodeDestroyed>;
  setHeight: (
    height: number | "auto" | `${number}%`,
  ) => Effect.Effect<void, TrackedNodeDestroyed | ParentTrackedNodeDestroyed>;
  addChild: <U extends NodeMetadata>(
    this: TrackedNodeService<T>,
    childNode: TrackedNodeService<U>,
  ) => Effect.Effect<
    number,
    | TrackedNodeDestroyed
    | ParentTrackedNodeDestroyed
    | FailedToSetTrackedNodeWidthAndHeight
    | FailedToInsertChildTrackNode
    | MissingChildLayoutNode
  >;
  getChildIndex: <U extends NodeMetadata>(childNode: TrackedNodeService<U>) => Effect.Effect<number>;
  removeChild: <U extends NodeMetadata>(childNode: TrackedNodeService<U>) => Effect.Effect<boolean>;
  removeChildAtIndex: (index: number) => Effect.Effect<TrackedNodeService<any> | null>;
  moveChild: <U extends NodeMetadata>(
    childNode: TrackedNodeService<U>,
    newIndex: number,
  ) => Effect.Effect<number, Error>;
  insertChild: (
    this: TrackedNodeService<T>,
  ) => <U extends NodeMetadata>(
    childNode: TrackedNodeService<U>,
    index: number,
  ) => Effect.Effect<number, FailedToSetTrackedNodeWidthAndHeight>;
  getChildCount: () => Effect.Effect<number>;
  getChildAtIndex: <K extends NodeMetadata>(index: number) => Effect.Effect<TrackedNodeService<K> | null>;
  setMetadata: (key: keyof T, value: T[keyof T]) => Effect.Effect<void>;
  getMetadata: (key: keyof T) => Effect.Effect<T[keyof T]>;
  removeMetadata: <K extends keyof T>(key: K) => Effect.Effect<void>;
  hasChild: <U extends NodeMetadata>(childNode: TrackedNodeService<U>) => Effect.Effect<boolean>;
  destroy: (this: TrackedNodeService<T>) => Effect.Effect<void, FailedToFreeYogaNode>;
  getProperty: <T extends keyof TrackedNodeProperties>(prop: T) => Effect.Effect<TrackedNodeProperties[T]>;
  update: <T extends keyof TrackedNodeProperties>(
    prop: T,
    value: TrackedNodeProperties[T] | ((p: TrackedNodeProperties) => TrackedNodeProperties),
  ) => Effect.Effect<void>;
}

export class TrackedNode extends Context.Tag("TrackedNode")<TrackedNode, TrackedNodeService>() {}

export class TrackedNodeCounterClass {
  static id: number = 0;
  constructor() {
    TrackedNodeCounterClass.id = TrackedNodeCounterClass.id + 1;
  }
  next() {
    const current = TrackedNodeCounterClass.id;
    TrackedNodeCounterClass.id = TrackedNodeCounterClass.id + 1;
    return Effect.sync(() => current);
  }
}

export class TrackedNodeCounter extends Context.Tag("TrackedNodeCounter")<
  TrackedNodeCounter,
  TrackedNodeCounterClass
>() {}

export type TrackedNodeProperties = {
  parent: TrackedNodeService<any> | null;
  children: TrackedNodeService<any>[];
  zIndex: number;
  _destroyed: boolean;
  _width: number | "auto" | `${number}%`;
  _height: number | "auto" | `${number}%`;
};

export const makeTrackedNode = Effect.fn(function* <T extends NodeMetadata>(yogaNode: YogaNode, metadata: T = {} as T) {
  // if (!yogaNode) return yield* Effect.fail(new Error("yogaNode is null"));
  const ee = yield* EventEmitter;
  const counter = yield* TrackedNodeCounter;
  const id = `trackednode_${counter.next()}`;
  const properties = yield* Ref.make<TrackedNodeProperties>({
    parent: null,
    children: [],
    zIndex: 0,
    _destroyed: false,
    _width: "auto",
    _height: "auto",
  });
  const getProperty = <T extends keyof TrackedNodeProperties>(prop: T) =>
    Ref.get(properties).pipe(Effect.map((p) => p[prop]));

  const update = <T extends keyof TrackedNodeProperties>(
    prop: T,
    value: TrackedNodeProperties[T] | ((p: TrackedNodeProperties) => TrackedNodeProperties),
  ) => Ref.update(properties, typeof value === "function" ? value : (p) => Object.assign(p, { [prop]: value }));

  const zIndex = yield* Ref.make(0);
  const meta = yield* Ref.make<T>({} as T);

  const parseWidth = Effect.fn(function* (width: number | "auto" | `${number}%`) {
    const des = yield* getProperty("_destroyed");
    if (des) {
      // Fatal: Something is very wrong (debug why we are trying to parse width after destruction)
      return yield* Effect.fail(new TrackedNodeDestroyed());
    }
    if (typeof width === "number" || width === "auto") {
      return width;
    }
    const p = yield* getProperty("parent");
    if (!p) {
      return yogaNode.getComputedWidth();
    }
    const d = yield* p.getProperty("_destroyed");
    if (d) {
      // Fatal: Something is very wrong (debug why we are trying to parse width after destruction)
      return yield* Effect.fail(new ParentTrackedNodeDestroyed());
    }
    return Math.floor((p.yogaNode.getComputedWidth() * parseInt(width)) / 100);
  });

  const parseHeight = Effect.fn(function* (height: number | "auto" | `${number}%`) {
    const des = yield* getProperty("_destroyed");
    if (des) {
      // Fatal: Something is very wrong (debug why we are trying to parse height after destruction)
      return yield* Effect.fail(new TrackedNodeDestroyed());
    }
    if (typeof height === "number" || height === "auto") {
      return height;
    }
    const p = yield* getProperty("parent");
    if (!p) {
      return yogaNode.getComputedHeight();
    }
    const d = yield* p.getProperty("_destroyed");
    if (d) {
      // Fatal: Something is very wrong (debug why we are trying to parse height after destruction)
      return yield* Effect.fail(new ParentTrackedNodeDestroyed());
    }
    return Math.floor((p.yogaNode.getComputedHeight() * parseInt(height)) / 100);
  });

  const setWidth = Effect.fn(function* (width: number | "auto" | `${number}%`) {
    yield* update("_width", width);
    const pw = yield* parseWidth(width);
    if (pw === "auto") {
      yogaNode.setWidthAuto();
    } else {
      yogaNode.setWidth(pw);
    }
  });

  const setHeight = Effect.fn(function* (height: number | "auto" | `${number}%`) {
    yield* update("_height", height);
    const ph = yield* parseHeight(height);
    if (ph === "auto") {
      yogaNode.setHeightAuto();
    } else {
      yogaNode.setHeight(ph);
    }
  });

  const getChildIndex = Effect.fn(function* <U extends NodeMetadata>(childNode: TrackedNodeService<U>) {
    const cs = yield* getProperty("children");
    return cs.indexOf(childNode);
  });

  const removeChild = Effect.fn(function* <U extends NodeMetadata>(childNode: TrackedNodeService<U>) {
    const cs = yield* getProperty("children");
    const index = cs.indexOf(childNode);
    if (index === -1) {
      return false;
    }

    yield* update("children", (p) => {
      const cs = p.children;
      cs.splice(index, 1);
      p.children = cs;
      return p;
    });
    yogaNode.removeChild(childNode.yogaNode);

    yield* childNode.update("parent", null);

    return true;
  });

  const removeChildAtIndex = Effect.fn(function* (index: number) {
    const cs = yield* getProperty("children");
    if (index < 0 || index >= cs.length) {
      return null;
    }

    const childNode = cs[index];

    yield* update("children", (p) => {
      const cs = p.children;
      cs.splice(index, 1);
      p.children = cs;
      return p;
    });
    yogaNode.removeChild(childNode.yogaNode);

    yield* childNode.update("parent", null);

    return childNode;
  });

  const moveChild = Effect.fn(function* <U extends NodeMetadata>(childNode: TrackedNodeService<U>, newIndex: number) {
    const cs = yield* getProperty("children");
    const currentIndex = cs.indexOf(childNode);
    if (currentIndex === -1) {
      return yield* Effect.fail(new Error("Node is not a child of this parent"));
    }

    const boundedNewIndex = Math.max(0, Math.min(newIndex, cs.length - 1));

    if (currentIndex === boundedNewIndex) {
      return currentIndex;
    }
    yield* update("children", (p) => {
      const cs = p.children;
      cs.splice(currentIndex, 1);
      cs.splice(boundedNewIndex, 0, childNode);
      p.children = cs;
      return p;
    });

    yogaNode.removeChild(childNode.yogaNode);
    yogaNode.insertChild(childNode.yogaNode, boundedNewIndex);

    return boundedNewIndex;
  });

  const getChildCount = Effect.fn(function* () {
    const cs = yield* getProperty("children");
    return cs.length;
  });

  const getChildAtIndex = Effect.fn(function* <K extends NodeMetadata>(index: number) {
    const cs = yield* getProperty("children");
    if (index < 0 || index >= cs.length) {
      return null;
    }
    const childs = cs as TrackedNodeService<K>[];
    return childs[index];
  });

  const setMetadata = Effect.fn(function* (key: keyof T, value: T[keyof T]) {
    yield* Ref.update(meta, (m) => {
      m[key] = value;
      return m;
    });
  });

  const getMetadata = Effect.fn(function* (key: keyof T) {
    const m = yield* Ref.get(meta);
    return m[key];
  });

  const removeMetadata = Effect.fn(function* (key: keyof T) {
    yield* Ref.update(meta, (m) => {
      delete m[key];
      return m;
    });
  });

  const hasChild = Effect.fn(function* <U extends NodeMetadata>(childNode: TrackedNodeService<U>) {
    const cs = yield* getProperty("children");
    return cs.includes(childNode);
  });

  let result = {
    id,
    yogaNode,
    metadata: meta,
    zIndex,
    properties,
    parseWidth,
    parseHeight,
    setWidth,
    setHeight,
    getChildIndex,
    removeChild,
    removeChildAtIndex,
    moveChild,
    getChildCount,
    getChildAtIndex,
    setMetadata,
    getMetadata,
    removeMetadata,
    hasChild,
    getProperty,
    update,
    destroy: function (this: TrackedNodeService<T>) {
      const self = this;
      return Effect.gen(function* () {
        const des = yield* getProperty("_destroyed");
        if (des) {
          return;
        }
        const p = yield* getProperty("parent");
        if (p) {
          yield* p.removeChild(self);
        }
        yield* Effect.try({
          try: () => yogaNode.free(),
          catch: (cause) => new FailedToFreeYogaNode({ cause }),
        });
        yield* update("_destroyed", true);
      });
    },
    insertChild: function (this: TrackedNodeService<T>) {
      const self = this;
      return Effect.fn(function* <U extends NodeMetadata>(childNode: TrackedNodeService<U>, index: number) {
        const p = yield* childNode.getProperty("parent");
        if (p) {
          yield* p.removeChild(childNode);
        }

        yield* childNode.update("parent", self);

        const z = yield* Ref.get(zIndex);
        yield* Ref.set(childNode.zIndex, z + 100);
        const cs = yield* getProperty("children");
        const boundedIndex = Math.max(0, Math.min(index, cs.length));

        yield* update("children", (p) => {
          const cs = p.children;
          cs.splice(boundedIndex, 0, childNode);
          p.children = cs;
          return p;
        });

        yogaNode.insertChild(childNode.yogaNode, boundedIndex);

        const wv = yield* getProperty("_width");
        const hv = yield* getProperty("_height");

        yield* Effect.try({
          try: () => {
            yogaNode.setWidth(wv);
            yogaNode.setHeight(hv);
          },
          catch: (e) => new FailedToSetTrackedNodeWidthAndHeight({ cause: e }),
        });

        return boundedIndex;
      });
    },
    addChild: function <U extends NodeMetadata>(this: TrackedNodeService<T>, childNode: TrackedNodeService<U>) {
      const self = this;
      return Effect.gen(function* () {
        const p = yield* childNode.getProperty("parent");
        if (p) {
          yield* p.removeChild(childNode);
        }

        yield* childNode.update("parent", self);

        const index = yield* getProperty("children").pipe(Effect.map((cs) => cs.length));

        yield* update("children", (p) => {
          const cs = p.children;
          cs.push(childNode);
          p.children = cs;
          return p;
        });
        const cs = yield* getProperty("children");

        const zindex = yield* childNode.getProperty("zIndex");
        if (!zindex) {
          const z = yield* self.getProperty("zIndex");
          yield* childNode.update("zIndex", z + 100);
        }
        const wv = yield* childNode.getProperty("_width");
        const w = yield* childNode.parseWidth(wv);
        const hv = yield* childNode.getProperty("_height");
        const h = yield* childNode.parseHeight(hv);

        yield* Effect.try({
          try: () => {
            childNode.yogaNode.setWidth(w);
            childNode.yogaNode.setHeight(h);
          },
          catch: (e) => new FailedToSetTrackedNodeWidthAndHeight({ cause: e }),
        });

        yield* Effect.try({
          try: () => {
            self.yogaNode.insertChild(childNode.yogaNode, index);
          },
          catch: (e) => new FailedToInsertChildTrackNode({ cause: e }),
        });

        return index;
      });
    },
  };

  return result satisfies TrackedNodeService<T>;
});
