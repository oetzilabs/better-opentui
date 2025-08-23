import { Effect } from "effect";
import { QueryPixelSize } from "../../ansi";

export type PixelResolution = {
  width: number;
  height: number;
};

export const getTerminalPixelResolution = Effect.fn(function* (stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream) {
  const res = yield* Effect.async<PixelResolution | null>((resume) => {
    stdin.setRawMode(true);
    const timeout = setTimeout(() => {
      resume(Effect.succeed(null));
    }, 100);
    stdin.once("data", (data) => {
      clearTimeout(timeout);
      const str = data.toString();
      if (/\x1b\[4/.test(str)) {
        // <ESC>[4;<height>;<width>t
        const [, height, width] = str.split(";");
        const resolution: PixelResolution = {
          width: parseInt(width),
          height: parseInt(height),
        };
        resume(Effect.succeed(resolution));
      }
    });
    stdout.write(QueryPixelSize.make("\u001B[14t"));
  });
  return res;
});
