import { Schema } from "effect";

export const Black = Schema.Literal("#000000").pipe(Schema.brand("Black"));
export const White = Schema.Literal("#FFFFFF").pipe(Schema.brand("White"));
export const Red = Schema.Literal("#FF0000").pipe(Schema.brand("Red"));
export const Green = Schema.Literal("#008000").pipe(Schema.brand("Green"));
export const Blue = Schema.Literal("#0000FF").pipe(Schema.brand("Blue"));
export const Yellow = Schema.Literal("#FFFF00").pipe(Schema.brand("Yellow"));
export const Cyan = Schema.Literal("#00FFFF").pipe(Schema.brand("Cyan"));
export const Magenta = Schema.Literal("#FF00FF").pipe(Schema.brand("Magenta"));
export const Silver = Schema.Literal("#C0C0C0").pipe(Schema.brand("Silver"));
export const Gray = Schema.Literal("#808080").pipe(Schema.brand("Gray"));
export const Grey = Schema.Literal("#808080").pipe(Schema.brand("Grey"));
export const Maroon = Schema.Literal("#800000").pipe(Schema.brand("Maroon"));
export const Olive = Schema.Literal("#808000").pipe(Schema.brand("Olive"));
export const Lime = Schema.Literal("#00FF00").pipe(Schema.brand("Lime"));
export const Aqua = Schema.Literal("#00FFFF").pipe(Schema.brand("Aqua"));
export const Teal = Schema.Literal("#008080").pipe(Schema.brand("Teal"));
export const Navy = Schema.Literal("#000080").pipe(Schema.brand("Navy"));
export const Fuchsia = Schema.Literal("#FF00FF").pipe(Schema.brand("Fuchsia"));
export const Purple = Schema.Literal("#800080").pipe(Schema.brand("Purple"));
export const Orange = Schema.Literal("#FFA500").pipe(Schema.brand("Orange"));
export const BrightBlack = Schema.Literal("#666666").pipe(Schema.brand("BrightBlack"));
export const BrightRed = Schema.Literal("#FF6666").pipe(Schema.brand("BrightRed"));
export const BrightGreen = Schema.Literal("#66FF66").pipe(Schema.brand("BrightGreen"));
export const BrightBlue = Schema.Literal("#6666FF").pipe(Schema.brand("BrightBlue"));
export const BrightYellow = Schema.Literal("#FFFF66").pipe(Schema.brand("BrightYellow"));
export const BrightCyan = Schema.Literal("#66FFFF").pipe(Schema.brand("BrightCyan"));
export const BrightMagenta = Schema.Literal("#FF66FF").pipe(Schema.brand("BrightMagenta"));
export const BrightWhite = Schema.Literal("#FFFFFF").pipe(Schema.brand("BrightWhite"));

export const Transparent = Schema.Literal("transparent").pipe(Schema.brand("Transparent"));

export const Custom = Schema.TemplateLiteral("#", Schema.String).pipe(Schema.brand("Custom"));

export type Custom = typeof Custom.Type;

export const Collection = {
  Custom,
  Transparent,
  Black,
  White,
  Red,
  Green,
  Blue,
  Yellow,
  Cyan,
  Magenta,
  Silver,
  Gray,
  Grey,
  Maroon,
  Olive,
  Lime,
  Aqua,
  Teal,
  Navy,
  Fuchsia,
  Purple,
  Orange,
  BrightBlack,
  BrightRed,
  BrightGreen,
  BrightBlue,
  BrightYellow,
  BrightCyan,
  BrightMagenta,
  BrightWhite,
};

export const NonCustom = Schema.Union(
  Black,
  White,
  Red,
  Green,
  Blue,
  Yellow,
  Cyan,
  Magenta,
  Silver,
  Gray,
  Grey,
  Maroon,
  Olive,
  Lime,
  Aqua,
  Teal,
  Navy,
  Fuchsia,
  Purple,
  Orange,
  BrightBlack,
  BrightRed,
  BrightGreen,
  BrightBlue,
  BrightYellow,
  BrightCyan,
  BrightMagenta,
  BrightWhite,
);

export type NonCustom = typeof NonCustom.Type;

export const Input = Schema.Union(
  Custom,
  Transparent,
  Black,
  White,
  Red,
  Green,
  Blue,
  Yellow,
  Cyan,
  Magenta,
  Silver,
  Gray,
  Grey,
  Maroon,
  Olive,
  Lime,
  Aqua,
  Teal,
  Navy,
  Fuchsia,
  Purple,
  Orange,
  BrightBlack,
  BrightRed,
  BrightGreen,
  BrightBlue,
  BrightYellow,
  BrightCyan,
  BrightMagenta,
  BrightWhite,
);

export type Input = typeof Input.Type;

export const Colors = {
  Custom: (color: `#${string}`) => Custom.make(color),
  Transparent: Transparent.make("transparent"),
  Black: Black.make("#000000"),
  White: White.make("#FFFFFF"),
  Red: Red.make("#FF0000"),
  Green: Green.make("#008000"),
  Blue: Blue.make("#0000FF"),
  Yellow: Yellow.make("#FFFF00"),
  Cyan: Cyan.make("#00FFFF"),
  Magenta: Magenta.make("#FF00FF"),
  Silver: Silver.make("#C0C0C0"),
  Gray: Gray.make("#808080"),
  Grey: Grey.make("#808080"),
  Maroon: Maroon.make("#800000"),
  Olive: Olive.make("#808000"),
  Lime: Lime.make("#00FF00"),
  Aqua: Aqua.make("#00FFFF"),
  Teal: Teal.make("#008080"),
  Navy: Navy.make("#000080"),
  Fuchsia: Fuchsia.make("#FF00FF"),
  Purple: Purple.make("#800080"),
  Orange: Orange.make("#FFA500"),
  BrightBlack: BrightBlack.make("#666666"),
  BrightRed: BrightRed.make("#FF6666"),
  BrightGreen: BrightGreen.make("#66FF66"),
  BrightBlue: BrightBlue.make("#6666FF"),
  BrightYellow: BrightYellow.make("#FFFF66"),
  BrightCyan: BrightCyan.make("#66FFFF"),
  BrightMagenta: BrightMagenta.make("#FF66FF"),
  BrightWhite: BrightWhite.make("#FFFFFF"),
};
