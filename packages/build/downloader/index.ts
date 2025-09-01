import { FetchHttpClient, FileSystem, HttpClient, HttpClientRequest, Path } from "@effect/platform";
import { BunFileSystem, BunHttpPlatform, BunPath } from "@effect/platform-bun";
import { Array, Chunk, Console, Effect, Match, Stream } from "effect";
import { DownloaderError, DownloaderFileNotFound } from "./errors";

export class DownloaderService extends Effect.Service<DownloaderService>()("@better-opentui/downloader", {
  effect: Effect.gen(function* (_) {
    const client = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const DEFAULT_TARGET_FOLDER_PATH = "/tmp";

    const download = Effect.fn("@better-opentui/downloader/download")(function* (
      url: string,
      targetFolderPath = DEFAULT_TARGET_FOLDER_PATH,
      writeType: "buffer" | "stream" = "buffer",
    ) {
      const response = yield* client
        .get(url, {
          headers: {
            Accept: "application/octet-stream",
            responseType: "application/octet-stream",
          },
        })
        .pipe(
          Effect.catchTags({
            RequestError: (cause) => Effect.fail(new DownloaderError({ cause })),
            ResponseError: (cause) => Effect.fail(new DownloaderError({ cause })),
          }),
        );
      const isOk = response.status === 200;
      if (!isOk) {
        return yield* Effect.fail(new DownloaderError({ cause: new Error(`Response status is ${response.status}`) }));
      }
      // yield* Console.log(`Response status is ${response.status}`);
      return yield* Match.value(writeType).pipe(
        Match.when(
          "buffer",
          Effect.fn(function* () {
            const buffer = yield* response.arrayBuffer;
            const filename = path.basename(url);
            const targetPath = path.join(targetFolderPath, filename);
            // we have to remove hashes and query params from the url
            const exists = yield* fs.exists(targetFolderPath);
            if (!exists) {
              // create folder
              yield* fs.makeDirectory(targetFolderPath, { recursive: true });
            }
            const targetPathWithoutHash = targetPath.replace(/#.*$/, "").replace(/\?.*$/, "");

            yield* fs.writeFile(targetPathWithoutHash, Buffer.from(buffer)).pipe(
              Effect.catchTags({
                BadArgument: (cause) => Effect.fail(new DownloaderError({ cause })),
                SystemError: (cause) => Effect.fail(new DownloaderError({ cause })),
              }),
            );
            return yield* Effect.succeed(targetPathWithoutHash);
          }),
        ),
        Match.when(
          "stream",
          Effect.fn(function* () {
            const stream = response.stream;
            const collection = yield* stream.pipe(Stream.runCollect);
            const dataArray = Chunk.toArray(collection);
            const data = Uint8Array.from(dataArray);
            const filename = path.basename(url);
            const targetPath = path.join(targetFolderPath, filename);
            const exists = yield* fs.exists(targetFolderPath);
            if (!exists) {
              // create folder
              yield* fs.makeDirectory(targetFolderPath, { recursive: true });
            }
            const targetPathWithoutHash = targetPath.replace(/#.*$/, "").replace(/\?.*$/, "");
            yield* fs.writeFile(targetPathWithoutHash, data).pipe(
              Effect.catchTags({
                BadArgument: (cause) => Effect.fail(new DownloaderError({ cause })),
                SystemError: (cause) => Effect.fail(new DownloaderError({ cause })),
              }),
            );
            return yield* Effect.succeed(targetPathWithoutHash);
          }),
        ),
        Match.orElse(() => Effect.fail(new DownloaderError({ cause: new Error(`Invalid writeType ${writeType}`) }))),
      );
    });

    return {
      download,
    } as const;
  }),
  dependencies: [BunFileSystem.layer, BunPath.layer, FetchHttpClient.layer, BunHttpPlatform.layer],
}) {}

export const DownloaderLive = DownloaderService.Default;

// Type exports
// export type Frontend = NonNullable<Awaited<ReturnType<DownloaderService[""]>>>;
