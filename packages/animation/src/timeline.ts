import { Context, Effect, Ref, Schema } from "effect";
import { TimelineAlreadySynced } from "./errors";

export type TimelineOptions = {
  duration?: number;
  loop?: boolean;
  autoplay?: boolean;
  onComplete?: () => Effect.Effect<void>;
  onPause?: () => Effect.Effect<void>;
};

export type AnimationOptions<
  T,
  U extends {
    [key: string]: any;
  },
> = U & {
  duration: number;
  ease?: EasingFunctions;
  onUpdate?: (animation: JSAnimation<T, U>) => Effect.Effect<void>;
  onComplete?: () => Effect.Effect<void>;
  onStart?: () => Effect.Effect<void>;
  onLoop?: () => Effect.Effect<void>;
  loop?: boolean | number;
  loopDelay?: number;
  alternate?: boolean;
  once?: boolean;
};

export type JSAnimation<T, U extends { [key: string]: any } = any> = {
  targets: (T & U)[];
  deltaTime: number;
  progress: number;
  currentTime: number;
};

const Animation = Schema.Literal("animation").pipe(Schema.brand("Animation"));
type Animation = typeof Animation.Type;
const Callback = Schema.Literal("callback").pipe(Schema.brand("Callback"));
type Callback = typeof Callback.Type;
const TimelineLiteral = Schema.Literal("timeline").pipe(Schema.brand("Timeline"));
type TimelineLiteral = typeof TimelineLiteral.Type;

export type TimelineItem = {
  type: Animation | Callback | TimelineLiteral;
  startTime: number;
};

export type TimelineTimelineItem<T, U extends { [key: string]: any }> = TimelineItem & {
  timeline: TimelineService<T, U>;
  timelineStarted?: boolean;
};
type CallbackFunction = () => Effect.Effect<void>;

export type TimelineCallbackItem = TimelineItem & {
  callback: CallbackFunction;
  executed: boolean;
};

export type TiimelineItemCollection<
  T,
  U extends {
    [key: string]: any;
  },
> = TimelineAnimationItem<T, U> | TimelineCallbackItem | TimelineTimelineItem<T, U>;

const easingFunctions = {
  linear: Effect.fn(function* (t: number) {
    return t;
  }),
  inQuad: Effect.fn(function* (t: number) {
    return t * t;
  }),
  outQuad: Effect.fn(function* (t: number) {
    return t * (2 - t);
  }),
  inOutQuad: Effect.fn(function* (t: number) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }),
  inExpo: Effect.fn(function* (t: number) {
    return t === 0 ? 0 : Math.pow(2, 10 * (t - 1));
  }),
  outExpo: Effect.fn(function* (t: number) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }),
  inOutSine: Effect.fn(function* (t: number) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }),
  outBounce: Effect.fn(function* (t: number) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      return n1 * (t -= 1.5 / d1) * t + 0.75;
    } else if (t < 2.5 / d1) {
      return n1 * (t -= 2.25 / d1) * t + 0.9375;
    } else {
      return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }
  }),
  outElastic: Effect.fn(function* (t: number) {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }),
  inBounce: (t: number) =>
    Effect.gen(function* () {
      const result = yield* Effect.suspend(() => easingFunctions.outBounce(1 - t));
      return 1 - result;
    }),
  inCirc: Effect.fn(function* (t: number) {
    return 1 - Math.sqrt(1 - t * t);
  }),
  outCirc: Effect.fn(function* (t: number) {
    return Math.sqrt(1 - Math.pow(t - 1, 2));
  }),
  inOutCirc: Effect.fn(function* (t: number) {
    if ((t *= 2) < 1) return -0.5 * (Math.sqrt(1 - t * t) - 1);
    return 0.5 * (Math.sqrt(1 - (t -= 2) * t) + 1);
  }),
  inBack: Effect.fn(function* (t: number, s: number = 1.70158) {
    return t * t * ((s + 1) * t - s);
  }),
  outBack: Effect.fn(function* (t: number, s: number = 1.70158) {
    return --t * t * ((s + 1) * t + s) + 1;
  }),
  inOutBack: Effect.fn(function* (t: number, s: number = 1.70158) {
    s *= 1.525;
    if ((t *= 2) < 1) return 0.5 * (t * t * ((s + 1) * t - s));
    return 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
  }),
} as const;

export type EasingFunctions = keyof typeof easingFunctions;

