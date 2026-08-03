/* ──────────────────────────────────────────────────────────────────────────
   anamorphic — head-tracked off-axis projection for the whole page.

   The camera finds your eyes, we work out where they are in millimetres
   relative to the middle of the screen, and then every depth plane on the
   page is re-projected from that viewpoint. Lean left and you see around
   the inside corners of the room; lean in and it opens up.

   The maths, briefly. A plane at depth z, viewed from an eye a distance P
   in front of the glass, projects as a uniform scale s = P / (P - z) about
   the point where the eye's line of sight crosses the glass. Content planes
   are all parallel to the screen, so that projection is exactly a scale plus
   a translate — no keystoning to fake, nothing that needs real 3D.

   We subtract the resting projection (eye centred), so a head-on viewer sees
   the page exactly as it is laid out, and only the *differential* survives:

       Δ = eyeOffsetPx · (1 - s)

   which is the same for every element on a plane and drops to zero when the
   eye is centred. That keeps the page readable and clickable while still
   giving true, physically-derived parallax between planes.

   The room behind the page is the one thing that does need real CSS 3D —
   its walls are rotated — so it gets a genuine `perspective` and a
   `perspective-origin` driven by the same eye position. Both halves come
   from one measurement, so they agree.
   ────────────────────────────────────────────────────────────────────────── */

import { CMD } from './copy.js';
import { derived, writable } from './store.js';

/** No bundler magic, no framework import: just whether there is a DOM. */
const browser = typeof window !== 'undefined' && typeof document !== 'undefined';

export type AnaMode = 'off' | 'face' | 'blob' | 'pointer' | 'tilt';
export type LogTone = 'plain' | 'accent' | 'warn' | 'dim';

/* ── public state ─────────────────────────────────────────────────────── */

export const anaMode = writable<AnaMode>('off');
export const anaStatus = writable('off');
export const anaDetector = writable('none');
/** true once a stable read has been calibrated — the "lock" lamp */
export const anaTracking = writable(false);
/** stays true through the fade-out, so the room can leave gracefully */
export const anaVisible = writable(false);
export const anaHud = writable(false);
export const anaGain = writable(1);
export const anaMirror = writable(true);
export const anaReadout = writable({ x: 0, y: 0, z: 600, yaw: 0 });
/** camera frame aspect (height / width), so the HUD preview is not squashed */
export const anaAspect = writable(0.75);
/** true from the moment the camera is asked for until it is running or has
    failed — a permission prompt can sit there indefinitely, and everything
    that stops tracking has to be able to reach into that window. */
export const anaStarting = writable(false);
export const anaActive = derived(
	[anaMode, anaStarting],
	([m, s]) => m !== 'off' || s
);

/** One-shot messages for the terminal to print. */
export const anaLog = writable<{ id: number; text: string; tone: LogTone } | null>(null);

let logSeq = 0;
function log(text: string, tone: LogTone = 'plain') {
	anaLog.set({ id: ++logSeq, text, tone });
}

/** Say something in the terminal from outside the engine. */
export const say = log;

/* ── constants ────────────────────────────────────────────────────────── */

const PX_PER_MM = 96 / 25.4; // CSS reference pixel
const IPD_MM = 63; // mean adult interpupillary distance
const EYE_CORNER_MM = 95; // outer eye corner span, when irises are unavailable
const HEAD_MM = 150; // fallback: head width for the blob tracker
const HFOV = (63 * Math.PI) / 180; // assumed webcam horizontal field of view
const STALE_MS = 900; // how long a measurement stays trustworthy without a fresh read

export type Plane = { key: string; z: number };

export type AnaOptions = {
	/** Depth planes, in CSS px. Negative is away from the viewer. Each one
	    publishes --ana-<key>-x / -y / -s, so a custom set needs custom CSS. */
	planes: Plane[];
	/** 0 = parallax only, 1 = true perspective size change. Anything much
	    above ~0.4 starts to disturb the layout it is sitting on. */
	sizeCue: number;
	/** ms — how quickly the effect eases in and out */
	ramp: number;
	/** Where the face mesh comes from. Both are fetched once, on first use. */
	runtimeUrl: string;
	modelUrl: string;
	/** How far the planes may spread, given the viewport and the viewer's
	    motion preference. Return 1 for the full effect, 0 for none. */
	amplitude: (viewportWidth: number, prefersReducedMotion: boolean) => number;
};

