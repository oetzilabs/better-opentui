import type { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Ref, Schema } from "effect";
import { OptimizedBuffer } from "../../../buffer/optimized";
import { Colors, Input } from "../../../colors";
import type { Collection } from "../../../errors";
import type { KeyboardEvent } from "../../../events/keyboard";
import type { MouseEvent } from "../../../events/mouse";
import type { ParsedKey } from "../../../inputs/keyboard";
import { parseColor } from "../../../utils";
import { Library } from "../../../zig";
import { PositionRelative } from "../../utils/position";
import { base, type BaseElement } from "../base";
import { group } from "../group";
import type { Binds, ElementOptions } from "../utils";
import { contentArea } from "./content-area";
import { horizontalScrollbar } from "./horizontal-scrollbar";
import { verticalScrollbar } from "./vertical-scrollbar";

const PercentageSchema = Schema.TemplateLiteral(Schema.Number, Schema.Literal("%"));
type Percentage = typeof PercentageSchema.Type;

export interface ScrollableElement<T, FBT extends string = "scrollable">
  extends BaseElement<"scrollable", ScrollableElement<T, FBT>> {
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onKeyboardEvent: (
    event: KeyboardEvent,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onUpdate: (
    self: ScrollableElement<T, FBT>,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  setPosition: (
    axis: "vertical" | "horizontal",
    percentage: Percentage | number,
  ) => Effect.Effect<void, Collection, Library>;
  getScrollOffset: (axis: "vertical" | "horizontal") => Effect.Effect<number, Collection, Library>;
  setScrollOffset: (axis: "vertical" | "horizontal", offset: number) => Effect.Effect<void, Collection, Library>;
  scrollTo: (
    axis: "vertical" | "horizontal",
    direction: "up" | "down" | "left" | "right",
    amount?: number,
  ) => Effect.Effect<void, Collection, Library>;
}

export type ScrollableOptions<T, FBT extends string = "scrollable"> = ElementOptions<FBT, ScrollableElement<T, FBT>> & {
  axis: {
    vertical: boolean;
    horizontal: boolean;
  };
  colors?: {
    bg?: Input;
    focusedBg?: Input;
    scrollBg?: Input;
    indicator?: Input;
    focusedIndicator?: Input;
  };
  icons?: {
    up?: string;
    down?: string;
    left?: string;
    right?: string;
    trackVertical?: string;
    trackHorizontal?: string;
  };
  onUpdate?: (
    self: ScrollableElement<T, FBT>,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
};

const DEFAULTS = {
  axis: {
    vertical: true,
    horizontal: false,
  },
  colors: {
    bg: Colors.Transparent,
    fg: Colors.White,
    focusedBg: Colors.Custom("#1a1a1a"),
    focusedFg: Colors.White,
    scrollBg: Colors.Custom("#333333"),
    indicator: Colors.Custom("#666666"),
    focusedIndicator: Colors.White,
  },
  icons: {
    up: "▲",
    down: "▼",
    left: "◀",
    right: "▶",
    trackVertical: "█",
    trackHorizontal: "█",
  },
} satisfies ScrollableOptions<any>;

export const scrollable = Effect.fn(function* <T extends any, FBT extends string = "scrollable">(
  binds: Binds,
  content: BaseElement<any, any>,
  options: ScrollableOptions<any, FBT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  // Create the main scrollable container
  const scrollableContainer = yield* group(
    binds,
    {
      position: PositionRelative.make(1),
      width: "100%",
      height: "100%",
      left: 0,
      top: 0,
      visible: true,
      focused: options.focused ?? true,
    },
    parentElement,
  );

  // Get container dimensions for proper positioning
  const containerDims = yield* Ref.get(scrollableContainer.dimensions);

  // Calculate dimensions for content area and scrollbars
  const contentWidth = options.axis.vertical ? containerDims.widthValue - 1 : containerDims.widthValue;
  const contentHeight = options.axis.horizontal ? containerDims.heightValue - 1 : containerDims.heightValue;
  const scrollbarHeight = options.axis.horizontal ? containerDims.heightValue - 1 : containerDims.heightValue;
  const scrollbarWidth = options.axis.vertical ? containerDims.widthValue - 1 : containerDims.widthValue;

  // Create content area - leave space for scrollbars
  const contentAreaElement = yield* contentArea(
    binds,
    {
      width: contentWidth,
      height: contentHeight,
      left: 0,
      top: 0,
    },
    scrollableContainer,
  );

  yield* contentAreaElement.add(content);

  // Create vertical scrollbar - position on the right
  const verticalScrollbarElement = yield* verticalScrollbar(
    binds,
    {
      colors: {
        track: options.colors?.scrollBg,
        indicator: options.colors?.indicator,
        focusedIndicator: options.colors?.focusedIndicator,
      },
      visible: options.axis.vertical,
      width: 1,
      height: scrollbarHeight,
      left: containerDims.widthValue - 1,
      top: 0,
      onChange: Effect.fn(function* (offset) {
        const hOffset = yield* contentAreaElement.getScrollOffset("horizontal");
        yield* contentAreaElement.setScrollOffset(offset, hOffset);
      }),
    },
    scrollableContainer,
  );

  // Create horizontal scrollbar - position at the bottom
  const horizontalScrollbarElement = yield* horizontalScrollbar(
    binds,
    {
      colors: {
        track: options.colors?.scrollBg,
        indicator: options.colors?.indicator,
        focusedIndicator: options.colors?.focusedIndicator,
      },
      visible: options.axis.horizontal,
      height: 1,
      width: scrollbarWidth,
      left: 0,
      top: containerDims.heightValue - 1,
      onChange: Effect.fn(function* (offset) {
        const vOffset = yield* contentAreaElement.getScrollOffset("vertical");
        yield* contentAreaElement.setScrollOffset(vOffset, offset);
      }),
    },
    scrollableContainer,
  );

  // Scroll methods
  const getScrollOffset = Effect.fn(function* (axis: "vertical" | "horizontal") {
    if (axis === "vertical") {
      return yield* verticalScrollbarElement.getScrollOffset();
    } else if (axis === "horizontal") {
      return yield* horizontalScrollbarElement.getScrollOffset();
    }
    return 0;
  });

  const setScrollOffset = Effect.fn(function* (axis: "vertical" | "horizontal", offset: number) {
    if (axis === "vertical" && verticalScrollbarElement) {
      yield* verticalScrollbarElement.setScrollOffset(offset);
    } else if (axis === "horizontal" && horizontalScrollbarElement) {
      yield* horizontalScrollbarElement.setScrollOffset(offset);
    }
    // Update content area with new scroll offset
    const vOffset = yield* getScrollOffset("vertical");
    const hOffset = yield* getScrollOffset("horizontal");
    yield* contentAreaElement.setScrollOffset(vOffset, hOffset);
  });

  const setPosition = Effect.fn(function* (axis: "vertical" | "horizontal", percentage: Percentage | number) {
    const percentValue = typeof percentage === "string" ? parseFloat(percentage.replace("%", "")) / 100 : percentage;
    const offset = Math.floor(percentValue * 100); // Simplified, would need content dimensions
    yield* setScrollOffset(axis, offset);
  });

  const scrollTo = Effect.fn(function* (
    axis: "vertical" | "horizontal",
    direction: "up" | "down" | "left" | "right",
    amount: number = 1,
  ) {
    const currentOffset = yield* getScrollOffset(axis);
    const newOffset = Match.value(direction).pipe(
      Match.when("up", () => currentOffset - amount),
      Match.when("down", () => currentOffset + amount),
      Match.when("left", () => currentOffset - amount),
      Match.when("right", () => currentOffset + amount),
      Match.exhaustive,
    );
    yield* setScrollOffset(axis, newOffset);
  });

  // Update scrollbars with content information
  const updateScrollbars = Effect.fn(function* () {
    const contentDims = yield* Ref.get(content.dimensions);
    const contentAreaDims = yield* Ref.get(contentAreaElement.dimensions);
    const vOffset = yield* getScrollOffset("vertical");
    const hOffset = yield* getScrollOffset("horizontal");

    yield* verticalScrollbarElement.setScrollInfo(contentDims.heightValue, contentAreaDims.heightValue, vOffset);
    yield* horizontalScrollbarElement.setScrollInfo(contentDims.widthValue, contentAreaDims.widthValue, hOffset);
  });

  // Event handlers
  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    return true;
  });

  const onKeyboardEvent = Effect.fn(function* (event) {
    yield* verticalScrollbarElement.onKeyboardEvent(event);
    yield* horizontalScrollbarElement.onKeyboardEvent(event);

    // Update scrollbars with latest content info
    yield* updateScrollbars();

    // After scrollbar handles the event, update content area with new scroll offsets
    const vOffset = yield* getScrollOffset("vertical");
    const hOffset = yield* getScrollOffset("horizontal");
    yield* contentAreaElement.setScrollOffset(vOffset, hOffset);
  });

  const onMouseEvent: ScrollableElement<T, FBT>["onMouseEvent"] = Effect.fn(function* (event) {
    // Mouse events are handled by individual scrollbar elements
    if (event.type === "scroll" && event.scroll) {
      const { direction, delta } = event.scroll;
      const amount = Math.abs(delta) > 100 ? 3 : 1;
      const vOffset = yield* getScrollOffset("vertical");
      const hOffset = yield* getScrollOffset("horizontal");
      if (direction === "up") {
        yield* contentAreaElement.setScrollOffset(vOffset - amount, hOffset);
        yield* setScrollOffset("vertical", vOffset - amount);
      } else if (direction === "down") {
        yield* contentAreaElement.setScrollOffset(vOffset + amount, hOffset);
        yield* setScrollOffset("vertical", vOffset + amount);
      } else if (direction === "left") {
        yield* contentAreaElement.setScrollOffset(vOffset, hOffset - amount);
        yield* setScrollOffset("horizontal", hOffset - amount);
      } else if (direction === "right") {
        yield* contentAreaElement.setScrollOffset(vOffset, hOffset + amount);
        yield* setScrollOffset("horizontal", hOffset + amount);
      }
      event.preventDefault();
    }
  });

  scrollableContainer.onResize = Effect.fn(function* (width: number, height: number) {
    yield* Ref.update(scrollableContainer.dimensions, (dims) => ({
      ...dims,
      widthValue: width,
      heightValue: height,
    }));

    const contentAreaWidth = options.axis.vertical ? width - 1 : width;
    const contentAreaHeight = options.axis.horizontal ? height - 1 : height;
    const verticalScrollbarHeight = options.axis.horizontal ? height - 1 : height;
    const horizontalScrollbarWidth = options.axis.vertical ? width - 1 : width;

    // Update content area
    yield* contentAreaElement.onResize(contentAreaWidth, contentAreaHeight);

    // Update vertical scrollbar
    if (options.axis.vertical) {
      yield* Ref.update(verticalScrollbarElement.dimensions, (dims) => ({
        ...dims,
        widthValue: 1,
        heightValue: verticalScrollbarHeight,
      }));
      yield* Ref.update(verticalScrollbarElement.location, (loc) => ({
        ...loc,
        x: width - 1,
        y: 0,
      }));
    }

    // Update horizontal scrollbar
    if (options.axis.horizontal) {
      yield* Ref.update(horizontalScrollbarElement.dimensions, (dims) => ({
        ...dims,
        widthValue: horizontalScrollbarWidth,
        heightValue: 1,
      }));
      yield* Ref.update(horizontalScrollbarElement.location, (loc) => ({
        ...loc,
        x: 0,
        y: height - 1,
      }));
    }

    const contentDims = yield* Ref.get(content.dimensions);
    const contentAreaDims = yield* Ref.get(contentAreaElement.dimensions);
    const vOffset = yield* getScrollOffset("vertical");
    yield* verticalScrollbarElement.setScrollInfo(contentDims.heightValue, contentAreaDims.heightValue, vOffset);
    const hOffset = yield* getScrollOffset("horizontal");
    yield* horizontalScrollbarElement.setScrollInfo(contentDims.widthValue, contentAreaDims.widthValue, hOffset);
    yield* updateScrollbars();
  });

  // Update method
  scrollableContainer.onUpdate = Effect.fn(function* (self) {
    yield* updateScrollbars();

    const children = yield* Ref.get(scrollableContainer.renderables);
    yield* Effect.all(
      children.map((child) => Effect.suspend(() => child.update())),
      { concurrency: 10 },
    );

    // Update scrollbars again after children are updated
    yield* updateScrollbars();
  });

  yield* scrollableContainer.add(contentAreaElement);
  yield* scrollableContainer.add(verticalScrollbarElement);
  yield* scrollableContainer.add(horizontalScrollbarElement);

  // Initial update to set scrollbar info
  yield* updateScrollbars();

  return {
    ...scrollableContainer,
    type: "scrollable",
    onKeyboardEvent,
    handleKeyPress,
    onMouseEvent,
    setPosition,
    getScrollOffset,
    setScrollOffset,
    scrollTo,
  };
});
