// https://github.com/sst/opentui/blob/main/src/parse.keypress.ts
// Converted to Effect

import { Brand, Effect, Match, RegExp, Schema } from "effect";

const metaKeyCodeRe = /^(?:\x1b)([a-zA-Z0-9])$/;

const fnKeyRe = /^(?:\x1b+)(O|N|\[|\[\[)(?:(\d+)(?:;(\d+))?([~^$])|(?:1;)?(\d+)?([a-zA-Z]))/;

export const F1 = Schema.Literal("OP", "[11~", "[[A").pipe(Schema.brand("f1"));
export const F2 = Schema.Literal("OQ", "[12~", "[[B").pipe(Schema.brand("f2"));
export const F3 = Schema.Literal("OR", "[13~", "[[C").pipe(Schema.brand("f3"));
export const F4 = Schema.Literal("OS", "[14~", "[[D").pipe(Schema.brand("f4"));
export const F5 = Schema.Literal("[15~", "[[E").pipe(Schema.brand("f5"));
export const F6 = Schema.Literal("[17~").pipe(Schema.brand("f6"));
export const F7 = Schema.Literal("[18~").pipe(Schema.brand("f7"));
export const F8 = Schema.Literal("[19~").pipe(Schema.brand("f8"));
export const F9 = Schema.Literal("[20~").pipe(Schema.brand("f9"));
export const F10 = Schema.Literal("[21~").pipe(Schema.brand("f10"));
export const F11 = Schema.Literal("[23~").pipe(Schema.brand("f11"));
export const F12 = Schema.Literal("[24~").pipe(Schema.brand("f12"));

export const Up = Schema.Literal("[A", "OA", "[a", "p", "Oa").pipe(Schema.brand("up"));
export const Down = Schema.Literal("[B", "OB", "[b", "n", "Ob").pipe(Schema.brand("down"));
export const Right = Schema.Literal("[C", "OC", "[c", "f", "Oc").pipe(Schema.brand("right"));
export const Left = Schema.Literal("[D", "OD", "[d", "b", "Od").pipe(Schema.brand("left"));
export const Clear = Schema.Literal("[E", "OE", "[e", "Oe").pipe(Schema.brand("clear"));
export const End = Schema.Literal("[F", "OF", "[4~", "[8~", "[8$", "[8^").pipe(Schema.brand("end"));
export const Home = Schema.Literal("[H", "OH", "[1~", "[7~", "[7$", "[7^").pipe(Schema.brand("home"));
export const Insert = Schema.Literal("[2~", "[2$", "[2^").pipe(Schema.brand("insert"));
export const Delete = Schema.Literal("[3~", "[3$", "[3^").pipe(Schema.brand("delete"));
export const PageUp = Schema.Literal("[5~", "[[5~", "[5$", "[5^").pipe(Schema.brand("pageup"));
export const PageDown = Schema.Literal("[6~", "[[6~", "[6$", "[6^").pipe(Schema.brand("pagedown")); // putty
export const Tab = Schema.Literal("[Z").pipe(Schema.brand("tab"));
export const Shift = Schema.Literal("[a", "[b", "[c", "[d", "[e", "[2$", "[3$", "[5$", "[6$", "[7$", "[8$", "[Z").pipe(
  Schema.brand("shift"),
);
export const Ctrl = Schema.Literal("Oa", "Ob", "Oc", "Od", "Oe", "[2^", "[3^", "[5^", "[6^", "[7^", "[8^").pipe(
  Schema.brand("ctrl"),
);

// special keys
export const Return = Schema.Literal("\r").pipe(Schema.brand("return"));
export type Return = typeof Return.Type;
export const Enter = Schema.Literal("\n").pipe(Schema.brand("enter"));
export type Enter = typeof Enter.Type;
export const TabSpecial = Schema.Literal("\t").pipe(Schema.brand("tab"));
export type TabSpecial = typeof TabSpecial.Type;
export const Backspace = Schema.Literal("\b", "\x1b\b", "\x7f", "\x1b\x7f").pipe(Schema.brand("backspace"));
export type Backspace = typeof Backspace.Type;
export const Escape = Schema.Literal("\x1b", "\x1b\x1b").pipe(Schema.brand("escape"));
export type Escape = typeof Escape.Type;
export const Space = Schema.Literal(" ", "\x1b ").pipe(Schema.brand("space"));
export type Space = typeof Space.Type;
export const CtrlLetter = Schema.Literal("\x1a").pipe(Schema.brand("ctrl+letter"));
export type CtrlLetter = typeof CtrlLetter.Type;
export const Number = Schema.Literal("0", "1", "2", "3", "4", "5", "6", "7", "8", "9").pipe(Schema.brand("number"));
export type Number = typeof Number.Type;
export const LowerCaseLetter = Schema.Literal(
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
  "o",
  "p",
  "q",
  "r",
  "s",
  "t",
  "u",
  "v",
  "w",
  "x",
  "y",
  "z",
).pipe(Schema.brand("lowercaseletter"));
export type LowerCaseLetter = typeof LowerCaseLetter.Type;
export const UpperCaseLetter = Schema.Literal(
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
).pipe(Schema.brand("uppercaseletter"));
export type UpperCaseLetter = typeof UpperCaseLetter.Type;
export const SpecialChar = Schema.String.pipe(Schema.brand("special"));
export type SpecialChar = typeof SpecialChar.Type;

export const Specials = Schema.Union(
  Return,
  Enter,
  Backspace,
  Escape,
  Space,
  CtrlLetter,
  Number,
  LowerCaseLetter,
  UpperCaseLetter,
  SpecialChar,
);
export type Specials = typeof Specials.Type;

export const KeyNames = Schema.Union(
  Shift,
  Ctrl,
  ...Specials.members,
  F1,
  F2,
  F3,
  F4,
  F5,
  F6,
  F7,
  F8,
  F9,
  F10,
  F11,
  F12,
  Up,
  Down,
  Right,
  Left,
  Clear,
  End,
  Home,
  Insert,
  Delete,
  PageUp,
  PageDown,
  Tab,
);

export type KeyNames = typeof KeyNames.Type;

export const ParsedKey = Schema.Struct({
  name: Schema.String,
  ctrl: Schema.Boolean,
  meta: Schema.Boolean,
  shift: Schema.Boolean,
  option: Schema.Boolean,
  sequence: Schema.String,
  number: Schema.Boolean,
  raw: Schema.String,
  code: Schema.optional(Schema.String),
});

export type ParsedKey = typeof ParsedKey.Type;
export const BufferSchema = Schema.instanceOf(Buffer);
export const ParseInput = Schema.Union(Schema.String, BufferSchema);
export type ParseInput = typeof ParseInput.Type;

export const parse = Effect.fn(function* (key: ParseInput = "") {
  const parsed1 = Match.value(key).pipe(
    Match.when(Schema.is(BufferSchema), (s) => {
      let b = "";
      if (s[0]! > 127 && s[1] === undefined) {
        s[0] -= 128;
        b = "\x1b" + String(s);
      } else {
        b = String(s);
      }
      return b;
    }),
    Match.when(Schema.is(Schema.Unknown), (s) => String(s)),
    Match.when(Schema.is(Schema.String), () => ""),
    Match.exhaustive,
  );

  let result = Match.value(parsed1).pipe(
    Match.when(Schema.is(KeyNames), (s) => {
      return ParsedKey.make({
        name: "",
        ctrl: Schema.is(Ctrl)(key),
        meta: metaKeyCodeRe.test(s),
        shift: Schema.is(Shift)(key),
        option: false,
        number: false,
        sequence: parsed1 || "",
        raw: parsed1,
      });
    }),
    Match.when(Schema.is(Specials), (s) => {
      return Match.value(s).pipe(
        Match.when(Schema.is(Return), (s) => {
          return ParsedKey.make({
            name: "return",
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(Enter), (s) => {
          return ParsedKey.make({
            name: "enter",
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(TabSpecial), (s) => {
          return ParsedKey.make({
            name: "tab",
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(Backspace), (s) => {
          return ParsedKey.make({
            name: "backspace",
            ctrl: false,
            meta: s.charAt(0) === "\x1b",
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(Escape), (s) => {
          return ParsedKey.make({
            name: "escape",
            ctrl: false,
            meta: s.length === 2,
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(Space), (s) => {
          return ParsedKey.make({
            name: "space",
            ctrl: false,
            meta: s.length === 2,
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(CtrlLetter), (s) => {
          return ParsedKey.make({
            name: String.fromCharCode(s.charCodeAt(0) + "a".charCodeAt(0) - 1),
            ctrl: true,
            meta: false,
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(Number), (s) => {
          return ParsedKey.make({
            name: s,
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: true,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(LowerCaseLetter), (s) => {
          return ParsedKey.make({
            name: s,
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: true,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(UpperCaseLetter), (s) => {
          return ParsedKey.make({
            name: s.toLocaleLowerCase(),
            ctrl: false,
            meta: false,
            shift: true,
            option: false,
            number: true,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(Schema.is(SpecialChar), (s) => {
          return ParsedKey.make({
            name: s,
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: true,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(metaKeyCodeRe.test, (s) => {
          const parts = s.match(metaKeyCodeRe)!;
          return ParsedKey.make({
            name: parts[1]!,
            ctrl: false,
            meta: true,
            shift: /^[A-Z]$/.test(parts[1]!),
            option: false,
            number: true,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.when(fnKeyRe.test, (s) => {
          const parts = s.match(fnKeyRe)!;
          const segs = [...s];
          // ansi escape sequence
          // reassemble the key code leaving out leading \x1b's,
          // the modifier key bitflag and any meaningless "1;" sequence
          const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join("");
          const modifier = ((parts[3] || parts[5] || 1) as number) - 1;
          const brandName = "";
          return ParsedKey.make({
            name: brandName,
            ctrl: !!(modifier & 4) || Schema.is(Ctrl)(key),
            meta: !!(modifier & 10),
            shift: !!(modifier & 1) || Schema.is(Shift)(key),
            option: (segs[0] === "\u001b" && segs[1] === "\u001b") || !!(modifier & 2), // Add option/alt modifier detection,
            number: true,
            sequence: parsed1 || "",
            raw: parsed1,
            code,
          });
        }),
        Match.when(Schema.is(Delete), (s) => {
          return ParsedKey.make({
            name: "delete",
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: true,
            sequence: parsed1 || "",
            raw: parsed1,
            code: "[3~",
          });
        }),
        Match.when(Schema.is(Schema.Unknown), (s) => {
          return ParsedKey.make({
            name: "unknown",
            ctrl: false,
            meta: false,
            shift: false,
            option: false,
            number: false,
            sequence: parsed1 || "",
            raw: parsed1,
          });
        }),
        Match.exhaustive,
      );
    }),
    Match.when(Schema.is(Schema.Unknown), (s) => {
      return ParsedKey.make({
        name: "unknown",
        ctrl: false,
        meta: false,
        shift: false,
        option: false,
        number: false,
        sequence: parsed1 || "",
        raw: parsed1,
      });
    }),
    Match.exhaustive,
  );
  return result;
});
