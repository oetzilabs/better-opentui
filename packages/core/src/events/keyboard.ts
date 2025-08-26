import type { ParsedKey } from "../inputs/keyboard";
import type { BaseElement } from "../renderer/elements/base";

export class KeyboardEvent {
  public readonly type: "keydown" | "keyup" | "keypress";
  public readonly key: string;
  public readonly code?: string;
  public readonly source?: BaseElement<any, any>;
  public readonly modifiers: {
    shift: boolean;
    alt: boolean;
    ctrl: boolean;
    meta: boolean;
  };
  public readonly parsedKey: ParsedKey;
  public readonly target: BaseElement<any, any> | null;
  public readonly originalEvent: ParsedKey;
  private _defaultPrevented: boolean = false;

  public get defaultPrevented(): boolean {
    return this._defaultPrevented;
  }

  constructor(
    target: BaseElement<any, any> | null,
    attributes: ParsedKey & { source?: BaseElement<any, any>; type?: "keydown" | "keyup" | "keypress" },
  ) {
    this.target = target;
    const { source, type, ..._parsedKey } = attributes;
    this.parsedKey = _parsedKey;
    this.type = attributes.type || "keydown";
    this.key = attributes.name;
    this.code = attributes.code;
    this.modifiers = {
      shift: attributes.shift,
      alt: attributes.option,
      ctrl: attributes.ctrl,
      meta: attributes.meta,
    };
    this.originalEvent = attributes;
    this.source = attributes.source;
  }

  public preventDefault(): void {
    this._defaultPrevented = true;
  }
}
