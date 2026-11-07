# Experiment-X

A playground for experimental UIs. A small parent shell lists every experiment and
switches between them. Each experiment runs in its own iframe, so its scripts,
styles and globals can't leak into the shell or into other experiments.

## Getting started

```sh
npm install
npm run dev        # shell at http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the build
```

Every push to `main` is deployed to GitHub Pages at
https://onddi.github.io/Experiment-X/ by `.github/workflows/deploy.yml`.
The build uses relative paths (`base: './'`), so it works under that sub-path as is.

Deep-link to an experiment with `#/<slug>`, e.g. `http://localhost:5173/#/color-mixer`.
Keyboard shortcuts in the shell: `[` / `]` previous / next, `\` toggle the list
(click outside the experiment first, since keys typed inside the iframe go to the experiment).

## Adding an experiment

```sh
npm run new liquid-buttons
# or with a custom title:
npm run new liquid-buttons -- "Liquid buttons"
```

This copies `experiments/_template` to `experiments/liquid-buttons/`. It shows up in
the shell automatically; there's no registry to edit.

### Conventions

```
experiments/
  <slug>/              kebab-case folder name, also used in the URL
    experiment.json    metadata the shell reads (required)
    index.html         entry page loaded in the iframe (required)
    main.ts            anything else is up to the experiment
    style.css
```

`experiment.json`:

| field         | required | meaning                                              |
| ------------- | -------- | ---------------------------------------------------- |
| `title`       | yes      | Name shown in the list                               |
| `description` | no       | One-liner under the title                            |
| `created`     | no       | `YYYY-MM-DD`; newest experiments are listed first    |
| `tags`        | no       | Labels, matched by the filter box                    |
| `hidden`      | no       | `true` hides it from the list without deleting it    |

Rules that keep experiments siloed:

- **Only import from inside your own folder** (and from npm packages). Don't import
  from `src/shell` or from another experiment. If two experiments need the same
  thing, copy it.
- **Global styles are fine.** Style `body`, `h1`, `*` as you like; the iframe
  keeps it contained.
- **Use relative paths** (`./main.ts`, `./assets/foo.png`) so the build works from
  any base path.
- Folders starting with `_` (like `_template`) are ignored by the shell and the build.

### Using a framework

Experiments are plain Vite pages, so any framework works per experiment. Install the
package and its Vite plugin at the root (e.g. `npm i react react-dom @vitejs/plugin-react`),
add the plugin to `vite.config.ts`, and use it only inside that experiment's folder.
Other experiments are unaffected because each one is a separate page and bundle.

## How it works

- `index.html` + `src/shell/` is the parent shell. It discovers experiments with
  `import.meta.glob('/experiments/*/experiment.json')` and only ever reads that
  metadata, never experiment code.
- Picking an experiment points the iframe at `experiments/<slug>/`. Each switch loads
  a fresh document, so no state carries over between experiments.
- `vite.config.ts` adds every `experiments/*/index.html` as a separate build input, so
  each experiment is its own page in `dist/experiments/<slug>/`, and can also be
  opened on its own (the ↗ button in the toolbar).
