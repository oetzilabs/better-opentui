import { Effect, Layer } from "effect";
import Yoga, { type Config } from "yoga-layout";
import { makeTrackedNode, TrackedNodeCounter, TrackedNodeCounterClass } from "./lib/trackednode";
import type { NodeMetadata } from "./types";

export const createTrackedNode = Effect.fn(function* <T extends NodeMetadata>(
  metadata: T = {} as T,
  yogaConfig?: Config,
) {
  const yogaNode = Yoga.Node.create(yogaConfig);
  const trackNodeCounterLayer = Layer.succeed(TrackedNodeCounter, new TrackedNodeCounterClass());
  return yield* makeTrackedNode<T>(yogaNode, metadata).pipe(Effect.provide(trackNodeCounterLayer));
});
