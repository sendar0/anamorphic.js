<script lang="ts">
	/* A thin wrapper around ../room.ts, which builds the room as plain DOM.
	   Everything it draws is styled by anamorphic.css under `.ana-*`, so there is
	   nothing framework-shaped left in here — mount it and forget it. */
	import { mountRoom, type RoomOptions } from '../room';

	let { motes = 26, glass = true, escapeToExit = true }: Omit<RoomOptions, 'target'> = $props();

	$effect(() => {
		const room = mountRoom({ motes, glass, escapeToExit });
		return () => room.destroy();
	});
</script>
