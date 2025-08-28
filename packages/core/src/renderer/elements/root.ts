import { Effect, Ref } from "effect";
import { Direction } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import { base, type BaseElement } from "./base";

export interface RootElement extends BaseElement<"root", RootElement> {}

export const root = Effect.fn(function* () {
  const b = yield* base<"root", RootElement>("root", {
    selectable: false,
    zIndex: 0,
  });

  const calculateLayout = Effect.fn(function* () {
    const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);
    b.layoutNode.yogaNode.calculateLayout(width, height, Direction.LTR);
  });

  b.onMouseEvent = Effect.fn("root.onMouseEvent")(function* (event) {
    yield* Effect.annotateCurrentSpan("root.onMouseEvent", event);
    // Note: processMouseEvent already handles recursive processing of children
    // No need to do it here to avoid double-processing
  });

  b.onKeyboardEvent = Effect.fn("root.onKeyboardEvent")(function* (event) {
    yield* Effect.annotateCurrentSpan("root.onKeyboardEvent", event);
    // Note: processKeyboardEvent already handles recursive processing of children
    // No need to do it here to avoid double-processing
  });

  b.onUpdate = Effect.fn(function* () {
    if (b.layoutNode.yogaNode.isDirty()) {
      yield* calculateLayout();
    }
    yield* b.updateFromLayout();

    const es = yield* Ref.get(b.renderables);
    yield* Effect.all(es.map((e) => Effect.suspend(() => e.update()), { concurrency: 10, concurrentFinalizers: true }));
  });

  b.onResize = Effect.fn(function* (width: number, height: number) {
    yield* b.layoutNode.setWidth(width);
    yield* b.layoutNode.setHeight(height);

    const es = yield* Ref.get(b.renderables);
    yield* Effect.all(
      es.map((e) => Effect.suspend(() => e.onResize(width, height)), {
        concurrency: 10,
        concurrentFinalizers: true,
      }),
    );
  });

  return {
    ...b,
  } satisfies RootElement;
});
