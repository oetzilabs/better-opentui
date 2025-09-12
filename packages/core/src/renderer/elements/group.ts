import { Effect, Ref } from "effect";
import { isMouseDown, isMouseDrag, isMouseUp } from "../../inputs/mouse";
import type { SelectionState } from "../../types";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import type { Binds, ElementOptions } from "./utils";

export interface GroupElement extends BaseElement<"group", GroupElement> {}

export interface GroupOptions extends ElementOptions<"group", GroupElement> {
  onMouseEvent?: BaseElement<"group", GroupElement>["onMouseEvent"];
  onKeyboardEvent?: BaseElement<"group", GroupElement>["onKeyboardEvent"];
}

export const group = Effect.fn(function* (
  binds: Binds,
  options: GroupOptions = {
    visible: true,
    selectable: false,
  },
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));
  const b = yield* base(
    "group",
    binds,
    {
      ...options,
      width: options.width ?? "auto",
      height: options.height ?? "auto",
      visible: true,
      selectable: false,
      position: PositionRelative.make(1),
    },
    parentElement,
  );

  b.onMouseEvent = Effect.fn("group.onMouseEvent")(function* (event) {
    yield* Effect.annotateCurrentSpan("group.onMouseEvent", event);
    const fn = options.onMouseEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);

    if (event.source) {
      if (event.source.id === b.id && !event.defaultPrevented) {
        if (isMouseDown(event.type) || isMouseDrag(event.type) || isMouseUp(event.type)) {
          yield* event.source.setFocused(true);
        } else {
          yield* event.source.setFocused(false);
        }
        // Note: processMouseEvent already handles recursive processing of children
        // No need to do it here to avoid double-processing
      }
    }
  });

  b.onResize = Effect.fn(function* (width: number, height: number) {
    const children = yield* Ref.get(b.renderables);
    yield* Effect.all(
      children.map((child) => Effect.suspend(() => child.onResize(width, height))),
      { concurrency: 10 },
    );
  });

  b.onUpdate = Effect.fn(function* (self) {
    // const ctx = yield* Ref.get(binds.context);
    // const [loc, dims] = yield* Effect.all([Ref.get(self.location), Ref.get(self.dimensions)]);
    // yield* ctx.addToHitGrid(loc.x, loc.y, dims.widthValue, dims.heightValue, self.num);

    const children = yield* Ref.get(b.renderables);
    yield* Effect.all(
      children.map((child) => Effect.suspend(() => child.onUpdate(child))),
      { concurrency: 10 },
    );
  });

  const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
    return false;
  });

  const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
    return false;
  });

  const destroy = Effect.fn(function* () {
    const elements = yield* Ref.get(b.renderables);
    yield* Effect.all(
      elements.map((element) => Effect.suspend(() => element.destroy())),
      { concurrency: 10 },
    );
    yield* b.destroy();
  });

  const onResize = Effect.fn(function* (width: number, height: number) {
    // check if the group width and height are a percentage and if so, update it accordingly
    const { widthValue: pWidth, heightValue: pHeight } = yield* Ref.get(parentElement.dimensions);
    const { width: oldWidth, height: oldHeight } = yield* Ref.get(b.dimensions);

    if (typeof oldWidth === "string") {
      if (oldWidth !== "auto" && oldWidth.endsWith("%")) {
        const newWidth = Math.floor(pWidth * (parseFloat(oldWidth.slice(0, -1)) / 100));
        yield* Ref.update(b.dimensions, (d) => ({
          ...d,
          widthValue: newWidth,
        }));
      } else {
        // do nothing?
        const cw = oldWidth as "auto" | number;
        yield* Ref.update(b.dimensions, (d) => ({
          ...d,
          widthValue: width,
        }));
        // if (cw === "auto") {
        // } else {
        // }
      }
    }
    if (typeof oldHeight === "string") {
      if (oldHeight !== "auto" && oldHeight.endsWith("%")) {
        const newHeight = Math.floor(pHeight * (parseFloat(oldHeight.slice(0, -1)) / 100));
        yield* Ref.update(b.dimensions, (d) => ({
          ...d,
          heightValue: newHeight,
        }));
      } else {
        const ch = oldHeight as "auto" | number;
        yield* Ref.update(b.dimensions, (d) => ({
          ...d,
          heightValue: height,
        }));
        // console.debug("height", ch, height);
        // if (ch === "auto") {
        // } else {
        // }
      }
    }

    // yield* Ref.update(b.dimensions, (d) => ({
    //   ...d,
    //   widthValue: width,
    //   heightValue: height,
    // }));
    const children = yield* Ref.get(b.renderables);
    yield* Effect.all(
      children.map((child) => Effect.suspend(() => child.onResize(width, height))),
      { concurrency: 10 },
    );
  });

  return {
    ...b,
    onResize,
    shouldStartSelection,
    onSelectionChanged,
    destroy,
  } satisfies GroupElement;
});
