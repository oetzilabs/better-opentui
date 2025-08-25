import { Effect, Ref } from "effect";
import { Direction } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { base, type BaseElement } from "./base";

export interface RootElement extends BaseElement<"root", RootElement> {}

export const root = Effect.fn(function* () {
  const b = yield* base<"root", RootElement>("root", {
    selectable: false,
  });

  const calculateLayout = Effect.fn(function* () {
    const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);
    b.layoutNode.yogaNode.calculateLayout(width, height, Direction.LTR);
  });

  b.onMouseEvent = Effect.fn("root.onMouseEvent")(function* (event) {
    yield* Effect.annotateCurrentSpan("root.onMouseEvent", event);
    const es = yield* Ref.get(b.renderables);
    yield* Effect.all(
      es.map((e) => Effect.suspend(() => e.onMouseEvent(event)), {
        concurrency: "unbounded",
        concurrentFinalizers: true,
      }),
    );
  });

  b.onUpdate = Effect.fn(function* () {
    if (b.layoutNode.yogaNode.isDirty()) {
      yield* calculateLayout();
    }
    yield* b.updateFromLayout();

    const es = yield* Ref.get(b.renderables);
    yield* Effect.all(
      es.map((e) => Effect.suspend(() => e.update()), { concurrency: "unbounded", concurrentFinalizers: true }),
    );
  });

  b.render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(
      elements.map((e) => Effect.suspend(() => e.render(buffer, deltaTime))),
      { concurrency: "unbounded", concurrentFinalizers: true },
    );
  });

  b.onResize = Effect.fn(function* (width: number, height: number) {
    yield* b.layoutNode.setWidth(width);
    yield* b.layoutNode.setHeight(height);
  });

  return {
    ...b,
  } as RootElement;
});