export type TimelineAnimationItem<T extends any, U extends { [key: string]: any }> = TimelineItem & {
  target: (T & U)[];
  properties?: Record<string, number>;
  initialValues?: Record<string, number>[];
  duration?: number;
  ease?: EasingFunctions;
  loop?: boolean | number;
  loopDelay?: number;
  alternate?: boolean;
  onUpdate?: (animation: JSAnimation<T, U>) => Effect.Effect<void>;
  onComplete?: () => Effect.Effect<void>;
  onStart?: () => Effect.Effect<void>;
  onLoop?: () => Effect.Effect<void>;
  completed?: boolean;
  started?: boolean;
  currentLoop?: number;
  once?: boolean;
};

const captureInitialValues = Effect.fn(function* <T, U extends { [key: string]: any }>(
  item: TimelineAnimationItem<T, U>,
) {
  if (!item.properties) return;
  if (!item.initialValues || item.initialValues.length === 0) {
    const initialValues: Record<string, number>[] = [];

    for (let i = 0; i < item.target.length; i++) {
      const target = item.target[i];
      const targetInitialValues: Record<string, number> = {};

      for (const key of Object.keys(item.properties)) {
        // @ts-ignore
        if (typeof target[key] === "number") {
          // @ts-ignore
          targetInitialValues[key] = target[key];
        }
      }

      initialValues.push(targetInitialValues);
    }

    item.initialValues = initialValues;
  }
});

const applyAnimationAtProgress = Effect.fn(function* <T, U extends { [key: string]: any }>(
  item: TimelineAnimationItem<T, U>,
  progress: number,
  reversed: boolean,
  timelineTime: number,
  deltaTime: number = 0,
) {
  if (!item.properties || !item.initialValues) return;

  const easingFn = easingFunctions[item.ease || "linear"] || easingFunctions.linear;
  const easedProgress = yield* easingFn(Math.max(0, Math.min(1, progress)));
  const finalProgress = reversed ? 1 - easedProgress : easedProgress;

  for (let i = 0; i < item.target.length; i++) {
    const target = item.target[i];
    const targetInitialValues = item.initialValues[i];

    if (!targetInitialValues) continue;

    for (const [key, endValue] of Object.entries(item.properties)) {
      const startValue = targetInitialValues[key];
      const newValue = startValue + (endValue - startValue) * finalProgress;
      // @ts-ignore
      target[key] = newValue;
    }
  }

  if (item.onUpdate) {
    const animation: JSAnimation<T, U> = {
      targets: item.target,
      progress: easedProgress,
      currentTime: timelineTime,
      deltaTime: deltaTime,
    };
    yield* item.onUpdate(animation);
  }
});

const evaluateAnimation = Effect.fn(function* <T extends any, U extends { [key: string]: any }>(
  item: TimelineAnimationItem<T, U>,
  timelineTime: number,
  deltaTime: number = 0,
) {
  if (timelineTime < item.startTime) {
    return;
  }

  const animationTime = timelineTime - item.startTime;
  const duration = item.duration || 0;

  if (timelineTime >= item.startTime && !item.started) {
    yield* captureInitialValues(item);
    if (item.onStart) {
      yield* item.onStart();
    }
    item.started = true;
  }

  if (duration === 0) {
    if (!item.completed) {
      yield* applyAnimationAtProgress(item, 1, false, timelineTime, deltaTime);
      if (item.onComplete) {
        yield* item.onComplete();
      }
      item.completed = true;
    }
    return;
  }

  // Unified looping logic - single execution is just maxLoops = 1
  const maxLoops = !item.loop || item.loop === 1 ? 1 : typeof item.loop === "number" ? item.loop : Infinity;
  const loopDelay = item.loopDelay || 0;
  const cycleTime = duration + loopDelay;
  let currentCycle = Math.floor(animationTime / cycleTime);
  let timeInCycle = animationTime % cycleTime;

  // Trigger onLoop if a loop cycle (not the final one) completes
  if (item.onLoop && item.currentLoop !== undefined && currentCycle > item.currentLoop && currentCycle < maxLoops) {
    yield* item.onLoop();
  }
  item.currentLoop = currentCycle;

  // Check if the animation part of the *final loop* has just completed
  if (item.onComplete && !item.completed && currentCycle === maxLoops - 1 && timeInCycle >= duration) {
    const finalLoopReversed = (item.alternate || false) && currentCycle % 2 === 1;
    yield* applyAnimationAtProgress(item, 1, finalLoopReversed, timelineTime, deltaTime);

    yield* item.onComplete();
    item.completed = true;
    return;
  }

  if (currentCycle >= maxLoops) {
    if (!item.completed) {
      const finalReversed = (item.alternate || false) && (maxLoops - 1) % 2 === 1;
      yield* applyAnimationAtProgress(item, 1, finalReversed, timelineTime, deltaTime);

      if (item.onComplete) {
        yield* item.onComplete();
      }
      item.completed = true;
    }
    return;
  }

  if (timeInCycle === 0 && animationTime > 0 && currentCycle < maxLoops) {
    currentCycle = currentCycle - 1;
    timeInCycle = cycleTime;
  }

  if (timeInCycle >= duration) {
    const isReversed = (item.alternate || false) && currentCycle % 2 === 1;
    yield* applyAnimationAtProgress(item, 1, isReversed, timelineTime, deltaTime);
    return;
  }

  const progress = timeInCycle / duration;
  const isReversed = (item.alternate || false) && currentCycle % 2 === 1;
  yield* applyAnimationAtProgress(item, progress, isReversed, timelineTime, deltaTime);
});

