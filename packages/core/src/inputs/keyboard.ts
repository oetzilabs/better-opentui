import { Effect, Match, Schema } from "effect";

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

export const Up = Schema.Literal("[A", "OA", "[a", "\u001b[A").pipe(Schema.brand("up"));
export const Down = Schema.Literal("[B", "OB", "[b", "\u001b[B").pipe(Schema.brand("down"));
export const Right = Schema.Literal("[C", "OC", "[c", "\u001b[C").pipe(Schema.brand("right"));
export const Left = Schema.Literal("[D", "OD", "[d", "\u001b[D").pipe(Schema.brand("left"));
export const Clear = Schema.Literal("[E", "OE", "[e", "Oe").pipe(Schema.brand("clear"));
export const End = Schema.Literal("[F", "OF", "[4~", "[8~", "[8$", "[8^").pipe(Schema.brand("end"));
export const Home = Schema.Literal("[H", "OH", "[1~", "[7~", "[7$", "[7^").pipe(Schema.brand("home"));
export const Insert = Schema.Literal("[2~", "[2$", "[2^").pipe(Schema.brand("insert"));
export const Delete = Schema.Literal("[3~", "[3$", "[3^", "\x1b[3~").pipe(Schema.brand("delete"));
export const PageUp = Schema.Literal("[5~", "[[5~", "[5$", "[5^", "[5;2~", "[5;5~").pipe(Schema.brand("pageup"));
export const PageDown = Schema.Literal("[6~", "[[6~", "[6$", "[6^", "[6;2~", "[6;5~").pipe(Schema.brand("pagedown")); // putty
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
export const isReturn = (name: string) => Schema.is(Return)(name);
export const Enter = Schema.Literal("\n").pipe(Schema.brand("enter"));
export type Enter = typeof Enter.Type;
export const isEnter = (name: string) => Schema.is(Enter)(name);
export const TabSpecial = Schema.Literal("\t").pipe(Schema.brand("tab"));
export type TabSpecial = typeof TabSpecial.Type;
export const isTabSpecial = (name: string) => Schema.is(TabSpecial)(name);
export const Backspace = Schema.Literal("\b", "\x1b\b", "\x7f", "\x1b\x7f").pipe(Schema.brand("backspace"));
export type Backspace = typeof Backspace.Type;
export const isBackspace = (name: string) => Schema.is(Backspace)(name);
export const Escape = Schema.Literal("\x1b", "\x1b\x1b").pipe(Schema.brand("escape"));
export type Escape = typeof Escape.Type;
export const isEscape = (name: string) => Schema.is(Escape)(name);
export const Space = Schema.Literal(" ", "\x1b ").pipe(Schema.brand("space"));
export type Space = typeof Space.Type;
export const isSpace = (name: string) => Schema.is(Space)(name);
export const CtrlLetter = Schema.Literal("\x1a").pipe(Schema.brand("ctrl+letter"));
export type CtrlLetter = typeof CtrlLetter.Type;
export const isCtrlLetter = (name: string) => Schema.is(CtrlLetter)(name);
export const Number = Schema.Literal("0", "1", "2", "3", "4", "5", "6", "7", "8", "9").pipe(Schema.brand("number"));
export type Number = typeof Number.Type;
export const isNumber = (name: string) => Schema.is(Number)(name);
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
export const isLowerCaseLetter = (name: string) => Schema.is(LowerCaseLetter)(name);
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
export const isUpperCaseLetter = (name: string) => Schema.is(UpperCaseLetter)(name);
export const SpecialChar = Schema.String.pipe(Schema.brand("special"));
export type SpecialChar = typeof SpecialChar.Type;
export const isSpecialChar = (name: string) => Schema.is(SpecialChar)(name);

export const ArrowKeys = Schema.Union(Up, Down, Left, Right);
export type ArrowKeys = typeof ArrowKeys.Type;
export const isArrowKeys = (name: string) => Schema.is(ArrowKeys)(name);

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

