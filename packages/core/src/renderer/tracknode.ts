import { FailedToFreeYogaNode, ParentTrackedNodeDestroyed, TrackedNodeDestroyed } from "@opentuee/ui/src/lib/errors";
import { Console, Effect } from "effect";
import Yoga, { type Config, type Node as YogaNode } from "yoga-layout";

interface NodeMetadata {
  [key: string]: any;
}

class TrackedNode<T extends NodeMetadata = NodeMetadata> {
  static idCounter = 0;
  id: number;
  yogaNode: YogaNode;
  metadata: T;
  parent: TrackedNode<any> | null;
  children: TrackedNode<any>[];
  protected _destroyed: boolean = false;

  // Yoga calculates subpixels and the setMeasureFunc throws all over the place when trying to use it,
  // so we make up for rounding errors by calculating the percentual manually.
  protected _width: number | "auto" | `${number}%` = "auto";
  protected _height: number | "auto" | `${number}%` = "auto";

  constructor(yogaNode: YogaNode, metadata: T = {} as T) {
    this.id = TrackedNode.idCounter++;
    this.yogaNode = yogaNode;
    this.metadata = metadata;
    this.parent = null;
    this.children = [];
  }

  parseWidth = (width: number | "auto" | `${number}%`) =>
    Effect.gen(this, function* () {
      if (this._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse width after destruction)
        return yield* Effect.fail(new TrackedNodeDestroyed());
      }
      if (typeof width === "number" || width === "auto") {
        return width;
      }
      if (!this.parent) {
        return this.yogaNode.getComputedWidth();
      }
      if (this.parent._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse width after destruction)
        return yield* Effect.fail(new ParentTrackedNodeDestroyed());
      }
      return Math.floor((this.parent.yogaNode.getComputedWidth() * parseInt(width)) / 100);
    });

  parseHeight = (height: number | "auto" | `${number}%`) =>
    Effect.gen(this, function* () {
      if (this._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse height after destruction)
        return yield* Effect.fail(new TrackedNodeDestroyed());
      }
      if (typeof height === "number" || height === "auto") {
        return height;
      }
      if (!this.parent) {
        return this.yogaNode.getComputedHeight();
      }
      if (this.parent._destroyed) {
        // Fatal: Something is very wrong (debug why we are trying to parse height after destruction)
        return yield* Effect.fail(new ParentTrackedNodeDestroyed());
      }
      return Math.floor((this.parent.yogaNode.getComputedHeight() * parseInt(height)) / 100);
    });

  setWidth = (width: number | "auto" | `${number}%`) =>
    Effect.gen(this, function* () {
      this._width = width;
      const parsedWidth = yield* this.parseWidth(width);
      if (parsedWidth === "auto") {
        this.yogaNode.setWidthAuto();
      } else {
        this.yogaNode.setWidth(parsedWidth);
      }
    });

  setHeight = (height: number | "auto" | `${number}%`) =>
    Effect.gen(this, function* () {
      this._height = height;
      const parsedHeight = yield* this.parseHeight(height);
      if (parsedHeight === "auto") {
        this.yogaNode.setHeightAuto();
      } else {
        this.yogaNode.setHeight(parsedHeight);
      }
    });

  addChild = <U extends NodeMetadata>(childNode: TrackedNode<U>) =>
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
        childNode.yogaNode.setWidth(pw);
        childNode.yogaNode.setHeight(ph);
      } catch (e) {
        console.error("Error setting width and height", e);
      }

      return index;
    });

  getChildIndex = <U extends NodeMetadata>(childNode: TrackedNode<U>) =>
    Effect.gen(this, function* () {
      return this.children.indexOf(childNode);
    });

  removeChild = <U extends NodeMetadata>(childNode: TrackedNode<U>) =>
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

  moveChild = <U extends NodeMetadata>(childNode: TrackedNode<U>, newIndex: number) =>
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

  insertChild = <U extends NodeMetadata>(childNode: TrackedNode<U>, index: number) =>
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

  hasChild = <U extends NodeMetadata>(childNode: TrackedNode<U>) =>
    Effect.gen(this, function* () {
      return this.children.includes(childNode);
    });

  destroy = () =>
    Effect.gen(this, function* () {
      yield* Console.log("Destroying node", this.id);
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

function createTrackedNode<T extends NodeMetadata>(metadata: T = {} as T, yogaConfig?: Config): TrackedNode<T> {
  const yogaNode = Yoga.Node.create(yogaConfig);
  return new TrackedNode<T>(yogaNode, metadata);
}

export { TrackedNode, createTrackedNode };
