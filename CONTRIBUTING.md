# Contributing to Animora

Thanks for helping! Animora is a plain Vite + React + TypeScript app with no backend.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

## Where things live

| Path | What it does |
| --- | --- |
| `src/model/` | Document types, animatable property metadata, element factory, demo project |
| `src/engine/easing.ts` | Easing presets and the cubic-bezier solver |
| `src/engine/interpolate.ts` | Value-at-time for numbers, colors and paths (`frameAt`) |
| `src/engine/path.ts` | Path parser (all SVG commands → absolute M/L/C/Z), shape generators, morph normalization |
| `src/engine/render.ts` | **The** renderer: static frames (editor canvas, PNG, video) and animated SVG/SMIL export |
| `src/model/tree.ts` | Helpers for the nested layer tree (locate, walk, ancestors) |
| `src/engine/matrix.ts` | 2D affine math used to rebase layers when grouping, ungrouping, merging or moving between groups |
| `src/state/` | Zustand store, undo/redo, editing actions (`actions.ts`, auto-keyframing in `setValues`) and layer-tree operations (`structure.ts`) |
| `src/io/` | SVG/image import, downloads, PNG and WebM export |
| `src/components/` | UI: canvas, timeline, properties panel, dialogs |

The editor canvas draws every element with the same `staticElementMarkup()` used for exports, so what you
see is what gets exported. To add an animatable property: add it to `PROP_META` / `PROPS_BY_TYPE`, render it
in `shapeMarkup()`, and emit its `<animate>` in `animatedElementMarkup()`.

## Pull requests

- Keep PRs focused; describe what changed and how you tested it.
- Run `npm run build` (type-check + bundle) before opening the PR.
- New UI should work with both mouse and keyboard where practical.