export const FKeys = Schema.Union(F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12);
export type FKeys = typeof FKeys.Type;
export const isFKeys = (name: string) => Schema.is(FKeys)(name);

export const UtilityKeys = Schema.Union(Clear, End, Home, Insert, Delete, PageUp, PageDown, Tab);

export const KeyNames = Schema.Union(
  Shift,
  Ctrl,
  ...Specials.members,
  ...FKeys.members,
  ...ArrowKeys.members,
  ...UtilityKeys.members,
);

export type KeyNames = typeof KeyNames.Type;

export const ParsedKey = Schema.mutable(
  Schema.Struct({
    name: Schema.String,
    ctrl: Schema.Boolean,
    meta: Schema.Boolean,
    shift: Schema.Boolean,
    option: Schema.Boolean,
    sequence: Schema.String,
    number: Schema.Boolean,
    raw: Schema.String,
    code: Schema.optional(Schema.String),
  }),
);

export type ParsedKey = typeof ParsedKey.Type;
export const BufferSchema = Schema.instanceOf(Buffer);
export const ParseInput = Schema.Union(Schema.String, BufferSchema);
export type ParseInput = typeof ParseInput.Type;

export const parse = Effect.fn(function* (key: ParseInput = "") {
  if (Buffer.isBuffer(key)) {
    if (key[0]! > 127 && key[1] === undefined) {
      key[0] -= 128;
      key = "\x1b" + String(key);
    } else {
      key = String(key);
    }
  } else if (typeof key !== "string") {
    key = String(key);
  } else if (!key) {
    key = "";
  }

  // Drop mouse sequences immediately. Somehow they cause issues with the keyboardhandlers
  if (/^(?:\x1b\[M|\x1b\[<|\x1b\[\d+;\d+[mM]|\x1b\[<\d+;\d+;\d+[mM])/.test(key)) {
    return null;
  }

  let xresult: ParsedKey = {
    name: "unknown",
    ctrl: Schema.is(Ctrl)(key),
    meta: false,
    shift: Schema.is(Shift)(key),
    option: false,
    number: false,
    sequence: key,
    raw: key,
  };

  // ArrowKeys matcher
  xresult = Match.value(key).pipe(
    // ArrowKeys
    Match.when(Schema.is(Up), (s) => {
      xresult.name = "up";
      xresult.sequence = key;
      return xresult;
    }),
    Match.when(Schema.is(Down), (s) => {
      xresult.name = "down";
      xresult.sequence = key;
      return xresult;
    }),
    Match.when(Schema.is(Left), (s) => {
      xresult.name = "left";
      xresult.sequence = key;
      return xresult;
    }),
    Match.when(Schema.is(Right), (s) => {
      xresult.name = "right";
      xresult.sequence = key;
      return xresult;
    }),
    Match.orElse(() => xresult),
  );
  if (xresult.name !== "unknown") return xresult;

  // Specials matcher
  xresult = Match.value(key).pipe(
    // Specials
    Match.when(Schema.is(Return), (s) => {
      xresult.name = "return";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(Enter), (s) => {
      xresult.name = "enter";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(TabSpecial), (s) => {
      xresult.name = "tab";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(Backspace), (s) => {
      xresult.name = "backspace";
      xresult.sequence = s;
      xresult.meta = s.charAt(0) === "\x1b";
      return xresult;
    }),
    Match.when(Schema.is(Escape), (s) => {
      xresult.name = "escape";
      xresult.sequence = s;

      xresult.meta = s.length === 2;
      return xresult;
    }),
    Match.when(Schema.is(Space), (s) => {
      xresult.name = "space";
      xresult.sequence = s;

      xresult.meta = s.length === 2;
      return xresult;
    }),
    Match.when(Schema.is(CtrlLetter), (s) => {
      xresult.name = String.fromCharCode(s.charCodeAt(0) + "a".charCodeAt(0) - 1);
      xresult.sequence = s;
      xresult.ctrl = true;
      return xresult;
    }),
    Match.when(Schema.is(Number), (s) => {
      xresult.name = s;
      xresult.sequence = s;
      xresult.number = true;
      return xresult;
    }),
    Match.when(Schema.is(LowerCaseLetter), (s) => {
      xresult.name = s;
      xresult.sequence = s;
      xresult.number = true;
      return xresult;
    }),
    Match.when(Schema.is(UpperCaseLetter), (s) => {
      xresult.name = s.toLocaleLowerCase();
      xresult.sequence = s;
      xresult.shift = true;
      xresult.number = true;
      return xresult;
    }),
    Match.when(Schema.is(SpecialChar), (s) => {
      xresult.name = s;
      xresult.sequence = s;
      xresult.number = true;
      return xresult;
    }),
    Match.orElse(() => xresult),
  );
  if (xresult.name !== "unknown") return xresult;

  // FKeys matcher
  xresult = Match.value(key).pipe(
    Match.when(Schema.is(F1), (s) => {
      xresult.name = "f1";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F2), (s) => {
      xresult.name = "f2";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F3), (s) => {
      xresult.name = "f3";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F4), (s) => {
      xresult.name = "f4";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F5), (s) => {
      xresult.name = "f5";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F6), (s) => {
      xresult.name = "f6";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F7), (s) => {
      xresult.name = "f7";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F8), (s) => {
      xresult.name = "f8";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F9), (s) => {
      xresult.name = "f9";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F10), (s) => {
      xresult.name = "f10";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F11), (s) => {
      xresult.name = "f11";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(F12), (s) => {
      xresult.name = "f12";
      xresult.sequence = s;
      return xresult;
    }),
    Match.orElse(() => xresult),
  );
  if (xresult.name !== "unknown") return xresult;

  // UtilityKeys matcher
  xresult = Match.value(key).pipe(
    Match.when(Schema.is(Clear), (s) => {
      xresult.name = "clear";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(End), (s) => {
      xresult.name = "end";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(Home), (s) => {
      xresult.name = "home";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(Insert), (s) => {
      xresult.name = "insert";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(Delete), (s) => {
      xresult.name = "delete";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(PageUp), (s) => {
      xresult.name = "pageup";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(PageDown), (s) => {
      xresult.name = "pagedown";
      xresult.sequence = s;
      return xresult;
    }),
    Match.when(Schema.is(Tab), (s) => {
      xresult.name = "tab";
      xresult.sequence = s;
      return xresult;
    }),
    Match.orElse(() => xresult),
  );
  if (xresult.name !== "unknown") return xresult;

  // Modifiers, Meta, FnKey, Unknown, Fallback matcher
  xresult = Match.value(key).pipe(
    Match.when(Schema.is(Ctrl), (s) => {
      xresult.name = "ctrl";
      xresult.sequence = s;
      xresult.ctrl = true;
      return xresult;
    }),
    Match.when(Schema.is(Shift), (s) => {
      xresult.name = "shift";
      xresult.sequence = s;
      xresult.shift = true;
      return xresult;
    }),
    Match.orElse((s) => {
      let parts;
      if ((parts = metaKeyCodeRe.exec(s))) {
        xresult.meta = true;
        xresult.shift ||= /^[A-Z]$/.test(parts[1]!);
        xresult.name = parts[1];
      } else if ((parts = fnKeyRe.exec(s))) {
        const segs = [...s];
        if (segs[0] === "\u001b" && segs[1] === "\u001b") {
          xresult.option = true;
        }

        const code = [parts[1], parts[2], parts[4], parts[6]].filter(Boolean).join("");
        const modifier = ((parts[3] || parts[5] || 1) as number) - 1;

        xresult.ctrl ||= !!(modifier & 4);
        xresult.meta ||= !!(modifier & 10);
        xresult.shift ||= !!(modifier & 1);
        xresult.option ||= !!(modifier & 2);
        xresult.code = code;
      }
      return xresult;
    }),
  );

  return xresult;
});
