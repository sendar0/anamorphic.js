/* anamorphic — head-tracked off-axis projection.

   This entry point is framework-free: it imports nothing but its own files
   and touches nothing but the DOM. Svelte components live in ./svelte,
   behind their own entry point, so a plain-JS host never pays for them.

   See ./README.md. */

export {
	// lifecycle
	startCamera,
	startPointer,
	startTilt,
	stopAnamorphic,
	configure,
	// controls
	recenter,
	toggleMirror,
	setGain,
	setPreviewCanvas,
	say,
	// capability checks
	hasCamera,
	hasTilt,
	isCoarsePointer,
	cameraProblem,
	// state
	anaMode,
	anaStatus,
	anaDetector,
	anaTracking,
	anaVisible,
	anaActive,
	anaStarting,
	anaHud,
	anaGain,
	anaMirror,
	anaReadout,
	anaAspect,
	anaLog
} from './engine.js';

export type { AnaMode, AnaOptions, LogTone, Plane } from './engine.js';

export { writable, derived } from './store.js';
export type { Readable, Writable, Subscriber, Unsubscriber } from './store.js';

export { CMD, INTRO, INTRO_HEAD, START_LABEL, USAGE, wrap } from './copy.js';

export { mountRoom } from './room.js';
export type { RoomOptions, RoomHandle } from './room.js';