const evaluateCallback = Effect.fn(function* (item: TimelineCallbackItem, timelineTime: number) {
  if (!item.executed && timelineTime >= item.startTime && item.callback) {
    yield* item.callback();
    item.executed = true;
  }
});

const evaluateTimelineSync = Effect.fn(function* <T, U extends { [key: string]: any }>(
  item: TimelineTimelineItem<T, U>,
  timelineTime: number,
  deltaTime: number = 0,
) {
  if (!item.timeline) return;
  if (timelineTime < item.startTime) {
    return;
  }

  if (!item.timelineStarted) {
    item.timelineStarted = true;
    yield* item.timeline.play();

    const overshoot = timelineTime - item.startTime;
    yield* item.timeline.update(overshoot);
    return;
  }

  yield* item.timeline.update(deltaTime);
});

const evaluateItem = Effect.fn(function* <T, U extends { [key: string]: any }>(
  item: TimelineItem,
  timelineTime: number,
  deltaTime: number = 0,
) {
  const isAnimation = Schema.is(Animation);
  const isCallback = Schema.is(Callback);
  // const isTimeline = Schema.is(TimelineLiteral);

  if (isAnimation(item.type)) {
    yield* evaluateAnimation(item as TimelineAnimationItem<T, U>, timelineTime, deltaTime);
  } else if (isCallback(item.type)) {
    yield* evaluateCallback(item as TimelineCallbackItem, timelineTime);
  }
});

export type TimelineService<T, U extends { [key: string]: any }> = {
  add: (target: T, properties: AnimationOptions<T, U>, startTime?: number | string) => Effect.Effect<void>;
  once: (target: T, properties: AnimationOptions<T, U>) => Effect.Effect<void>;
  call: (callback: CallbackFunction, startTime?: number | string) => Effect.Effect<void>;
  sync: (timeline: TimelineService<T, U>, startTime?: number) => Effect.Effect<void, TimelineAlreadySynced>;
  play: () => Effect.Effect<void>;
  pause: () => Effect.Effect<void>;
  resetItems: () => Effect.Effect<void>;
  restart: () => Effect.Effect<void>;
  update: (deltaTime: number) => Effect.Effect<void>;
  isSynced: () => Effect.Effect<boolean>;
  isPlaying: Ref.Ref<boolean>;
  isComplete: Ref.Ref<boolean>;
  getCurrentTime: () => Effect.Effect<number>;
  getItems: () => Effect.Effect<TimelineItem[]>;
};

export class Timeline extends Context.Tag("Timeline")<Timeline, TimelineService<any, any>>() {}

