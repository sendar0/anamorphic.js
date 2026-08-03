/* The one description of what 3d mode is. The terminal prints it, the
   invite modal shows it — neither of them owns it, so they cannot drift. */

/** What the command is called. Every message that tells someone what to type
    reads it from here. */
export const CMD = '3d';

export const INTRO_HEAD = 'the page, redrawn from wherever your eyes actually are.';

export const INTRO = [
	'The webcam finds your face, works out how far left, right, up and away from the screen you are sitting, and re-projects every layer of this page — and the room it is all standing in — from that exact viewpoint. Lean, and you see around the inside corners of the box.',
	"Nothing is uploaded: no frame, no landmark, no measurement — the whole thing runs in this tab. The only outbound requests are for the tracker itself, once: the runtime from jsdelivr.net and the face-mesh model from Google's MediaPipe bucket. Turning it off releases the camera."
];

export const START_LABEL = 'turn on the camera';

export const USAGE = `usage: ${CMD} [command]

  on            ask for the camera and track your head
  pointer       no camera — the cursor stands in for your eyes
  tilt          phones and tablets — the orientation sensors drive it
  hud           show the tracker panel: preview, meters, knobs
  gain <n>      how far the planes spread apart (0.3 – 2.4)
  recenter      take where you are sitting now as straight-on
  mirror        flip the horizontal axis
  status        what the tracker is doing
  off           back to two dimensions (esc works too)`;

/** Greedy wrap, for the terminal's fixed-width rendering of the same prose. */
export function wrap(text: string, width = 66, indent = '  ') {
	const out: string[] = [];
	let line = '';
	for (const word of text.split(' ')) {
		if (line && (line + ' ' + word).length > width) {
			out.push(indent + line);
			line = word;
		} else {
			line = line ? line + ' ' + word : word;
		}
	}
	if (line) out.push(indent + line);
	return out.join('\n');
}
