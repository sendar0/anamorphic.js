<script lang="ts">
	/* The way in for people who never open the terminal: a corner flash, and
	   a modal that says exactly what the terminal says before anyone is
	   asked for a camera. */
	import { tick } from 'svelte';
	import {
		CMD,
		INTRO,
		INTRO_HEAD,
		START_LABEL,
		cameraProblem,
		anaActive,
		anaLog,
		anaMode,
		anaStarting,
		hasCamera,
		hasTilt,
		isCoarsePointer,
		startCamera,
		startPointer,
		startTilt
	} from 'anamorphic';

	/** Where the long explanation lives, if the host has such a page. */
	let { docsHref = '' }: { docsHref?: string } = $props();

	let open = $state(false);
	let dialog = $state<HTMLDivElement | null>(null);
	let opener = $state<HTMLButtonElement | null>(null);
	let startBtn = $state<HTMLButtonElement | null>(null);

	const problem = $derived(hasCamera() ? null : cameraProblem());
	// while the modal is up, the engine's own messages are the status line
	const note = $derived($anaStarting ? ($anaLog?.text ?? 'asking for the camera…') : '');

	async function show() {
		open = true;
		await tick();
		startBtn?.focus();
	}

	function close() {
		if (!open) return;
		open = false;
		opener?.focus();
	}

	// The engine reaches a real mode once permission is granted — or once it
	// has fallen back on its own. Either way the modal has said its piece.
	$effect(() => {
		if ($anaMode !== 'off') open = false;
	});

	// Tells the stylesheet to keep the top bar's controls clear of the flash.
	$effect(() => {
		const root = document.documentElement;
		root.toggleAttribute('data-invite', !$anaActive);
		return () => root.removeAttribute('data-invite');
	});

	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
			return;
		}
		// a modal should not leak focus to the page behind it
		if (e.key !== 'Tab' || !dialog) return;
		const focusable = dialog.querySelectorAll<HTMLElement>('button:not(:disabled)');
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if !$anaActive}
	<button class="ribbon" bind:this={opener} onclick={show} aria-haspopup="dialog">
		<span class="face" aria-hidden="true"></span>
		<span class="label">Now in <b>3D!</b></span>
	</button>
{/if}

