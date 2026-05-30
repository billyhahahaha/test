<script>
	import {
		items,
		CATEGORIES,
		categoryLabel,
		addItem,
		removeItem,
		fileToResizedDataURL
	} from './storage.js';

	let name = '';
	let category = CATEGORIES[2].id; // default to "Tops"
	let color = '#3b82f6';
	let image = null;
	let busy = false;
	let error = '';
	let fileInput;

	let filter = 'all';

	$: visible =
		filter === 'all' ? $items : $items.filter((it) => it.category === filter);

	async function onFile(event) {
		const file = event.target.files && event.target.files[0];
		if (!file) return;
		error = '';
		busy = true;
		try {
			image = await fileToResizedDataURL(file);
		} catch (e) {
			error = e.message || 'Could not process image';
		} finally {
			busy = false;
		}
	}

	function reset() {
		name = '';
		color = '#3b82f6';
		image = null;
		if (fileInput) fileInput.value = '';
	}

	function submit() {
		if (!name.trim()) {
			error = 'Give the item a name.';
			return;
		}
		addItem({ name: name.trim(), category, color, image });
		reset();
		error = '';
	}
</script>

<section class="wardrobe">
	<form class="add-form card" on:submit|preventDefault={submit}>
		<h2>Add an item</h2>

		<label class="uploader" class:has-image={image}>
			{#if image}
				<img src={image} alt="preview" />
			{:else}
				<span>{busy ? 'Processing…' : '📷 Add a photo (optional)'}</span>
			{/if}
			<input
				type="file"
				accept="image/*"
				bind:this={fileInput}
				on:change={onFile}
			/>
		</label>

		<label class="field">
			<span>Name</span>
			<input type="text" bind:value={name} placeholder="e.g. White linen shirt" />
		</label>

		<div class="row">
			<label class="field">
				<span>Category</span>
				<select bind:value={category}>
					{#each CATEGORIES as cat}
						<option value={cat.id}>{cat.label}</option>
					{/each}
				</select>
			</label>

			<label class="field color-field">
				<span>Color</span>
				<input type="color" bind:value={color} />
			</label>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button type="submit" class="primary" disabled={busy}>Add to wardrobe</button>
	</form>

	<div class="list-area">
		<div class="list-header">
			<h2>My wardrobe <span class="count">({$items.length})</span></h2>
			<select bind:value={filter} class="filter">
				<option value="all">All categories</option>
				{#each CATEGORIES as cat}
					<option value={cat.id}>{cat.label}</option>
				{/each}
			</select>
		</div>

		{#if visible.length === 0}
			<p class="empty">
				{$items.length === 0
					? 'Your wardrobe is empty — add your first item on the left.'
					: 'No items in this category yet.'}
			</p>
		{:else}
			<div class="grid">
				{#each visible as item (item.id)}
					<div class="item-card">
						<div
							class="thumb"
							style="background-color: {item.color || '#eee'}"
						>
							{#if item.image}
								<img src={item.image} alt={item.name} />
							{:else}
								<span class="placeholder">{categoryLabel(item.category)}</span>
							{/if}
						</div>
						<div class="meta">
							<strong>{item.name}</strong>
							<small>{categoryLabel(item.category)}</small>
						</div>
						<button
							class="delete"
							title="Remove"
							on:click={() => removeItem(item.id)}>✕</button
						>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.wardrobe {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 24px;
		align-items: start;
	}

	.card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 14px;
		padding: 20px;
	}

	h2 {
		margin: 0 0 16px;
		font-size: 1.15rem;
	}

	.field {
		display: block;
		margin-bottom: 12px;
	}
	.field span {
		display: block;
		font-size: 0.8rem;
		color: #6b7280;
		margin-bottom: 4px;
	}
	.field input[type='text'],
	.field select {
		width: 100%;
		margin: 0;
	}

	.row {
		display: flex;
		gap: 12px;
	}
	.row .field {
		flex: 1;
	}
	.color-field {
		flex: 0 0 64px;
	}
	.color-field input[type='color'] {
		width: 100%;
		height: 38px;
		padding: 2px;
	}

	.uploader {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		height: 150px;
		margin-bottom: 14px;
		border: 2px dashed #d1d5db;
		border-radius: 10px;
		cursor: pointer;
		color: #6b7280;
		text-align: center;
		overflow: hidden;
		background: #fafafa;
	}
	.uploader.has-image {
		border-style: solid;
	}
	.uploader img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.uploader input[type='file'] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		margin: 0;
	}

	button.primary {
		width: 100%;
		background: #111827;
		color: #fff;
		border: none;
		border-radius: 8px;
		padding: 0.7em;
		cursor: pointer;
		font-weight: 600;
	}
	button.primary:hover:not(:disabled) {
		background: #374151;
	}

	.error {
		color: #dc2626;
		font-size: 0.85rem;
		margin: 0 0 10px;
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}
	.list-header h2 {
		margin: 0;
	}
	.count {
		color: #9ca3af;
		font-weight: 400;
	}
	.filter {
		margin: 0;
		max-width: 200px;
	}

	.empty {
		color: #6b7280;
		padding: 40px 0;
		text-align: center;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 16px;
	}

	.item-card {
		position: relative;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
	}
	.thumb {
		height: 140px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.placeholder {
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.8rem;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}
	.meta {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.meta small {
		color: #9ca3af;
	}

	.delete {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 28px;
		height: 28px;
		padding: 0;
		margin: 0;
		border-radius: 50%;
		border: none;
		background: rgba(17, 24, 39, 0.7);
		color: #fff;
		cursor: pointer;
		line-height: 1;
	}
	.delete:hover {
		background: #dc2626;
	}

	@media (max-width: 760px) {
		.wardrobe {
			grid-template-columns: 1fr;
		}
	}
</style>
