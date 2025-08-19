import * as Colors from "@opentuee/core/src/colors";
import type { BorderSides, BorderStyle } from "@opentuee/core/src/components/border";
import type { RenderableNumber, RenderContext } from "@opentuee/core/src/components/renderable";
import type {
  OptimizedBufferDrawTextLocalInvalidText,
  RendererFailedToResizeRenderer,
} from "@opentuee/core/src/errors";
import { EventEmitter } from "@opentuee/core/src/event-emitter";
import type { ParsedKey } from "@opentuee/core/src/inputs/keyboard";
import { CliRenderer, type FrameCallback } from "@opentuee/core/src/renderer";
import { RGBAClass } from "@opentuee/core/src/types";
import * as Renderables from "@opentuee/ui/src/components/renderables";
import { Context, Effect, Match, Ref, Schema } from "effect";
import { add } from "effect/Context";
import { makeBufferedElement } from "../bufferedelement";
import { makeContainerElement, type ContainerElementService } from "../container";
import { Blurred, Focused, makeElement, type ElementOptions, type ElementService } from "../element";
import type { FailedToRemoveKeypressHandler, FailedToSetKeypressHandler } from "../errors";
import type { KeyHandler } from "../lib/keyhandler";

export type TabControllerElementOptions = ElementOptions & {
  tabBarHeight?: number;
  tabBarBackgroundColor?: Colors.Input;
  selectedBackgroundColor?: Colors.Input;
  selectedTextColor?: Colors.Input;
  selectedDescriptionColor?: Colors.Input;
  showDescription?: boolean;
  showUnderline?: boolean;
  showScrollArrows?: boolean;
};

const Changed = Schema.Literal("TabChanged").pipe(Schema.brand("TabChanged"));
export type Changed = typeof Changed.Type;

const Selected = Schema.Literal("selected").pipe(Schema.brand("TabSelected"));
export type Selected = typeof Selected.Type;

export const TabControllerEvents = Schema.Union(Changed, Selected).pipe(Schema.brand("TabControllerEvents"));
export type TabControllerEvents = typeof TabControllerEvents.Type;

export type TabControllerService<T> = ElementService<T> & {
  tabs: Ref.Ref<Tab<T>[]>;
  addTab: (
    tabObject: TabObject<T>,
  ) => Effect.Effect<Tab<T>, never, RenderContext | RenderableNumber | EventEmitter | KeyHandler>;
  getCurrentTab: () => Effect.Effect<Tab<T>>;
  getCurrentTabGroup: () => Effect.Effect<ContainerElementService<T>>;
  switchToTab: (index: number) => Effect.Effect<void>;
  nextTab: () => Effect.Effect<void>;
  previousTab: () => Effect.Effect<void>;
  update: (deltaMs: number) => Effect.Effect<void>;
  getCurrentTabIndex: () => Effect.Effect<number>;
  getTabSelectElement: () => Effect.Effect<TabSelectElementService<T>>;
  focus: () => Effect.Effect<void, FailedToSetKeypressHandler>;
  blur: () => Effect.Effect<void, FailedToSetKeypressHandler>;
  isFocused: () => Effect.Effect<boolean>;
  onResize: (width: number, height: number) => Effect.Effect<void, RendererFailedToResizeRenderer>;
  destroySelf: () => Effect.Effect<void, FailedToRemoveKeypressHandler | FailedToSetKeypressHandler>;
};

export class TabControllerElement extends Context.Tag("TabControllerElement")<
  TabControllerElement,
  TabControllerService<any>
>() {}
export interface TabObject<T> {
  title: string;
  init(tabGroup: ContainerElementService<T>): Effect.Effect<void>;
  update?(deltaMs: number, tabGroup: ContainerElementService<T>): Effect.Effect<void>;
  show?(): Effect.Effect<void>;
  hide?(): Effect.Effect<void>;
}

interface Tab<T> {
  title: string;
  tabObject: TabObject<T>;
  group: ContainerElementService<T>;
  initialized: boolean;
}

