import { Effect, Ref } from "effect";
import type { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, type Input } from "../../colors";
import { parseColor } from "../../colors/utils";
import type { Collection } from "../../errors";
import { Library } from "../../lib";
import { DEFAULT_THEME } from "../../themes";
import { FlexColumn } from "../utils/flex";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import type { Binds, ColorsThemeRecord, ElementOptions } from "./utils";

export type StatusBarArea = "left" | "center" | "right";

export interface StatusBarElement<ST extends string = "status-bar">
  extends BaseElement<"status-bar", StatusBarElement<ST>> {
  addElement: (area: StatusBarArea, element: BaseElement<any, any>) => Effect.Effect<void, Collection, Library>;
  removeElement: (area: StatusBarArea, element: BaseElement<any, any>) => Effect.Effect<void, Collection, Library>;
  getAreaElements: (area: StatusBarArea) => Effect.Effect<BaseElement<any, any>[], Collection, Library>;
  clearArea: (area: StatusBarArea) => Effect.Effect<void, Collection, Library>;
}

export type StatusBarOptions<ST extends string = "status-bar"> = ElementOptions<ST, StatusBarElement<ST>> & {
  colors?: FrameBufferOptions<StatusBarElement<ST>>["colors"] & {
    bg?: Input;
    fg?: Input;
  };
};

export const statusBar = Effect.fn(function* <ST extends string = "status-bar">(
  binds: Binds,
  options: StatusBarOptions<ST> = {
    colors: {
      bg: DEFAULT_THEME.elements["status-bar"].bg,
      fg: DEFAULT_THEME.elements["status-bar"].fg,
    },
  },
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  const b = yield* base<"status-bar", StatusBarElement<ST>>(
    "status-bar",
    binds,
    {
      ...options,
      position: PositionRelative.make(1),
      flexDirection: FlexColumn.make(0),
      width: "100%",
      height: 1,
      left: 0,
      top: 0,
      selectable: false,
      ...(options.colors
        ? {
            colors: {
              bg: options.colors.bg ?? DEFAULT_THEME.elements["status-bar"].bg,
              fg: options.colors.fg ?? DEFAULT_THEME.elements["status-bar"].fg,
            },
          }
        : {}),
    },
    parentElement,
  );

  const framebuffer_buffer = yield* b.createFrameBuffer();

  // Area-based element storage (arrays)
  const areaElements = yield* Ref.make<Record<StatusBarArea, BaseElement<any, any>[]>>({
    left: [],
    center: [],
    right: [],
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* b.destroy();
  });

  const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
    const v = yield* Ref.get(b.visible);
    if (!v) return;
    //only render the background
    const loc = yield* Ref.get(b.location);
    const colors = yield* Ref.get(b.colors);
    const bgColor = yield* parseColor(colors.bg);
    yield* framebuffer_buffer.clear(bgColor);
    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
    yield* b.doRender()(buffer, deltaTime);
  });

  const onUpdate = Effect.fn(function* (self) {
    const fn = options.onUpdate ?? Effect.fn(function* (self) {});
    yield* fn(self);

    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);

    const v = yield* Ref.get(b.visible);
    if (!v) return;

    const { left, center, right } = yield* Ref.get(areaElements);

    // left:
    let leftX = 0;
    for (const element of left) {
      const { widthValue: width } = yield* Ref.get(element.dimensions);
      yield* Ref.update(element.location, (loc) => ({ ...loc, x: leftX, y: y }));
      leftX += width;
    }

    // center:
    const totalCenterWidth = yield* Effect.all(center.map((e) => Ref.get(e.dimensions))).pipe(
      Effect.map((dims) =>
        dims.reduce((width, element) => {
          return width + element.widthValue;
        }, -1),
      ),
    );
    let centerX = Math.floor((w - totalCenterWidth) / 2);
    for (const element of center) {
      const elementDims = yield* Ref.get(element.dimensions);
      yield* Ref.update(element.location, (loc) => ({ ...loc, x: centerX, y: y }));
      centerX += elementDims.widthValue;
    }

    // right:
    let rightX = w;
    for (const element of right) {
      const { widthValue: width } = yield* Ref.get(element.dimensions);
      yield* Ref.update(element.location, (loc) => ({ ...loc, x: rightX - width, y: y }));
      rightX -= width;
    }
  });

  // Area management methods
  const addElement = Effect.fn(function* (area: StatusBarArea, element: BaseElement<any, any>) {
    yield* Ref.update(areaElements, (elements) => ({
      ...elements,
      [area]: [...elements[area], element],
    }));
    yield* b.add(element);
  });

  const removeElement = Effect.fn(function* (area: StatusBarArea, element: BaseElement<any, any>) {
    if (element) {
      // Remove specific element
      yield* Ref.update(areaElements, (elements) => ({
        ...elements,
        [area]: elements[area].filter((e) => e !== element),
      }));
    }
    yield* element.destroy();
    yield* b.remove(element);
  });

  const getAreaElements = Effect.fn(function* (area: StatusBarArea) {
    const elements = yield* Ref.get(areaElements);
    return elements[area];
  });

  const clearArea = Effect.fn(function* (area: StatusBarArea) {
    const elements = yield* Ref.get(areaElements);
    for (const element of elements[area]) {
      yield* element.destroy();
    }
    yield* Ref.update(areaElements, (elements) => ({
      ...elements,
      [area]: [],
    }));

    yield* Ref.set(b.renderables, []);
  });

  return {
    ...b,
    onUpdate,
    render,
    addElement,
    removeElement,
    getAreaElements,
    clearArea,
    destroy,
  } satisfies StatusBarElement<ST>;
});