export const makeTimeline = Effect.fn(function* <
  T,
  U extends {
    [key: string]: any;
  },
>(options: TimelineOptions = {}) {
  const duration = yield* Ref.make(options.duration || 0);
  const loop = yield* Ref.make(options.loop || true);
  const autoplay = yield* Ref.make(options.autoplay !== false);
  const onComplete = yield* Ref.make(options.onComplete);
  const onPause = yield* Ref.make(options.onPause);
  const items = yield* Ref.make<TiimelineItemCollection<T, U>[]>([]);
  const currentTime = yield* Ref.make(0);
  const subTimelines = yield* Ref.make<TimelineTimelineItem<T, U>[]>([]);
  const synced = yield* Ref.make(false);
  const isPlaying = yield* Ref.make(false);
  const isComplete = yield* Ref.make(false);

  const add = Effect.fn(function* (target: T & U, properties: AnimationOptions<T, U>, startTime: number | string = 0) {
    const resolvedStartTime = typeof startTime === "string" ? 0 : startTime;
    const animationProperties: Record<string, number> = {};

    // Extract animation properties (don't capture initial values here)
    for (const key in properties) {
      if (
        !["duration", "ease", "onUpdate", "onComplete", "onStart", "onLoop", "loop", "loopDelay", "alternate"].includes(
          key,
        )
      ) {
        if (typeof properties[key] === "number") {
          animationProperties[key] = properties[key];
        }
      }
    }

    yield* Ref.update(items, (items) => {
      items.push({
        type: Animation.make("animation"),
        startTime: resolvedStartTime,
        target: Array.isArray(target) ? target : [target],
        properties: animationProperties,
        initialValues: [], // Will be captured when animation starts
        duration: properties.duration !== undefined ? properties.duration : 1000,
        ease: properties.ease || "linear",
        loop: properties.loop,
        loopDelay: properties.loopDelay || 0,
        alternate: properties.alternate || false,
        onUpdate: properties.onUpdate,
        onComplete: properties.onComplete,
        onStart: properties.onStart,
        onLoop: properties.onLoop,
        completed: false,
        started: false,
        currentLoop: 0,
        once: properties.once ?? false,
      });
      return items;
    });
  });

  const once = Effect.fn(function* (target: any, properties: AnimationOptions<T, U>) {
    const ct = yield* Ref.get(currentTime);
    yield* add(
      target,
      {
        ...properties,
        once: true,
      },
      ct,
    );
  });

  const call = Effect.fn(function* (callback: CallbackFunction, startTime: number | string = 0) {
    const resolvedStartTime = typeof startTime === "string" ? 0 : startTime;

    yield* Ref.update(items, (items) => {
      items.push({
        type: Callback.make("callback"),
        startTime: resolvedStartTime,
        callback,
        executed: false,
      });
      return items;
    });
  });

  const sync = Effect.fn(function* (timeline: TimelineService<T, U>, startTime: number = 0) {
    const s = yield* Ref.get(synced);
    if (s) {
      return yield* Effect.fail(new TimelineAlreadySynced());
    }
    yield* Ref.update(subTimelines, (subTimelines) => {
      subTimelines.push({
        type: TimelineLiteral.make("timeline"),
        startTime,
        timeline,
      });
      return subTimelines;
    });

    yield* Ref.set(synced, true);
  });

  const play = Effect.fn(function* () {
    const isC = yield* Ref.get(isComplete);
    if (isC) {
      return yield* restart();
    }
    const stl = yield* Ref.get(subTimelines);
    yield* Effect.all(
      stl.map(
        Effect.fn(function* (subTimeline) {
          if (subTimeline.timelineStarted) {
            yield* subTimeline.timeline.play();
          } else {
            yield* Effect.void;
          }
        }),
      ),
    );

    yield* Ref.set(isPlaying, true);
  });

  const pause = Effect.fn(function* () {
    const stl = yield* Ref.get(subTimelines);
    yield* Effect.all(
      stl.map(
        Effect.fn(function* (subTimeline) {
          if (subTimeline.timelineStarted) {
            yield* subTimeline.timeline.pause();
          } else {
            yield* Effect.void;
          }
        }),
      ),
    );
    yield* Ref.set(isPlaying, false);
    const op = yield* Ref.get(onPause);
    if (op) {
      yield* op();
    }
  });

  const resetItems = Effect.fn(function* () {
    const isAnimation = Schema.is(Animation);
    const isCallback = Schema.is(Callback);
    yield* Ref.update(items, (items) => {
      const newitems = items.map((item) => {
        if (isCallback(item.type)) {
          // item.executed = false
          (item as TimelineCallbackItem).executed = false;
          return item;
        } else if (isAnimation(item.type)) {
          const i = item as TimelineAnimationItem<T, U>;
          i.completed = false;
          i.started = false;
          i.currentLoop = 0;
          return i;
        }
        return item;
      });
      return newitems;
    });
    const stl = yield* Ref.get(subTimelines);
    const newStl = yield* Effect.all(
      stl.map(
        Effect.fn(function* (subTimeline) {
          subTimeline.timelineStarted = false;
          if (subTimeline.timeline) {
            yield* subTimeline.timeline.restart();
            yield* subTimeline.timeline.pause();
          }
          return subTimeline;
        }),
      ),
    );
    yield* Ref.set(subTimelines, newStl);
  });

  const restart = Effect.fn(function* () {
    yield* Ref.set(isComplete, false);
    yield* Ref.set(currentTime, 0);
    yield* Ref.set(isPlaying, true);

    yield* resetItems();
  });

  const update: (deltaTime: number) => Effect.Effect<void> = (deltaTime: number) =>
    Effect.gen(function* () {
      const stl = yield* Ref.get(subTimelines);
      for (const subTimeline of stl) {
        const ct = yield* Ref.get(currentTime);
        yield* evaluateTimelineSync(subTimeline, ct + deltaTime, deltaTime);
      }
      const ip = yield* Ref.get(isPlaying);
      if (!ip) return;

      const ct = yield* Ref.updateAndGet(currentTime, (currentTime) => currentTime + deltaTime);

      const is = yield* Ref.get(items);
      yield* Effect.all(is.map((i) => evaluateItem(i, ct, deltaTime)));

      const isAnimation = Schema.is(Animation);
      // Remove completed "once" items (iterate backwards to avoid index shifting)
      for (let i = is.length - 1; i >= 0; i--) {
        const item = is[i];
        if (isAnimation(item.type)) {
          const it = item as TimelineAnimationItem<T, U>;
          if (it.once && it.completed) {
            // this.items.splice(i, 1)
            yield* Ref.update(items, (items) => {
              items.splice(i, 1);
              return items;
            });
          }
        }
      }
      const l = yield* Ref.get(loop);
      const ct2 = yield* Ref.get(currentTime);
      const d = yield* Ref.get(duration);
      if (l && ct2 >= d) {
        const overshoot = ct2 % d;

        yield* resetItems();
        // this.currentTime = 0;
        yield* Ref.set(currentTime, 0);

        if (overshoot > 0) {
          yield* Effect.suspend(() => update(overshoot));
        }
      } else if (!l && ct2 >= d) {
        yield* Ref.set(currentTime, d);
        yield* Ref.set(isPlaying, false);
        yield* Ref.set(isComplete, true);
        const oc = yield* Ref.get(onComplete);
        if (oc) {
          yield* oc();
        }
      }
    });

  const isSynced = Effect.fn(function* () {
    return yield* Ref.get(synced);
  });

  const getCurrentTime = Effect.fn(function* () {
    return yield* Ref.get(currentTime);
  });

  const getItems = Effect.fn(function* () {
    return yield* Ref.get(items);
  });

  return {
    add,
    once,
    call,
    sync,
    play,
    pause,
    resetItems,
    restart,
    isSynced,
    isPlaying,
    isComplete,
    getCurrentTime,
    update,
    getItems,
  } as TimelineService<T, U>;
});

