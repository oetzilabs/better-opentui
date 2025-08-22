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

  const getRenderable = Effect.fn(function* (id: number) {
    const elements = yield* Ref.get(b.renderables);
    return elements.find((e) => e.id === id);
  });

  const setVisible = Effect.fn(function* (value: boolean) {
    yield* Ref.set(b.visible, value);
  });

  const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
    const elements = yield* Ref.get(b.renderables);
    return yield* Effect.all(elements.map((element) => Effect.suspend(() => element.shouldStartSelection(x, y)))).pipe(
      Effect.map((shouldStarts) => shouldStarts.some((shouldStart) => shouldStart)),
    );
  });

  const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null, width: number, height: number) {
    const elements = yield* Ref.get(b.renderables);
    return yield* Effect.all(
      elements.map((element) => Effect.suspend(() => element.onSelectionChanged(selection, width, height))),
    ).pipe(Effect.map((changeds) => changeds.some((changed) => changed)));
  });

  const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(elements.map((element) => Effect.suspend(() => element.processMouseEvent(event))));
  });

  const processKeyboardEvent = Effect.fn(function* (event: KeyboardEvent) {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(elements.map((element) => Effect.suspend(() => element.processKeyboardEvent(event))));
  });

  const destroy = Effect.fn(function* () {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(
      elements.map((element) => Effect.suspend(() => element.destroy())),
      { concurrency: "unbounded" },
    );
    yield* b.destroy();
  });

  return {
    ...b,
    resize,
    getRenderable,
    setVisible,
    shouldStartSelection,
    onSelectionChanged,
    processMouseEvent,
    processKeyboardEvent,
    destroy,
  } as const;
});
