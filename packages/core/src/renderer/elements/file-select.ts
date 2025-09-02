import { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Option, Ref, Schema } from "effect";
import Fuse, { type IFuseOptions } from "fuse.js";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { KeyboardEvent } from "../../events/keyboard";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { button } from "./button";
import { type FrameBufferOptions } from "./framebuffer";
import { group } from "./group";
import { input } from "./input";
import { statusBar } from "./status-bar";
import { text } from "./text";
import type { Binds, ElementOptions } from "./utils";

// Sort schemas
const SortCriterion = Schema.Union(
  Schema.Literal("folder"),
  Schema.Literal("alphanumeric"),
  Schema.Literal("files"),
  Schema.Literal("date"),
  Schema.Literal("size"),
);

const SortOptions = Schema.Struct({
  direction: Schema.Union(Schema.Literal("asc"), Schema.Literal("desc")),
  orderBy: Schema.Array(SortCriterion),
});

// Helper function to format file sizes
const formatFileSize = (bytes: bigint): string => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = Number(bytes);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
};

export interface FileOption {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: bigint;
  modified?: Date;
  id: string;
}

export interface FileSelectElement<FBT extends string = "file-select">
  extends BaseElement<"file-select", FileSelectElement<FBT>> {
  setLookupPath: (path: string) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  getLookupPath: () => Effect.Effect<string, Collection, Library>;
  goUp: () => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  getSelectedFiles: () => Effect.Effect<FileOption[], Collection, Library>;
  toggleSelection: (index: number) => Effect.Effect<void, Collection, Library>;
  setFocusedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  getFocusedIndex: () => Effect.Effect<number, Collection, Library>;
  setTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setSelectedTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setSelectedBgColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setFocusedBgColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setFocusedTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
  setWrapSelection: (wrap: boolean) => Effect.Effect<void, Collection, Library>;
  setShowScrollIndicator: (show: boolean) => Effect.Effect<void, Collection, Library>;
  setSort: (sort: typeof SortOptions.Type) => Effect.Effect<void, Collection, Library>;
  handleKeyPress: (key: ParsedKey) => Effect.Effect<boolean, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onUpdate: (
    self: FileSelectElement<FBT>,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onSelect: (files: FileOption[]) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onKeyboardEvent: (
    event: KeyboardEvent,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
}

export type FileSelectOptions<FBT extends string = "file-select"> = ElementOptions<FBT, FileSelectElement<FBT>> & {
  colors?: FrameBufferOptions<FileSelectElement<FBT>>["colors"] & {
    bg?: Input;
    fg?: Input;
    selectedBg?: Input;
    selectedFg?: Input;
    focusedBg?: Input;
    focusedFg?: Input;
    scrollIndicator?: Input;
    pathBg?: Input;
    pathFg?: Input;
    directoryFg?: Input;
    fileFg?: Input;
  };
  showScrollIndicator?: boolean;
  selectedIds?: string[];
  onUpdate?: (
    self: FileSelectElement<FBT>,
  ) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  onSelect?: (files: FileOption[]) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  search?: { enabled: boolean; config?: IFuseOptions<FileOption> };
  parentNode?: BaseElement<any, any> | null;
  lookup_path: string;
  sort?: typeof SortOptions.Type;
  statusBar?: {
    enabled?: boolean;
  };
  orderOfElements?: ("search" | "status-bar" | "file-list")[];
};

const DEFAULTS = {
  colors: {
    bg: Colors.Transparent,
    fg: Colors.White,
    selectedBg: Colors.Custom("#334455"),
    selectedFg: Colors.Yellow,
    focusedBg: Colors.Custom("#1a1a1a"),
    focusedFg: Colors.White,
    scrollIndicator: Colors.Custom("#666666"),
    directoryFg: Colors.Custom("#4A90E2"), // Blue for directories
    fileFg: Colors.Custom("#7ED321"), // Green for files
    pathBg: Colors.Custom("#2a2a2a"),
    pathFg: Colors.White,
  },
  showScrollIndicator: false,
  selectedIds: [],
  search: { enabled: false, config: { keys: ["name"] } },
  parentNode: null,
  lookup_path: ".",
  sort: { direction: "asc", orderBy: ["folder", "alphanumeric"] },
  statusBar: { enabled: true },
  orderOfElements: ["search", "file-list", "status-bar"],
} satisfies FileSelectOptions;

export const fileSelect = Effect.fn(function* <FBT extends string = "file-select">(
  binds: Binds,
  options: FileSelectOptions<FBT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const lookupPath = yield* Ref.make(path.join(process.cwd(), options.lookup_path ?? DEFAULTS.lookup_path));

  const searchOpts = options.search ?? DEFAULTS.search;

  const parentDimensions = yield* Ref.get(parentElement.dimensions);

  // Get status bar configuration
  const statusBarConfig = options.statusBar ?? DEFAULTS.statusBar;
  const statusBarEnabled = statusBarConfig.enabled ?? DEFAULTS.statusBar.enabled;
  const statusBarHeight = statusBarEnabled ? 1 : 0;

  const files = yield* Ref.make<FileOption[]>([]);
  const filteredFiles = yield* Ref.make<FileOption[]>([]);
  const selectedIds = yield* Ref.make<string[]>([]);
  const focusedIndex = yield* Ref.make(0);

  const selectedBg = yield* Ref.make(options.colors?.selectedBg ?? DEFAULTS.colors.selectedBg);
  const selectedFg = yield* Ref.make(options.colors?.selectedFg ?? DEFAULTS.colors.selectedFg);
  const showScrollIndicator = yield* Ref.make(options.showScrollIndicator ?? DEFAULTS.showScrollIndicator);
  const scrollIndicatorColor = yield* Ref.make(options.colors?.scrollIndicator ?? DEFAULTS.colors.scrollIndicator);

  const directoryFg = yield* Ref.make(options.colors?.directoryFg ?? DEFAULTS.colors.directoryFg);
  const fileFg = yield* Ref.make(options.colors?.fileFg ?? DEFAULTS.colors.fileFg);

  const scrollOffset = yield* Ref.make(0);
  const wrapSelection = yield* Ref.make(true);

  const searchable = yield* Ref.make(searchOpts.enabled);

  const sortConfig = yield* Ref.make(options.sort ?? DEFAULTS.sort);

  const fuse = searchOpts.enabled ? new Fuse([], searchOpts.config ?? { keys: ["name"] }) : null;

  const wrapper = yield* group(
    binds,
    {
      position: PositionRelative.make(1),
      width: "100%",
      height: "100%",
      left: 0,
      top: 0,
      visible: true,
    },
    parentElement,
  );

  const framebuffer_buffer = yield* wrapper.createFrameBuffer();

  const fileSelectElement = yield* base<"file-select", FileSelectElement<FBT>>(
    "file-select",
    binds,
    {
      ...options,
      position: PositionRelative.make(1),
      selectable: true,
      left: 0,
      top: 0,
      height: options.height
        ? options.height === "auto"
          ? Math.min(
              20, // Default file list height
              parentDimensions.heightValue - 2 - statusBarHeight, // Space for search + path + status bar if enabled
            )
          : options.height
        : Math.min(20, parentDimensions.heightValue - 2 - statusBarHeight),
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
        focusedBg: options.colors?.focusedBg ?? DEFAULTS.colors.focusedBg,
        focusedFg: options.colors?.focusedFg ?? DEFAULTS.colors.focusedFg,
      },
    },
    wrapper,
  );

  fileSelectElement.onResize = Effect.fn(function* (width: number, height: number) {
    yield* Ref.update(fileSelectElement.dimensions, (d) => ({ ...d, widthValue: width, heightValue: height }));
    yield* framebuffer_buffer.resize(width, height);
    yield* updateScrollOffset();
  });

  // Rendering
  fileSelectElement.render = Effect.fn(function* (buffer: OptimizedBuffer, _dt: number) {
    const v = yield* Ref.get(fileSelectElement.visible);
    if (!v) return;

    const loc = yield* Ref.get(fileSelectElement.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(fileSelectElement.dimensions);
    const focused = yield* Ref.get(fileSelectElement.focused);
    const colors = yield* Ref.get(fileSelectElement.colors);
    const bgColor = yield* parseColor(focused ? colors.focusedBg : colors.bg);

    yield* framebuffer_buffer.clear(bgColor);

    const fileList = yield* Ref.get(filteredFiles);
    const selIds = yield* Ref.get(selectedIds);
    const focIdx = yield* Ref.get(focusedIndex);
    const scroll = yield* Ref.get(scrollOffset);

    // Render file list
    const visibleFiles = fileList.slice(scroll, scroll + h);
    const baseFg = yield* parseColor(focused ? colors.focusedFg : colors.fg);
    const baseBg = yield* parseColor(focused ? colors.focusedBg : colors.bg);
    const selBgVal = yield* Ref.get(selectedBg);
    const selFgVal = yield* Ref.get(selectedFg);
    const selBg = yield* parseColor(selBgVal);
    const selFg = yield* parseColor(selFgVal);

    for (let i = 0; i < visibleFiles.length; i++) {
      const actualIndex = scroll + i;
      const file = visibleFiles[i];
      const isSelected = selIds.includes(file.id);
      const isFocused = actualIndex === focIdx;
      const itemY = i;

      if (itemY >= h) break;

      if (isFocused) {
        yield* framebuffer_buffer.fillRect(0, itemY, w, 1, baseBg);
      }
      if (isSelected) {
        yield* framebuffer_buffer.fillRect(0, itemY, w, 1, selBg);
      }

      // Enhanced icons and colors
      const icon = file.isDirectory ? "📁" : "📄";
      const sizeInfo = file.size ? ` (${formatFileSize(file.size)})` : "";
      const dateInfo = file.modified ? ` ${file.modified.toLocaleDateString()}` : "";
      const nameContent = `${icon} ${file.name}${sizeInfo}${dateInfo}`;

      // Use different colors for directories vs files
      const dirFgColor = yield* parseColor(yield* Ref.get(directoryFg));
      const fileFgColor = yield* parseColor(yield* Ref.get(fileFg));

      const nameColor = isFocused ? selFg : file.isDirectory ? dirFgColor : fileFgColor;

      yield* framebuffer_buffer.drawText(nameContent, 0, itemY, nameColor);
    }

    const showScroll = yield* Ref.get(showScrollIndicator);

    // Scroll indicator
    if (showScroll && fileList.length > h) {
      const scrollPercent = focIdx / Math.max(1, fileList.length - 1);
      const indicatorY = Math.floor(scrollPercent * h);
      const indicatorX = w - 1;
      const sic = yield* Ref.get(scrollIndicatorColor);
      const parsedSIC = yield* parseColor(sic);
      yield* framebuffer_buffer.drawText("█", indicatorX, indicatorY, parsedSIC);
    }

    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
  });

  // Create path text component
  const pathText = yield* text(
    binds,
    `Path: ${path.join(process.cwd(), options.lookup_path ?? DEFAULTS.lookup_path)}`,
    {
      position: PositionRelative.make(1),
      height: 1,
      width: "100%",
      colors: {
        bg: options.colors?.pathBg ?? DEFAULTS.colors.pathBg,
        fg: options.colors?.pathFg ?? DEFAULTS.colors.pathFg,
      },
    },
    wrapper,
  );

  const statusBarElement = yield* statusBar(
    binds,
    {
      colors: options.colors,
    },
    wrapper,
  );

  const statusBarRightText = yield* button(
    binds,
    {
      position: PositionRelative.make(1),
      height: 1,
      right: 0,
      top: 0,
      colors: options.colors,
      text: options.sort ? (options.sort.direction === "asc" ? "▲" : "▼") : "Ready",
    },
    statusBarElement,
  );

  // Create sort button and add it to the left area
  const sortButton = yield* button(
    binds,
    {
      position: PositionRelative.make(1),
      height: 1,
      left: 0,
      top: 0,
      text: "Sort",
      colors: options.colors,
      onClick: Effect.fn(function* () {
        const currentSort = yield* Ref.get(sortConfig);
        const hasDateSort = currentSort.orderBy.some((criterion: string) => criterion === "date");
        const newOrderBy = hasDateSort ? (["folder", "alphanumeric"] as const) : (["date", "alphanumeric"] as const);
        yield* setSort({
          direction: currentSort.direction,
          orderBy: newOrderBy,
        });
        const sortText = newOrderBy.some((criterion: string) => criterion === "date") ? "Date" : "Name";
        yield* statusBarRightText.setText(`Sort: ${sortText}`);
      }),
    },
    statusBarElement, // Parent is the status bar
  );

  yield* statusBarElement.addElement("left", sortButton);
  yield* statusBarElement.addElement("right", statusBarRightText);

  // Always add to parent, but control visibility
  yield* statusBarElement.setVisible(statusBarEnabled);

  // Search input
  const searchInput = yield* input(
    binds,
    {
      ...options,
      focused: false,
      visible: searchOpts.enabled,
      colors: options.colors ?? DEFAULTS.colors,
      width: "100%",
      position: PositionRelative.make(1),
      height: 1,
      left: 0,
      top: 0,
      value: "",
      placeholder: "Search files",
      onUpdate: Effect.fn(function* (self) {
        const value = yield* self.getValue();
        if (value.length === 0) {
          const allFiles = yield* Ref.get(files);
          yield* Ref.set(filteredFiles, allFiles);
        } else if (fuse) {
          const filtered = fuse.search(value).map((o) => o.item);
          yield* Ref.set(filteredFiles, filtered);
        }
        yield* updateScrollOffset();
      }),
    },
    wrapper,
  );

  // Helper to update scroll offset
  const updateScrollOffset = Effect.fn(function* () {
    const idx = yield* Ref.get(focusedIndex);
    const fileList = yield* Ref.get(filteredFiles);
    const { heightValue: height } = yield* Ref.get(fileSelectElement.dimensions);
    const maxVisibleItems = Math.max(1, height);
    const halfVisible = Math.floor(maxVisibleItems / 2);
    const newScrollOffset = Math.max(0, Math.min(idx - halfVisible, fileList.length - maxVisibleItems));
    yield* Ref.set(scrollOffset, newScrollOffset);
  });

  // Setters/getters
  const setLookupPath = Effect.fn(function* (path: string) {
    yield* Ref.set(lookupPath, path);
    yield* pathText.setContent(`Path: ${path}`);
    yield* readDirectory(path);
    yield* Ref.set(focusedIndex, 0);
    yield* updateScrollOffset();
  });

  const getLookupPath = Effect.fn(function* () {
    return yield* Ref.get(lookupPath);
  });

  const goUp = Effect.fn(function* () {
    const currentPath = yield* Ref.get(lookupPath);
    const parentPath = currentPath === "/" ? "/" : currentPath.split("/").slice(0, -1).join("/") || "/";
    yield* setLookupPath(parentPath);
  });

  const getSelectedFiles = Effect.fn(function* () {
    const fileList = yield* Ref.get(files);
    const selIds = yield* Ref.get(selectedIds);
    return fileList.filter((file) => selIds.includes(file.id));
  });

  const toggleSelection = Effect.fn(function* (index: number) {
    const fileList = yield* Ref.get(filteredFiles);
    if (index < 0 || index >= fileList.length) return;

    const file = fileList[index];
    const selIds = yield* Ref.get(selectedIds);
    const isSelected = selIds.includes(file.id);

    if (isSelected) {
      yield* Ref.set(
        selectedIds,
        selIds.filter((id) => id !== file.id),
      );
    } else {
      yield* Ref.set(selectedIds, [...selIds, file.id]);
    }
  });

  const setFocusedIndex = Effect.fn(function* (index: number) {
    const fileList = yield* Ref.get(filteredFiles);
    if (index >= 0 && index < fileList.length) {
      yield* Ref.set(focusedIndex, index);
      yield* updateScrollOffset();
    }
  });

  const getFocusedIndex = Effect.fn(function* () {
    return yield* Ref.get(focusedIndex);
  });

  const setTextColor = fileSelectElement.setForegroundColor;

  const setSelectedTextColor = Effect.fn(function* (color) {
    if (typeof color === "function") {
      yield* Ref.update(selectedFg, (c) => color(c));
    } else {
      yield* Ref.set(selectedFg, color);
    }
  });

  const setSelectedBgColor = Effect.fn(function* (color) {
    if (typeof color === "function") {
      yield* Ref.update(selectedBg, (c) => color(c));
    } else {
      yield* Ref.set(selectedBg, color);
    }
  });

  const setFocusedBgColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(fileSelectElement.colors, (c) => ({
        ...c,
        focusedBg: color(c.focusedBg),
      }));
    } else {
      yield* Ref.update(fileSelectElement.colors, (c) => ({ ...c, focusedBg: color }));
    }
  });

  const setFocusedTextColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(fileSelectElement.colors, (c) => ({
        ...c,
        focusedFg: color(c.focusedFg),
      }));
    } else {
      yield* Ref.update(fileSelectElement.colors, (c) => ({ ...c, focusedFg: color }));
    }
  });

  const setWrapSelection = Effect.fn(function* (wrap: boolean) {
    yield* Ref.set(wrapSelection, wrap);
  });

  const setShowScrollIndicator = Effect.fn(function* (show: boolean) {
    yield* Ref.set(showScrollIndicator, show);
  });

  const setSort = Effect.fn(function* (sort: typeof SortOptions.Type) {
    yield* Ref.set(sortConfig, sort);
    const currentFiles = yield* Ref.get(files);
    const sortedFiles = yield* sortFiles(currentFiles, sort);
    yield* Ref.set(files, sortedFiles);
    yield* Ref.set(filteredFiles, sortedFiles);
    if (fuse) {
      fuse.setCollection(sortedFiles);
    }
  });

  // Keyboard navigation
  const moveUp = Effect.fn(function* (steps: number = 1) {
    const idx = yield* Ref.get(focusedIndex);
    const fileList = yield* Ref.get(filteredFiles);
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx - steps;
    if (newIndex >= 0) {
      yield* Ref.set(focusedIndex, newIndex);
    } else if (wrap && fileList.length > 0) {
      yield* Ref.set(focusedIndex, fileList.length - 1);
    } else {
      yield* Ref.set(focusedIndex, 0);
    }
    yield* updateScrollOffset();
  });

  const moveDown = Effect.fn(function* (steps: number = 1) {
    const idx = yield* Ref.get(focusedIndex);
    const fileList = yield* Ref.get(filteredFiles);
    const wrap = yield* Ref.get(wrapSelection);
    let newIndex = idx + steps;
    if (newIndex < fileList.length) {
      yield* Ref.set(focusedIndex, newIndex);
    } else if (wrap && fileList.length > 0) {
      yield* Ref.set(focusedIndex, 0);
    } else {
      yield* Ref.set(focusedIndex, fileList.length - 1);
    }
    yield* updateScrollOffset();
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const focused = yield* Ref.get(fileSelectElement.focused);
    if (!focused) return false;

    const sa = yield* Ref.get(searchable);
    const keyName = key.name;
    const isShift = key.shift;

    // Handle search focus
    if (sa && keyName === "tab") {
      yield* Ref.update(searchInput.focused, (f) => !f);
      return true;
    }

    // Handle up button
    if (keyName === "u" && key.ctrl) {
      yield* goUp();
      return true;
    }

    // Handle enter on directory
    if (keyName === "return" || keyName === "enter") {
      const focIdx = yield* Ref.get(focusedIndex);
      const fileList = yield* Ref.get(filteredFiles);
      if (focIdx >= 0 && focIdx < fileList.length) {
        const file = fileList[focIdx];
        if (file.isDirectory) {
          if (file.name === "..") {
            yield* goUp();
          } else {
            yield* setLookupPath(file.path);
          }
          return true;
        } else {
          const selectedFiles = yield* getSelectedFiles();
          yield* onSelect(selectedFiles);
          return true;
        }
      }
    }

    // Navigation
    return yield* Match.value(keyName).pipe(
      Match.when(
        "up",
        Effect.fn(function* () {
          yield* moveUp(isShift ? 5 : 1);
          return true;
        }),
      ),
      Match.when(
        "down",
        Effect.fn(function* () {
          yield* moveDown(isShift ? 5 : 1);
          return true;
        }),
      ),
      Match.when(
        "space",
        Effect.fn(function* () {
          const focIdx = yield* Ref.get(focusedIndex);
          const fileList = yield* Ref.get(filteredFiles);
          if (focIdx >= 0 && focIdx < fileList.length) {
            const file = fileList[focIdx];
            if (!file.isDirectory) {
              // Only toggle selection for files, not directories
              yield* toggleSelection(focIdx);
            }
          }
          return true;
        }),
      ),
      Match.orElse(
        Effect.fn(function* () {
          return false;
        }),
      ),
    );
  });

  wrapper.onUpdate = Effect.fn(function* (self) {
    const v = yield* Ref.get(wrapper.visible);
    if (!v) return;

    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(wrapper.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(wrapper.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, wrapper.num);

    let topY = 0;
    const elements = yield* Ref.get(wrapper.renderables);
    for (const element of elements) {
      const { heightValue: height } = yield* Ref.get(element.dimensions);
      yield* Ref.update(element.location, (loc) => ({ ...loc, y: topY }));
      yield* element.update();
      topY += height;
    }
  });

  const onKeyboardEvent = Effect.fn(function* (event) {
    const fn = options.onKeyboardEvent ?? Effect.fn(function* (event) {});
    yield* fn(event);
    if (!event.defaultPrevented) {
      yield* handleKeyPress(event.parsedKey);
    }
  });

  const destroy = Effect.fn(function* () {
    yield* framebuffer_buffer.destroy;
    yield* fileSelectElement.destroy();
  });

  const onSelect = Effect.fn(function* (selectedFiles: FileOption[]) {
    const fn = options.onSelect ?? Effect.fn(function* (files: FileOption[]) {});
    yield* fn(selectedFiles);
  });

  // Function to sort files
  const sortFiles = Effect.fn(function* (fileOptions: FileOption[], sort: typeof SortOptions.Type) {
    return [...fileOptions].sort((a, b) => {
      for (const criterion of sort.orderBy) {
        const cmp = Match.value(criterion).pipe(
          Match.when("folder", () => (a.isDirectory ? 0 : 1) - (b.isDirectory ? 0 : 1)),
          Match.when("files", () => (a.isDirectory ? 1 : 0) - (b.isDirectory ? 1 : 0)),
          Match.when("alphanumeric", () => a.name.localeCompare(b.name)),
          Match.when("date", () => {
            if (a.modified && b.modified) {
              return a.modified.getTime() - b.modified.getTime();
            } else if (a.modified) {
              return -1;
            } else if (b.modified) {
              return 1;
            }
            return 0;
          }),
          Match.when("size", () => {
            if (a.size !== undefined && b.size !== undefined) {
              return Number(a.size - b.size);
            } else if (a.size !== undefined) {
              return -1;
            } else if (b.size !== undefined) {
              return 1;
            }
            return 0;
          }),
          Match.orElse(() => 0),
        );
        if (cmp !== 0) {
          return sort.direction === "asc" ? cmp : -cmp;
        }
      }
      return 0;
    });
  });

  // Function to read directory
  const readDirectory = Effect.fn(function* (location: string) {
    const files_from_folder = yield* fs.readDirectory(location);
    const entries = yield* Effect.all(
      files_from_folder.map(
        Effect.fn(function* (file) {
          const stat = yield* fs.stat(file);
          return {
            ...stat,
            name: file,
            path: path.join(location, file),
          };
        }),
      ),
      {
        concurrency: 10,
        batching: true,
      },
    );
    const fileOptions: FileOption[] = [];

    // Add parent directory option if not root
    if (location !== "/") {
      fileOptions.push({
        name: "..",
        path: "..",
        isDirectory: true,
        id: "..",
      });
    }

    for (const entry of entries) {
      const filePath = path.join(location, entry.name);
      const absolutePath = path.join(process.cwd(), filePath);
      fileOptions.push({
        name: entry.name,
        path: absolutePath,
        isDirectory: entry.type === "Directory",
        size: entry.size,
        modified: Option.isSome(entry.mtime) ? entry.mtime.value : undefined,
        id: absolutePath,
      });
    }

    const currentSort = yield* Ref.get(sortConfig);
    const sortedFileOptions = yield* sortFiles(fileOptions, currentSort);
    yield* Ref.set(files, sortedFileOptions);
    yield* Ref.set(filteredFiles, sortedFileOptions);
    if (fuse) {
      fuse.setCollection(sortedFileOptions);
    }
  });

  // Initialize
  yield* readDirectory(options.lookup_path ?? DEFAULTS.lookup_path);

  const orderOfElements = options.orderOfElements ?? DEFAULTS.orderOfElements;

  for (const element of orderOfElements) {
    yield* Match.value(element).pipe(
      Match.when(
        "search",
        Effect.fn(function* () {
          yield* wrapper.add(searchInput);
        }),
      ),
      Match.when(
        "file-list",
        Effect.fn(function* () {
          yield* wrapper.add(pathText);
          yield* wrapper.add(fileSelectElement);
        }),
      ),
      Match.when(
        "status-bar",
        Effect.fn(function* () {
          yield* wrapper.add(statusBarElement);
        }),
      ),
      Match.exhaustive,
    );
  }

  return {
    ...wrapper,
    onKeyboardEvent,
    // onUpdate,
    onSelect,
    setLookupPath,
    getLookupPath,
    goUp,
    getSelectedFiles,
    toggleSelection,
    setFocusedIndex,
    getFocusedIndex,
    setTextColor,
    setSelectedTextColor,
    setSelectedBgColor,
    setFocusedBgColor,
    setFocusedTextColor,
    setWrapSelection,
    setShowScrollIndicator,
    setSort,
    handleKeyPress,
    destroy,
  };
});
