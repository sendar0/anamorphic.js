# anamorphic

Head-tracked off-axis projection for a web page. The camera finds your eyes,
works out where they are in millimetres relative to the middle of the screen,
and re-projects the page from that exact viewpoint — plus a gridded room
behind it. Lean, and you see around the inside corners of the box.

**No dependencies at all.** The core is plain TypeScript and the DOM —
including the room, which draws itself. Svelte components are optional and
live behind their own entry point, so a plain-JS host never pays for them.

```
anamorphic/
  index.ts          core API — framework-free
  engine.ts         measurement, projection, the rAF loop
  room.ts           builds the box as plain DOM
  store.ts          a 60-line observable (Svelte store contract)
  copy.ts           the explainer text, so UI and docs cannot drift
  anamorphic.css    plane variables, utilities, and the room's styles
  svelte/           AnaRoom · AnaHud · AnaInvite (optional)
  demo/             the showcase — vanilla, no framework
```

## Run the demo

```sh
npm install
npm run dev        # http://localhost:5180
```

The demo is the documentation you can lean at. It uses nothing but the core
API, which is the point: if it works, the library stands on its own.

## Quick start

Anywhere, with no framework:

```js
import 'anamorphic/anamorphic.css';
import { mountRoom, startCamera } from 'anamorphic';

mountRoom();      // draws the box; tears itself down when the effect ends
startCamera();    // asks for the camera, loads the mesh, starts tracking
```

```html
<div data-ana-page>
  <h1 data-ana-plane="fore">In front</h1>
  <p  data-ana-plane="deep">Behind</p>
</div>
```

Or with Svelte, if you have it:

```svelte
<script>
  import 'anamorphic/anamorphic.css';
  import { AnaRoom } from 'anamorphic/svelte';
  import { startCamera, stopAnamorphic, anaActive } from 'anamorphic';
</script>

<AnaRoom />

<div data-ana-page>
  <h1 data-ana-plane="fore">In front</h1>
  <button onclick={() => ($anaActive ? stopAnamorphic() : startCamera())}>
    {$anaActive ? 'off' : 'on'}
  </button>
</div>
```

Three things are load-bearing:

1. **Import the stylesheet.** It is inert until the engine sets
   `<html data-ana="on">`, so a page that never starts it pays nothing.
2. **Mark your page container** with `data-ana-page`. The room is painted
   at `z-index: 0` fixed to the viewport; your content has to sit above it.
3. **Put things on planes.** Either the `data-ana-plane` attribute, or
   `transform: var(--ana-t-fore)` in your own CSS — see *Planes* below.

### Installing

There is no build step and no bundle: the package ships TypeScript source,
so a bundler is assumed (any of vite, esbuild, webpack, rollup). Either copy
the folder into your project, or point at the repo:

```sh
npm install github:sanderamelink/anamorphic
```

## How it works

A plane at depth *z*, seen by an eye a distance *P* in front of the glass,
projects as a uniform scale about the point where your line of sight crosses
the screen:

```
s = P / (P - z)
```

Content planes are all parallel to the screen, so that projection is
*exactly* a scale plus a translate. No keystoning to fake, nothing that
needs real 3D.

The trick that makes it usable on a real page: subtract the resting
projection — what you would see sitting square in front of the screen. What
survives is only the differential,

```
Δ = eyeOffsetPx · (1 - s)
```

which is identical for every element on a plane and **zero when your eye is
centred**. So a head-on viewer sees the page pixel-for-pixel as it was laid
out, and it only moves relative to itself as they lean. Text stays crisp,
hit targets stay put, nothing reflows.

The room behind the page is the one part that needs genuine CSS 3D — its
walls are rotated — so it gets a real `perspective` and a `perspective-origin`
driven by the same measurement. Both halves agree because both come from one
eye position.

Distance comes from the interpupillary span: the iris landmarks are a known
~63 mm apart, so their separation in pixels gives range through a pinhole
model. A one-euro filter smooths the result — still when you are still,
quick when you move.

## Tracking

Four sources, in order of fidelity:

| mode | what drives it | needs |
| --- | --- | --- |
| `face` | MediaPipe face mesh, iris landmarks | camera, secure context, one CDN fetch |
| `blob` | built-in skin-tone tracker | camera only — no network, coarser, no yaw |
| `pointer` | the cursor stands in for your eyes | nothing |
| `tilt` | device orientation sensors | a phone or tablet |

`startCamera()` walks down this list on its own: if the model will not load
it falls back to `blob`, and if the camera is refused it falls back to
`pointer` and says why. Nothing is uploaded — no frame, no landmark, no
measurement. The only outbound requests are for the tracker itself, once.

## Planes

Five, back to front. The engine publishes three CSS variables per plane and
rewrites them every frame:

