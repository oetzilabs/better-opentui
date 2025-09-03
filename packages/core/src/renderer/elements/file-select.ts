import { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Option, Order, Ref, Schema } from "effect";
import Fuse, { type IFuseOptions } from "fuse.js";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { KeyboardEvent } from "../../events/keyboard";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { collection, type Sorting } from "../utils/collection";
import { PositionRelative } from "../utils/position";
import { type BaseElement } from "./base";
import { button } from "./button";
import { type FrameBufferOptions } from "./framebuffer";
import { group } from "./group";
import { input } from "./input";
import { list, type RenderItemContext } from "./list";
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

const SortOptions = Schema.Array(
  Schema.Struct({
    type: SortCriterion,
    direction: Schema.Union(Schema.Literal("asc"), Schema.Literal("desc")),
  }),
);

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
  display: string;
}

export interface FileSelectElement<FBT extends string = "file-select">
  extends BaseElement<"file-select", FileSelectElement<FBT>> {
  setLookupPath: (path: string) => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  getLookupPath: () => Effect.Effect<string, Collection, Library>;
  goUp: () => Effect.Effect<void, Collection, Library | FileSystem.FileSystem | Path.Path>;
  getSelectedFile: () => Effect.Effect<FileOption | null, Collection, Library>;
  setSelectedIndex: (index: number) => Effect.Effect<void, Collection, Library>;
  setTextColor: (color: ((oldColor: Input) => Input) | Input) => Effect.Effect<void, Collection, Library>;
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
    directoryBg?: Input;
    fileBg?: Input;
    fileFg?: Input;
  };
  showScrollIndicator?: boolean;
  selectedIndex?: number;
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
  layout?: ("search" | "status-bar" | "file-list" | "path")[];
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
    directoryBg: Colors.Custom("#2a2a2a"),
    directoryFg: Colors.Custom("#4A90E2"), // Blue for directories
    fileBg: Colors.Transparent,
    fileFg: Colors.Custom("#7ED321"), // Green for files
    pathBg: Colors.Custom("#2a2a2a"),
    pathFg: Colors.White,
  },
  showScrollIndicator: false,
  selectedIndex: -1,
  search: { enabled: false, config: { keys: ["name"] } },
  parentNode: null,
  lookup_path: ".",
  sort: [
    { type: "folder", direction: "desc" },
    { type: "alphanumeric", direction: "asc" },
  ],
  statusBar: { enabled: true },
  layout: ["search", "path", "file-list", "status-bar"],
} satisfies FileSelectOptions;

