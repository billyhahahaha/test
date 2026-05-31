<script>
	import {
		garments,
		addGarment,
		removeGarment,
		tryOn,
		activeTab
	} from './storage.js';
	import { parseMeasurements } from './parseMeasurements.js';

	let name = '';
	let link = '';
	let sizeText = '';
	let busy = false;
	let msg = '';

	let collectionUrl = '';
	let importing = false;
	let importMsg = '';

	const FIELDS = ['waist', 'hip', 'rise', 'inseam', 'thigh', 'legOpening'];
	const labelFor = (k) =>
		({ waist: 'Waist', hip: 'Hip', rise: 'Rise', inseam: 'Inseam', thigh: 'Thigh', legOpening: 'Hem' }[k]);
	const inch = (cm) => `${Math.round(cm / 2.54)}"`;

	function summarize(m) {
		return FIELDS.filter((k) => m[k] != null)
			.map((k) => `${labelFor(k)} ${inch(m[k])}`)
			.join(' · ');
	}

	async function addFromLink() {
		if (!link.trim()) return;
		busy = true;
		msg = 'Fetching…';
		try {
			const r = await fetch('/api/scrape?url=' + encodeURIComponent(link.trim()));
			const j = await r.json();
			if (j.ok && Object.keys(j.found || {}).length) {
				addGarment({
					name: name.trim() || (j.title ? j.title.slice(0, 60) : 'Imported garment'),
					measurements: j.found,
					sourceUrl: link.trim()
				});
				msg = 'Added with ' + summarize(j.found) + '.';
				name = '';
				link = '';
			} else {
				msg = j.ok
					? 'Reached the page but found no measurements. Use the paste box.'
					: j.error || 'Could not read that page.';
			}
		} catch (e) {
			msg = 'Request failed: ' + (e.message || 'network error');
		}
		busy = false;
	}

	function addFromText() {
		if (!sizeText.trim()) return;
		const { fields } = parseMeasurements(sizeText);
		if (!Object.keys(fields).length) {
			msg = 'No measurements recognized in that text.';
			return;
		}
		addGarment({ name: name.trim() || 'Pasted garment', measurements: fields });
		msg = 'Added with ' + summarize(fields) + '.';
		name = '';
		sizeText = '';
	}

	function tryGarment(g) {
		tryOn.set(g.measurements);
		activeTab.set('fit');
	}

	async function importCollection() {
		if (!collectionUrl.trim()) return;
		importing = true;
		importMsg = 'Scanning the collection page…';
		try {
			const r = await fetch('/api/catalog?url=' + encodeURIComponent(collectionUrl.trim()));
			const j = await r.json();
			if (j.ok && j.products && j.products.length) {
				for (const p of j.products) {
					addGarment({ name: p.name, image: p.image, sourceUrl: p.url, measurements: {} });
				}
				importMsg = `Imported ${j.products.length} items (names/images only — open each to add measurements).`;
				collectionUrl = '';
			} else {
				importMsg = j.error || 'No products found on that page.';
			}
		} catch (e) {
			importMsg = 'Request failed: ' + (e.message || 'network error');
		}
		importing = false;
	}
</script>

