import type { Align } from "@opentuee/core/src/renderer/utils/align";
import type { FlexDirection } from "@opentuee/core/src/renderer/utils/flex";
import type { Justify } from "@opentuee/core/src/renderer/utils/justify";
import type { PositionInput, PositionTypeString } from "@opentuee/core/src/renderer/utils/position";
import type { Position } from "@opentuee/ui/src/types";

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
  margin?: {
    top?: PositionInput;
    right?: PositionInput;
    bottom?: PositionInput;
    left?: PositionInput;
  };
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
