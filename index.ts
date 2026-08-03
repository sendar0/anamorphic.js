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
} from './engine';

export type { AnaMode, AnaOptions, LogTone, Plane } from './engine';

export { writable, derived } from './store';
export type { Readable, Writable, Subscriber, Unsubscriber } from './store';

export { CMD, INTRO, INTRO_HEAD, START_LABEL, USAGE, wrap } from './copy';

export { mountRoom } from './room';
export type { RoomOptions, RoomHandle } from './room';
