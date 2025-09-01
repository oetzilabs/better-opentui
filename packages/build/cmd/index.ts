import { Command } from "@effect/platform";
import { Config, Effect, pipe, Stream } from "effect";

export const cmdExec = Effect.fn("@better-opentui/cmd")(function* (
  com: Command.Command,
  ignore_logging: boolean = false,
) {
  const separator = process.platform === "win32" ? ";" : ":";
  const PathConfig = yield* Config.string("PATH").pipe(Config.withDefault(""));
  const PATH = PathConfig.split(separator)
    .filter((p) => !p.includes(" "))
    .join(separator);
  const env = Command.env({
    PATH,
  });

  return yield* pipe(
    Command.start(com.pipe(env)),
    Effect.flatMap((_process) =>
      Effect.gen(function* (_) {
        const stdoutStream = _process.stdout.pipe(Stream.decodeText("utf8"));
        const stderrStream = _process.stderr.pipe(Stream.decodeText("utf8"));
        const stdoutCollection: string[] = [];
        const stderrCollection: string[] = [];

        yield* stdoutStream.pipe(
          Stream.runForEach((line) => {
            stdoutCollection.push(line);
            return ignore_logging ? Effect.void : Effect.log(line);
          }),
          Effect.fork,
        );

        yield* stderrStream.pipe(
          Stream.runForEach((line) => {
            stdoutCollection.push(line);
            return ignore_logging ? Effect.void : Effect.log(line);
          }),
          Effect.fork,
        );
        return Object.assign(_process, {
          stdout: stdoutCollection,
          stderr: stderrCollection,
        });
      }),
    ),
  );
});
