<script lang="ts">
	/* The instrument panel: what the tracker sees, and the knobs for it.
	   Everything here is also reachable from the terminal — this is for
	   people who want to watch the thing work. `3d hud` toggles it. */
	import { CMD } from '../copy';
	import {
		anaAspect,
		anaDetector,
		anaGain,
		anaHud,
		anaMirror,
		anaMode,
		anaReadout,
		anaStatus,
		anaTracking,
		anaVisible,
		recenter,
		say,
		setPreviewCanvas,
		startCamera,
		startPointer,
		stopAnamorphic,
		toggleMirror
	} from '../engine';

	let canvas = $state<HTMLCanvasElement | null>(null);

	$effect(() => {
		setPreviewCanvas(canvas);
		return () => setPreviewCanvas(null);
	});

	const camera = $derived($anaMode === 'face' || $anaMode === 'blob');
	const pos = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(0);
	const track = (v: number, range: number) => 50 + Math.max(-1, Math.min(1, v / range)) * 46;
</script>

{#if $anaVisible && $anaHud}
	<aside class="hud" class:live={$anaMode !== 'off'} class:lock={$anaTracking}>
		<div class="top">
			<span class="lamp"></span>
			<span class="status">{$anaStatus}</span>
			<button class="x" onclick={() => anaHud.set(false)} aria-label="close the tracker panel"
				>×</button
			>
		</div>

		{#if camera}
			<canvas
				bind:this={canvas}
				class="preview"
				class:mirrored={$anaMirror}
				width="160"
				height={Math.round(160 * $anaAspect)}
			></canvas>
		{/if}

		<div class="src">
			<span>detector</span><b>{$anaDetector}</b>
		</div>

		<div class="meters">
			<div class="meter">
				<span>x</span>
				<div class="track"><i style="left:{track($anaReadout.x, 220)}%"></i></div>
				<em>{pos($anaReadout.x)}mm</em>
			</div>
			<div class="meter">
				<span>y</span>
				<div class="track"><i style="left:{track($anaReadout.y, 180)}%"></i></div>
				<em>{pos($anaReadout.y)}mm</em>
			</div>
			<!-- distance and yaw are only ever measured by the camera; the other
			     modes assume a fixed one, so showing a number would be a fiction -->
			<div class="meter" class:idle={!camera}>
				<span>dist</span>
				<div class="track">{#if camera}<i style="left:{track($anaReadout.z - 600, 450)}%"></i>{/if}</div>
				<em>{camera ? ($anaReadout.z / 10).toFixed(0) + 'cm' : '—'}</em>
			</div>
			<div class="meter" class:idle={$anaMode !== 'face'}>
				<span>yaw</span>
				<div class="track">
					{#if $anaMode === 'face'}<i style="left:{track($anaReadout.yaw, 45)}%"></i>{/if}
				</div>
				<em>{$anaMode === 'face' ? pos($anaReadout.yaw) + '°' : '—'}</em>
			</div>
		</div>

		<div class="row">
			<button onclick={recenter}>recenter</button>
			<button
				disabled={$anaMode === 'pointer'}
				title={$anaMode === 'pointer' ? 'nothing to mirror in pointer mode' : 'flip the horizontal axis'}
				onclick={() => say(`${CMD}: ${toggleMirror() ? 'mirrored' : 'direct'}`, 'dim')}
			>
				mirror
			</button>
		</div>
		<div class="row">
			{#if camera}
				<button onclick={startPointer}>pointer</button>
			{:else}
				<button onclick={startCamera}>camera</button>
			{/if}
			<button
				class="off"
				onclick={() => {
					stopAnamorphic();
					say(`${CMD}: off — back to two dimensions.`, 'dim');
				}}>off</button
			>
		</div>

		<label class="slider">
			<span>strength — {$anaGain.toFixed(2)}×</span>
			<input
				type="range"
				min="0.3"
				max="2.4"
				step="0.05"
				value={$anaGain}
				oninput={(e) => anaGain.set(parseFloat(e.currentTarget.value))}
			/>
		</label>
	</aside>
{/if}

<style>
	.hud {
		position: fixed;
		right: clamp(10px, 2vw, 22px);
		bottom: clamp(10px, 2vh, 22px);
		z-index: 9996;
		width: 208px;
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		padding: 0.7rem;
		font-family: var(--font-mono, ui-monospace, 'SF Mono', Menlo, monospace);
		background: color-mix(in srgb, var(--bg-1, #0f141a) 84%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid var(--line, #1f2a36);
		border-radius: var(--r-md, 8px);
		box-shadow: var(--shadow, 0 20px 40px -20px rgba(0, 0, 0, 0.6));
	}

	.top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.6rem;
	}
	.lamp {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--fg-faint, #5b6674);
		flex: none;
		transition:
			background var(--dur, 180ms) var(--ease, cubic-bezier(0.2, 0.6, 0.2, 1)),
			box-shadow var(--dur, 180ms) var(--ease, cubic-bezier(0.2, 0.6, 0.2, 1));
	}
	.hud.live .lamp {
		background: var(--accent-3, #f7c873);
		box-shadow: 0 0 9px color-mix(in srgb, var(--accent-3, #f7c873) 80%, transparent);
	}
	.hud.lock .lamp {
		background: var(--accent, #7cf0a3);
		box-shadow: 0 0 9px var(--accent, #7cf0a3);
	}
	.status {
		flex: 1;
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--fg-dim, #98a2b3);
		line-height: 1.3;
	}
	.x {
		border: 0;
		padding: 0 0.15rem;
		color: var(--fg-faint, #5b6674);
		font-size: 0.95rem;
		line-height: 1;
	}
	.x:hover {
		color: var(--fg, #e6edf3);
		background: transparent;
	}

	.preview {
		display: block;
		width: 100%;
		height: auto;
		background: var(--bg, #0a0e12);
		border: 1px solid var(--line, #1f2a36);
		border-radius: var(--r-sm, 4px);
	}
	.preview.mirrored {
		transform: scaleX(-1);
	}

	.src {
		display: flex;
		justify-content: space-between;
		margin: 0.5rem 0 0.1rem;
		font-size: 0.58rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--fg-faint, #5b6674);
	}
	.src b {
		font-weight: 400;
		color: var(--accent, #7cf0a3);
	}

	.meters {
		margin: 0.6rem 0;
		display: grid;
		gap: 0.45rem;
	}
	.meter {
		display: grid;
		grid-template-columns: 26px 1fr 48px;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.58rem;
		letter-spacing: 0.12em;
		color: var(--fg-faint, #5b6674);
	}
	.meter em {
		font-style: normal;
		text-align: right;
		color: var(--fg-dim, #98a2b3);
	}
	.meter.idle {
		opacity: 0.45;
	}
	.track {
		position: relative;
		height: 1px;
		background: var(--line, #1f2a36);
	}
	.track i {
		position: absolute;
		top: -2px;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent-3, #f7c873);
		transform: translateX(-50%);
	}

	.row {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.4rem;
	}
	.row button {
		flex: 1;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		padding: 0.35rem 0.3rem;
		color: var(--fg-dim, #98a2b3);
	}
	.row button:hover:not(:disabled) {
		color: var(--fg, #e6edf3);
		border-color: var(--accent, #7cf0a3);
	}
	.row button:disabled {
		opacity: 0.4;
		cursor: default;
		background: transparent;
	}
	.row button.off:hover {
		border-color: var(--warn, #ff8a8a);
		color: var(--warn, #ff8a8a);
	}

	.slider {
		display: grid;
		gap: 0.3rem;
		margin-top: 0.55rem;
		font-size: 0.58rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--fg-faint, #5b6674);
	}
	.slider input {
		width: 100%;
		accent-color: var(--accent, #7cf0a3);
		height: 14px;
		margin: 0;
	}

	@media (max-width: 520px) {
		.hud {
			width: auto;
			left: clamp(10px, 3vw, 22px);
		}
		.preview {
			max-width: 160px;
			margin-inline: auto;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.lamp {
			transition: none;
		}
	}
</style>
