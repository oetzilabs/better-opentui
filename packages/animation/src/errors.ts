import { Schema } from "effect";

export class TimelineAlreadySynced extends Schema.TaggedError<TimelineAlreadySynced>("TimelineAlreadySynced")(
  "TimelineAlreadySynced",
  {},
) {}
