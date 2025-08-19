import { EventEmitter as EE } from "events";
import { Context, Layer } from "effect";

export class EventEmitter extends Context.Tag("EventEmitter")<EventEmitter, EE>() {}

export const layer = Layer.succeed(EventEmitter, new EE());
