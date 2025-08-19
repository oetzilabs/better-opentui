import type { TextOptions } from "@opentuee/ui/src/components/text";
import { Console, Effect, Ref } from "effect";
import type { OptimizedBuffer } from "../buffer/optimized";
import { TextBuffer } from "../buffer/text";
import * as Colors from "../colors";
import type { RendererFailedToAddToHitGrid, RendererFailedToDrawTextBuffer } from "../errors";
import type { MouseEvent } from "../events/mouse";
import type { SelectionState } from "../types";
import { Library, LibraryLive } from "../zig";
import { createTrackedNode } from "./tracknode";
import { PositionAbsolute } from "./utils/position";

export interface RenderContextInterface {
  addToHitGrid: (
    x: number,
    y: number,
    width: number,
    height: number,
    id: number,
  ) => Effect.Effect<void, RendererFailedToAddToHitGrid, Library>;
  width: () => Effect.Effect<number>;
  height: () => Effect.Effect<number>;
  needsUpdate: () => Effect.Effect<void>;
}

class ElementCounter extends Effect.Service<ElementCounter>()("ElementCounter", {
  dependencies: [LibraryLive],
  effect: Effect.gen(function* () {
    const counter = yield* Ref.make(0);
    return {
      getNext: Effect.fn(function* () {
        return yield* Ref.updateAndGet(counter, (c) => c + 1);
      }),
    };
  }),
}) {}

export const ElementCounterLive = ElementCounter.Default;

