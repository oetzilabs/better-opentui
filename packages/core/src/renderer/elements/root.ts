import { Effect, Ref } from "effect";
import { Direction } from "yoga-layout";
import { base, type BaseElement } from "./base";
import type { Binds } from "./utils";

export interface RootElement extends BaseElement<"root", RootElement> {}

export const root = Effect.fn(function* (binds: Binds, initial: { width: number; height: number }) {
  const b = yield* base<"root", RootElement>("root", binds, {
    visible: true,
    selectable: false,
    zIndex: 0,
    width: initial.width,
    height: initial.height,
  });
  yield* b.setupYogaProperties(initial);

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

  b.onResize = Effect.fn(function* (width: number, height: number) {
    yield* Ref.update(b.dimensions, (d) => ({
      ...d,
      widthValue: width,
      heightValue: height,
    }));
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
