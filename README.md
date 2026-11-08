# Experiment-X

A playground for experimental UIs. **X-Frame**, the parent frame app, lists every
experiment and switches between them. Each experiment runs in its own iframe, so its
scripts, styles and globals can't leak into X-Frame or into other experiments.

## Getting started

```sh
npm install
npm run dev        # X-Frame at http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the build
```

Every push to `main` is deployed to GitHub Pages at
https://onddi.github.io/Experiment-X/ by `.github/workflows/deploy.yml`.
The build uses relative paths (`base: './'`), so it works under that sub-path as is.

Deep-link to an experiment with `#/<slug>`, e.g. `http://localhost:5173/#/color-mixer`.
Keyboard shortcuts in X-Frame: `[` / `]` previous / next, `\` toggle the list
(click outside the experiment first, since keys typed inside the iframe go to the experiment).

## Adding an experiment

```sh
npm run new liquid-buttons
# or with a custom title:
npm run new liquid-buttons -- "Liquid buttons"
```

This copies `experiments/_template` to `experiments/liquid-buttons/`. It shows up in
X-Frame automatically; there's no registry to edit.

### Conventions

```
experiments/
  <slug>/              kebab-case folder name, also used in the URL
    experiment.json    metadata X-Frame reads (required)
    index.html         entry page loaded in the iframe (required)
    main.ts            anything else is up to the experiment
    style.css
    xframe.ts          optional: client for layers, the data bus and hand-over
