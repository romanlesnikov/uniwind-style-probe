# uniwind-style-probe

Checks that your Tailwind **breakpoint** and **platform** variants still carry their condition after [uniwind](https://github.com/uni-stack/uniwind) compiles them for React Native — in about a second, without building the app or picking up a device.

```
$ uniwind-style-probe --css ./global.css
uniwind 1.12.0
✓ 1470 classes checked across ios, android — every variant kept its condition
```

When something is wrong it says what, and exits `1`:

```
$ uniwind-style-probe --css ./global.css

✗ breakpoint-dropped — 73 classes
  sm:hidden lost its breakpoint and now applies at every width (expected minWidth 640)
  sm:flex-row lost its breakpoint and now applies at every width (expected minWidth 640)
  …

✗ platform-leaked — 1 class
  ios:-mt-12 is tagged ios: but was emitted into the android stylesheet
```

## Why this exists

On the web a breakpoint is a real media query and the browser evaluates it at runtime. On native there is no such thing: uniwind resolves `@media` at **compile time** and bakes a `minWidth` into each style. If that number comes out `0`, the style applies at every width and a phone quietly renders the desktop layout.

That is exactly what happened in [uni-stack/uniwind#668](https://github.com/uni-stack/uniwind/issues/668). Two separate things had to line up:

1. uniwind's CSS processor pushed the media condition into its declaration config **once per `@media` block**, then reset that config after each child rule — so only the first rule in a block kept its condition.
2. tailwindcss 4.3.3 started **merging** breakpoint blocks. Same project CSS, compiled twice: 4.3.2 emitted **74** separate `@media (width >= 40rem)` blocks, 4.3.3 emitted **1**.

Alone, neither is visible. Together, 73 of those 74 utilities silently lost their breakpoint.

The symptom points everywhere except the cause. `Dimensions`, the measure store and `UniwindRuntime.screen` all report correct values, because nothing is wrong at runtime — the condition was already gone when the bundle was built. No amount of runtime debugging finds it, and the only way to see it used to be to run the app on a device and look.

This tool reads the compiled stylesheet instead.

## Status

**The bug is fixed.** [#686](https://github.com/uni-stack/uniwind/pull/686) landed and uniwind **v1.12.1** shipped it on 1 October 2026. If you are on 1.12.1 or later with current tailwindcss, you should get a clean run.

So this is a **regression guard**, not a fix for a live problem. It is worth keeping in CI because the failure mode is silent, it is reachable from an ordinary dependency bump, and the two packages that have to agree are maintained separately. A floating version range is what let tailwindcss 4.3.3 into the project that found this in the first place.

## Install

```bash
npm install --save-dev uniwind-style-probe
```

It resolves `uniwind` from your project, so install it alongside the project it checks. Node 20.11+.

## Usage

```bash
uniwind-style-probe --css ./global.css
```

| Option | |
| --- | --- |
| `--css <file>` | Tailwind CSS entry file. Required. Resolved from the current directory, same as uniwind's Metro config. |
| `--platform <name>` | `ios`, `android` or `web`. Repeatable. Defaults to `ios` and `android`. |
| `--project <dir>` | Project root used to resolve `uniwind`. Defaults to the current directory. |
| `--no-expo` | The project is bare React Native rather than Expo. |
| `--json` | Print findings as JSON. |

Run it from wherever your CSS entry file is resolved — in an Expo monorepo that is usually the Expo app directory:

```bash
cd apps/expo && npx uniwind-style-probe --css ./global.css
```

### In CI

```yaml
- run: npx uniwind-style-probe --css ./global.css
```

Exit codes: `0` clean, `1` findings, `2` the probe itself could not run.

### As a library

```js
import { check } from 'uniwind-style-probe'
import { extract } from 'uniwind-style-probe/extract'

const { sheets } = await extract({ cssEntryFile: './global.css' })
const findings = check(sheets)
```

## What it checks

**`breakpoint-dropped`** — every `sm:` / `md:` / `lg:` / `xl:` / `2xl:` class is grouped by prefix, and the expected `minWidth` is whatever the majority of that group agrees on. Anything that disagrees is reported. Calibrating from the stylesheet means custom breakpoints work without configuration. If a whole group came out `0` there is no majority left, so the group is reported once rather than guessing a width.

**`platform-leaked`** — the stylesheet is compiled once per platform and compared. An `ios:` class appearing in the Android sheet is a leak, and vice versa.

## How it works

uniwind does not export its CSS pipeline, so `extract.js` loads `dist/metro/transformer.cjs` through `vm.compileFunction` with a short tail appended that re-exports the internals it needs, and calls `compileCSS` with a `UniwindBundlerConfig` built for each platform. The result is the same source the native runtime receives; it is evaluated with a stubbed runtime and the static parts of each entry are read.

Nothing is written to `node_modules`. The trade-off is the obvious one: this reaches into internals and a uniwind release can move them. `src/check.js` holds every rule as a pure function over a plain stylesheet object, so the part that can break is small, isolated, and the part that matters is covered by tests that need neither uniwind nor Tailwind.

## Development

```bash
npm install
npm test
```

## License

MIT
