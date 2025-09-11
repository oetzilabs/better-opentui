import type { BaseElement } from "./base";
import type { CounterElement } from "./counter";
import type { GroupElement } from "./group";
import type { TextElement } from "./text";

// Not sure if BaseElement would be allowed here. Technically yes, but practically because it can hold any element with different behaviours and properties, no.
// export type Content = string | TextElement | GroupElement | BaseElement<any, any> | Array<Content>;
export type Content = string | TextElement | GroupElement | CounterElement | Array<Content>;