export const makeTabControllerElement = <T>(id: string, options: TabControllerElementOptions) =>
  Effect.gen(function* () {
    const ee = yield* EventEmitter;
    const renderable = yield* makeElement<T>(id, {
      ...options,
      type: Renderables.TabController.make("TabController"),
    });
    const cliRenderer = yield* CliRenderer;

    const tabs = yield* Ref.make<Tab<T>[]>([]);
    const currentTabIndex = yield* Ref.make(0);
    const tabBarHeight = yield* Ref.make(options.tabBarHeight || 4);

    const tabSelectElement = yield* makeTabSelectElement<number>(`${id}-tabs`, {
      width: "100%",
      height: options.tabBarHeight || 4,
      options: [],
      zIndex: 100,
      selectedBackgroundColor: options.selectedBackgroundColor || Colors.Custom.make("#333333"),
      selectedTextColor: options.selectedTextColor || Colors.Yellow.make("#FFFF00"),
      // textColor: this.textColor,
      selectedDescriptionColor: options.selectedDescriptionColor || Colors.White.make("#FFFFFF"),
      backgroundColor: options.tabBarBackgroundColor,
      // borderStyle: this.borderStyle,
      // borderColor: this.borderColor,
      // focusedBorderColor: this.focusedBorderColor,
      showDescription: options.showDescription ?? true,
      showUnderline: options.showUnderline ?? true,
      showScrollArrows: options.showScrollArrows ?? true,
      type: Renderables.TabSelect.make("TabSelect"),
    });

    ee.on(
      Changed.make("TabChanged"),
      Effect.fn(function* (index: number) {
        yield* switchToTab(index);
      }),
    );

    yield* renderable.add(tabSelectElement);

    const addTab = Effect.fn(function* (tabObject: TabObject<T>) {
      const id = renderable.id;
      const ts = yield* Ref.get(tabs);
      const tsH = yield* Ref.get(tabBarHeight);
      const z = yield* Ref.get(renderable.zIndex);
      const tabGroup = yield* makeContainerElement<T>(`${id}-tab-${ts.length}`, {
        position: {
          left: 0,
          top: tsH,
        },
        zIndex: z + 50,
        visible: false,
        width: "100%",
        height: 1,
        type: Renderables.Container.make("Container"),
      });

      yield* renderable.add(tabGroup);

      const tab: Tab<T> = {
        title: tabObject.title,
        tabObject,
        group: tabGroup,
        initialized: false,
      };
      yield* Ref.update(tabs, (tabs) => {
        tabs.push(tab);
        return tabs;
      });

      yield* updateTabSelectOptions();
      return tab;
    });

    const updateTabSelectOptions = Effect.fn(function* () {
      const ts = yield* Ref.get(tabs);
      const options: TabSelectOption<number>[] = ts.map((tab, index) => ({
        name: tab.title,
        description: `Tab ${index + 1}/${ts.length} - Use Left/Right arrows to navigate | Press Ctrl+C to exit | D: toggle debug`,
        value: index,
      }));

      yield* tabSelectElement.setOptions(options);

      if (ts.length === 1) {
        const firstTab = yield* getCurrentTab();
        yield* Ref.set(firstTab.group.visible, true);
        yield* initializeTab(firstTab);

        if (firstTab.tabObject.show) {
          yield* firstTab.tabObject.show();
        }
      }
    });

    const initializeTab = Effect.fn(function* (tab: Tab<T>) {
      if (!tab.initialized) {
        yield* tab.tabObject.init(tab.group);
        tab.initialized = true;
      }
    });
    const initialFrameCallback = Effect.fn(function* (deltaMs: number) {
      yield* update(deltaMs);
    });
    const frameCallback = yield* Ref.make<FrameCallback | null>(initialFrameCallback);
    yield* cliRenderer.setFrameCallback(initialFrameCallback);

    const update = Effect.fn(function* (deltaMs: number) {
      const currentTab = yield* getCurrentTab();
      if (currentTab && currentTab.tabObject.update) {
        yield* currentTab.tabObject.update(deltaMs, currentTab.group);
      }
    });

    const getCurrentTab = Effect.fn(function* () {
      const ts = yield* Ref.get(tabs);
      const cti = yield* Ref.get(currentTabIndex);
      return ts[cti];
    });

    const getCurrentTabGroup = Effect.fn(function* () {
      const currentTab = yield* getCurrentTab();
      return currentTab.group;
    });

    const switchToTab = Effect.fn(function* (index: number) {
      const ts = yield* Ref.get(tabs);
      if (index < 0 || index >= ts.length) return;
      const cti = yield* Ref.get(currentTabIndex);
      if (index === cti) return;

      const currentTab = yield* getCurrentTab();
      yield* Ref.set(currentTab.group.visible, false);
      if (currentTab.tabObject.hide) {
        yield* currentTab.tabObject.hide();
      }

      yield* Ref.set(currentTabIndex, index);
      const newTab = yield* getCurrentTab();
      yield* Ref.set(currentTab.group.visible, true);

      yield* initializeTab(newTab);

      if (newTab.tabObject.show) {
        yield* newTab.tabObject.show();
      }

      ee.emit(Changed.make("TabChanged"), index, newTab);
    });

    const nextTab = Effect.fn(function* () {
      const ts = yield* Ref.get(tabs);
      const cti = yield* Ref.get(currentTabIndex);
      yield* switchToTab((cti + 1) % ts.length);
    });

    const previousTab = Effect.fn(function* () {
      const ts = yield* Ref.get(tabs);
      const cti = yield* Ref.get(currentTabIndex);
      yield* switchToTab((cti - 1 + ts.length) % ts.length);
    });

    const getCurrentTabIndex = Effect.fn(function* () {
      return yield* Ref.get(currentTabIndex);
    });

    const getTabSelectElement = Effect.fn(function* () {
      return tabSelectElement;
    });

    const focus = Effect.fn(function* () {
      const tse = yield* getTabSelectElement();
      yield* tse.focus();
      ee.emit(Focused.make("Focused"));
    });

    const blur = Effect.fn(function* () {
      const tse = yield* getTabSelectElement();
      yield* tse.blur();
      ee.emit(Blurred.make("Blurred"));
    });

    const isFocused = Effect.fn(function* () {
      const tse = yield* getTabSelectElement();
      return yield* tse.focused;
    });

    const onResize = Effect.fn(function* (width: number, height: number) {
      const tse = yield* getTabSelectElement();
      const tseW = yield* Ref.get(tse.width);
      const tseH = yield* Ref.get(tse.height);
      if (width === tseW && height === tseH) return;

      const w = yield* Ref.updateAndGet(renderable.width, () => width);
      const h = yield* Ref.updateAndGet(renderable.height, () => height);
      yield* Ref.set(tabSelectElement.width, w);
      yield* Ref.set(tabSelectElement.height, h);

      const ts = yield* Ref.get(tabs);
      for (const tab of ts) {
        yield* Ref.set(tab.group.y, h);
        yield* Ref.set(tab.group.width, w);
        const tbh = yield* Ref.get(tabBarHeight);
        yield* Ref.set(tab.group.height, h - tbh);
      }

      yield* renderable.onResize(width, height);
    });

    const destroySelf = Effect.fn(function* () {
      yield* blur();

      const fc = yield* Ref.get(frameCallback);
      if (fc) {
        yield* cliRenderer.removeFrameCallback(fc);
        yield* Ref.set(frameCallback, null);
      }

      const ts = yield* Ref.get(tabs);
      for (const tab of ts) {
        yield* tab.group.destroy();
      }
      yield* tabSelectElement.destroy();

      // ee.removeAllListeners();
    });

    return {
      ...renderable,
      tabs,
      addTab,
      getCurrentTab,
      getCurrentTabGroup,
      switchToTab,
      nextTab,
      previousTab,
      update,
      getCurrentTabIndex,
      getTabSelectElement,
      focus,
      blur,
      isFocused,
      onResize,
      destroySelf,
    } as TabControllerService<T>;
  });

