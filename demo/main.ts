/* The demo, in plain TypeScript — no framework anywhere. If this page works,
   the library genuinely stands on its own. */

// exactly what a consumer writes: `import 'anamorphic/anamorphic.css'`
import '../anamorphic.css';

import {
	cameraProblem,
	anaActive,
	anaDetector,
	anaGain,
	anaMode,
	anaReadout,
	anaStatus,
	hasTilt,
	isCoarsePointer,
	mountRoom,
	recenter,
	setPreviewCanvas,
	startCamera,
	startPointer,
	startTilt,
	stopAnamorphic
} from '../index';

// page furniture, not part of the library
import { highlightAll } from './highlight';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

highlightAll();
mountRoom();

/* ── controls ─────────────────────────────────────────────────────────── */

const camera = $<HTMLButtonElement>('camera');
const tilt = $<HTMLButtonElement>('tilt');
const recentre = $<HTMLButtonElement>('recenter');
const off = $<HTMLButtonElement>('off');
const preview = $<HTMLCanvasElement>('preview');

camera.addEventListener('click', () => startCamera());
$('pointer').addEventListener('click', () => startPointer());
tilt.addEventListener('click', () => startTilt());
recentre.addEventListener('click', () => recenter());
off.addEventListener('click', () => stopAnamorphic());

if (hasTilt() && isCoarsePointer()) tilt.hidden = false;

// say why rather than showing a button that cannot work
const problem = cameraProblem();
if (problem) {
	camera.disabled = true;
	camera.textContent = `camera — ${problem[0]}`;
	const note = $('problem');
	note.hidden = false;
	note.textContent = problem[1];
}

const gain = $<HTMLInputElement>('gain');
gain.addEventListener('input', () => anaGain.set(parseFloat(gain.value)));
anaGain.subscribe((v) => ($('gain-value').textContent = v.toFixed(2)));

/* ── live state ───────────────────────────────────────────────────────── */

const state = $('state');
anaStatus.subscribe((s) => (state.textContent = s));

anaActive.subscribe((on) => {
	state.classList.toggle('on', on);
	recentre.disabled = !on;
	off.disabled = !on;
});

// the preview only draws while a canvas is registered, so hand it over
// when a camera mode is running and take it back when it is not
anaMode.subscribe((mode) => {
	const looking = mode === 'face' || mode === 'blob';
	preview.hidden = !looking;
	setPreviewCanvas(looking ? preview : null);
});

const readout = $('readout');
const signed = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0);
anaReadout.subscribe((r) => {
	readout.innerHTML =
		`detector <b>${anaDetector.get()}</b> · ` +
		`eye <b>${signed(r.x)}mm</b>, <b>${signed(r.y)}mm</b> · ` +
		`<b>${(r.z / 10).toFixed(0)}cm</b> away`;
});

/* ── the skull ────────────────────────────────────────────────────────── */

/* Holbein's trick on a live measurement. The drawing carries the inverse of
   the distortion you would see from RESOLVE_MM, so `d` — how far your eye is
   from that one viewpoint, as a fraction — is the only number the CSS needs:
   1 sitting square in front, 0 standing exactly where the picture was made
   for. Everything the drawing does is a function of it. */
const RESOLVE_MM = -170;

const skull = $('skull-figure');
const meter = $('skull-meter');
const hint = $('skull-hint');

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

function setSkull(eyeX: number) {
	// past 1.25 the projection would fold through 90° and mirror itself
	const d = clamp(1 - eyeX / RESOLVE_MM, 0, 1.25);
	const found = clamp(1 - d, 0, 1);
	skull.style.setProperty('--sk-d', d.toFixed(3));
	meter.style.width = (found * 100).toFixed(1) + '%';
	// loose enough that a tracker that jitters by a few mm can still land it
	skull.classList.toggle('is-resolved', found > 0.88);
	hint.textContent =
		found > 0.88
			? 'there it is — memento mori'
			: found > 0.5
				? 'nearly — keep going'
				: `a smear — lean ${RESOLVE_MM < 0 ? 'left' : 'right'}`;
}

anaReadout.subscribe((r) => setSkull(r.x));
// with nothing running there is no viewpoint to speak of, so it goes back to
// being a stain on the page
anaActive.subscribe((on) => {
	if (!on) setSkull(0);
});
