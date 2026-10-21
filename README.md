# Animora: open-source SVG animator

**Animora** is a free, open-source SVG animation editor that runs entirely in your browser, in the spirit of
[SVGator](https://www.svgator.com/). **No sign-up, no sign-in, no uploads.** Your work stays on your machine.

Draw or import vector artwork, animate it on a keyframe timeline with easing, and export a lightweight
**animated SVG** that plays anywhere without JavaScript. You can also export a WebM video or PNG frames.

### ▶ [Open Animora in your browser: itsrajverma.github.io/animora](https://itsrajverma.github.io/animora/)

Nothing to install and no account to create. Open the link and start animating.

[![Deploy to GitHub Pages](https://github.com/itsrajverma/animora/actions/workflows/deploy.yml/badge.svg)](https://github.com/itsrajverma/animora/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-7c6cf2.svg)](LICENSE)

![Animora editor](docs/screenshot.png)

## Features

The editor follows SVGator's layout: a tool bar on top, **Elements / Library / Templates** on the left,
**Properties / Comments** on the right, and a full-width timeline with an **Animate** button.

**Animators** (SVGator style: pick one from *Animate*, or press Shift + key)
- Morph (⇧M), Position (⇧P), Motion path, Origin (⇧A), Scale (⇧S), Rotate (⇧R), Skew (⇧K), Size, Corner radius, Font size
- Opacity (⇧O), Fill color (⇧C), Fill opacity, Stroke color (⇧B), Stroke opacity, Stroke width (⇧W),
  Stroke offset (⇧F), Stroke dashes (⇧D), Draw stroke, Filters: blur and drop shadow (⇧L)
- **Motion paths**: *Set motion path* and click any path (or create a default one), edit its nodes on the canvas,
  animate the offset, *auto orient* along the curve
- **Masks**: put a shape on top, select it with the layers below, *Create mask*
- **Draggable transform origin** with snapping to the box corners and center; *Center origin*

**Timeline**
- One row per animator; drag keyframes, drag the bar between two keyframes to move both, box-select by dragging
- Right-click menu: copy, paste at playhead, duplicate, reverse keyframes, quick easings, delete
- 30+ easings, **step easings** (step start / end ×N), a draggable custom cubic-bezier editor with **saved curves**
- Draggable end marker to set the animation length, editable time display, timeline zoom, loop preview
- Position keyframes show their trajectory on the canvas

**Drawing & editing**
- Tools: transform, node, pen, line, rectangle, ellipse, polygon, star, text, hand
- Rulers with draggable **guides**, grid, **snapping** (objects, guides, grid, pixels), zoom & fit
- Group, ungroup, merge into one path, move up/down, flip, rotate ±90°, align & distribute
- Properties: position/size, transforms, opacity, **blend modes**, fill & stroke (opacity, caps, joins, dashes,
  path length with *Set as offset*), fill rule, text (font, weight, alignment, letter spacing), filters

**Library & templates**
- Library: your **uploads** and **saved items** (*Save to library*, stored in the browser), symbols, and
  illustrations (characters, business, devices, food & drinks, nature, icons)
- 11 animated templates: loader, heartbeat, notification bell, rocket on a motion path, masked text reveal,
  shape morph, stroke drawing, toggle switch, card hover with filters, ticking clock with step easing
- Comments tab: notes pinned to a time and an element, saved with the project

**Import / export**
- Import SVG (groups, CSS classes, transforms, gradients and clip paths are kept) and PNG/JPG/GIF/WebP; drag & drop
- **Animated SVG** (SMIL, no JavaScript) with start **on load / on mouse over / on click**, iterations,
  direction (normal, reverse, alternate, alternate reverse), speed and fill mode
- **GIF**, **WebM video**, **PNG sequence (.zip)**, PNG / static SVG of a frame, project file (`.animora.json`)
- Automatic local save in the browser

## Run it locally

Just want to use it? Go to **https://itsrajverma.github.io/animora/**. To run or develop it on your own machine:

```bash
git clone https://github.com/itsrajverma/animora.git
cd animora
npm install
npm run dev
```

Open http://localhost:5173. To build a static site (deployable to any static host, e.g. GitHub Pages or Netlify):

```bash
npm run build   # output in dist/
```

A GitHub Actions workflow (`.github/workflows/deploy.yml`) publishes `dist/` to GitHub Pages on every push to `main`.

## How animating works

1. Draw a shape, pick something from the Library, start from a Template, or import an SVG.
2. Select it and click **Animate** in the timeline (or press Shift+P, Shift+S, Shift+R…). A keyframe is added at the playhead.
3. Move the playhead and change the value on the canvas or in Properties. A new keyframe appears automatically.
4. Select keyframes and set their easing (curve button in the timeline, or Properties). The easing applies to the next segment.
5. Click **Export** to preview and download SVG, GIF, video or PNG frames.

Press `?` in the app for all keyboard shortcuts.

## Architecture

Vite + React 18 + TypeScript, with Zustand + Immer for state. No backend.

- One renderer (`src/engine/render.ts`) is used for the editor canvas, frame exports and the animated SVG, so what you see is what you export.
- Animated export uses nested `<g>` wrappers with `<animateTransform>` per transform channel and
  `<animate>` per attribute, with `calcMode="spline"` key splines for easing. Easings that overshoot (back, elastic,
  bounce) are sampled, since SMIL key splines must stay in [0, 1].

See [CONTRIBUTING.md](CONTRIBUTING.md) for a code map.

## Roadmap ideas

- Boolean operations (union / subtract / intersect / exclude)
- Gradient fills and gradient animation
- Lottie export, CSS-only and JavaScript-player SVG export, scroll trigger
- Per-letter text animation

Contributions welcome!

## License

[MIT](LICENSE)
