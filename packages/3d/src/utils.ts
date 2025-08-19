import { FileSystem } from "@effect/platform";
import { Config, Effect, Schema } from "effect";
import { Jimp } from "jimp";
import { FailedLoadingTexture, FileNotFound } from "./errors";

export const PathsSchema = Schema.Record({
  key: Schema.String,
  value: Schema.String,
});
type PathsSchema = typeof PathsSchema.Type;

export const fixPaths = Effect.fn(function* (paths: PathsSchema) {
  const packerBundle = yield* Config.boolean("BUN_PACKER_BUNDLE").pipe(Config.withDefault(false));
  if (packerBundle) {
    const entries = Object.entries(paths);
    const fixedEntries = entries.map(([key, value]) => [key, value.replace("../", "")]);
    return PathsSchema.make(Object.fromEntries(fixedEntries));
  }
  return PathsSchema.make(paths);
});

export const loadTemplate = Effect.fn(function* (filePath: string, params: Record<string, string>) {
  const fs = yield* FileSystem.FileSystem;
  const exists = yield* fs.exists(filePath).pipe(
    Effect.catchTags({
      BadArgument: (error) => Effect.succeed(false),
      SystemError: (error) => Effect.succeed(false),
    }),
  );
  if (!exists) {
    return yield* Effect.fail(new FileNotFound({ filePath }));
  }
  const file = yield* fs.readFileString(filePath);
  return file.replace(/\${(\w+)}/g, (match, key) => params[key] || match);
});
