import type { Align } from "./align";
import type { FlexDirection } from "./flex";
import type { Justify } from "./justify";
import type { PositionInput, PositionTypeString } from "./position";

export interface LayoutOptions {
  width?: PositionInput;
  height?: PositionInput;
  flexGrow?: number;
  flexShrink?: number;
  flexDirection?: FlexDirection;
  alignItems?: Align;
  justifyContent?: Justify;
  flexBasis?: number | "auto" | undefined;
  position?: PositionTypeString;
  top?: PositionInput;
  right?: PositionInput;
  bottom?: PositionInput;
  left?: PositionInput;
  zIndex: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  margin?:
    | {
        top?: PositionInput;
        right?: PositionInput;
        bottom?: PositionInput;
        left?: PositionInput;
      }
    | PositionInput;
  padding?:
    | {
        top?: PositionInput;
        right?: PositionInput;
        bottom?: PositionInput;
        left?: PositionInput;
      }
    | PositionInput;
  enableLayout?: boolean;
}
