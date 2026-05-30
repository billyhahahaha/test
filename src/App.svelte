<script>
	import Wardrobe from './lib/Wardrobe.svelte';
	import Builder from './lib/Builder.svelte';
	import Outfits from './lib/Outfits.svelte';
	import FitVisualizer from './lib/FitVisualizer.svelte';

	const tabs = [
		{ id: 'wardrobe', label: '👕 Wardrobe' },
		{ id: 'builder', label: '✨ Build' },
		{ id: 'outfits', label: '📁 Outfits' },
		{ id: 'fit', label: '📐 Fit' }
	];
	let active = 'wardrobe';
</script>

<div class="app">
	<header>
		<h1>Outfit Studio</h1>
		<nav>
			{#each tabs as tab}
				<button
					class:active={active === tab.id}
					on:click={() => (active = tab.id)}>{tab.label}</button
				>
			{/each}
		</nav>
	</header>

	<main>
		{#if active === 'wardrobe'}
			<Wardrobe />
		{:else if active === 'builder'}
			<Builder />
		{:else if active === 'outfits'}
			<Outfits />
		{:else}
			<FitVisualizer />
		{/if}
	</main>

	<footer>
		Everything is saved privately in your browser.
	</footer>
</div>

<style>
	.app {
		max-width: 1100px;
		margin: 0 auto;
		padding: 16px;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 24px;
	}
	h1 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: #111827;
	}

	nav {
		display: flex;
		gap: 6px;
		background: #f3f4f6;
		padding: 4px;
		border-radius: 10px;
	}
	nav button {
		margin: 0;
		border: none;
		background: transparent;
		padding: 0.5em 1em;
		border-radius: 8px;
		cursor: pointer;
		color: #4b5563;
		font-weight: 500;
	}
	nav button.active {
		background: #fff;
		color: #111827;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	footer {
		margin-top: 40px;
		text-align: center;
		color: #9ca3af;
		font-size: 0.8rem;
	}
</style>
