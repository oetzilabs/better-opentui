import { Colors } from "../colors";
import type { Theme } from "./schema";

export const DEFAULT_THEME: Theme = {
  name: "default",
  colors: {
    bg: Colors.Transparent,
    fg: Colors.White,
    cursorColor: Colors.White,
  },
  elements: {
    button: {
      bg: Colors.Gray,
      fg: Colors.White,
      focusedBg: Colors.Custom("#1a1a1a"),
      focusedFg: Colors.White,
      hoverBg: Colors.Gray,
      hoverFg: Colors.White,
      pressedBg: Colors.Custom("#222222"),
      pressedFg: Colors.White,
    },
    input: {
      bg: Colors.Custom("#0a0a0a"),
      fg: Colors.White,
      selectableBg: Colors.Custom("#1a1a1a"),
      selectableFg: Colors.White,
      placeholderColor: Colors.Custom("#666666"),
      cursorColor: Colors.White,
      focusedBg: Colors.Black,
      focusedFg: Colors.White,
    },
    textarea: {
      bg: Colors.Custom("#1a1a1a"),
      fg: Colors.White,
      focusedBg: Colors.Black,
      focusedFg: Colors.White,
      placeholderColor: Colors.Gray,
      cursorColor: Colors.White,
    },
    checkbox: {
      bg: Colors.Black,
      fg: Colors.White,
      focusedBg: Colors.Black,
      focusedFg: Colors.White,
      placeholderColor: Colors.Gray,
      cursorColor: Colors.White,
    },
    list: {
      bg: Colors.Black,
      fg: Colors.White,
      focusedBg: Colors.Custom("#1a1a1a"),
      focusedFg: Colors.White,
      selectedBg: Colors.Custom("#334455"),
      selectedFg: Colors.White,
      scrollIndicatorColor: Colors.Gray,
    },
    counter: {
      bg: Colors.Custom("#444444"),
      fg: Colors.White,
    },
    "status-bar": {
      bg: Colors.Custom("#1a1a1a"),
      fg: Colors.White,
    },
    "file-select": {
      bg: Colors.Black,
      fg: Colors.White,
      selectedBg: Colors.Custom("#334455"),
      selectedFg: Colors.White,

      focusedBg: Colors.Custom("#1a1a1a"),
      focusedFg: Colors.White,
      scrollIndicatorColor: Colors.Gray,

      searchBg: Colors.Custom("#2a2a2a"),
      searchFg: Colors.White,
      searchFocusedBg: Colors.Custom("#1a1a1a"),
      searchFocusedFg: Colors.White,
      searchPlaceholderColor: Colors.Gray,
      searchCursorColor: Colors.White,

      statusBarBg: Colors.Custom("#1a1a1a"),
      statusBarFg: Colors.White,

      statusBarStatusBg: Colors.Custom("#2a2a2a"),
      statusBarStatusFg: Colors.White,

      sortButtonBg: Colors.Custom("#2a2a2a"),
      sortButtonFg: Colors.White,
      sortButtonHoverBg: Colors.Custom("#222222"),
      sortButtonHoverFg: Colors.White,
      sortButtonFocusBg: Colors.Custom("#222222"),
      sortButtonFocusFg: Colors.White,
      sortButtonPressedBg: Colors.Custom("#222222"),
      sortButtonPressedFg: Colors.White,

      directoryBg: Colors.Custom("#2a2a2a"),
      directoryFg: Colors.Custom("#4A90E2"), // Blue for directories
      fileBg: Colors.Transparent,
      fileFg: Colors.Custom("#7ED321"), // Green for files

      pathBg: Colors.Custom("#2a2a2a"),
      pathFg: Colors.White,
    },
    "multi-select": {
      bg: Colors.Black,
      fg: Colors.White,
      selectedBg: Colors.Custom("#334455"),
      selectedFg: Colors.Yellow,

      focusedBg: Colors.Custom("#1a1a1a"),
      focusedFg: Colors.White,
      scrollIndicatorColor: Colors.Custom("#666666"),

      searchBg: Colors.Custom("#2a2a2a"),
      searchFg: Colors.White,
      searchFocusedBg: Colors.Custom("#1a1a1a"),
      searchFocusedFg: Colors.White,
      searchPlaceholderColor: Colors.Gray,
      searchCursorColor: Colors.White,

      descriptionColor: Colors.Gray,
      disabledDescriptionColor: Colors.Gray,
      selectedDescriptionColor: Colors.Gray,
    },
  },
};
