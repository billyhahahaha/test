<script>
	import { items, outfits, removeOutfit, categoryLabel } from './storage.js';

	function resolveItems(itemIds) {
		return itemIds
			.map((id) => $items.find((it) => it.id === id))
			.filter(Boolean);
	}
</script>

<section class="outfits">
	<h2>Saved outfits <span class="count">({$outfits.length})</span></h2>

	{#if $outfits.length === 0}
		<p class="empty">No saved outfits yet. Build one in the Builder tab.</p>
	{:else}
		<div class="grid">
			{#each $outfits as outfit (outfit.id)}
				{@const pieces = resolveItems(outfit.itemIds)}
				<div class="outfit-card">
					<div class="head">
						<strong>{outfit.name}</strong>
						<button class="delete" on:click={() => removeOutfit(outfit.id)}
							>✕</button
						>
					</div>
					{#if pieces.length === 0}
						<p class="gone">The items in this outfit were removed.</p>
					{:else}
						<div class="pieces">
							{#each pieces as item (item.id)}
								<div
									class="piece"
									style="background-color: {item.color || '#eee'}"
									title="{item.name} — {categoryLabel(item.category)}"
								>
									{#if item.image}
										<img src={item.image} alt={item.name} />
									{:else}
										<span>{item.name}</span>
									{/if}
								</div>
							{/each}
						</div>
						<ul class="names">
							{#each pieces as item (item.id)}
								<li>{item.name}</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	h2 {
		margin: 0 0 16px;
		font-size: 1.15rem;
	}
	.count {
		color: #9ca3af;
		font-weight: 400;
	}
	.empty {
		color: #6b7280;
		padding: 40px 0;
		text-align: center;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 18px;
	}

	.outfit-card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 14px;
		padding: 16px;
	}
	.head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
	}
	.delete {
		width: 26px;
		height: 26px;
		padding: 0;
		margin: 0;
		border-radius: 50%;
		border: none;
		background: #f3f4f6;
		cursor: pointer;
		line-height: 1;
		color: #6b7280;
	}
	.delete:hover {
		background: #dc2626;
		color: #fff;
	}

	.pieces {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 10px;
	}
	.piece {
		width: 64px;
		height: 64px;
		border-radius: 10px;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.piece img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.piece span {
		font-size: 0.6rem;
		color: rgba(255, 255, 255, 0.95);
		text-align: center;
		padding: 2px;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
	}

	.names {
		margin: 0;
		padding-left: 18px;
		color: #6b7280;
		font-size: 0.85rem;
	}
	.gone {
		color: #9ca3af;
		font-size: 0.85rem;
	}
</style>
