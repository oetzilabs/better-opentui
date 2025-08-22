import { Context, Effect, Layer } from "effect";

export class Shutdown extends Context.Tag("Shutdown")<Shutdown, Effect.Effect.Success<typeof makeShutdownLatch>>() {}

const makeShutdownLatch = Effect.gen(function* () {
  const shutdownLatch = yield* Effect.makeLatch();

  const listen = shutdownLatch.whenOpen;
  const run = shutdownLatch.open;

  return { listen, run, latch: shutdownLatch };
});

export const ShutdownLive = Layer.effect(Shutdown, makeShutdownLatch);