export interface TabSelectOption<T> {
  name: string;
  description: string;
  value?: T;
}

export type TabSelectElementService<T> = ElementService<T> & {
  refreshContent: (
    contentX: number,
    contentY: number,
    contentWidth: number,
    contentHeight: number,
  ) => Effect.Effect<void, OptimizedBufferDrawTextLocalInvalidText>;
  setOptions: (options: TabSelectOption<T>[]) => Effect.Effect<void>;
  getSelectedOption: () => Effect.Effect<TabSelectOption<T> | null>;
  getSelectedIndex: () => Effect.Effect<number>;
  moveLeft: () => Effect.Effect<void>;
  moveRight: () => Effect.Effect<void>;
  selectCurrent: () => Effect.Effect<void>;
  setSelectedIndex: (index: number) => Effect.Effect<void>;
  onResize: (width: number, height: number) => Effect.Effect<void, RendererFailedToResizeRenderer>;
  setTabWidth: (tabWidth: number) => Effect.Effect<void>;
  getTabWidth: () => Effect.Effect<number>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean>;
  setShowDescription: (show: boolean) => Effect.Effect<void>;
  getShowDescription: () => Effect.Effect<boolean>;
  setShowUnderline: (show: boolean) => Effect.Effect<void>;
  getShowUnderline: () => Effect.Effect<boolean>;
  onBorderChanged: (border: boolean | BorderSides[], borderStyle: BorderStyle) => Effect.Effect<void>;
  setShowScrollArrows: (show: boolean) => Effect.Effect<void>;
  getShowScrollArrows: () => Effect.Effect<boolean>;
  setWrapSelection: (wrap: boolean) => Effect.Effect<void>;
  getWrapSelection: () => Effect.Effect<boolean>;
};

