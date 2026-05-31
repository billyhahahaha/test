<script>
	import Wardrobe from './lib/Wardrobe.svelte';
	import Builder from './lib/Builder.svelte';
	import Outfits from './lib/Outfits.svelte';
	import FitVisualizer from './lib/FitVisualizer.svelte';
	import Collection from './lib/Collection.svelte';
	import { onMount } from 'svelte';
	import { activeTab, addGarment, tryOn } from './lib/storage.js';

	// Handle hand-off from the bookmarklet: ?import=<base64url(JSON)>
	onMount(() => {
		try {
			const params = new URLSearchParams(location.search);
			const raw = params.get('import');
			if (!raw) return;
			const json = decodeURIComponent(escape(atob(raw.replace(/-/g, '+').replace(/_/g, '/'))));
			const data = JSON.parse(json);
			addGarment({
				name: data.name || 'Imported garment',
				image: data.image || '',
				sourceUrl: data.url || '',
				measurements: data.measurements || {}
			});
			if (data.measurements && Object.keys(data.measurements).length) tryOn.set(data.measurements);
			activeTab.set('fit');
			history.replaceState(null, '', location.pathname);
		} catch (e) {
			console.warn('import failed', e);
		}
	});

	const tabs = [
		{ id: 'wardrobe', label: '👕 Wardrobe' },
		{ id: 'builder', label: '✨ Build' },
		{ id: 'outfits', label: '📁 Outfits' },
		{ id: 'collection', label: '🧥 Collection' },
		{ id: 'fit', label: '📐 Fit' }
	];
</script>

<div class="app">
	<header>
		<h1>Outfit Studio</h1>
		<nav>
			{#each tabs as tab}
				<button class:active={$activeTab === tab.id} on:click={() => activeTab.set(tab.id)}
					>{tab.label}</button
				>
			{/each}
		</nav>
	</header>

	<main>
		{#if $activeTab === 'wardrobe'}
			<Wardrobe />
		{:else if $activeTab === 'builder'}
			<Builder />
		{:else if $activeTab === 'outfits'}
			<Outfits />
		{:else if $activeTab === 'collection'}
			<Collection />
		{:else}
			<FitVisualizer />
		{/if}
	</main>

	<footer>Everything is saved privately in your browser.</footer>
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
		flex-wrap: wrap;
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