export const fileSelect = Effect.fn(function* <FBT extends string = "file-select">(
  binds: Binds,
  options: FileSelectOptions<FBT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const lookupPath = yield* Ref.make(path.join(process.cwd(), options.lookup_path ?? DEFAULTS.lookup_path));

  const searchOpts = options.search ?? DEFAULTS.search;

  const internalColors = yield* Ref.make({
    ...options.colors,
    ...DEFAULTS.colors,
  });

  const parentDimensions = yield* Ref.get(parentElement.dimensions);

  // Get layout
  const layout = options.layout ?? DEFAULTS.layout;

  // Calculate fixed heights for layout elements
  const searchHeight = layout.includes("search") ? 1 : 0;
  const pathHeight = layout.includes("path") ? 1 : 0;

  // Get status bar configuration
  const statusBarConfig = options.statusBar ?? DEFAULTS.statusBar;
  const statusBarEnabled = statusBarConfig.enabled ?? DEFAULTS.statusBar.enabled;
  const statusBarHeight = statusBarEnabled ? 1 : 0;

  const fileCollection = yield* collection<FileOption>(
    [
      {
        name: "..",
        path: "..",
        isDirectory: true,
        id: "..",
        display: "📁 ..",
      },
    ],
    "name",
  );

  const sortConfig = yield* Ref.make(options.sort ?? DEFAULTS.sort);

  const fuse = searchOpts.enabled ? new Fuse([], searchOpts.config ?? { keys: ["name"] }) : null;

  const wrapper = yield* group(
    binds,
    {
      position: PositionRelative.make(1),
      width: "100%",
      height: "auto",
      left: 0,
      top: 0,
      visible: true,
    },
    parentElement,
  );
  const cols = yield* Ref.get(internalColors);
  const directoryFg = yield* parseColor(cols.directoryFg);
  const fileFg = yield* parseColor(cols.fileFg);
  const selFg = yield* parseColor(cols.selectedFg);
  const directoryBg = yield* parseColor(cols.directoryBg);
  const fileBg = yield* parseColor(cols.fileBg);
  const selBg = yield* parseColor(cols.selectedBg);
  const focusedBg = yield* parseColor(cols.focusedBg);
  const focusedFg = yield* parseColor(cols.focusedFg);

  const listElement = yield* list(
    binds,
    fileCollection,
    {
      position: PositionRelative.make(1),
      width: "100%",
      left: 0,
      top: 2,
      height: options.height
        ? options.height === "auto"
          ? Math.min(
              20, // Default file list height
              parentDimensions.heightValue - searchHeight - pathHeight - statusBarHeight, // Space for search + path + status bar if enabled
            )
          : options.height
        : Math.min(20, parentDimensions.heightValue - searchHeight - pathHeight - statusBarHeight),
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
        focusedBg: options.colors?.focusedBg ?? DEFAULTS.colors.focusedBg,
        focusedFg: options.colors?.focusedFg ?? DEFAULTS.colors.focusedFg,
        selectedBg: options.colors?.selectedBg ?? DEFAULTS.colors.selectedBg,
        selectedFg: options.colors?.selectedFg ?? DEFAULTS.colors.selectedFg,
        scrollIndicator: options.colors?.scrollIndicator ?? DEFAULTS.colors.scrollIndicator,
      },
      showScrollIndicator: options.showScrollIndicator ?? DEFAULTS.showScrollIndicator,
      renderItem: Effect.fn(function* (buffer, framebuffer_buffer, context: RenderItemContext<FileOption>) {
        const { item: file, index, isFocused, isSelected, x, y, width, height, colors } = context;

        // Enhanced icons and colors
        const icon = file.isDirectory ? "📁" : "📄";
        const sizeInfo = file.size ? ` (${formatFileSize(file.size)})` : "";
        const dateInfo = file.modified ? ` ${file.modified.toLocaleDateString()}` : "";
        const nameContent = `${icon} ${file.name}${sizeInfo}${dateInfo}`;

        let fg = file.isDirectory ? directoryFg : fileFg;
        if (isSelected) {
          fg = selFg;
        }
        if (isFocused) {
          fg = focusedFg;
        }
        let bg = file.isDirectory ? directoryBg : fileBg;
        if (isSelected) {
          bg = selBg;
        }
        if (isFocused) {
          bg = focusedBg;
        }

        yield* Effect.all(
          [framebuffer_buffer.fillRect(0, y, width, height, bg), framebuffer_buffer.drawText(nameContent, 0, y, fg)],
          {
            concurrency: "unbounded",
          },
        );
      }),
    },
    wrapper,
  );

  yield* listElement.setOnSelect(
    Effect.fn(function* (item) {
      const it = item as FileOption | null;
      if (it) {
        if (it.isDirectory) {
          if (it.name === "..") {
            yield* goUp();
          } else {
            yield* setLookupPath(it.path);
          }
          yield* searchInput.setValue("");
        } else {
          // Select file
          yield* onSelect([it]);
        }
      }
      return;
    }),
  );

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
      text: options.sort && options.sort.length > 0 ? (options.sort[0].direction === "asc" ? "▲" : "▼") : "Ready",
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
        const hasDateSort = currentSort.some((criterion) => criterion.type === "date");
        const newSort = hasDateSort
          ? [
              { type: "folder" as const, direction: "asc" as const },
              { type: "alphanumeric" as const, direction: "asc" as const },
            ]
          : [
              { type: "date" as const, direction: "asc" as const },
              { type: "alphanumeric" as const, direction: "asc" as const },
            ];
        yield* setSort(newSort);
        const sortText = newSort.some((criterion) => criterion.type === "date") ? "Date" : "Name";
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
      focused: true,
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
        // ! Keep this empty to avoid LSP issues.
        // TODO: Figure out why this is needed.
      }),
      onChange: Effect.fn(function* (value: string) {
        if (value.length === 0) {
          const lup = yield* getLookupPath();
          yield* Effect.suspend(() => readDirectory(options.lookup_path ?? DEFAULTS.lookup_path));
        } else if (fuse) {
          const allFiles = yield* fileCollection.getItems();
          fuse.setCollection(allFiles);
          const filtered = fuse.search(value).map((o) => o.item);
          yield* fileCollection.setItems(filtered);
        }
        yield* listElement.setFocusedIndex(0);
      }),
    },
    wrapper,
  );

  // Setters/getters
  const setLookupPath = Effect.fn(function* (path: string) {
    yield* Ref.set(lookupPath, path);
    yield* pathText.setContent(`Path: ${path}`);
    yield* readDirectory(path);
    yield* listElement.setFocusedIndex(0);
  });

  const getLookupPath = Effect.fn(function* () {
    return yield* Ref.get(lookupPath);
  });

  const goUp = Effect.fn(function* () {
    const currentPath = yield* Ref.get(lookupPath);
    const parentPath = currentPath === "/" ? "/" : currentPath.split("/").slice(0, -1).join("/") || "/";
    yield* setLookupPath(parentPath);
  });

  const setTextColor = listElement.setForegroundColor;

  const setShowScrollIndicator = Effect.fn(function* (show: boolean) {
    yield* listElement.setShowScrollIndicator(show);
  });

  const setSort = Effect.fn(function* (sort: typeof SortOptions.Type) {
    yield* Ref.set(sortConfig, sort);
    // Create new sorts
    const newSortings: Sorting<FileOption>[] = [];
    for (const criterion of sort) {
      const sorting = Match.value(criterion.type).pipe(
        Match.when("folder", () => ({
          id: "folder",
          key: "isDirectory" as keyof FileOption,
          direction: criterion.direction,
          fn: Order.boolean,
        })),
        Match.when("files", () => ({
          id: "files",
          key: "isDirectory" as keyof FileOption,
          direction: criterion.direction,
          fn: Order.boolean,
        })),
        Match.when("alphanumeric", () => ({
          id: "alphanumeric",
          key: "name" as keyof FileOption,
          direction: criterion.direction,
          fn: Order.string,
        })),
        Match.when("date", () => ({
          id: "date",
          key: "modified" as keyof FileOption,
          direction: criterion.direction,
          fn: Order.bigint,
        })),
        Match.when("size", () => ({
          id: "size",
          key: "size" as keyof FileOption,
          direction: criterion.direction,
          fn: Order.number,
        })),
        Match.orElse(() => ({
          id: "default",
          key: "name" as keyof FileOption,
          direction: criterion.direction,
          fn: Order.string,
        })),
      );
      // @ts-ignore
      newSortings.push(sorting);
    }
    yield* fileCollection.resetSort(...newSortings);
    yield* fileCollection.onUpdate();
    const sortedFiles = yield* fileCollection.getItems();
    if (fuse) {
      fuse.setCollection(sortedFiles);
    }
  });

  const handleKeyPress = Effect.fn(function* (key: ParsedKey) {
    const sa = searchOpts.enabled;
    const keyName = key.name;
    const isShift = key.shift;

    // Handle search focus
    if (sa && keyName === "tab") {
      yield* Ref.update(searchInput.focused, (f) => !f);
      return true;
    }

    // // Handle up button
    // if (keyName === "u" && key.ctrl) {
    //   yield* goUp();
    //   return true;
    // }

    return false;
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
      const loc = yield* Ref.updateAndGet(element.location, (loc) => ({ ...loc, y: topY, x: loc.x }));
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
    yield* listElement.destroy();
  });

  const onSelect = Effect.fn(function* (selectedFiles: FileOption[]) {
    const fn = options.onSelect ?? Effect.fn(function* (files: FileOption[]) {});
    yield* fn(selectedFiles);
  });

  // Function to read directory
  const readDirectory = Effect.fn(function* (location: string) {
    if (location === "/") return;
    const path_exists = yield* fs.exists(location);
    if (!path_exists) return;
    const files_from_folder = yield* fs.readDirectory(location);
    const entries = yield* Effect.all(
      files_from_folder.map(
        Effect.fn(function* (file) {
          const fullpath = path.join(location, file);
          const stat = yield* fs.stat(fullpath);
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
        display: "📁 ..",
      });
    }

    for (const entry of entries) {
      const filePath = path.join(location, entry.name);
      const icon = entry.type === "Directory" ? "📁" : "📄";
      const sizeInfo = entry.size ? ` (${formatFileSize(entry.size)})` : "";
      const dateInfo = Option.isSome(entry.mtime) ? ` ${entry.mtime.value.toLocaleDateString()}` : "";
      const display = `${icon} ${entry.name}${sizeInfo}${dateInfo}`;
      fileOptions.push({
        name: entry.name,
        path: filePath,
        isDirectory: entry.type === "Directory",
        size: entry.size,
        modified: Option.isSome(entry.mtime) ? entry.mtime.value : undefined,
        id: filePath,
        display,
      });
    }

    yield* fileCollection.setItems(fileOptions);
    const currentSort = yield* Ref.get(sortConfig);
    yield* setSort(currentSort);
    yield* fileCollection.onUpdate();

    if (fuse) {
      fuse.setCollection(fileOptions);
    }
  });

  // Initialize
  yield* readDirectory(options.lookup_path ?? DEFAULTS.lookup_path);

  for (const element of layout) {
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
          yield* wrapper.add(listElement);
        }),
      ),
      Match.when(
        "path",
        Effect.fn(function* () {
          yield* wrapper.add(pathText);
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
    onSelect,
    setLookupPath,
    getLookupPath,
    goUp,
    setTextColor,
    setShowScrollIndicator,
    setSort,
    handleKeyPress,
    destroy,
  };
});
