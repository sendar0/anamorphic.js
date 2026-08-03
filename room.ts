/* The box you are looking into.

   Five walls, gridded, meeting at the edges of the viewport — the only part
   of the effect that needs real CSS 3D, because its walls are rotated. It
   takes the same eye measurement the page planes do, so the two agree about
   where you are sitting.

   Built as plain DOM so the library needs no framework to draw its own
   room. The styles live in anamorphic.css under `.ana-*`; ../svelte/AnaRoom is
   a thin wrapper around this. */

import { CMD } from './copy';
import { anaActive, anaVisible, say, stopAnamorphic } from './engine';

export type RoomOptions = {
	/** where to append the room; defaults to <body> */
	target?: HTMLElement;
	/** how many dust motes to drift through the box; 0 for none */
	motes?: number;
	/** the glass welded to the screen — bezel and moving sheen */
	glass?: boolean;
	/** let Escape turn the effect off */
	escapeToExit?: boolean;
};

export type RoomHandle = { destroy(): void };

/* A fixed pseudo-random sequence: the dust should look the same every time
   you open the case, and a server-rendered host must agree with the client. */
function motesOf(n: number) {
	let seed = 20240717;
	const rnd = () => {
		seed = (seed * 1664525 + 1013904223) % 4294967296;
		return seed / 4294967296;
	};
	return Array.from({ length: n }, () => ({
		size: 1 + rnd() * 2.4,
		left: rnd() * 100,
		top: rnd() * 100,
		z: rnd() * 260 - 110,
		delay: -rnd() * 18
	}));
}

function el(tag: string, className: string) {
	const node = document.createElement(tag);
	node.className = className;
	return node;
}

function buildStage(moteCount: number) {
	const stage = el('div', 'ana-stage');
	stage.setAttribute('aria-hidden', 'true');
	const chamber = el('div', 'ana-chamber');

	for (const side of ['back', 'left', 'right', 'top', 'bottom']) {
		const wall = el('div', `ana-wall ana-${side}`);
		wall.appendChild(el('i', 'ana-grid'));
		if (side === 'back') wall.appendChild(el('i', 'ana-cast'));
		chamber.appendChild(wall);
	}

	if (moteCount > 0) {
		const motes = el('div', 'ana-motes');
		for (const m of motesOf(moteCount)) {
			const b = el('b', '');
			b.style.cssText =
				`width:${m.size.toFixed(1)}px;height:${m.size.toFixed(1)}px;` +
				`left:${m.left.toFixed(2)}%;top:${m.top.toFixed(2)}%;` +
				`transform:translateZ(${m.z.toFixed(0)}px);animation-delay:${m.delay.toFixed(1)}s`;
			motes.appendChild(b);
		}
		chamber.appendChild(motes);
	}

	stage.appendChild(chamber);
	return stage;
}

function buildGlass() {
	const glass = el('div', 'ana-glass');
	glass.setAttribute('aria-hidden', 'true');
	glass.appendChild(el('i', 'ana-bezel'));
	glass.appendChild(el('i', 'ana-sheen'));
	return glass;
}

/**
 * Draws the room whenever the effect is visible, and takes it away again
 * when it has finished fading out. Call once; keep the handle to tear down.
 */
export function mountRoom(options: RoomOptions = {}): RoomHandle {
	if (typeof document === 'undefined') return { destroy() {} };

	const { target = document.body, motes = 26, glass = true, escapeToExit = true } = options;

	let stage: HTMLElement | null = null;
	let pane: HTMLElement | null = null;

	const show = () => {
		if (stage) return;
		stage = buildStage(motes);
		target.appendChild(stage);
		if (glass) {
			pane = buildGlass();
			target.appendChild(pane);
		}
	};

	const hide = () => {
		stage?.remove();
		pane?.remove();
		stage = null;
		pane = null;
	};

	const unsubscribe = anaVisible.subscribe((visible) => (visible ? show() : hide()));

	const onKey = (e: KeyboardEvent) => {
		if (e.key !== 'Escape' || !anaActive.get()) return;
		stopAnamorphic();
		say(`${CMD}: off — back to two dimensions.`, 'dim');
	};
	if (escapeToExit) window.addEventListener('keydown', onKey);

	return {
		destroy() {
			unsubscribe();
			if (escapeToExit) window.removeEventListener('keydown', onKey);
			hide();
		}
	};
}
