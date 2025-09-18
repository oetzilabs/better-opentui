import { FileSystem, Path } from "@effect/platform";
import type { PlatformError } from "@effect/platform/Error";
import { Config, Context, DateTime, Effect, Layer, Ref, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import { DEFAULT_THEME } from ".";
import { ThemeFolderNotSupportedYet, ThemeNotFound, ThemeNotJsonFile } from "./errors";
import { ThemeSchema, type Theme } from "./schema";

export interface ThemeManagerInterface {
  lastUpdated: Ref.Ref<DateTime.DateTime>;
  load: (
    themeName: string,
  ) => Effect.Effect<Theme, ThemeNotFound | ThemeFolderNotSupportedYet | ThemeNotJsonFile | PlatformError | ParseError>;
  list: () => Effect.Effect<string[]>;
  current: () => Effect.Effect<Theme>;
  refresh: () => Effect.Effect<
    void,
    ThemeNotFound | ThemeFolderNotSupportedYet | ThemeNotJsonFile | PlatformError | ParseError
  >;
}

export class ThemeManager extends Context.Tag("ThemeManager")<ThemeManager, ThemeManagerInterface>() {}

export const makeThemeManager = Effect.fn("makeThemeManager")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const themes = yield* Ref.make<string[]>(["default"]);
  const currentTheme = yield* Ref.make<Theme>(DEFAULT_THEME);
  const lastUpdated = yield* Ref.make<DateTime.DateTime>(yield* DateTime.now);

  const themeFolderPath = yield* Config.string("THEME_FOLDER").pipe(Config.withDefault("themes"));

  const loadList = Effect.fn("loadList")(function* () {
    const currentWorkingDirectory = process.cwd();
    const isAbsolutePath = path.isAbsolute(themeFolderPath);
    let themePath = path.join(currentWorkingDirectory, themeFolderPath);

    if (isAbsolutePath) {
      themePath = path.join(themeFolderPath);
    }

    const exists = yield* fs.exists(themePath);
    if (!exists) {
      return;
    }

    const pathStats = yield* fs.stat(themePath);
    if (pathStats.type !== "Directory") {
      return;
    }

    const files = yield* fs.readDirectory(themePath);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    const names = jsonFiles.map((file) => file.replace(".json", ""));

    yield* Ref.set(themes, names);
  });

  const load = Effect.fn("load")(function* (themeName: string) {
    if (themeName === "default") {
      yield* Ref.set(currentTheme, DEFAULT_THEME);
      return DEFAULT_THEME;
    }

    const loadedThemes = yield* Ref.get(themes);
    const ct = yield* Ref.get(currentTheme);
    if (!loadedThemes.includes(themeName)) {
      return ct;
    }

    if (ct.name === themeName) {
      return ct;
    }

    const currentWorkingDirectory = process.cwd();
    const isAbsolutePath = path.isAbsolute(themeFolderPath);
    let themePath = path.join(currentWorkingDirectory, themeFolderPath, themeName + ".json");

    if (isAbsolutePath) {
      themePath = path.join(themeFolderPath, themeName + ".json");
    }

    const exists = yield* fs.exists(themePath);
    if (!exists) {
      return yield* Effect.fail(new ThemeNotFound({ name: themeName }));
    }

    const pathStats = yield* fs.stat(themePath);
    if (pathStats.type === "Directory") {
      return yield* Effect.fail(new ThemeFolderNotSupportedYet({ name: themeName }));
    }

    // chechk if the theme is a json file

    const fileName = path.basename(themePath);
    if (!fileName.endsWith(".json") && pathStats.type !== "File") {
      return yield* Effect.fail(new ThemeNotJsonFile({ name: themeName }));
    }

    // load the actual json file

    const contents = yield* fs.readFileString(themePath);
    const json = JSON.parse(contents);
    const theme = yield* Schema.decodeUnknown(ThemeSchema)(json);

    if (!theme) {
      return yield* Effect.fail(new ThemeNotJsonFile({ name: themeName }));
    }

    yield* Ref.set(currentTheme, theme);
    yield* Ref.set(lastUpdated, yield* DateTime.now);

    return theme;
  });

  const list = Effect.fn("list")(function* () {
    return yield* Ref.get(themes);
  });

  const current = Effect.fn("current")(function* () {
    return yield* Ref.get(currentTheme);
  });

  yield* loadList();

  const refresh = Effect.fn("refresh")(function* () {
    return yield* loadList();
  });

  yield* load("default");

  return {
    lastUpdated,
    load,
    list,
    current,
    refresh,
  } as const;
});

export const ThemeManagerLive = Layer.effect(ThemeManager, makeThemeManager());