const DEFAULTS: AnaOptions = {
	planes: [
		{ key: 'far', z: -340 },
		{ key: 'deep', z: -210 },
		{ key: 'mid', z: -110 },
		{ key: 'fore', z: 95 },
		{ key: 'near', z: 185 }
	],
	sizeCue: 0.3,
	ramp: 190,
	runtimeUrl: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35',
	modelUrl:
		'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
	amplitude: (width, calm) => (calm ? 0.45 : width < 640 ? 0.6 : 1)
};

let options: AnaOptions = { ...DEFAULTS };

/** Override any of the defaults. Call before starting; planes and URLs are
    read once per start, the rest every frame. */
export function configure(next: Partial<AnaOptions>) {
	options = { ...options, ...next };
	return options;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ── one-euro filter: still when you are still, quick when you move ───── */

class OneEuro {
	private x: number | null = null;
	private dx = 0;
	private t = 0;

	constructor(
		private min = 1.1,
		private beta = 0.02,
		private dCutoff = 1.0
	) {}

	private alpha(cutoff: number, dt: number) {
		const tau = 1 / (2 * Math.PI * cutoff);
		return 1 / (1 + tau / dt);
	}

	filter(v: number, t: number) {
		if (this.x === null) {
			this.x = v;
			this.t = t;
			return v;
		}
		const dt = Math.max(1e-3, (t - this.t) / 1000);
		this.t = t;
		this.dx = lerp(this.dx, (v - this.x) / dt, this.alpha(this.dCutoff, dt));
		this.x = lerp(this.x, v, this.alpha(this.min + this.beta * Math.abs(this.dx), dt));
		return this.x;
	}

	reset() {
		this.x = null;
		this.dx = 0;
		this.t = 0;
	}
}

const fX = new OneEuro(1.0, 0.01);
const fY = new OneEuro(1.0, 0.01);
const fZ = new OneEuro(0.7, 0.004);
const fYaw = new OneEuro(1.4, 0.02);
const fPitch = new OneEuro(1.4, 0.02);

/* ── measurement state ────────────────────────────────────────────────── */

type Sample = { ok: boolean; x: number; y: number; z: number; yaw: number; pitch: number };

const sample: Sample = { ok: false, x: 0, y: 0, z: 600, yaw: 0, pitch: 0 };
const eye = { x: 0, y: 0, z: 600, yaw: 0, pitch: 0 };
const cal = { x: 0, y: 0, done: false };
const pointer = { x: 0, y: 0 };
const tilt = { x: 0, y: 0 };

let mode: AnaMode = 'off';
let gain = 1;
let mirror = true;
let tracking = false;
let lastSeen = 0;
let steady = 0;
let tiltCal: { g: number; b: number } | null = null;

let video: HTMLVideoElement | null = null;
let stream: MediaStream | null = null;
let previewCanvas: HTMLCanvasElement | null = null;
let previewCtx: CanvasRenderingContext2D | null = null;

if (browser) {
	anaGain.subscribe((v) => (gain = v));
	anaMirror.subscribe((v) => (mirror = v));
	anaTracking.subscribe((v) => (tracking = v));
}

/* ── tier 1: MediaPipe face landmarker ────────────────────────────────── */

type Landmark = { x: number; y: number; z: number };
type Connection = { start: number; end: number };

/* eslint-disable @typescript-eslint/no-explicit-any */
let landmarker: any = null;
let faceOval: Connection[] | null = null;
let lastTs = -1;

async function loadFaceModel() {
	const url = `${options.runtimeUrl}/vision_bundle.mjs`;
	const mod = await import(/* @vite-ignore */ url);
	const { FaceLandmarker, FilesetResolver } = mod as any;
	const fileset = await FilesetResolver.forVisionTasks(`${options.runtimeUrl}/wasm`);
	const opts = (delegate: 'GPU' | 'CPU') => ({
		baseOptions: { modelAssetPath: options.modelUrl, delegate },
		runningMode: 'VIDEO',
		numFaces: 1,
		outputFaceBlendshapes: false,
		outputFacialTransformationMatrixes: true,
		minFaceDetectionConfidence: 0.4,
		minFacePresenceConfidence: 0.4,
		minTrackingConfidence: 0.4
	});
	try {
		landmarker = await FaceLandmarker.createFromOptions(fileset, opts('GPU'));
	} catch {
		landmarker = await FaceLandmarker.createFromOptions(fileset, opts('CPU'));
	}
	faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL ?? null;
}

function readFace(nowMs: number) {
	if (!video) return;
	const vw = video.videoWidth;
	const vh = video.videoHeight;
	if (!vw) return;

	// MediaPipe insists on strictly increasing timestamps
	const ts = nowMs <= lastTs ? lastTs + 1 : nowMs;
	lastTs = ts;

	let res: any;
	try {
		res = landmarker.detectForVideo(video, ts);
	} catch {
		return;
	}

	const faces: Landmark[][] | undefined = res?.faceLandmarks;
	if (!faces || !faces.length) {
		sample.ok = false;
		drawFacePreview(null);
		return;
	}
	const lm = faces[0];

	// irises when the refined mesh is available (478 pts), eye corners otherwise
	let ax: number, ay: number, bx: number, by: number, span: number;
	if (lm.length >= 478) {
		ax = lm[468].x * vw;
		ay = lm[468].y * vh;
		bx = lm[473].x * vw;
		by = lm[473].y * vh;
		span = IPD_MM;
	} else if (lm.length >= 264) {
		ax = lm[33].x * vw;
		ay = lm[33].y * vh;
		bx = lm[263].x * vw;
		by = lm[263].y * vh;
		span = EYE_CORNER_MM;
	} else {
		sample.ok = false;
		return;
	}

	const px = Math.hypot(bx - ax, by - ay);
	if (px < 4) {
		sample.ok = false;
		return;
	}

	const f = vw / 2 / Math.tan(HFOV / 2); // focal length, in pixels
	const z = (f * span) / px; // millimetres from the lens
	sample.x = ((ax + bx) / 2 - vw / 2) * (z / f);
	sample.y = ((ay + by) / 2 - vh / 2) * (z / f);
	sample.z = z;
	sample.ok = true;
	lastSeen = nowMs;

	const M = res.facialTransformationMatrixes;
	if (M && M.length) {
		const m: number[] = M[0].data; // column-major 4×4
		sample.yaw = (Math.atan2(m[8], m[10]) * 180) / Math.PI;
		sample.pitch = (Math.asin(clamp(-m[9], -1, 1)) * 180) / Math.PI;
	}

	drawFacePreview(lm);
}

function drawFacePreview(lm: Landmark[] | null) {
	if (!previewCtx || !previewCanvas || !video) return;
	const W = previewCanvas.width;
	const H = previewCanvas.height;
	previewCtx.drawImage(video, 0, 0, W, H);
	if (!lm) return;

	previewCtx.lineWidth = 1;
	if (faceOval) {
		previewCtx.strokeStyle = 'rgba(124,240,163,.85)';
		previewCtx.beginPath();
		for (const c of faceOval) {
			const a = lm[c.start];
			const b = lm[c.end];
			previewCtx.moveTo(a.x * W, a.y * H);
			previewCtx.lineTo(b.x * W, b.y * H);
		}
		previewCtx.stroke();
	}
	if (lm.length >= 478) {
		previewCtx.fillStyle = 'rgba(247,200,115,.95)';
		for (const i of [468, 473]) {
			previewCtx.beginPath();
			previewCtx.arc(lm[i].x * W, lm[i].y * H, 2.2, 0, Math.PI * 2);
			previewCtx.fill();
		}
		previewCtx.strokeStyle = 'rgba(247,200,115,.55)';
		previewCtx.beginPath();
		previewCtx.moveTo(lm[468].x * W, lm[468].y * H);
		previewCtx.lineTo(lm[473].x * W, lm[473].y * H);
		previewCtx.stroke();
	}
}

/* ── tier 2: skin-blob fallback, for when the model cannot load ───────── */

const BW = 128;
let BH = 96;
let work: HTMLCanvasElement | null = null;
let wctx: CanvasRenderingContext2D | null = null;
const bxs = new Int16Array(BW * 180);
const bys = new Int16Array(BW * 180);
const blob = { cx: BW / 2, cy: BH / 2, r: BW * 0.22, ok: false };

function readBlob(nowMs: number) {
	if (!video || video.readyState < 2 || !video.videoWidth) return;
	if (!work) {
		work = document.createElement('canvas');
		wctx = work.getContext('2d', { willReadFrequently: true });
	}
	if (!wctx) return;

	BH = clamp(Math.round((BW * video.videoHeight) / video.videoWidth), 48, 180);
	if (work.width !== BW || work.height !== BH) {
		work.width = BW;
		work.height = BH;
	}
	wctx.drawImage(video, 0, 0, BW, BH);
	const d = wctx.getImageData(0, 0, BW, BH).data;

	let n = 0;
	for (let y = 0; y < BH; y++) {
		for (let x = 0; x < BW; x++) {
			const i = (y * BW + x) << 2;
			const r = d[i];
			const g = d[i + 1];
			const b = d[i + 2];
			const luma = 0.299 * r + 0.587 * g + 0.114 * b;
			if (luma < 38 || luma > 248) continue;
			const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
			const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
			if (cb > 76 && cb < 131 && cr > 132 && cr < 180 && r > g && r >= b) {
				bxs[n] = x;
				bys[n] = y;
				n++;
			}
		}
	}
	if (n < 40) {
		blob.ok = false;
		sample.ok = false;
		drawBlobPreview(n);
		return;
	}

	// a few mean-shift passes settle on the head
	let cx = blob.cx;
	let cy = blob.cy;
	let R = blob.r;
	let inside = 0;
	for (let pass = 0; pass < 5; pass++) {
		let sx = 0;
		let sy = 0;
		let k = 0;
		const R2 = R * R;
		for (let p = 0; p < n; p++) {
			const dx = bxs[p] - cx;
			const dy = bys[p] - cy;
			if (dx * dx + dy * dy < R2) {
				sx += bxs[p];
				sy += bys[p];
				k++;
			}
		}
		if (!k) {
			cx = BW / 2;
			cy = BH / 2;
			R = BW * 0.25;
			continue;
		}
		cx = sx / k;
		cy = sy / k;
		inside = k;
		R = lerp(R, clamp(Math.sqrt(k / (Math.PI * 0.62)) * 1.25, BW * 0.07, BW * 0.42), 0.45);
	}
	blob.ok = inside / (Math.PI * R * R) > 0.32 && inside > 45;
	blob.cx = cx;
	blob.cy = cy;
	blob.r = R;

	if (blob.ok) {
		const f = BW / 2 / Math.tan(HFOV / 2);
		const z = (f * HEAD_MM) / (2 * R);
		sample.x = (cx - BW / 2) * (z / f);
		sample.y = (cy - BH / 2) * (z / f);
		sample.z = z;
		sample.yaw = 0;
		sample.pitch = 0;
		sample.ok = true;
		lastSeen = nowMs;
	} else {
		sample.ok = false;
	}
	drawBlobPreview(n);
}

function drawBlobPreview(n: number) {
	if (!previewCtx || !previewCanvas || !work) return;
	const W = previewCanvas.width;
	const H = previewCanvas.height;
	previewCtx.drawImage(work, 0, 0, W, H);
	const sx = W / BW;
	const sy = H / BH;
	previewCtx.fillStyle = 'rgba(124,240,163,.30)';
	for (let i = 0; i < n; i += 2) previewCtx.fillRect(bxs[i] * sx, bys[i] * sy, sx * 2, sy * 2);
	if (blob.ok) {
		previewCtx.strokeStyle = 'rgba(247,200,115,.95)';
		previewCtx.lineWidth = 1;
		previewCtx.beginPath();
		previewCtx.arc(blob.cx * sx, blob.cy * sy, blob.r * sx, 0, Math.PI * 2);
		previewCtx.stroke();
	}
}

/* ── writing the projection out as CSS custom properties ──────────────── */

const written = new Map<string, string>();

function setVar(name: string, value: string) {
	if (written.get(name) === value) return;
	written.set(name, value);
	document.documentElement.style.setProperty(name, value);
}

function clearVars() {
	for (const name of written.keys()) document.documentElement.style.removeProperty(name);
	written.clear();
}

const calmQuery = browser ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** How far the planes are allowed to spread, per the configured policy. */
function amplitude() {
	return options.amplitude(window.innerWidth, !!calmQuery?.matches);
}

function project(mix: number) {
	const halfW = window.innerWidth / 2;
	const halfH = window.innerHeight / 2;

	// where the eye sits on the glass, in CSS pixels from the centre
	const ex = clamp(eye.x * PX_PER_MM * gain, -halfW * 1.8, halfW * 1.8);
	const ey = clamp(eye.y * PX_PER_MM * gain, -halfH * 1.8, halfH * 1.8);
	// and how far in front of it — the perspective distance
	const P = clamp((eye.z * PX_PER_MM) / Math.max(0.35, gain), 900, 5200);

	const amp = amplitude() * mix;
	const maxX = window.innerWidth * 0.18;
	const maxY = window.innerHeight * 0.18;

	for (const plane of options.planes) {
		const z = plane.z * amp;
		const s = P / (P - z);
		setVar(`--ana-${plane.key}-x`, clamp(ex * (1 - s), -maxX, maxX).toFixed(2) + 'px');
		setVar(`--ana-${plane.key}-y`, clamp(ey * (1 - s), -maxY, maxY).toFixed(2) + 'px');
		setVar(`--ana-${plane.key}-s`, clamp(Math.pow(s, options.sizeCue), 0.86, 1.16).toFixed(4));
	}

	// the room is real CSS 3D, so it wants the eye as a perspective origin
	setVar('--ana-persp', P.toFixed(0) + 'px');
	setVar('--ana-ox', clamp(50 + (ex / halfW) * 50, -140, 240).toFixed(2) + '%');
	setVar('--ana-oy', clamp(50 + (ey / halfH) * 50, -140, 240).toFixed(2) + '%');
	setVar('--ana-cz', (clamp((600 - eye.z) * 0.25 * gain, -160, 220) * mix).toFixed(1) + 'px');
	// the sheen on the glass tracks which way you are facing
	setVar('--ana-sx', clamp(50 - eye.yaw * 1.1, 5, 95).toFixed(1) + '%');
	setVar('--ana-sy', clamp(34 + eye.pitch * 0.9, 5, 90).toFixed(1) + '%');
	setVar('--ana-mix', mix.toFixed(3));
}

/* ── the loop ─────────────────────────────────────────────────────────── */

let looping = false;
let mix = 0;
let mixTarget = 0;
let lastFrame = 0;
let uiTick = 0;

function tick(now: number) {
	const dt = lastFrame ? Math.min(64, now - lastFrame) : 16;
	lastFrame = now;

	if (mode === 'face') readFace(now);
	else if (mode === 'blob') readBlob(now);

	let tx = eye.x;
	let ty = eye.y;
	let tz = eye.z;
	let tyaw = 0;
	let tpitch = 0;

	if (mode === 'pointer') {
		tx = (pointer.x * window.innerWidth) / 2 / PX_PER_MM;
		ty = (pointer.y * window.innerHeight) / 2 / PX_PER_MM;
		tz = 600;
	} else if (mode === 'tilt') {
		tx = mirror ? tilt.x : -tilt.x;
		ty = tilt.y;
		tz = 420;
	} else if (sample.ok && now - lastSeen < STALE_MS) {
		// `sample.ok` alone is not enough: several read paths bail out early
		// (no frame yet, a detector throw, a dead stream) and leave the last
		// good sample sitting there, which would freeze the page mid-pose
		// while the HUD cheerfully claimed to be tracking.
		tx = (mirror ? -sample.x : sample.x) - cal.x;
		// Straight offsets from where you were sitting when we calibrated. An
		// extra half-viewport term for the camera sitting above the screen
		// would cancel here anyway — except after a resize, where it would
		// silently drag the vertical origin with the window.
		ty = sample.y - cal.y;
		tz = sample.z;
		tyaw = mirror ? -sample.yaw : sample.yaw;
		tpitch = sample.pitch;
		steady++;
		if (!cal.done && steady > 15) {
			// a stable read, not one lucky frame, is what "sitting straight on" means
			cal.x = mirror ? -sample.x : sample.x;
			cal.y = sample.y;
			cal.done = true;
			anaTracking.set(true);
			setStatus('tracking');
		}
	} else if (mode !== 'off' && now - lastSeen > STALE_MS) {
		steady = 0;
		tx = lerp(eye.x, 0, 0.04);
		ty = lerp(eye.y, 0, 0.04);
		if (tracking) {
			anaTracking.set(false);
			setStatus('face lost');
		}
	}
	if (sample.ok && cal.done && !tracking) {
		anaTracking.set(true);
		setStatus('tracking');
	}

	eye.x = fX.filter(clamp(tx, -600, 600), now);
	eye.y = fY.filter(clamp(ty, -500, 500), now);
	eye.z = fZ.filter(clamp(tz, 180, 1600), now);
	eye.yaw = fYaw.filter(clamp(tyaw, -70, 70), now);
	eye.pitch = fPitch.filter(clamp(tpitch, -60, 60), now);

	// ease the whole effect in and out rather than snapping
	mix = lerp(mix, mixTarget, 1 - Math.exp(-dt / options.ramp));
	if (Math.abs(mix - mixTarget) < 0.002) mix = mixTarget;

	const scrolled = window.scrollY;
	project(mix);
	setVar('--ana-scroll', scrolled.toFixed(0) + 'px');

	// throttled, but never gated on a particular piece of UI being open
	if (++uiTick % 5 === 0) {
		anaReadout.set({ x: eye.x, y: eye.y, z: eye.z, yaw: eye.yaw });
	}

	if (mixTarget === 0 && mix === 0) {
		// faded all the way out — put the page back exactly as we found it
		looping = false;
		lastFrame = 0;
		clearVars();
		document.documentElement.removeAttribute('data-ana');
		anaVisible.set(false);
		return;
	}
	requestAnimationFrame(tick);
}

function startLoop() {
	// Once, and never taken back: the page's entrance animation would
	// otherwise replay every time it is switched off. See anamorphic.css.
	document.documentElement.dataset.anaUsed = '1';
	document.documentElement.dataset.ana = 'on';
	anaVisible.set(true);
	mixTarget = 1;
	if (!looping) {
		looping = true;
		lastFrame = 0;
		requestAnimationFrame(tick);
	}
}

/* ── camera / sensor plumbing ─────────────────────────────────────────── */

function setStatus(s: string) {
	anaStatus.set(s);
}

function ensureVideo() {
	if (video) return video;
	video = document.createElement('video');
	video.playsInline = true;
	video.muted = true;
	video.autoplay = true;
	video.setAttribute('aria-hidden', 'true');
	video.style.cssText =
		'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
	video.addEventListener('loadedmetadata', () => {
		if (video?.videoWidth) anaAspect.set(video.videoHeight / video.videoWidth);
	});
	document.body.appendChild(video);
	return video;
}

const embedded = (() => {
	if (!browser) return false;
	try {
		return window.self !== window.top;
	} catch {
		return true;
	}
})();

function diagnose(err: unknown): [string, string] {
	if (!window.isSecureContext)
		return [
			'insecure page',
			'browsers only hand out cameras on https:// or localhost. this page is neither, so the prompt never fires.'
		];
	if (!navigator.mediaDevices?.getUserMedia)
		return ['no camera api', 'this browser exposes no getUserMedia here.'];
	const name = (err as { name?: string } | null)?.name;
	switch (name) {
		case 'NotAllowedError':
		case 'SecurityError':
			return embedded
				? [
						'blocked by the embedder',
						'this page is inside a frame that was not granted camera access. open it in its own tab.'
					]
				: [
						'permission denied',
						`the camera was refused for this site. re-allow it in the address bar, then run \`${CMD} on\` again.`
					];
		case 'NotFoundError':
		case 'OverconstrainedError':
			return ['no front camera', 'no user-facing camera was offered by this device.'];
		case 'NotReadableError':
			return ['camera busy', 'another app is holding the camera. close it and try again.'];
		default:
			return [
				'camera unavailable',
				'the request failed' + (name ? ' with ' + name : '') + '.'
			];
	}
}

function resetTracking() {
	sample.ok = false;
	cal.done = false;
	cal.x = 0;
	cal.y = 0;
	steady = 0;
	lastSeen = 0;
	anaTracking.set(false);
	fX.reset();
	fY.reset();
	fZ.reset();
	fYaw.reset();
	fPitch.reset();
}

function onPointerMove(e: PointerEvent) {
	if (mode !== 'pointer') return;
	pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
	pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
}

function onOrient(e: DeviceOrientationEvent) {
	if (e.gamma == null || e.beta == null) return;
	if (!tiltCal) tiltCal = { g: e.gamma, b: e.beta };
	tilt.x = clamp((e.gamma - tiltCal.g) * 7.5, -280, 280);
	tilt.y = clamp((e.beta - tiltCal.b) * 7.5, -230, 230);
}

function stopSensors() {
	if (stream) {
		for (const t of stream.getTracks()) t.stop();
		stream = null;
	}
	if (video) {
		video.srcObject = null;
		video.remove();
		video = null;
	}
	window.removeEventListener('pointermove', onPointerMove);
	window.removeEventListener('deviceorientation', onOrient);
	tiltCal = null;
}

function setMode(next: AnaMode) {
	generation++;
	mode = next;
	anaMode.set(next);
}

/* ── public api ───────────────────────────────────────────────────────── */

let starting = false;
/** bumped whenever the mode changes, so a slow camera start can tell that
    it was cancelled while it was away asking for permission */
let generation = 0;

function setStarting(v: boolean) {
	starting = v;
	anaStarting.set(v);
}

export async function startCamera() {
	if (!browser) return;
	if (starting) {
		log(`the camera is already being asked for — answer the prompt, or \`${CMD} off\`.`, 'dim');
		return;
	}
	setStarting(true);
	const mine = ++generation;
	stopSensors();
	resetTracking();
	setStatus('starting');
	log('requesting the camera — video and face data never leave this device.', 'dim');

	try {
		if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
			throw Object.assign(new Error('unavailable'), { preflight: true });
		}
		stream = await navigator.mediaDevices.getUserMedia({
			video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
			audio: false
		});
		if (mine !== generation) {
			// switched modes or turned off while the prompt was up
			for (const t of stream.getTracks()) t.stop();
			stream = null;
			setStarting(false);
			return;
		}
		// a camera can be unplugged, or taken by another app, mid-session
		for (const t of stream.getVideoTracks()) {
			t.addEventListener('ended', () => {
				if (mode !== 'face' && mode !== 'blob') return;
				log('the camera stream ended — falling back to the pointer.', 'warn');
				startPointer();
			});
		}
		const v = ensureVideo();
		v.srcObject = stream;
		await v.play();
	} catch (err) {
		setStarting(false);
		if (mine !== generation) return;
		const preflight = (err as { preflight?: boolean }).preflight;
		const [label, text] = diagnose(preflight ? null : err);
		setStatus(label);
		log(`camera: ${label} — ${text}`, 'warn');
		if (isCoarsePointer() && hasTilt()) {
			// a cursor that only exists while a finger is down is a poor stand-in
			log(`on a touch screen, \`${CMD} tilt\` works better than the pointer.`, 'dim');
		}
		log(`falling back to pointer tracking. \`${CMD} camera\` to try again.`, 'dim');
		startPointer();
		return;
	}

	if (!landmarker) {
		log('loading the face mesh (~3 MB, once per session)…', 'dim');
		try {
			await loadFaceModel();
		} catch {
			landmarker = null;
		}
	}

	if (mine !== generation) {
		setStarting(false);
		return;
	}

	if (landmarker) {
		setMode('face');
		anaDetector.set('face mesh');
		setStatus('looking for you');
		log('face mesh ready — look at the screen and lean around.', 'accent');
	} else {
		setMode('blob');
		anaDetector.set('blob (offline)');
		setStatus('fallback tracking');
		log('the face model would not load; using the built-in blob tracker.', 'warn');
	}
	setStarting(false);
	startLoop();
}

