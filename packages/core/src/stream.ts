import { Effect, Stream } from "effect";
import { isExitOnCtrlC } from "./ansi";

export class Std extends Effect.Service<Std>()("Std", {
  scoped: Effect.gen(function* () {
    const read = Effect.fn(function* (stdin: NodeJS.ReadStream) {
      return Stream.async<Buffer, Error>((emit) => {
        stdin.setRawMode(true).resume().setEncoding("utf8");

        const onData = async (b: Buffer) => {
          const str = b.toString();
          if (isExitOnCtrlC(str)) return await emit.end();
          await emit.single(b);
        };
        const onErr = async (e: Error) => await emit.fail(e);
        const onEnd = async () => await emit.end();

        stdin.on("data", onData).on("error", onErr).on("end", onEnd);

        return Effect.gen(function* () {
          stdin.off("data", onData).off("error", onErr).off("end", onEnd);
        });
      });
    });

    const catchResize = Effect.fn(function* (p: typeof process) {
      return yield* Effect.async<{
        width: number;
        height: number;
      }>((resume) => {
        const handler = () => {
          const width = p.stdout.columns || 80;
          const height = p.stdout.rows || 24;
          return resume(Effect.succeed({ width, height }));
        };
        p.on("SIGWINCH", handler);
        return Effect.gen(function* () {
          p.off("SIGWINCH", handler);
        });
      });
    });

    const write = Effect.fn(function* (stdout: NodeJS.WriteStream, data: Buffer) {
      return yield* Effect.async<boolean, Error>((resume) => {
        const sent = stdout.write(data, (err) => {
          if (err) {
            return resume(Effect.fail(err));
          } else {
          }
        });
        if (!sent) return resume(Effect.fail(new Error("Failed to write: " + data.toString("utf8"))));
        return resume(Effect.succeed(sent));
      });
    });

    return {
      read,
      write,
      catchResize,
    };
  }),
}) {}

export const StdLive = Std.Default;
