import { FileSystem, Path } from "@effect/platform";
import { Effect, Match, Option, Ref } from "effect";
import Fuse, { type IFuseOptions } from "fuse.js";
import { OptimizedBuffer } from "../../buffer/optimized";
import { Colors, Input } from "../../colors";
import type { Collection } from "../../errors";
import type { KeyboardEvent } from "../../events/keyboard";
import type { ParsedKey } from "../../inputs/keyboard";
import { parseColor } from "../../utils";
import { Library } from "../../zig";
import { PositionAbsolute, PositionRelative } from "../utils/position";
import { base, type BaseElement } from "./base";
import { type FrameBufferOptions } from "./framebuffer";
import { input } from "./input";
import type { Binds, ElementOptions } from "./utils";

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
    upButtonBg?: Input;
    upButtonFg?: Input;
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
    pathBg: Colors.Custom("#2a2a2a"),
    pathFg: Colors.White,
    upButtonBg: Colors.Custom("#444444"),
    upButtonFg: Colors.White,
  },
  showScrollIndicator: false,
  selectedIds: [],
  search: { enabled: false, config: { keys: ["name"] } },
  parentNode: null,
  lookup_path: ".",
} satisfies FileSelectOptions;

export const fileSelect = Effect.fn(function* <FBT extends string = "file-select">(
  binds: Binds,
  options: FileSelectOptions<FBT>,
  parentElement: BaseElement<any, any> | null = null,
) {
  const lib = yield* Library;
  if (!parentElement) return yield* Effect.fail(new Error("Parent element is required"));

  const searchOpts = options.search ?? DEFAULTS.search;

  const parentDimensions = yield* Ref.get(parentElement.dimensions);

  const b = yield* base<"file-select", FileSelectElement<FBT>>(
    "file-select",
    binds,
    {
      ...options,
      position: PositionRelative.make(1),
      selectable: true,
      left: 0,
      top: 2, // Leave space for path and up button
      height: options.height
        ? options.height === "auto"
          ? Math.min(
              20, // Default file list height
              parentDimensions.heightValue - 4, // Space for path, up, search
            )
          : options.height
        : Math.min(20, parentDimensions.heightValue - 4),
      colors: {
        bg: options.colors?.bg ?? DEFAULTS.colors.bg,
        fg: options.colors?.fg ?? DEFAULTS.colors.fg,
        focusedBg: options.colors?.focusedBg ?? DEFAULTS.colors.focusedBg,
        focusedFg: options.colors?.focusedFg ?? DEFAULTS.colors.focusedFg,
      },
    },
    parentElement,
  );

  const framebuffer_buffer = yield* b.createFrameBuffer();

  const lookupPath = yield* Ref.make(options.lookup_path ?? DEFAULTS.lookup_path);
  const files = yield* Ref.make<FileOption[]>([]);
  const filteredFiles = yield* Ref.make<FileOption[]>([]);
  const selectedIds = yield* Ref.make<string[]>([]);
  const focusedIndex = yield* Ref.make(0);

  const selectedBg = yield* Ref.make(options.colors?.selectedBg ?? DEFAULTS.colors.selectedBg);
  const selectedFg = yield* Ref.make(options.colors?.selectedFg ?? DEFAULTS.colors.selectedFg);
  const scrollIndicatorColor = yield* Ref.make(options.colors?.scrollIndicator ?? DEFAULTS.colors.scrollIndicator);
  const pathBg = yield* Ref.make(options.colors?.pathBg ?? DEFAULTS.colors.pathBg);
  const pathFg = yield* Ref.make(options.colors?.pathFg ?? DEFAULTS.colors.pathFg);
  const upButtonBg = yield* Ref.make(options.colors?.upButtonBg ?? DEFAULTS.colors.upButtonBg);
  const upButtonFg = yield* Ref.make(options.colors?.upButtonFg ?? DEFAULTS.colors.upButtonFg);

  const scrollOffset = yield* Ref.make(0);
  const wrapSelection = yield* Ref.make(true);

  const searchable = yield* Ref.make(searchOpts.enabled);

  const fuse = searchOpts.enabled ? new Fuse([], searchOpts.config ?? { keys: ["name"] }) : null;

  // Function to read directory
  const readDirectory = Effect.fn(function* (path: string) {
    const fs = yield* FileSystem.FileSystem;
    const p = yield* Path.Path;
    const fullPath = p.join(path);
    const files_from_folder = yield* fs.readDirectory(fullPath);
    const entries = yield* Effect.all(
      files_from_folder.map(
        Effect.fn(function* (file) {
          const stat = yield* fs.stat(file);
          return {
            ...stat,
            name: file,
            path: p.join(fullPath, file),
          };
        }),
      ),
    );
    const fileOptions: FileOption[] = [];

    // Add parent directory option if not root
    if (path !== "/") {
      fileOptions.push({
        name: "..",
        path: "..",
        isDirectory: true,
        id: "..",
      });
    }

    for (const entry of entries) {
      const filePath = p.join(fullPath, entry.name);
      fileOptions.push({
        name: entry.name,
        path: filePath,
        isDirectory: entry.type === "Directory",
        size: entry.size,
        modified: Option.isSome(entry.mtime) ? entry.mtime.value : undefined,
        id: filePath,
      });
    }

    yield* Ref.set(files, fileOptions);
    yield* Ref.set(filteredFiles, fileOptions);
    if (fuse) {
      fuse.setCollection(fileOptions);
    }
  });

  // Initialize
  yield* readDirectory(options.lookup_path ?? DEFAULTS.lookup_path);

  const listDimensions = yield* Ref.get(b.dimensions);
  const listPosition = yield* Ref.get(b.location);
  // Search input
  const searchInput = yield* input(
    binds,
    {
      ...options,
      focused: false,
      visible: true,
      colors: options.colors ?? DEFAULTS.colors,
      width: options.width,
      position: PositionRelative.make(1),
      height: 1,
      left: 0,
      top: listPosition.y + listDimensions.heightValue,
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
    parentElement,
  );

  yield* parentElement.add(searchInput);

  // Helper to update scroll offset
  const updateScrollOffset = Effect.fn(function* () {
    const idx = yield* Ref.get(focusedIndex);
    const fileList = yield* Ref.get(filteredFiles);
    const { heightValue: height } = yield* Ref.get(b.dimensions);
    const maxVisibleItems = Math.max(1, height);
    const halfVisible = Math.floor(maxVisibleItems / 2);
    const newScrollOffset = Math.max(0, Math.min(idx - halfVisible, fileList.length - maxVisibleItems));
    yield* Ref.set(scrollOffset, newScrollOffset);
  });

  // Rendering
  const render = Effect.fn(function* (buffer: OptimizedBuffer, _dt: number) {
    yield* Library; // Ensure Library context
    const v = yield* Ref.get(b.visible);
    if (!v) return;

    const loc = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    const focused = yield* Ref.get(b.focused);
    const colors = yield* Ref.get(b.colors);
    const bgColor = yield* parseColor(focused ? colors.focusedBg : colors.bg);
    yield* framebuffer_buffer.clear(bgColor);

    const fileList = yield* Ref.get(filteredFiles);
    const selIds = yield* Ref.get(selectedIds);
    const focIdx = yield* Ref.get(focusedIndex);
    const scroll = yield* Ref.get(scrollOffset);
    const currentPath = yield* Ref.get(lookupPath);

    // Render path
    const pathBgVal = yield* Ref.get(pathBg);
    const pathFgVal = yield* Ref.get(pathFg);
    const pathBgColor = yield* parseColor(pathBgVal);
    const pathFgColor = yield* parseColor(pathFgVal);
    yield* framebuffer_buffer.fillRect(0, 0, w, 1, pathBgColor);
    yield* framebuffer_buffer.drawText(`Path: ${currentPath}`, 0, 0, pathFgColor);

    // Render up button
    const upBgVal = yield* Ref.get(upButtonBg);
    const upFgVal = yield* Ref.get(upButtonFg);
    const upBgColor = yield* parseColor(upBgVal);
    const upFgColor = yield* parseColor(upFgVal);
    const upText = "[Up]";
    const upX = w - upText.length;
    yield* framebuffer_buffer.fillRect(upX, 0, upText.length, 1, upBgColor);
    yield* framebuffer_buffer.drawText(upText, upX, 0, upFgColor);

    // Render file list
    const visibleFiles = fileList.slice(scroll, scroll + h);
    const baseFg = yield* parseColor(focused ? colors.focusedFg : colors.fg);
    const selBgVal = yield* Ref.get(selectedBg);
    const selFgVal = yield* Ref.get(selectedFg);
    const selBg = yield* parseColor(selBgVal);
    const selFg = yield* parseColor(selFgVal);

    for (let i = 0; i < visibleFiles.length; i++) {
      const actualIndex = scroll + i;
      const file = visibleFiles[i];
      const isSelected = selIds.includes(file.id);
      const isFocused = actualIndex === focIdx;
      const itemY = 1 + i; // Start after path row

      if (itemY >= h + 1) break;

      if (isFocused) {
        yield* framebuffer_buffer.fillRect(0, itemY, w, 1, selBg);
      }

      const icon = file.isDirectory ? "[DIR]" : "[FILE]";
      const nameContent = `${icon} ${file.name}`;
      const nameColor = isFocused ? selFg : baseFg;

      yield* framebuffer_buffer.drawText(nameContent, 0, itemY, nameColor);
    }

    // Scroll indicator
    const showScroll = options.showScrollIndicator ?? DEFAULTS.showScrollIndicator;
    if (showScroll && fileList.length > h) {
      const scrollPercent = focIdx / Math.max(1, fileList.length - 1);
      const indicatorY = 1 + Math.floor(scrollPercent * h);
      const indicatorX = w - 1;
      const sic = yield* Ref.get(scrollIndicatorColor);
      const parsedSIC = yield* parseColor(sic);
      yield* framebuffer_buffer.drawText("█", indicatorX, indicatorY, parsedSIC);
    }

    yield* buffer.drawFrameBuffer(loc.x, loc.y, framebuffer_buffer);
  });

  // Setters/getters
  const setLookupPath = Effect.fn(function* (path: string) {
    yield* Ref.set(lookupPath, path);
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

  const setTextColor = b.setForegroundColor;

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
      yield* Ref.update(b.colors, (c) => ({
        ...c,
        focusedBg: color(c.focusedBg),
      }));
    } else {
      yield* Ref.update(b.colors, (c) => ({ ...c, focusedBg: color }));
    }
  });

  const setFocusedTextColor = Effect.fn(function* (color: ((oldColor: Input) => Input) | Input) {
    if (typeof color === "function") {
      yield* Ref.update(b.colors, (c) => ({
        ...c,
        focusedFg: color(c.focusedFg),
      }));
    } else {
      yield* Ref.update(b.colors, (c) => ({ ...c, focusedFg: color }));
    }
  });

  const setWrapSelection = Effect.fn(function* (wrap: boolean) {
    yield* Ref.set(wrapSelection, wrap);
  });

  const setShowScrollIndicator = Effect.fn(function* (show: boolean) {
    // This is a no-op since we use options.showScrollIndicator
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
    const focused = yield* Ref.get(b.focused);
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

  const onUpdate = Effect.fn(function* (self) {
    const fn = options.onUpdate ?? Effect.fn(function* (self) {});
    yield* fn(self);
    const ctx = yield* Ref.get(binds.context);
    const { x, y } = yield* Ref.get(b.location);
    const { widthValue: w, heightValue: h } = yield* Ref.get(b.dimensions);
    yield* ctx.addToHitGrid(x, y, w, h, b.num);
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
    yield* b.destroy();
  });

  const onSelect = Effect.fn(function* (selectedFiles: FileOption[]) {
    const fn = options.onSelect ?? Effect.fn(function* (files: FileOption[]) {});
    yield* fn(selectedFiles);
  });

  return {
    ...b,
    onKeyboardEvent,
    onUpdate,
    onSelect,
    render,
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
    handleKeyPress,
    destroy,
  };
});
