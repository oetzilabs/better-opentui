import { EventEmitter } from "@opentuee/core/src/event-emitter";
import * as Keyboard from "@opentuee/core/src/inputs/keyboard";
import { Context, Effect, Fiber, Stream } from "effect";

export type KeyHandlerService = {
  destroy: () => Effect.Effect<void>;
  ee: EventEmitter;
};

export class KeyHandler extends Context.Tag("KeyHandler")<KeyHandler, KeyHandlerService>() {}

export const makeKeyHandler = Effect.gen(function* () {
  const ee = yield* EventEmitter;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  const stream = Stream.async<Buffer>((emit) => {
    const onData = Effect.fn(function* (key: Buffer) {
      yield* Effect.promise(() => emit.single(key));
    });
    process.stdin.on("data", onData);

    // cleanup logic
    return Effect.sync(() => {
      process.stdin.removeListener("data", onData);
    });
  });

  // run the stream to emit parsed keys
  const fiber = yield* stream.pipe(
    Stream.mapEffect(Keyboard.parse),
    Stream.tap((parsedKey) => Effect.sync(() => ee.emit("keypress", parsedKey))),
    Stream.runDrain,
    Effect.fork,
  );

  const destroy = Effect.gen(function* () {
    yield* fiber.interruptAsFork(fiber.id());
    process.stdin.setRawMode(false);
    process.stdin.pause();
  });

  return { destroy, ee } as const;
});
