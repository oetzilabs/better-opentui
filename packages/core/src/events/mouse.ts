import type { MouseEventType, RawMouseEvent, ScrollInfo } from "../inputs/mouse";
import type { BaseElement } from "../renderer/elements/base";

export class MouseEvent {
  public readonly type: MouseEventType;
  public readonly button: number;
  public readonly x: number;
  public readonly y: number;
  public readonly source?: BaseElement<any, any> | null;
  public readonly modifiers: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
  };
  public readonly scroll?: ScrollInfo;
  public readonly target: BaseElement<any, any> | null;
  private _defaultPrevented: boolean = false;

  public get defaultPrevented(): boolean {
    return this._defaultPrevented;
  }

  constructor(
    target: BaseElement<any, any> | null,
    attributes: RawMouseEvent & { source?: BaseElement<any, any> | null },
  ) {
    this.target = target;
    this.type = attributes.type;
    this.button = attributes.button;
    this.x = attributes.x;
    this.y = attributes.y;
    this.modifiers = attributes.modifiers;
    this.scroll = attributes.scroll;
    this.source = attributes.source;
  }

  public preventDefault(): void {
    this._defaultPrevented = true;
  }
}