export function startPointer() {
	if (!browser) return;
	stopSensors();
	resetTracking();
	setMode('pointer');
	anaDetector.set('pointer');
	anaTracking.set(true);
	setStatus('pointer');
	window.addEventListener('pointermove', onPointerMove, { passive: true });
	startLoop();
	log(`${CMD}: pointer mode — the cursor stands in for your eyes.`, 'accent');
}

export async function startTilt() {
	if (!browser) return;
	const D = window.DeviceOrientationEvent as
		| (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> })
		| undefined;
	if (!D) {
		log('this device exposes no orientation sensors.', 'warn');
		return;
	}
	try {
		if (typeof D.requestPermission === 'function') {
			const granted = await D.requestPermission();
			if (granted !== 'granted') {
				log('motion access was refused — allow it in your browser settings.', 'warn');
				return;
			}
		}
	} catch {
		log('this browser would not release the orientation sensors.', 'warn');
		return;
	}
	stopSensors();
	resetTracking();
	tiltCal = null;
	setMode('tilt');
	anaDetector.set('device tilt');
	anaTracking.set(true);
	setStatus('tilt');
	window.addEventListener('deviceorientation', onOrient);
	startLoop();
	log(`${CMD}: tilt mode — hold the device still for a moment, then lean it.`, 'accent');

	// Desktop browsers expose DeviceOrientationEvent and then never fire it,
	// which would leave the effect on and perfectly motionless. Give it a moment.
	const mine = generation;
	setTimeout(() => {
		if (mode !== 'tilt' || mine !== generation || tiltCal) return;
		log('nothing is reporting orientation here — falling back to the pointer.', 'warn');
		startPointer();
	}, 2000);
}

