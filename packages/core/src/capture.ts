import { Effect, PubSub, Ref, Stream } from "effect";
import { EventEmitter } from "./event-emitter";

export type CapturedOutput = {
  stream: "stdout" | "stderr";
  output: string;
};

export class CaptureService extends Effect.Service<CaptureService>()("@better-opentui/capture", {
  effect: Effect.gen(function* () {
    const outputRef = yield* Ref.make<CapturedOutput[]>([]);
    const pubsub = yield* PubSub.unbounded<CapturedOutput>();
    const ee = yield* EventEmitter;

    // expose a live Stream that consumers can pipe/run
    const stream = Stream.fromPubSub(pubsub);

    const write = Effect.fn("@better-opentui/capture/write")(function* (streamName: "stdout" | "stderr", data: string) {
      const entry: CapturedOutput = { stream: streamName, output: data };
      yield* Ref.update(outputRef, (arr) => [...arr, entry]);
      yield* PubSub.publish(pubsub, entry);
      ee.emit("write", streamName, data);
    });

    const claimOutput = Effect.fn("@better-opentui/capture/claimOutput")(function* () {
      const arr = yield* Ref.get(outputRef);
      const joined = arr.map((o) => o.output).join("");
      yield* Ref.set(outputRef, []);
      return joined;
    });

    const clear = Effect.fn("@better-opentui/capture/clear")(function* () {
      yield* Ref.set(outputRef, []);
    });

    const size = Effect.fn("@better-opentui/capture/size")(function* () {
      const arr = yield* Ref.get(outputRef);
      return arr.length;
    });

    return {
      write,
      claimOutput,
      clear,
      // raw stream (Stream<CapturedOutput,...>)
      stream,
      ee,
      size,
    } as const;
  }),
  dependencies: [],
}) {}

export const CaptureLive = CaptureService.Default;