export type TabSelectElementOptions<T> = Omit<ElementOptions, "height"> & {
  height?: number;
  options: TabSelectOption<T>[];
  tabWidth?: number;
  selectedBackgroundColor?: Colors.Input;
  selectedTextColor?: Colors.Input;
  selectedDescriptionColor?: Colors.Input;
  showScrollArrows?: boolean;
  showDescription?: boolean;
  showUnderline?: boolean;
  wrapSelection?: boolean;
};

const SelectionChanged = Schema.Literal("selectionChanged").pipe(Schema.brand("SelectionChanged"));
export type SelectionChanged = typeof SelectionChanged.Type;
const ItemSelected = Schema.Literal("itemSelected").pipe(Schema.brand("ItemSelected"));
export type ItemSelected = typeof ItemSelected.Type;

export const TabSelectEvents = Schema.Union(SelectionChanged, ItemSelected).pipe(Schema.brand("TabSelectEvents"));
export type TabSelectEvents = typeof TabSelectEvents.Type;

export class TabSelectElement extends Context.Tag("TabSelectElement")<
  TabSelectElement,
  TabSelectElementService<any>
>() {}

const calculateDynamicHeight = Effect.fn(function* (
  border: boolean | BorderSides[],
  showUnderline: boolean,
  showDescription: boolean,
) {
  const hasBorder = border !== false;
  let height = 1;

  if (showUnderline) {
    height += 1;
  }

  if (showDescription) {
    height += 1;
  }

  if (hasBorder) {
    height += 2;
  }

  return height;
});