```

`experiment.json`:

| field         | required | meaning                                              |
| ------------- | -------- | ---------------------------------------------------- |
| `title`       | yes      | Name shown in the list                               |
| `description` | no       | One-liner under the title                            |
| `created`     | no       | `YYYY-MM-DD`; newest experiments are listed first    |
| `tags`        | no       | Labels, matched by the filter box                    |
| `hidden`      | no       | `true` hides it from the list without deleting it    |
| `provides`    | no       | Data-bus topics it publishes, e.g. `["transport"]`   |
| `accepts`     | no       | Data-bus topics it can use                           |

Rules that keep experiments siloed:

- **Only import from inside your own folder** (and from npm packages). Don't import
  from `src/shell` or from another experiment. If two experiments need the same
  thing, copy it.
- **Global styles are fine.** Style `body`, `h1`, `*` as you like; the iframe
  keeps it contained.
- **Use relative paths** (`./main.ts`, `./assets/foo.png`) so the build works from
  any base path.
- Folders starting with `_` (like `_template`) are ignored by X-Frame and the build.

### Using a framework

Experiments are plain Vite pages, so any framework works per experiment. Install the
package and its Vite plugin at the root (e.g. `npm i react react-dom @vitejs/plugin-react`),
add the plugin to `vite.config.ts`, and use it only inside that experiment's folder.
Other experiments are unaffected because each one is a separate page and bundle.

## How it works

- `index.html` + `src/shell/` is X-Frame, the parent frame app (`view.ts` layers,
  `bus.ts` data bus). It discovers experiments with
  `import.meta.glob('/experiments/*/experiment.json')` and only ever reads that
  metadata, never experiment code.
- Picking an experiment points an iframe at `experiments/<slug>/`. Each switch loads
  a fresh document, so no state carries over between experiments.
- `vite.config.ts` adds every `experiments/*/index.html` as a separate build input, so
  each experiment is its own page in `dist/experiments/<slug>/`, and can also be
  opened on its own (the ↗ button in the toolbar).

## Hand-over between experiments

An experiment can hand the screen to another one, e.g. the carousel grid opening a
cell into a different visualisation. X-Frame is in charge: it loads the next
experiment in a second iframe over the current one, fades it in once it has loaded,
and shows a ✕ (or takes Escape) to go back. Experiments still never import each
other; they only exchange `postMessage`s with X-Frame (same origin):

| direction            | message                                              |
| -------------------- | ---------------------------------------------------- |
| experiment → X-Frame | `{ type: 'xp:list' }` asks which experiments exist   |
| X-Frame → experiment | `{ type: 'xp:list', experiments: [{ slug, title, provides, accepts }] }` |
| experiment → X-Frame | `{ type: 'xp:handover', slug, params? }` show `slug` on top; `params` (strings) are added to its URL query, e.g. `{ preset: '3' }` → `?preset=3` |
| X-Frame → experiment | `{ type: 'xp:release' }` it was closed, take over again |

Opened on its own page (outside X-Frame), an experiment simply gets no answer.
The X-Frame client (below) wraps these as `xframe.list()`, `xframe.handover()` and
`xframe.onRelease()`.

## Layers

X-Frame can show several experiments at once, e.g. particles over an audio player.
Open the **Layers** panel (⧉ in the toolbar) or hover an experiment in the list and
click **+** to add it as a layer. Each layer is still its own iframe, so isolation
is unchanged. Per layer you can set:

- **Placement**: *Stacked* covers the base (and blends with it), *Docked
  top/bottom/left/right* takes a strip of the stage and shrinks what's left.
- **Blend mode** and **opacity** for stacked layers. `screen` is a good default
  for visuals on a dark background: black disappears, light adds up.
- **Gets the mouse**: only one stacked layer (or the base) gets pointer input;
  docked strips always do.

The whole setup is in the URL, so it can be bookmarked or shared:

```
#/audio-timeline+particle-field                         base + one stacked layer
#/audio-timeline+particle-field?1=full,screen,90&input=0
#/particle-field+audio-timeline?1=bottom,normal,100,25  player docked along the bottom
```

`1=` describes layer 1 as `placement,blend,opacity[,size%]`; `input=` is the index of
the layer that gets the mouse. Clicking an experiment in the list goes back to
showing just that one.

**Being a good layer.** X-Frame tells each experiment how it is shown (see
`xframe.onLayer` below). When stacked, an experiment can drop its page background
(`background: transparent`) so the layer below shows through without needing a
blend mode. Keep the controls out of the way, or hide them when `layer.input` is
false since that layer can't be clicked anyway.

## Data bus

Experiments on screen together can share data through X-Frame: one publishes on a
named **topic**, others subscribe. X-Frame routes the messages, keeps the last value
of each topic (a late subscriber gets it immediately), and lists live feeds with
their rates in the Layers panel. Experiments still never touch each other.

### X-Frame client

Copy [`experiments/_template/xframe.ts`](experiments/_template/xframe.ts) into your
experiment (new experiments get it from the template). It works the same in and out
of X-Frame; outside it, publishing does nothing and nothing arrives.

```ts
import { xframe } from './xframe.ts';

xframe.publish('transport', { playing: true, time: 12.3, duration: 201.5 });
const stop = xframe.subscribe('audio.spectrum', (data, from) => { /* from = publisher's slug */ });
xframe.onLayer((layer) => { /* layer.role: 'standalone' | 'base' | 'stacked' | 'docked' */ });
```

Declare what you publish and use in `experiment.json`. It's optional, but X-Frame uses
it to point out layers that can feed each other:

```json
{ "provides": ["audio.spectrum", "transport"], "accepts": ["transport.command"] }
```

### Protocol

All `postMessage`, same origin, between an experiment and X-Frame (`parent`):

| direction            | message                                                   |
| -------------------- | --------------------------------------------------------- |
| experiment → X-Frame | `{ type: 'xp:hello' }` X-Frame answers with `xp:layer`    |
| X-Frame → experiment | `{ type: 'xp:layer', role, placement, index, count, input }` on load and whenever it changes |
| experiment → X-Frame | `{ type: 'xp:subscribe', topic }` / `{ type: 'xp:unsubscribe', topic }` |
| experiment → X-Frame | `{ type: 'xp:publish', topic, data }`                     |
| X-Frame → experiment | `{ type: 'xp:data', topic, data, from }` to every subscriber except the publisher |

`data` can be anything structured-clonable (objects, arrays, typed arrays). Bus traffic
is cheap enough for per-frame updates of a few KB.

### Topics

Topic names are `area.thing`. Add new ones here when an experiment starts using them.

**`audio.spectrum`**: the frequency spectrum of whatever is playing, once per
animation frame while it plays. Publishers send exactly what an `AnalyserNode` gives:

```ts
{
  bins: Uint8Array,      // analyser.getByteFrequencyData(), length fftSize / 2
  sampleRate: number,    // audioContext.sampleRate; bin k is k * sampleRate / fftSize Hz
  fftSize: number,       // use 4096
  smoothing: number,     // analyser.smoothingTimeConstant, use 0.3
  minDecibels: number,   // analyser.minDecibels (default -100)
  maxDecibels: number,   // analyser.maxDecibels (default -30)
}
```

When playback pauses or stops, publish one frame with all-zero `bins` so listeners fall
silent. A subscriber can run its own analysis on `bins` exactly as it would on a local
analyser, so it needs no mic or screen-share permission and the sound plays only once,
from the publisher.

**`audio.levels`** (optional, for simple listeners): `{ level, bass, mid, treble }`,
each 0–1, once per frame alongside `audio.spectrum`.

**`transport`**: playback state, on every change and about 4× a second while playing:

```ts
{ playing: boolean, time: number, duration: number, title?: string }   // seconds
```

**`transport.command`**: requests to whoever publishes `transport`:

```ts
{ action: 'play' | 'pause' | 'toggle' } | { action: 'seek', time: number }
```

**Browser note.** Browsers slow down or pause animation in iframes that aren't visible,
so a publisher should be on screen (base, stacked or docked) for its feed to run
smoothly.
