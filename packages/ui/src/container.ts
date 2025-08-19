import * as Colors from "@opentuee/core/src/colors";
import { Container } from "@opentuee/ui/src/components/renderables";
import { Context, Effect, Ref } from "effect";
import type { FlexDirection } from "yoga-layout";
import { makeElement, type ElementOptions, type ElementService } from "./element";

export type ContainerOptions = ElementOptions & { flexDirection?: FlexDirection };

export type ContainerElementService<T> = ElementService<T> & {
  flexDirection: Ref.Ref<FlexDirection>;
};

export class ContainerElement extends Context.Tag("Container")<ContainerElement, ContainerElementService<any>>() {}

export const makeContainerElement = <T>(id: string, options: ContainerOptions) =>
  Effect.gen(function* () {
    const renderable = yield* makeElement<T>(id, {
      ...options,
      type: Container.make("Container"),
      backgroundColor: options.backgroundColor || Colors.Transparent.make("transparent"),
      border: options.border !== undefined ? options.border : false,
    });
    const flexDirection = yield* Ref.make(options.flexDirection);

    const refreshContent = Effect.fn(function* (
      contentX: number,
      contentY: number,
      contentWidth: number,
      contentHeight: number,
    ) {
      // Containers typically don't render content themselves, just manage children
      // Override this method in subclasses if you want custom container rendering
    });

    return {
      ...renderable,
      flexDirection,
      refreshContent,
    } as ContainerElementService<T>;
  });