export const makeTabSelectElement = <T>(id: string, opts: TabSelectElementOptions<T>) =>
  Effect.gen(function* () {
    const ee = yield* EventEmitter;
    const calculatedHeight = yield* calculateDynamicHeight(
      opts.border ?? true,
      opts.showUnderline ?? true,
      opts.showDescription ?? true,
    );
    const renderable = yield* makeBufferedElement<T>(id, {
      ...opts,
      height: calculatedHeight,
      type: Renderables.TabSelect.make("TabSelect"),
    });
    const options = yield* Ref.make(opts.options || []);
    const tw = opts.tabWidth || 20;
    const tabWidth = yield* Ref.make(tw);
    const showDescription = yield* Ref.make(opts.showDescription ?? true);
    const showUnderline = yield* Ref.make(opts.showUnderline ?? true);
    const showScrollArrows = yield* Ref.make(opts.showScrollArrows ?? true);
    const wrapSelection = yield* Ref.make(opts.wrapSelection ?? false);

    const hasBorder = opts.border !== false;
    const w = yield* Ref.get(renderable.width);
    const usableWidth = hasBorder ? w - 2 : w;
    const maxVisibleTabs = yield* Ref.make(Math.max(1, Math.floor(usableWidth / tw)));

    const selectedBackgroundColor = yield* Ref.make(opts.selectedBackgroundColor || Colors.Custom.make("#334455"));
    const selectedTextColor = yield* Ref.make(opts.selectedTextColor || Colors.Yellow.make("#FFFF00"));
    const selectedDescriptionColor = yield* Ref.make(opts.selectedDescriptionColor || Colors.Custom.make("#CCCCCC"));

    const selectedIndex = yield* Ref.make(0);
    const scrollOffset = yield* Ref.make(0);

    const calcDynamicHeight = Effect.fn(function* () {
      const b = yield* Ref.get(renderable.border);
      const su = yield* Ref.get(showUnderline);
      const sd = yield* Ref.get(showDescription);
      return yield* calculateDynamicHeight(b, su, sd);
    });

    const refreshContent = Effect.fn(function* (
      contentX: number,
      contentY: number,
      contentWidth: number,
      contentHeight: number,
    ) {
      const os = yield* Ref.get(options);
      if (!renderable.frameBuffer || os.length === 0) return;
      const so = yield* Ref.get(scrollOffset);
      const mvt = yield* Ref.get(maxVisibleTabs);
      const visibleOptions = os.slice(so, so + mvt);

      // Render tab names
      for (let i = 0; i < visibleOptions.length; i++) {
        const actualIndex = so + i;
        const option = visibleOptions[i];
        const si = yield* Ref.get(selectedIndex);
        const isSelected = actualIndex === si;
        const tabX = contentX + i * tw;

        if (tabX >= contentX + contentWidth) break;

        const actualTabWidth = Math.min(tw, contentWidth - i * tw);

        const sbc = yield* Ref.get(selectedBackgroundColor);
        const sbcc = yield* RGBAClass.fromHex(sbc);
        if (isSelected) {
          yield* renderable.frameBuffer.fillRect(tabX, contentY, actualTabWidth, 1, sbcc);
        }

        const nameColor = isSelected ? selectedTextColor : renderable.textColor;
        const sd = yield* Ref.get(showDescription);
        const nameContent = sd ? option.description : option.name;
        const nc = yield* Ref.get(nameColor);
        const ncc = yield* RGBAClass.fromHex(nc);
        yield* renderable.frameBuffer.drawText(nameContent, tabX + 1, contentY, ncc);

        if (isSelected && showUnderline && contentHeight >= 2) {
          const underlineY = contentY + 1;
          yield* renderable.frameBuffer.drawText("▬".repeat(actualTabWidth), tabX, underlineY, ncc, sbcc);
        }
      }

      if (showDescription && contentHeight >= (showUnderline ? 3 : 2)) {
        const si = yield* Ref.get(selectedIndex);
        const selectedOption = os[si];
        if (selectedOption) {
          const descriptionY = contentY + (showUnderline ? 2 : 1);
          const sd = yield* Ref.get(showDescription);
          const descContent = sd ? selectedOption.description : selectedOption.name;

          const dc = yield* Ref.get(selectedDescriptionColor);
          const dcc = yield* RGBAClass.fromHex(dc);

          yield* renderable.frameBuffer.drawText(descContent, contentX + 1, descriptionY, dcc);
        }
      }
      if (showScrollArrows && os.length > mvt) {
        yield* renderScrollArrowsToFrameBuffer(contentX, contentY, contentWidth, contentHeight);
      }
    });

    const truncateText = Effect.fn(function* (text: string, maxWidth: number) {
      if (text.length <= maxWidth) return text;
      return text.substring(0, Math.max(0, maxWidth - 1)) + "…";
    });

    const renderScrollArrowsToFrameBuffer = Effect.fn(function* (
      contentX: number,
      contentY: number,
      contentWidth: number,
      contentHeight: number,
    ) {
      const so = yield* Ref.get(scrollOffset);
      const os = yield* Ref.get(options);
      const mvt = yield* Ref.get(maxVisibleTabs);

      const hasMoreLeft = so > 0;
      const hasMoreRight = so + mvt < os.length;

      const c = Colors.Custom.make("#AAAAAA");
      const cc = yield* RGBAClass.fromHex(c);
      if (hasMoreLeft) {
        yield* renderable.frameBuffer.drawText("‹", contentX, contentY, cc);
      }

      if (hasMoreRight) {
        yield* renderable.frameBuffer.drawText("›", contentX + contentWidth - 1, contentY, cc);
      }
    });

    const setOptions = Effect.fn(function* (opts: TabSelectOption<T>[]) {
      yield* Ref.set(options, opts);
      yield* Ref.update(selectedIndex, (si) => Math.min(si, opts.length - 1));
      yield* updateScrollOffset();
      yield* Ref.set(renderable.needsRefresh, true);
    });

    const getSelectedOption = Effect.fn(function* () {
      const os = yield* Ref.get(options);
      const si = yield* Ref.get(selectedIndex);
      return os[si] || null;
    });

    const getSelectedIndex = Effect.fn(function* () {
      return yield* Ref.get(selectedIndex);
    });

    const moveLeft = Effect.fn(function* () {
      const os = yield* Ref.get(options);
      const ws = yield* Ref.get(wrapSelection);
      yield* Ref.update(selectedIndex, (si) => {
        const newIndex = si - 1;
        if (newIndex >= 0) {
          si = newIndex;
        } else if (ws && os.length > 0) {
          si = os.length - 1;
        } else {
          si = 0;
        }
        return si;
      });

      yield* updateScrollOffset();
      yield* Ref.set(renderable.needsRefresh, true);
      const so = yield* getSelectedOption();
      const si = yield* Ref.get(selectedIndex);
      ee.emit(SelectionChanged.make("selectionChanged"), si, so);
    });

    const moveRight = Effect.fn(function* () {
      const os = yield* Ref.get(options);
      const ws = yield* Ref.get(wrapSelection);
      yield* Ref.update(selectedIndex, (si) => {
        const newIndex = si + 1;
        if (newIndex < os.length) {
          si = newIndex;
        } else if (ws && os.length > 0) {
          si = 0;
        } else {
          si = os.length - 1;
        }
        return si;
      });

      yield* updateScrollOffset();
      yield* Ref.set(renderable.needsRefresh, true);
      const so = yield* getSelectedOption();
      const si = yield* Ref.get(selectedIndex);
      ee.emit(SelectionChanged.make("selectionChanged"), si, so);
    });

    const selectCurrent = Effect.fn(function* () {
      const selected = yield* getSelectedOption();
      if (selected) {
        const si = yield* Ref.get(selectedIndex);
        ee.emit(ItemSelected.make("itemSelected"), si, selected);
      }
    });

    const setSelectedIndex = Effect.fn(function* (index: number) {
      const os = yield* Ref.get(options);
      if (index >= 0 && index < os.length) {
        yield* Ref.set(selectedIndex, index);
        yield* updateScrollOffset();
        yield* Ref.set(renderable.needsRefresh, true);
        const so = yield* getSelectedOption();
        const si = yield* Ref.get(selectedIndex);
        ee.emit(SelectionChanged.make("selectionChanged"), si, so);
      }
    });

    const updateScrollOffset = Effect.fn(function* () {
      const os = yield* Ref.get(options);
      if (!os) return;

      const mvt = yield* Ref.get(maxVisibleTabs);
      const halfVisible = Math.floor(mvt / 2);
      const si = yield* Ref.get(selectedIndex);
      const newScrollOffset = Math.max(0, Math.min(si - halfVisible, os.length - mvt));
      const so = yield* Ref.get(scrollOffset);
      if (newScrollOffset !== so) {
        yield* Ref.set(scrollOffset, newScrollOffset);
        yield* Ref.set(renderable.needsRefresh, true);
      }
    });

    const onResize = Effect.fn(function* (width: number, height: number) {
      const bo = yield* Ref.get(renderable.border);
      const hasBorder = bo !== false;
      const usableWidth = hasBorder ? width - 2 : width;
      yield* Ref.set(maxVisibleTabs, Math.max(1, Math.floor(usableWidth / tw)));
      yield* updateScrollOffset();
      yield* renderable.onResize(width, height);
    });

    const setTabWidth = Effect.fn(function* (tWidth: number) {
      const tw = yield* Ref.get(tabWidth);
      if (tw === tWidth) return;
      yield* Ref.set(tabWidth, tWidth);
      const bo = yield* Ref.get(renderable.border);
      const hasBorder = bo !== false;
      const w = yield* Ref.get(renderable.width);
      const usableWidth = hasBorder ? w - 2 : w;
      yield* Ref.set(maxVisibleTabs, Math.max(1, Math.floor(usableWidth / tw)));
      yield* updateScrollOffset();
      yield* Ref.set(renderable.needsRefresh, true);
    });

    const getTabWidth = Effect.fn(function* () {
      return yield* Ref.get(tabWidth);
    });

    const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
      const keyName = key.name;

      const x = yield* Match.value(keyName).pipe(
        Match.whenOr(
          "left",
          "k",
          "[",
          Effect.fn(function* () {
            yield* moveLeft();
            return true;
          }),
        ),
        Match.whenOr(
          "right",
          "j",
          "]",
          Effect.fn(function* () {
            yield* moveRight();
            return true;
          }),
        ),
        Match.whenOr(
          "return",
          "enter",
          Effect.fn(function* () {
            yield* selectCurrent();
            return true;
          }),
        ),
        Match.orElse(
          Effect.fn(function* () {
            return false;
          }),
        ),
      );

      return x;
    });

    const setShowDescription = Effect.fn(function* (show: boolean) {
      const shd = yield* Ref.get(showDescription);
      if (shd !== show) {
        yield* Ref.set(showDescription, show);
        const nh = yield* calcDynamicHeight();
        yield* Ref.set(renderable.height, nh);
      }
    });

    const getShowDescription = Effect.fn(function* () {
      return yield* Ref.get(showDescription);
    });

    const setShowUnderline = Effect.fn(function* (show: boolean) {
      const su = yield* Ref.get(showUnderline);
      if (su !== show) {
        yield* Ref.set(showUnderline, show);
        const nh = yield* calcDynamicHeight();
        yield* Ref.set(renderable.height, nh);
      }
    });

    const getShowUnderline = Effect.fn(function* () {
      return yield* Ref.get(showUnderline);
    });

    const onBorderChanged = Effect.fn(function* (border: boolean | BorderSides[], borderStyle: BorderStyle) {
      const nh = yield* calcDynamicHeight();
      yield* Ref.set(renderable.height, nh);

      const bo = yield* Ref.get(renderable.border);
      const hasBorder = bo !== false;
      const w = yield* Ref.get(renderable.width);
      const usableWidth = hasBorder ? w - 2 : w;
      yield* Ref.set(maxVisibleTabs, Math.max(1, Math.floor(usableWidth / tw)));
      yield* updateScrollOffset();
    });

    const setShowScrollArrows = Effect.fn(function* (show: boolean) {
      const sca = yield* Ref.get(showScrollArrows);
      if (sca !== show) {
        yield* Ref.set(showScrollArrows, show);
        yield* Ref.set(renderable.needsRefresh, true);
      }
    });

    const getShowScrollArrows = Effect.fn(function* () {
      return yield* Ref.get(showScrollArrows);
    });

    const setWrapSelection = Effect.fn(function* (wrap: boolean) {
      const ws = yield* Ref.get(wrapSelection);
      if (ws !== wrap) {
        yield* Ref.set(wrapSelection, wrap);
        yield* updateScrollOffset();
        yield* Ref.set(renderable.needsRefresh, true);
      }
    });

    const getWrapSelection = Effect.fn(function* () {
      return yield* Ref.get(wrapSelection);
    });

    return {
      ...renderable,
      refreshContent,
      setOptions,
      getSelectedOption,
      getSelectedIndex,
      moveLeft,
      moveRight,
      selectCurrent,
      setSelectedIndex,
      onResize,
      setTabWidth,
      getTabWidth,
      handleKeyPress,
      setShowDescription,
      getShowDescription,
      setShowUnderline,
      getShowUnderline,
      onBorderChanged,
      setShowScrollArrows,
      getShowScrollArrows,
      setWrapSelection,
      getWrapSelection,
    } as TabSelectElementService<T>;
  });
