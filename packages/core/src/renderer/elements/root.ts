import { Effect, Ref } from "effect";
import { Direction } from "yoga-layout";
import { OptimizedBuffer } from "../../buffer/optimized";
import type { KeyboardEvent } from "../../events/keyboard";
import type { MouseEvent } from "../../events/mouse";
import type { SelectionState } from "../../types";
import { base } from "./base";

export const root = Effect.fn(function* () {
  const b = yield* base("root");

  const calculateLayout = Effect.fn(function* () {
    const { widthValue: width, heightValue: height } = yield* Ref.get(b.dimensions);
    b.layoutNode.yogaNode.calculateLayout(width, height, Direction.LTR);
  });

  b.update = Effect.fn(function* () {
    if (b.layoutNode.yogaNode.isDirty()) {
      yield* calculateLayout();
    }
    yield* b.updateFromLayout();
  });

  b.render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(
      elements.map((e) => Effect.suspend(() => e.render(buffer, deltaTime))),
      { concurrency: "unbounded" },
    );
  });

  const resize = Effect.fn(function* (width: number, height: number) {
    yield* b.layoutNode.setWidth(width);
    yield* b.layoutNode.setHeight(height);
  });

  return {
    ...b,
    resize,
  } as const;
});