export function stopAnamorphic() {
	if (!browser) return;
	// setMode('off') below bumps `generation`, so a start still waiting on the
	// permission prompt will bail out and stop its own tracks when it lands.
	setStarting(false);
	stopSensors();
	resetTracking();
	setMode('off');
	anaDetector.set('none');
	setStatus('off');
	anaHud.set(false);
	mixTarget = 0;
	// the loop keeps running until the ramp reaches zero, then cleans up itself
	if (!looping) {
		mix = 0;
		clearVars();
		document.documentElement.removeAttribute('data-ana');
		anaVisible.set(false);
	}
}

export function recenter() {
	cal.done = false;
	steady = 0;
	fX.reset();
	fY.reset();
	if (mode === 'pointer') {
		pointer.x = 0;
		pointer.y = 0;
	}
	if (mode === 'tilt') tiltCal = null;
	// Only the camera path recalibrates over the next few frames and reports
	// 'tracking' when it lands. Pointer and tilt are centred the instant they
	// are asked, so saying 'recentring' would stick there for good.
	setStatus(mode === 'face' || mode === 'blob' ? 'recentring' : mode);
}

export function toggleMirror() {
	anaMirror.update((v) => !v);
	cal.done = false;
	steady = 0;
	fX.reset();
	return anaMirror.get();
}

export function setGain(v: number) {
	anaGain.set(clamp(v, 0.3, 2.4));
	return anaGain.get();
}

export function setPreviewCanvas(el: HTMLCanvasElement | null) {
	previewCanvas = el;
	previewCtx = el ? el.getContext('2d') : null;
}

export function hasCamera() {
	return browser && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

/** Why the camera is out of reach here, in the same words the failure path
    would use — so the terminal never blames https for a missing API. */
export function cameraProblem(): [string, string] | null {
	if (!browser || hasCamera()) return null;
	return diagnose(null);
}

export function hasTilt() {
	return browser && !!window.DeviceOrientationEvent;
}

export function isCoarsePointer() {
	return browser && window.matchMedia('(pointer: coarse)').matches;
}