<section class="collection">
	<div class="add card">
		<h2>Add a garment</h2>
		<label>Name (optional)
			<input type="text" bind:value={name} placeholder="e.g. Techno gabardine trousers" />
		</label>
		<div class="row">
			<input type="text" bind:value={link} placeholder="Paste a product link" />
			<button class="primary" on:click={addFromLink} disabled={busy}>{busy ? '…' : 'Fetch'}</button>
		</div>
		<details>
			<summary>or paste the size-guide text</summary>
			<textarea rows="3" bind:value={sizeText} placeholder="Waist 33 in · Hip 41 in · Rise 11 in · Inseam 34 in · Thigh 24 in · Leg opening 15 in"></textarea>
			<button on:click={addFromText}>Add from text</button>
		</details>
		{#if msg}<p class="msg">{msg}</p>{/if}

		<hr />
		<h2>Import a whole collection</h2>
		<p class="note">
			Paste a collection/listing URL to pull item names &amp; images. Note: many
			luxury sites (incl. Jil Sander) block automated access, so this often
			returns nothing — add items individually above when it does.
		</p>
		<div class="row">
			<input type="text" bind:value={collectionUrl} placeholder="Collection page URL" />
			<button on:click={importCollection} disabled={importing}>{importing ? '…' : 'Import'}</button>
		</div>
		{#if importMsg}<p class="msg">{importMsg}</p>{/if}
	</div>

	<div class="list">
		<h2>My collection <span class="count">({$garments.length})</span></h2>
		{#if $garments.length === 0}
			<p class="empty">No garments yet. Add one on the left, then “Try on” to see it on your avatar.</p>
		{:else}
			<div class="grid">
				{#each $garments as g (g.id)}
					<div class="g-card">
						<div class="thumb">
							{#if g.image}
								<img src={g.image} alt={g.name} referrerpolicy="no-referrer" />
							{:else}
								<span>👖</span>
							{/if}
						</div>
						<div class="meta">
							<strong title={g.name}>{g.name}</strong>
							{#if g.measurements && Object.keys(g.measurements).length}
								<small>{summarize(g.measurements)}</small>
							{:else}
								<small class="muted">no measurements yet</small>
							{/if}
						</div>
						<div class="actions">
							<button
								class="try"
								disabled={!g.measurements || !Object.keys(g.measurements).length}
								on:click={() => tryGarment(g)}>Try on</button
							>
							{#if g.sourceUrl}
								<a class="src" href={g.sourceUrl} target="_blank" rel="noreferrer">source</a>
							{/if}
							<button class="del" on:click={() => removeGarment(g.id)}>✕</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>

<style>
	.collection {
		display: grid;
		grid-template-columns: 320px 1fr;
		gap: 24px;
		align-items: start;
	}
	.card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 14px;
		padding: 18px;
	}
	h2 {
		margin: 0 0 12px;
		font-size: 1.1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		font-size: 0.78rem;
		color: #6b7280;
		gap: 3px;
		margin-bottom: 10px;
	}
	label input {
		margin: 0;
	}
	.row {
		display: flex;
		gap: 6px;
	}
	.row input {
		flex: 1;
		margin: 0;
	}
	.primary {
		background: #111827;
		color: #fff;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		margin: 0;
		padding: 0 1em;
	}
	button {
		cursor: pointer;
	}
	details {
		margin: 10px 0;
		font-size: 0.82rem;
		color: #6b7280;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		margin: 6px 0;
		font-family: inherit;
		font-size: 0.8rem;
		border: 1px solid #ccc;
		border-radius: 6px;
		padding: 6px;
	}
	hr {
		border: none;
		border-top: 1px solid #eee;
		margin: 16px 0;
	}
	.note {
		font-size: 0.74rem;
		color: #9ca3af;
		line-height: 1.4;
	}
	.msg {
		font-size: 0.78rem;
		color: #2563eb;
		margin: 8px 0 0;
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
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 16px;
	}
	.g-card {
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
		background: #fff;
		display: flex;
		flex-direction: column;
	}
	.thumb {
		height: 180px;
		background: #f3f4f6;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 2rem;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.meta {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		flex: 1;
	}
	.meta strong {
		font-size: 0.9rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.meta small {
		color: #6b7280;
		font-size: 0.74rem;
	}
	.meta .muted {
		color: #b8c0cb;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 12px 12px;
	}
	.try {
		flex: 1;
		background: #111827;
		color: #fff;
		border: none;
		border-radius: 7px;
		padding: 0.45em;
		font-weight: 600;
	}
	.try:disabled {
		background: #cbd5e1;
	}
	.src {
		font-size: 0.74rem;
		color: #2563eb;
	}
	.del {
		border: none;
		background: #f3f4f6;
		border-radius: 6px;
		width: 28px;
		height: 28px;
	}
	.del:hover {
		background: #fee2e2;
	}
	@media (max-width: 760px) {
		.collection {
			grid-template-columns: 1fr;
		}
	}
</style>