export type TimelineEngineService<T, U extends { [key: string]: any }> = {
  register: (timeline: TimelineService<T, U>) => Effect.Effect<void>;
  unregister: (timeline: TimelineService<T, U>) => Effect.Effect<void>;
  clear: () => Effect.Effect<void>;
  update: (deltaTime: number) => Effect.Effect<void>;
};

export class TimelineEngine extends Context.Tag("TimelineEngine")<TimelineEngine, TimelineEngineService<any, any>>() {}

export const makeTimelineEngine = Effect.fn(function* <T, U extends { [key: string]: any }>() {
  const timelines = yield* Ref.make<Set<TimelineService<T, U>>>(new Set());
  const defaults = yield* Ref.make<{
    frameRate: number;
  }>({
    frameRate: 60,
  });
  const register = Effect.fn(function* (timeline: TimelineService<T, U>) {
    yield* Ref.update(timelines, (timelines) => {
      timelines.add(timeline);
      return timelines;
    });
  });
  const unregister = Effect.fn(function* (timeline: TimelineService<T, U>) {
    yield* Ref.update(timelines, (timelines) => {
      timelines.delete(timeline);
      return timelines;
    });
  });
  const clear = Effect.fn(function* () {
    yield* Ref.update(timelines, (timelines) => {
      timelines.clear();
      return timelines;
    });
  });

  const update: (deltaTime: number) => Effect.Effect<void> = (deltaTime: number) =>
    Effect.gen(function* () {
      const ts = yield* Ref.get(timelines);
      for (const t of ts) {
        const isS = yield* t.isSynced();
        if (!isS) {
          yield* t.update(deltaTime);
        }
      }
    });
  return {
    register,
    unregister,
    clear,
    update,
  } as TimelineEngineService<T, U>;
});

export const createTimeline = Effect.fn(function* <T, U extends { [key: string]: any } = any>(
  options: TimelineOptions = {},
) {
  const engine = yield* TimelineEngine;
  const timeline = yield* makeTimeline<T, U>(options);
  if (options.autoplay !== false) {
    yield* timeline.play();
  }

  yield* engine.register(timeline);

  return timeline;
});
