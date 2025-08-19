import type { MouseEventType, RawMouseEvent, ScrollInfo } from "../inputs/mouse";
import type { Element } from "../renderer/elements";

export class MouseEvent {
  public readonly type: MouseEventType;
  public readonly button: number;
  public readonly x: number;
  public readonly y: number;
  public readonly source?: Element;
  public readonly modifiers: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
  };
  public readonly scroll?: ScrollInfo;
  public readonly target: Element | null;
  private _defaultPrevented: boolean = false;

  public get defaultPrevented(): boolean {
    return this._defaultPrevented;
  }

  constructor(target: Element | null, attributes: RawMouseEvent & { source?: Element }) {
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
