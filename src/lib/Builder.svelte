<script>
	import {
		items,
		CATEGORIES,
		categoryLabel,
		saveOutfit
	} from './storage.js';

	// selection maps category id -> item id (or undefined)
	let selection = {};
	let outfitName = '';
	let saved = false;

	$: itemsByCategory = CATEGORIES.map((cat) => ({
		...cat,
		items: $items.filter((it) => it.category === cat.id)
	}));

	function getItem(id) {
		return $items.find((it) => it.id === id);
	}

	$: chosen = CATEGORIES.map((c) => selection[c.id])
		.filter(Boolean)
		.map(getItem)
		.filter(Boolean);

	$: mainLayers = chosen
		.filter((it) => CATEGORIES.find((c) => c.id === it.category).zone === 'main')
		.sort(
			(a, b) =>
				CATEGORIES.find((c) => c.id === a.category).order -
				CATEGORIES.find((c) => c.id === b.category).order
		);

	$: sideLayers = chosen.filter(
		(it) => CATEGORIES.find((c) => c.id === it.category).zone === 'side'
	);

	function pick(catId, itemId) {
		// click an already-selected chip to deselect it
		selection = {
			...selection,
			[catId]: selection[catId] === itemId ? undefined : itemId
		};
		saved = false;
	}

	function clearAll() {
		selection = {};
		outfitName = '';
		saved = false;
	}

	function save() {
		if (chosen.length === 0) return;
		const itemIds = CATEGORIES.map((c) => selection[c.id]).filter(Boolean);
		saveOutfit({
			name: outfitName.trim() || `Outfit ${new Date().toLocaleDateString()}`,
			itemIds
		});
		saved = true;
	}
</script>

<section class="builder">
	<div class="pickers">
		<h2>Build an outfit</h2>
		{#if $items.length === 0}
			<p class="empty">Add some clothes in the Wardrobe tab first.</p>
		{:else}
			{#each itemsByCategory as cat}
				<div class="picker-group">
					<h3>{cat.label}</h3>
					{#if cat.items.length === 0}
						<p class="none">— nothing here yet —</p>
					{:else}
						<div class="chips">
							{#each cat.items as item (item.id)}
								<button
									class="chip"
									class:active={selection[cat.id] === item.id}
									on:click={() => pick(cat.id, item.id)}
									title={item.name}
								>
									<span
										class="swatch"
										style="background-color: {item.color || '#eee'}"
									>
										{#if item.image}
											<img src={item.image} alt={item.name} />
										{/if}
									</span>
									<span class="chip-name">{item.name}</span>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>

	<div class="stage">
		<div class="board">
			{#if chosen.length === 0}
				<p class="hint">Pick items on the left to compose your look.</p>
			{:else}
				<div class="main-stack">
					{#each mainLayers as item (item.id)}
						<div class="layer" title={categoryLabel(item.category)}>
							<div
								class="layer-img"
								style="background-color: {item.color || '#eee'}"
							>
								{#if item.image}
									<img src={item.image} alt={item.name} />
								{:else}
									<span>{item.name}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
				{#if sideLayers.length}
					<div class="side-stack">
						{#each sideLayers as item (item.id)}
							<div class="layer side" title={categoryLabel(item.category)}>
								<div
									class="layer-img"
									style="background-color: {item.color || '#eee'}"
								>
									{#if item.image}
										<img src={item.image} alt={item.name} />
									{:else}
										<span>{item.name}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		</div>

		<div class="controls">
			<input
				type="text"
				placeholder="Name this outfit"
				bind:value={outfitName}
			/>
			<div class="buttons">
				<button on:click={clearAll} disabled={chosen.length === 0}>Clear</button>
				<button class="primary" on:click={save} disabled={chosen.length === 0}>
					{saved ? '✓ Saved' : 'Save outfit'}
				</button>
			</div>
		</div>
	</div>
</section>

<style>
	.builder {
		display: grid;
		grid-template-columns: 340px 1fr;
		gap: 24px;
		align-items: start;
	}

	h2 {
		margin: 0 0 16px;
		font-size: 1.15rem;
	}
	h3 {
		margin: 0 0 8px;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: #6b7280;
	}

	.pickers {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 14px;
		padding: 20px;
		max-height: 80vh;
		overflow-y: auto;
	}
	.picker-group {
		margin-bottom: 18px;
	}
	.none {
		color: #c4c4c4;
		font-size: 0.85rem;
		margin: 0;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px 4px 4px;
		margin: 0;
		border: 1px solid #e5e7eb;
		border-radius: 999px;
		background: #fff;
		cursor: pointer;
		max-width: 100%;
	}
	.chip:hover {
		border-color: #9ca3af;
	}
	.chip.active {
		border-color: #111827;
		background: #111827;
		color: #fff;
	}
	.swatch {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		overflow: hidden;
		flex-shrink: 0;
		display: inline-block;
	}
	.swatch img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.chip-name {
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 160px;
	}

	.stage {
		position: sticky;
		top: 12px;
	}
	.board {
		position: relative;
		background: linear-gradient(160deg, #f8fafc, #eef2f7);
		border: 1px solid #e5e7eb;
		border-radius: 18px;
		min-height: 460px;
		padding: 24px;
		display: flex;
		justify-content: center;
		gap: 16px;
	}
	.hint {
		margin: auto;
		color: #9ca3af;
	}

	.main-stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
	}
	.side-stack {
		display: flex;
		flex-direction: column;
		gap: 14px;
		align-self: center;
	}

	.layer-img {
		width: 200px;
		height: 150px;
		border-radius: 12px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
	}
	.layer.side .layer-img {
		width: 96px;
		height: 96px;
	}
	.layer-img img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.layer-img span {
		color: rgba(255, 255, 255, 0.95);
		font-size: 0.85rem;
		text-align: center;
		padding: 6px;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
	}

	.controls {
		margin-top: 16px;
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.controls input {
		flex: 1;
		margin: 0;
	}
	.buttons {
		display: flex;
		gap: 8px;
	}
	.controls button {
		margin: 0;
		border-radius: 8px;
		padding: 0.55em 1em;
		cursor: pointer;
	}
	.controls button.primary {
		background: #111827;
		color: #fff;
		border: none;
		font-weight: 600;
	}
	.controls button.primary:disabled {
		background: #9ca3af;
	}

	.empty {
		color: #6b7280;
	}

	@media (max-width: 760px) {
		.builder {
			grid-template-columns: 1fr;
		}
		.stage {
			position: static;
		}
	}
</style>
