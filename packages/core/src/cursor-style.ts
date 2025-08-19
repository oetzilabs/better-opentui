import { Schema } from "effect";

export const Block = Schema.Literal("block").pipe(Schema.brand("Block"));
export const Line = Schema.Literal("line").pipe(Schema.brand("Line"));
export const Underline = Schema.Literal("underline").pipe(
  Schema.brand("Underline")
);

export type Block = typeof Block.Type;
export type Line = typeof Line.Type;
export type Underline = typeof Underline.Type;

export const Collection = {
  Block,
  Line,
  Underline,
};

export const Style = Schema.Union(Block, Line, Underline);

export type Style = typeof Style.Type;
