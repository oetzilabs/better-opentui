# better-opentui
<small>(the name is WIP and a joke, I don't really think its "better")</small>

I made this library from "scratch" by looking at the [OpenTUI](https://github.com/sst/opentui) codebase and trying to understand it.

"better-opentui" is an **_experimental reimplementation_** of OpenTUI, a toolkit for building terminal user interfaces with [Effect-TS (website)](https://effect.website/), [Effect-TS (github)](https://github.com/effect-ts/effect) and [Zig](https://ziglang.org/). 

<big><big><big>**THERE WILL BE A LOT OF BREAKING CHANGES, SINCE THIS IS A WORK IN PROGRESS.**</big></big></big>

## Usage

To install dependencies:

```bash
bun install
```

This also checks if you have zig installed and if not, it will install it for you, and build the zig project under [this directory](./packages/core/src/zig).


## Examples:

```bash
bun run examples/styled-text.ts
```

```bash
bun run examples/multi-select.ts
```

```bash
bun run examples/file-select.ts
```

---

A big thanks to [@sst](https://github.com/sst), [@kommander](https://github.com/kommander) and every contributor for their work on OpenTUI and making it available as MIT licensed code for everyone to use.

(I copy pasted the MIT License from the OpenTUI repository, I hope that's fine)