| plane | z | variables |
| --- | --- | --- |
| `far` | −340px | `--ana-far-x`, `--ana-far-y`, `--ana-far-s` |
| `deep` | −210px | `--ana-deep-*` |
| `mid` | −110px | `--ana-mid-*` |
| `fore` | +95px | `--ana-fore-*` |
| `near` | +185px | `--ana-near-*` |

Each also gets a ready-made composite, `--ana-t-far` … `--ana-t-near`, which is
what the utilities apply.

**Ordering matters.** Planes are 2D translations, so nothing sorts them for
you: a near element will happily paint *behind* a far one unless the z-index
says otherwise. The `data-ana-plane` utilities set `z-index` 1–5 to match.
If you assign planes in your own CSS, you own that ordering too. And note
z-index only orders within a stacking context, so two elements that can
overlap should share a parent.

**Things at the edge of the document.** A transformed box still contributes
scrollable overflow. Translating the last element on the page downward adds
scroll slack that grows and shrinks on every frame. Give bottom-most
elements the horizontal half of their plane only:

```css
transform: translate3d(var(--ana-deep-x), 0, 0) scale(var(--ana-deep-s));
```

**Elements with an existing animation.** A CSS animation outranks ordinary
declarations, so an entrance animation that ends on a `transform` will win
over the plane and pin the element in place. Retire it before turning the effect
on, and leave it retired — switching it back on afterwards replays the whole
entrance.

## API

```ts
import { startCamera, startPointer, startTilt, stopAnamorphic } from '$lib/anamorphic';
```

| function | does |
| --- | --- |
| `startCamera()` | asks for the camera, loads the mesh, starts tracking; falls back on its own |
| `startPointer()` | cursor mode — no permission needed |
| `startTilt()` | orientation sensors; falls back to pointer if none arrive |
| `stopAnamorphic()` | releases the camera, fades out, removes every variable it wrote |
| `recenter()` | takes the current pose as straight-on |
| `toggleMirror()` | flips the horizontal axis |
| `setGain(n)` | 0.3 – 2.4, how far the planes spread |
| `configure(opts)` | planes, size cue, ramp, model URLs, amplitude policy |
| `setPreviewCanvas(el)` | where to draw the tracker preview, or `null` |
| `mountRoom(opts)` | draws the room; returns a handle with `destroy()` |

State is exposed as stores — `subscribe(fn)` returning an unsubscribe, which
is also exactly Svelte's store contract, so `$anaMode` works as-is:

`anaMode` · `anaStatus` · `anaDetector` · `anaTracking` ·
`anaActive` · `anaStarting` · `anaVisible` · `anaReadout` ·
`anaGain` · `anaMirror` · `anaHud` · `anaAspect` · `anaLog`

`anaActive` covers the window where the camera has been asked for but no
answer has come back — a permission prompt can sit there indefinitely, and
anything offering a way out has to be able to reach into it.

```ts
configure({
  planes: [{ key: 'back', z: -400 }, { key: 'front', z: 120 }],
  sizeCue: 0.3,        // 0 = parallax only, 1 = true perspective scaling
  ramp: 190,           // ms to ease in and out
  amplitude: (width, calm) => (calm ? 0.45 : width < 640 ? 0.6 : 1)
});
```

Custom planes publish `--ana-<key>-*`, so they need matching CSS.

## Components

| component | what it is |
| --- | --- |
| `AnaRoom` | a wrapper around `mountRoom()`, so Svelte hosts can mount it declaratively. |
| `AnaHud` | tracker panel: camera preview, meters, knobs. Toggled by the `anaHud` store. |
| `AnaInvite` | a corner flash and a modal that explains the thing before asking for a camera. |

They read design tokens (`--bg-1`, `--accent`, `--font-mono`, …) when the
host defines them and fall back to sane values when it does not. The room
takes its colours from its own neutral tokens — `--ana-wall-near`,
`--ana-wall-far`, `--ana-wall-back`, `--ana-line`, `--ana-dust`, `--ana-glow`,
`--ana-bezel`, `--ana-sheen` — so re-theming it is a handful of variables
rather than a fork.

## What it costs, and where it will not work

- **A secure context.** Browsers hand out cameras on `https://` and
  `localhost` only. `cameraProblem()` returns the real reason when there is
  one, so you can say something more useful than "no camera".
- **~3 MB, once**, for the face mesh runtime and model, fetched on first
  start from jsDelivr and Google's MediaPipe bucket. Point `runtimeUrl` and
  `modelUrl` at your own host to avoid the third parties.
- **One rAF loop** while running: read the sensor, filter, write ~20 custom
  properties. The properties are transforms, so the work stays on the
  compositor. It stops itself the moment the fade-out completes.
- **`prefers-reduced-motion`** cuts the amplitude rather than refusing —
  the effect is opt-in by construction, so someone who asked for it gets a
  gentler version rather than nothing.
- **Camera modes need a real face in reasonable light.** The blob tracker is
  a fallback, not a peer: no yaw, and it will chase anything skin-coloured.

## Licence

MIT. See LICENSE.
