import { Effect } from "effect";
import Yoga, { type Config, type Node as YogaNode } from "yoga-layout";
import { FailedToFreeYogaNode, ParentTrackedNodeDestroyed, TrackedNodeDestroyed } from "./errors";

interface NodeMetadata {
  [key: string]: any;
}

class TrackedNode<EType extends string, T extends NodeMetadata = NodeMetadata> {
  static idCounter = 0;
  id: number;
  yogaNode: YogaNode;
  metadata: T;
  parent: TrackedNode<any, any> | null;
  children: TrackedNode<any, any>[];
  protected _destroyed: boolean = false;
  protected _type: EType;

  // Yoga calculates subpixels and the setMeasureFunc throws all over the place when trying to use it,
  // so we make up for rounding errors by calculating the percentual manually.
  protected _width: number | "auto" | `${number}%` = "auto";
  protected _height: number | "auto" | `${number}%` = "auto";

  constructor(type: EType, yogaNode: YogaNode, metadata: T = {} as T, parent: TrackedNode<any, any> | null = null) {
    this._type = type;
    this.id = TrackedNode.idCounter++;
    this.yogaNode = yogaNode;
    this.metadata = metadata;
    this.parent = parent;
    this.children = [];
  }

  parseWidth: (
    width: number | "auto" | `${number}%`,
  ) => Effect.Effect<number | "auto", TrackedNodeDestroyed | ParentTrackedNodeDestroyed, never> = (
    width: number | "auto" | `${number}%`,
  ) =>
    Effect.gen(this, function* () {
      if (this._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse width after destruction)
        return yield* Effect.fail(new TrackedNodeDestroyed());
      }
      if (typeof width === "number" || width === "auto") {
        return width;
      }
      if (!this.parent) {
        if (typeof this._width === "number") {
          return this._width;
        }
        const yogaWidth = this.yogaNode.getComputedWidth();
        return yogaWidth;
      }
      if (this.parent._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse width after destruction)
        return yield* Effect.fail(new ParentTrackedNodeDestroyed());
      }
      let pcw = yield* Effect.suspend(() => this.parent!.parseWidth(width));
      if (pcw === "auto") {
        return pcw;
      }
      const parsedInt = parseInt(width);
      if (Number.isNaN(pcw)) {
        pcw = 1;
      }
      return Math.floor((pcw * parsedInt) / 100);
    });

  parseHeight: (
    height: number | "auto" | `${number}%`,
  ) => Effect.Effect<number | "auto", TrackedNodeDestroyed | ParentTrackedNodeDestroyed, never> = (
    height: number | "auto" | `${number}%`,
  ) =>
    Effect.gen(this, function* () {
      if (this._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse height after destruction)
        return yield* Effect.fail(new TrackedNodeDestroyed());
      }
      if (typeof height === "number" || height === "auto") {
        return height;
      }
      if (!this.parent) {
        if (typeof this._height === "number") {
          return this._height;
        }
        const yogaHeight = this.yogaNode.getComputedHeight();
        return yogaHeight;
      }
      if (this.parent._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse height after destruction)
        return yield* Effect.fail(new ParentTrackedNodeDestroyed());
      }

      let pch = yield* Effect.suspend(() => this.parent!.parseHeight(height));
      if (pch === "auto") {
        return pch;
      }
      const parsedInt = parseInt(height);
      if (Number.isNaN(pch)) {
        pch = 1;
      }
      return Math.floor((pch * parsedInt) / 100);
    });

  setWidth = (width: number | "auto" | `${number}%`) =>
    Effect.gen(this, function* () {
      this._width = width;
      if (width === "auto") {
        this.yogaNode.setWidthAuto();
      } else {
        if (typeof width === "string" && width.endsWith("%")) {
          const pw = parseInt(width.slice(0, -1));
          if (Number.isNaN(pw)) {
            yield* Effect.fail(new Error(`Failed to set width for ${this._type}`));
          }
          yield* Effect.try({
            try: () => this.yogaNode.setWidthPercent(pw),
            catch: (e) => new Error(`Failed to set width for ${this._type}`),
          });
        } else {
          const parsedWidth = yield* this.parseWidth(width);
          yield* Effect.try({
            try: () => this.yogaNode.setWidth(parsedWidth),
            catch: (e) => new Error(`Failed to set width for ${this._type}`),
          });
        }
      }
    });

  setHeight = (height: number | "auto" | `${number}%`) =>
    Effect.gen(this, function* () {
      this._height = height;
      if (height === "auto") {
        this.yogaNode.setHeightAuto();
      } else {
        if (typeof height === "string" && height.endsWith("%")) {
          const ph = parseInt(height.slice(0, -1));
          if (Number.isNaN(ph)) {
            yield* Effect.fail(new Error(`Failed to set height for ${this._type}`));
          }
          yield* Effect.try({
            try: () => this.yogaNode.setHeightPercent(ph),
            catch: (e) => new Error(`Failed to set width for ${this._type}`),
          });
        } else {
          const parsedHeight = yield* this.parseHeight(height);
          yield* Effect.try({
            try: () => this.yogaNode.setHeight(parsedHeight),
            catch: (e) => new Error(`Failed to set height for ${this._type}`),
          });
        }
      }
    });

  addChild = <U extends NodeMetadata>(childNode: TrackedNode<any, U>) =>
    Effect.gen(this, function* () {
      if (childNode.parent) {
        yield* childNode.parent.removeChild(childNode);
      }

      childNode.parent = this;

      const index = this.children.length;
      this.children.push(childNode);
      this.yogaNode.insertChild(childNode.yogaNode, index);

      try {
        const pw = yield* childNode.parseWidth(childNode._width);
        const ph = yield* childNode.parseHeight(childNode._height);
        if (pw === "auto") {
          childNode.yogaNode.setWidthAuto();
        } else {
          childNode.yogaNode.setWidth(pw);
        }
        if (ph === "auto") {
          childNode.yogaNode.setHeightAuto();
        } else {
          childNode.yogaNode.setHeight(ph);
        }
      } catch (e) {
        console.error("Error setting width and height", e);
      }

      return index;
    });

  getChildIndex = <U extends NodeMetadata>(childNode: TrackedNode<any, U>) =>
    Effect.gen(this, function* () {
      return this.children.indexOf(childNode);
    });

  removeChild = <U extends NodeMetadata>(childNode: TrackedNode<any, U>) =>
    Effect.gen(this, function* () {
      const index = this.children.indexOf(childNode);
      if (index === -1) {
        return false;
      }

      this.children.splice(index, 1);
      this.yogaNode.removeChild(childNode.yogaNode);

      childNode.parent = null;

      return true;
    });

  removeChildAtIndex = (index: number) =>
    Effect.gen(this, function* () {
      if (index < 0 || index >= this.children.length) {
        return null;
      }

      const childNode = this.children[index];

      this.children.splice(index, 1);
      this.yogaNode.removeChild(childNode.yogaNode);

      childNode.parent = null;

      return childNode;
    });

  moveChild = <U extends NodeMetadata>(childNode: TrackedNode<any, U>, newIndex: number) =>
    Effect.gen(this, function* () {
      const currentIndex = this.children.indexOf(childNode);
      if (currentIndex === -1) {
        return yield* Effect.fail(new Error("Node is not a child of this parent"));
      }

      const boundedNewIndex = Math.max(0, Math.min(newIndex, this.children.length - 1));

      if (currentIndex === boundedNewIndex) {
        return currentIndex;
      }

      this.children.splice(currentIndex, 1);
      this.children.splice(boundedNewIndex, 0, childNode);

      this.yogaNode.removeChild(childNode.yogaNode);
      this.yogaNode.insertChild(childNode.yogaNode, boundedNewIndex);

      return boundedNewIndex;
    });

  insertChild = <U extends NodeMetadata>(childNode: TrackedNode<any, U>, index: number) =>
    Effect.gen(this, function* () {
      if (childNode.parent) {
        yield* childNode.parent.removeChild(childNode);
      }

      childNode.parent = this;
      const boundedIndex = Math.max(0, Math.min(index, this.children.length));

      this.children.splice(boundedIndex, 0, childNode);
      this.yogaNode.insertChild(childNode.yogaNode, boundedIndex);

      const pw = yield* childNode.parseWidth(childNode._width);
      const ph = yield* childNode.parseHeight(childNode._height);
      try {
        childNode.yogaNode.setWidth(pw);
        childNode.yogaNode.setHeight(ph);
      } catch (e) {
        console.error("Error setting width and height", e);
      }

      return boundedIndex;
    });

  getChildCount = () =>
    Effect.gen(this, function* () {
      return this.children.length;
    });

  getChildAtIndex = (index: number) =>
    Effect.gen(this, function* () {
      if (index < 0 || index >= this.children.length) {
        return null;
      }
      return this.children[index];
    });

  setMetadata = (key: keyof T, value: T[keyof T]) =>
    Effect.gen(this, function* () {
      this.metadata[key] = value;
    });

  getMetadata = <K extends keyof T>(key: K) =>
    Effect.gen(this, function* () {
      return this.metadata[key];
    });

  removeMetadata = <K extends keyof T>(key: K) =>
    Effect.gen(this, function* () {
      delete this.metadata[key];
    });

  hasChild = <U extends NodeMetadata>(childNode: TrackedNode<any, U>) =>
    Effect.gen(this, function* () {
      return this.children.includes(childNode);
    });

  destroy = () =>
    Effect.gen(this, function* () {
      if (this._destroyed) {
        return;
      }
      if (this.parent) {
        yield* this.parent.removeChild(this);
      }
      yield* Effect.try({
        try: () => this.yogaNode.free(),
        catch: (e) => new FailedToFreeYogaNode({ cause: e }),
      });

      this._destroyed = true;
    });
}

function createTrackedNode<EType extends string, T extends NodeMetadata>(
  type: EType,
  metadata: T = {} as T,
  yogaConfig?: Config,
  parent: TrackedNode<EType, T> | null = null,
): TrackedNode<EType, T> {
  const yogaNode = Yoga.Node.create(yogaConfig);
  return new TrackedNode<EType, T>(type, yogaNode, metadata, parent);
}

export { createTrackedNode, TrackedNode };