export class Elements extends Effect.Service<Elements>()("Elements", {
  dependencies: [LibraryLive, ElementCounterLive],
  effect: Effect.gen(function* () {
    const lib = yield* Library;
    const counter = yield* ElementCounter;
    const cachedGlobalSelection = yield* Ref.make<SelectionState | null>(null);

    const context = yield* Ref.make<RenderContextInterface>({
      width: Effect.fn(function* () {
        return 0;
      }),
      height: Effect.fn(function* () {
        return 0;
      }),
      addToHitGrid: Effect.fn(function* (x: number, y: number, width: number, height: number, id: number) {}),
      needsUpdate: Effect.fn(function* () {}),
    });

    const updateContext = Effect.fn(function* (ctx: RenderContextInterface) {
      yield* Ref.set(context, ctx);
    });

    const root = Effect.fn(function* (ctx: RenderContextInterface) {
      yield* Ref.set(context, ctx);
      const id = yield* counter.getNext();
      const selectable = yield* Ref.make(false);
      const elementsHolder = yield* Ref.make<Element[]>([]);

      const parent = yield* Ref.make<Element | null>(null);

      const add = Effect.fn(function* (container: Element, index?: number) {
        if (index === undefined) {
          const cs = yield* Ref.get(elementsHolder);
          index = cs.length;
        }

        yield* Ref.update(elementsHolder, (cs) => {
          cs.splice(index, 0, container);
          return cs;
        });
      });

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        const elements = yield* Ref.get(elementsHolder);
        yield* Effect.all(elements.map((e) => Effect.suspend(() => e.render(buffer, deltaTime))));
      });
      const layoutNode = createTrackedNode();

      const resize = Effect.fn(function* (width: number, height: number) {
        yield* layoutNode.setWidth(width);
        yield* layoutNode.setHeight(height);
      });

      const getRenderable = Effect.fn(function* (id: number) {
        const elements = yield* Ref.get(elementsHolder);
        return elements.find((e) => e.id === id);
      });

      return {
        id,
        render,
        resize,
        parent,
        getRenderable,
        add,
        selectable,
      } as const;
    });

    const group = Effect.fn(function* () {
      const type = "group" as const;
      const id = yield* counter.getNext();
      const visible = yield* Ref.make(true);
      const groupElements = yield* Ref.make<Element[]>([]);
      const parent = yield* Ref.make<Element | null>(null);
      const selectable = yield* Ref.make(true);

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        const v = yield* Ref.get(visible);
        if (!v) return;
        const elements = yield* Ref.get(groupElements);
        yield* Effect.all(elements.map((e) => Effect.suspend(() => e.render(buffer, deltaTime))));
      });

      const setVisible = Effect.fn(function* (value: boolean) {
        yield* Ref.set(visible, value);
      });

      const add = Effect.fn(function* (container: Element, index?: number) {
        if (index === undefined) {
          const cs = yield* Ref.get(groupElements);
          index = cs.length;
        }
        yield* Ref.update(groupElements, (cs) => {
          cs.splice(index, 0, container);
          return cs;
        });
      });
      const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});

      const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
        yield* onMouseEvent(event);
        const p = yield* Ref.get(parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processMouseEvent(event));
        }
      });

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        return false;
      });

      const onSelectionChanged = Effect.fn(function* (selection: SelectionState | null) {
        return false;
      });

      const setContent = Effect.fn(function* (value: Element) {
        yield* Ref.set(groupElements, [value]);
      });

      return {
        id,
        type,
        visible,
        setVisible,
        render,
        add,
        parent,
        selectable,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        setContent,
      };
    });

    const text = Effect.fn(function* (content: string, options: TextOptions = {}) {
      const id = yield* counter.getNext();
      const visible = yield* Ref.make(true);
      const type = "text" as const;
      const _content = yield* Ref.make(content);
      const location = yield* Ref.make({ x: 0, y: 0 });
      const dimensions = yield* Ref.make({ width: 0, height: 0 });
      const tba = yield* lib.createTextBuffer(content.length);
      const selectable = yield* Ref.make(true);
      const parent = yield* Ref.make<Element | null>(null);
      const textBuffer = yield* Ref.make(new TextBuffer(tba.bufferPtr, tba.buffers, content.length));

      const render = Effect.fn(function* (buffer: OptimizedBuffer, deltaTime: number) {
        const v = yield* Ref.get(visible);
        if (!v) return;
        const tb = yield* Ref.get(textBuffer);
        const loc = yield* Ref.get(location);
        const dim = yield* Ref.get(dimensions);
        const clipRect = {
          x: loc.x,
          y: loc.y,
          width: dim.width,
          height: dim.height,
        };
        yield* lib.bufferDrawTextBuffer(buffer.ptr, tb.ptr, loc.x, loc.y, clipRect);
      });

      const setVisible = Effect.fn(function* (value: boolean) {
        yield* Ref.set(visible, value);
      });

      const colors = yield* Ref.make({
        fg: options.fg ?? Colors.White.make("#FFFFFF"),
        bg: options.bg ?? Colors.Black.make("#000000"),
      });

      const localSelection = yield* Ref.make<{ start: number; end: number } | null>(null);
      const lineInfo = yield* Ref.make<{ lineStarts: number[]; lineWidths: number[] }>({
        lineStarts: [],
        lineWidths: [],
      });

      const onMouseEvent = Effect.fn(function* (event: MouseEvent) {});

      const processMouseEvent = Effect.fn(function* (event: MouseEvent) {
        yield* onMouseEvent(event);
        const p = yield* Ref.get(parent);
        if (p && !event.defaultPrevented) {
          yield* Effect.suspend(() => p.processMouseEvent(event));
        }
      });

      const add = Effect.fn(function* (container: Element, index?: number) {});

      const setContent = Effect.fn(function* (value: string) {
        yield* Ref.set(_content, value);
        // const tba = yield* lib.createTextBuffer(value.length);
        // const oldTextBuffer = yield* Ref.get(textBuffer);
        // yield* oldTextBuffer.destroy();
        // yield* Ref.set(textBuffer, new TextBuffer(tba.bufferPtr, tba.buffers, value.length));
      });

      const shouldStartSelection = Effect.fn(function* (x: number, y: number) {
        const p = yield* Ref.get(location);
        const { width, height } = yield* Ref.get(dimensions);
        const localX = x - p.x;
        const localY = y - p.y;
        return localX >= 0 && localX < width && localY >= 0 && localY < height;
      });

      const onSelectionChanged = Effect.fn(function* (
        selection: SelectionState | null,
        width: number,
        height: number = 1,
      ) {
        const previousSelection = yield* Ref.get(localSelection);
        if (!selection?.isActive) {
          yield* Ref.set(localSelection, null);
          return previousSelection !== null;
        }
        const p = yield* Ref.get(location);
        const myEndY = p.y + height - 1;

        if (myEndY < selection.anchor.y || p.y > selection.focus.y) {
          yield* Ref.set(localSelection, null);
          return previousSelection !== null;
        }

        if (height === 1) {
          const textLength = content.length;

          // Entire line is selected
          if (p.y > selection.anchor.y && p.y < selection.focus.y) {
            yield* Ref.set(localSelection, { start: 0, end: textLength });
          }

          // Selection spans this single line
          if (p.y === selection.anchor.y && p.y === selection.focus.y) {
            const start = Math.max(0, Math.min(selection.anchor.x - p.x, textLength));
            const end = Math.max(0, Math.min(selection.focus.x - p.x, textLength));
            yield* Ref.set(localSelection, start < end ? { start, end } : null);
          }

          // Line is at start of selection
          if (p.y === selection.anchor.y) {
            const start = Math.max(0, Math.min(selection.anchor.x - p.x, textLength));
            yield* Ref.set(localSelection, start < textLength ? { start, end: textLength } : null);
          }

          // Line is at end of selection
          if (p.y === selection.focus.y) {
            const end = Math.max(0, Math.min(selection.focus.x - p.x, textLength));
            yield* Ref.set(localSelection, end > 0 ? { start: 0, end } : null);
          }
        } else {
          const textLength = content.length;
          const li = yield* Ref.get(lineInfo);

          let selectionStart: number | null = null;
          let selectionEnd: number | null = null;

          for (let i = 0; i < li.lineStarts.length; i++) {
            const lineY = p.y + i;

            if (lineY < selection.anchor.y || lineY > selection.focus.y) continue;

            const lineStart = li.lineStarts[i];
            const lineEnd = i < li.lineStarts.length - 1 ? li.lineStarts[i + 1] - 1 : textLength;
            const lineWidth = li.lineWidths[i];

            if (lineY > selection.anchor.y && lineY < selection.focus.y) {
              // Entire line is selected
              if (selectionStart === null) selectionStart = lineStart;
              selectionEnd = lineEnd;
            } else if (lineY === selection.anchor.y && lineY === selection.focus.y) {
              // Selection starts and ends on this line
              const localStartX = Math.max(0, Math.min(selection.anchor.x - p.x, lineWidth));
              const localEndX = Math.max(0, Math.min(selection.focus.x - p.x, lineWidth));
              if (localStartX < localEndX) {
                selectionStart = lineStart + localStartX;
                selectionEnd = lineStart + localEndX;
              }
            } else if (lineY === selection.anchor.y) {
              // Selection starts on this line
              const localStartX = Math.max(0, Math.min(selection.anchor.x - p.x, lineWidth));
              if (localStartX < lineWidth) {
                selectionStart = lineStart + localStartX;
                selectionEnd = lineEnd;
              }
            } else if (lineY === selection.focus.y) {
              // Selection ends on this line
              const localEndX = Math.max(0, Math.min(selection.focus.x - p.x, lineWidth));
              if (localEndX > 0) {
                if (selectionStart === null) selectionStart = lineStart;
                selectionEnd = lineStart + localEndX;
              }
            }
          }
        }

        const ls = yield* Ref.get(localSelection);
        return (
          (ls !== null) !== (previousSelection !== null) ||
          ls?.start !== previousSelection?.start ||
          ls?.end !== previousSelection?.end
        );
      });

      return {
        id,
        type,
        visible,
        setVisible,
        render,
        add,
        parent,
        selectable,
        shouldStartSelection,
        onSelectionChanged,
        processMouseEvent,
        setContent,
      };
    });

    return {
      root,
      group,
      text,
      updateContext,
    };
  }),
}) {}

export const ElementsLive = Elements.Default;

export type Methods = "group" | "text";
export type MethodParameters = {
  [key in Methods]: Parameters<Elements[key]>;
};

export type Element = {
  type: Methods;
  id: number;
  selectable: Ref.Ref<boolean>;
  parent: Ref.Ref<Element | null>;
  visible: Ref.Ref<boolean>;
  setVisible: (value: boolean) => Effect.Effect<void>;
  render: (buffer: OptimizedBuffer, deltaTime: number) => Effect.Effect<void, RendererFailedToDrawTextBuffer>;
  add: (container: Element, index?: number) => Effect.Effect<void>;
  shouldStartSelection: (x: number, y: number) => Effect.Effect<boolean>;
  onSelectionChanged: (selection: SelectionState | null, width: number, height: number) => Effect.Effect<boolean>;
  processMouseEvent: (event: MouseEvent) => Effect.Effect<void>;
};
//  & (
//   | {
//       setContent: (value: Element) => Effect.Effect<void>;
//     }
//   | {
//       setContent: (value: string) => Effect.Effect<void>;
//     }
// );