{#if open}
	<div class="scrim" role="presentation" onclick={close}></div>
	<div
		class="modal"
		bind:this={dialog}
		role="dialog"
		aria-modal="true"
		aria-labelledby="invite-title"
	>
		<h2 id="invite-title"><b>{CMD}</b> — {INTRO_HEAD}</h2>

		{#each INTRO as para}
			<p>{para}</p>
		{/each}

		{#if problem}
			<p class="warn">no camera here — {problem[0]}: {problem[1]}</p>
		{/if}

		{#if note}
			<p class="note" role="status" aria-live="polite">{note}</p>
		{/if}

		<div class="actions">
			<button
				class="primary"
				bind:this={startBtn}
				disabled={!!problem || $anaStarting}
				onclick={startCamera}
			>
				{$anaStarting ? 'asking…' : START_LABEL}
			</button>
			{#if isCoarsePointer() && hasTilt()}
				<button onclick={startTilt}>use device tilt</button>
			{:else}
				<button onclick={startPointer}>use the pointer</button>
			{/if}
			<button class="quiet" onclick={close}>not now</button>
		</div>

		<p class="fine">
			or type <code>{CMD}</code> in the terminal — <code>{CMD} help</code> lists the rest.
			{#if docsHref}<a href={docsHref}>how it works</a>{/if}
		</p>
	</div>
{/if}

<style>
	/* A corner flash, the way a box of cereal announces something. The clip
	   path is on the button itself so the empty half of the square does not
	   swallow clicks meant for the bar underneath. Deliberately not a theme
	   colour: a flag has to read as one on all four themes. */
	.ribbon {
		position: fixed;
		top: 0;
		right: 0;
		z-index: 9994;
		width: var(--ana-ribbon);
		height: var(--ana-ribbon);
		padding: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		cursor: pointer;
		clip-path: polygon(0 0, 100% 0, 100% 100%);
	}
	.face {
		position: absolute;
		inset: 0;
		/* the fill, plus a keyline laid exactly along the hypotenuse — the pale
		   tip would otherwise dissolve into the paper theme's cream */
		background:
			linear-gradient(
				45deg,
				transparent 50%,
				rgba(120, 84, 0, 0.5) 50%,
				rgba(120, 84, 0, 0.5) calc(50% + 2px),
				transparent calc(50% + 2px)
			),
			linear-gradient(135deg, #ffe373 0%, #ffc61a 55%, #f0ac00 100%);
		clip-path: polygon(0 0, 100% 0, 100% 100%);
		transition: filter var(--dur, 180ms) var(--ease, cubic-bezier(0.2, 0.6, 0.2, 1));
	}
	.ribbon:hover .face {
		filter: brightness(1.08);
	}
	/* an outline would be clipped away with the rest of the square, so the
	   focus ring has to live inside the triangle */
	.ribbon:focus-visible .face {
		box-shadow: inset -3px 3px 0 0 #1c1500;
	}
	.ribbon:focus-visible {
		outline: none;
	}

	/* The label runs parallel to the hypotenuse, centred on the triangle's
	   centroid — a sixth of the square right of, and above, the middle. Now
	   that the type is big it fills the band, so the centroid reads centred. */
	.label {
		position: absolute;
		left: 50%;
		top: 50%;
		/* the skew is the cartoon: a bit of forward lean, like lettering on a
		   cereal box that is very excited about itself */
		transform: translate(-50%, -50%)
			translate(calc(var(--ana-ribbon) / 6), calc(var(--ana-ribbon) / -6)) rotate(45deg)
			skewX(-9deg);
		white-space: nowrap;
		/* comic faces where they exist; everywhere else the weight, the skew
		   and the outline carry it on their own */
		font-family: 'Comic Sans MS', 'Comic Neue', 'Chalkboard SE', 'Chalkboard', 'Marker Felt',
			var(--font-sans, system-ui, sans-serif);
		/* tied to the triangle, not the viewport, so the label keeps the same
		   share of the band at every size and can never outgrow the chord */
		font-size: calc(var(--ana-ribbon) * 0.095);
		line-height: 1;
		font-weight: 900;
		letter-spacing: 0.005em;
		color: #2a1d00;
		/* a cream keyline all the way round, then one hard shadow underneath —
		   the sticker look, and it survives whatever font actually loads */
		text-shadow:
			1px 1px 0 #fff5cf,
			-1px 1px 0 #fff5cf,
			1px -1px 0 #fff5cf,
			-1px -1px 0 #fff5cf,
			0 2px 0 rgba(120, 84, 0, 0.45);
		pointer-events: none;
	}
	/* The packaging trick: the qualifier stays small and the thing being sold
	   is enormous. It also buys the room — one long line at a single size
	   runs out of band before it runs out of enthusiasm. */
	.label b {
		font-size: 1.95em;
		line-height: 1;
		font-weight: 900;
	}

	.scrim {
		position: fixed;
		inset: 0;
		z-index: 10001;
		background: rgba(4, 7, 9, 0.62);
		backdrop-filter: blur(3px);
		-webkit-backdrop-filter: blur(3px);
	}

	.modal {
		position: fixed;
		z-index: 10002;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(46rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		padding: clamp(1.1rem, 3vw, 1.8rem);
		background: var(--bg-1, #0f141a);
		border: 1px solid var(--line, #1f2a36);
		border-top: 3px solid #ffd34d;
		border-radius: var(--r-lg, 14px);
		box-shadow: 0 40px 80px -30px rgba(0, 0, 0, 0.7);
	}

	.modal h2 {
		font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
		font-size: clamp(1rem, 2.2vw, 1.2rem);
		font-weight: 500;
		color: var(--fg, #e6edf3);
		margin-bottom: 0.9rem;
	}
	.modal h2 b {
		font-weight: 700;
		color: #d9a900;
	}
	.modal p {
		font-family: var(--font-sans, system-ui, sans-serif);
		font-size: 0.95rem;
		line-height: 1.6;
		color: var(--fg-dim, #98a2b3);
		margin-bottom: 0.8rem;
		max-width: 62ch;
	}
	.warn {
		color: var(--warn, #ff8a8a);
	}
	.note {
		font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
		font-size: 0.82rem;
		color: var(--accent, #7cf0a3);
		border-left: 2px solid var(--accent, #7cf0a3);
		padding-left: 0.6rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1.2rem 0 0.9rem;
	}
	.actions button {
		font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
		font-size: 0.82rem;
		padding: 0.5rem 0.9rem;
		border-radius: var(--r-md, 8px);
	}
	.actions .primary {
		background: #ffd34d;
		border-color: #d9a900;
		color: #1c1500;
		font-weight: 600;
	}
	.actions .primary:hover:not(:disabled) {
		background: #ffdf76;
	}
	.actions .primary:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.actions .quiet {
		border-color: transparent;
		color: var(--fg-faint, #5b6674);
	}
	.actions .quiet:hover {
		color: var(--fg, #e6edf3);
		background: transparent;
	}

	.fine {
		font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
		font-size: 0.75rem;
		color: var(--fg-faint, #5b6674);
		margin: 0;
	}
	.fine code {
		color: var(--accent, #7cf0a3);
	}
	.fine a {
		color: var(--accent-2, #8ecaff);
		margin-left: 0.4rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.face {
			transition: none;
		}
	}
</style>
