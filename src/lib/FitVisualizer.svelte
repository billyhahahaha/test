<script>
	import { onMount } from 'svelte';
	import Viewer3D from './Viewer3D.svelte';
	import AvatarCreator from './AvatarCreator.svelte';
	import { avatarUrl, tryOn } from './storage.js';
	import { idbPut, idbGet, idbDel } from './idb.js';
	import { parseMeasurements } from './parseMeasurements.js';

	// 3D options
	let hideClothes = true;
	let showLabels = false;
	let autoRotate = false;
	let garmentMode = 'cloth'; // 'cloth' | 'parametric'
	let fabric = 'gabardine';
	let debugSkeleton = false;
	const FABRICS = ['gabardine', 'wool', 'cotton', 'denim', 'linen', 'silk'];

	let showCreator = false;

	// bundled realistic avatars (your uploaded Avaturn meshes).
	// Avatars 2 & 4 are bare base bodies (no clothing mesh) — ideal for try-on
	// because the trousers drape over real legs. Avatars 1/3/5 are *clothed*
	// (the body lives inside the avaturn_look mesh), so hiding clothes removes
	// the legs. We flag that so the UI can warn / pick the right default.
	const AVATARS = [
		{ id: 1, url: '/models/avatar-1.glb', bare: false },
		{ id: 2, url: '/models/avatar-2.glb', bare: true },
		{ id: 3, url: '/models/avatar-3.glb', bare: false },
		{ id: 4, url: '/models/avatar-4.glb', bare: true },
		{ id: 5, url: '/models/avatar-5.glb', bare: false }
	];
	$: currentBare = AVATARS.find((a) => a.url === $avatarUrl)?.bare ?? true;

	// default to a bare base body so try-on works out of the box
	onMount(() => {
		if (!$avatarUrl) avatarUrl.set(AVATARS[1].url);
	});

	// resolve the stored avatar reference into a loadable URL.
	// 'idb:<key>#<nonce>' references an uploaded blob in IndexedDB.
	let resolvedUrl = '';
	let objectUrl = null;
	let lastResolved = '__init__';
	async function resolve(u) {
		if (u === lastResolved) return;
		lastResolved = u;
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = null;
		}
		if (!u) {
			resolvedUrl = '';
		} else if (u.startsWith('idb:')) {
			const key = u.slice(4).split('#')[0];
			const blob = await idbGet(key);
			resolvedUrl = blob ? (objectUrl = URL.createObjectURL(blob)) : '';
		} else {
			resolvedUrl = u;
		}
	}
	$: resolve($avatarUrl);

	let uploadBusy = false;
	let importUrl = '';
	async function onUpload(e) {
		const file = e.target.files && e.target.files[0];
		if (!file) return;
		uploadBusy = true;
		await idbPut('uploadedModel', file);
		avatarUrl.set('idb:uploadedModel#' + Date.now());
		uploadBusy = false;
		e.target.value = '';
	}
	function loadFromUrl() {
		if (importUrl.trim()) avatarUrl.set(importUrl.trim());
	}
	function removeAvatar() {
		idbDel('uploadedModel');
		avatarUrl.set('');
	}

	// ----- import garment measurements from a link / pasted text -----
	let linkUrl = '';
	let sizeText = '';
	let linkBusy = false;
	let importMsg = '';

	const round1 = (v) => Math.round(v * 10) / 10;

	// fieldsCm: { waist, hip, rise, inseam, thigh, legOpening } in centimetres
	function applyFields(fieldsCm) {
		const map = { waist: 'waist', hip: 'hip', rise: 'rise', inseam: 'inseam', thigh: 'thigh', legOpening: 'legOpening' };
		const applied = [];
		for (const k in map) {
			if (fieldsCm[k] != null) {
				g[map[k]] = round1(unit === 'in' ? fieldsCm[k] / 2.54 : fieldsCm[k]);
				applied.push(k);
			}
		}
		g = g; // trigger reactivity -> updates the 3D model
		return applied;
	}

	async function fetchLink() {
		if (!linkUrl.trim()) return;
		linkBusy = true;
		importMsg = 'Fetching the page…';
		try {
			const r = await fetch('/api/scrape?url=' + encodeURIComponent(linkUrl.trim()));
			const j = await r.json();
			if (j.ok) {
				const applied = applyFields(j.found || {});
				importMsg = applied.length
					? `Applied ${applied.join(', ')}${j.title ? ` from “${j.title.slice(0, 60)}”` : ''}.`
					: 'Reached the page but found no recognizable measurements. Use the paste box below.';
			} else {
				importMsg = j.error || 'Could not read that page.';
			}
		} catch (e) {
			importMsg = 'Request failed: ' + (e.message || 'network error');
		}
		linkBusy = false;
	}

	function parseText() {
		if (!sizeText.trim()) return;
		const { fields } = parseMeasurements(sizeText);
		const applied = applyFields(fields);
		importMsg = applied.length
			? `Applied ${applied.join(', ')} from pasted text.`
			: 'No measurements recognized in the pasted text.';
	}

	// ----- view mode -----
	let view = '3d'; // '3d' | 'diagram'

	// ----- units -----
	let unit = 'in'; // 'in' | 'cm'
	const toCm = (v) => (unit === 'in' ? v * 2.54 : v);
	const fmt = (cm) => {
		const v = unit === 'in' ? cm / 2.54 : cm;
		return Math.round(v * 10) / 10;
	};
	const label = (cm) => `${fmt(cm)}${unit === 'in' ? '"' : 'cm'}`;

	// ----- your body (prefilled from your stats) -----
	let body = {
		heightIn: 75, // 6'3"
		weightLb: 210,
		waist: 33, // worn waist (in)
		shoe: 12 // US men's
	};

	// ----- garment: trousers (size-appropriate defaults for a tall 33" waist) -----
	let g = {
		waist: 33,
		hip: 41,
		rise: 11, // front rise
		inseam: 34, // tall inseam
		thigh: 24, // thigh circumference
		legOpening: 15 // hem circumference
	};

	// US men's shoe size -> foot length (barleycorn formula)
	$: footLenCm = ((Number(body.shoe) + 22) / 3) * 2.54;

	// height readout in ft/in
	$: heightFtIn = (() => {
		const totalIn = unit === 'in' ? body.heightIn : body.heightIn; // stored in inches always
		const ft = Math.floor(totalIn / 12);
		const inch = Math.round(totalIn - ft * 12);
		return `${ft}'${inch}"`;
	})();

	// ---------- geometry ----------
	const W = 460;
	const H = 660;
	const marginTop = 28;
	const groundPad = 24;

	$: heightCm = body.heightIn * 2.54; // height always entered in inches
	$: drawableH = H - marginTop - groundPad;
	$: scale = drawableH / heightCm; // px per cm
	$: ground = H - groundPad;
	const cx = W / 2 + 30; // shift figure right to leave room for height dim line

	// vertical position (cm above ground) -> y px
	$: yOf = (cmAboveGround) => ground - cmAboveGround * scale;

	// anthropometric landmarks as fraction of total height
	$: L = {
		crown: heightCm,
		shoulder: 0.82 * heightCm,
		waist: 0.6 * heightCm,
		hip: 0.53 * heightCm,
		crotch: 0.47 * heightCm,
		knee: 0.285 * heightCm,
		ankle: 0.05 * heightCm
	};

	// front-view widths from circumference (treat limb as ~cylinder)
	const front = (circCm) => circCm / Math.PI;
	$: gWaistF = front(toCm(g.waist));
	$: gHipF = front(toCm(g.hip));
	$: gThighF = front(toCm(g.thigh));
	$: gHemF = front(toCm(g.legOpening));
	$: bodyWaistF = front(toCm(body.waist));

	$: px = (cm) => cm * scale;

	// trouser overlay polygon (front view), symmetric about cx
	$: trouser = (() => {
		const wb = px(gWaistF) / 2; // half waist width
		const hh = px(gHipF) / 2; // half hip width
		const th = px(gThighF); // thigh width (per leg)
		const hem = px(gHemF); // hem width (per leg)
		const yWaist = yOf(L.waist);
		const yHip = yOf(L.hip);
		const yCrotch = yOf(L.crotch);
		const yHem = yOf(L.ankle);
		const innerHemGap = 4;
		const legOuterR = hh; // outer of right leg at hip line
		return {
			yWaist,
			yHip,
			yCrotch,
			yHem,
			wb,
			hh,
			th,
			hem,
			path: [
				`M ${cx - wb} ${yWaist}`,
				`L ${cx + wb} ${yWaist}`,
				`L ${cx + hh} ${yHip}`,
				`L ${cx + hh} ${yHem}`,
				`L ${cx + hh - hem} ${yHem}`,
				`L ${cx + innerHemGap} ${yCrotch}`,
				`L ${cx - innerHemGap} ${yCrotch}`,
				`L ${cx - (hh - hem)} ${yHem}`,
				`L ${cx - hh} ${yHem}`,
				`L ${cx - hh} ${yHip}`,
				'Z'
			].join(' ')
		};
	})();

	// simple body silhouette behind the trousers
	$: figure = (() => {
		const headR = (heightCm / 7.5 / 2) * scale;
		const shoulderHalf = px(front(toCm(body.waist)) * 1.5) / 2 + 6;
		const hipHalf = trouser.hh + 4;
		const yShoulder = yOf(L.shoulder);
		const yChin = yOf(L.crown) + headR * 2;
		const yWaist = yOf(L.waist);
		const yHip = yOf(L.hip);
		const yCrotch = yOf(L.crotch);
		const yAnkle = yOf(L.ankle);
		return { headR, shoulderHalf, hipHalf, yShoulder, yChin, yWaist, yHip, yCrotch, yAnkle };
	})();

	// dimension annotations: {orient, x1,y1,x2,y2, text, anchor}
	$: dims = (() => {
		const t = trouser;
		const out = [];
		// total height (far left, vertical)
		out.push({
			o: 'v',
			x: 26,
			y1: yOf(L.crown),
			y2: ground,
			text: `Height ${heightFtIn} · ${label(heightCm)}`
		});
		// waist (horizontal across waistband)
		out.push({
			o: 'h',
			y: t.yWaist - 14,
			x1: cx - t.wb,
			x2: cx + t.wb,
			text: `Waist ${label(toCm(g.waist))}`
		});
		// hip
		out.push({
			o: 'h',
			y: t.yHip,
			x1: cx - t.hh,
			x2: cx + t.hh,
			text: `Hip ${label(toCm(g.hip))}`,
			inside: true
		});
		// front rise (vertical center, waist->crotch)
		out.push({
			o: 'v',
			x: cx + 4,
			y1: t.yWaist,
			y2: t.yCrotch,
			text: `Rise ${label(toCm(g.rise))}`,
			side: 'r'
		});
		// inseam (inner leg right)
		out.push({
			o: 'v',
			x: cx + t.hem * 0.5 + 6,
			y1: t.yCrotch,
			y2: t.yHem,
			text: `Inseam ${label(toCm(g.inseam))}`,
			side: 'r'
		});
		// outseam / length (outer right)
		out.push({
			o: 'v',
			x: cx + t.hh + 24,
			y1: t.yWaist,
			y2: t.yHem,
			text: `Length ${label(toCm(g.rise) + toCm(g.inseam))}`,
			side: 'r'
		});
		// thigh (across right leg, just below crotch)
		out.push({
			o: 'h',
			y: t.yCrotch + 22,
			x1: cx + 6,
			x2: cx + t.hh,
			text: `Thigh ${label(toCm(g.thigh))}`
		});
		// leg opening (right hem)
		out.push({
			o: 'h',
			y: t.yHem + 16,
			x1: cx + t.hh - t.hem,
			x2: cx + t.hh,
			text: `Hem ${label(toCm(g.legOpening))}`
		});
		// foot length
		out.push({
			o: 'h',
			y: ground + 10,
			x1: cx - px(footLenCm) / 2,
			x2: cx + px(footLenCm) / 2,
			text: `Foot (sz ${body.shoe}) ${label(footLenCm)}`
		});
		return out;
	})();

	let garmentColor = '#23262b';

	// apply a garment chosen from the Collection tab
	$: if ($tryOn) {
		applyFields($tryOn);
		tryOn.set(null);
	}

	// fit ease at the waistband (garment waist − body waist)
	$: waistEaseCm = toCm(g.waist) - toCm(body.waist);
	$: waistEase = (() => {
		const e = waistEaseCm;
		const val = unit === 'in' ? e / 2.54 : e;
		let cls = 'ok',
			word = 'Comfortable';
		if (e < 0) {
			cls = 'bad';
			word = 'Too tight';
		} else if (e < 1) {
			cls = 'warn';
			word = 'Snug';
		} else if (e > 7) {
			cls = 'warn';
			word = 'Relaxed';
		}
		return { text: `${val >= 0 ? '+' : ''}${Math.round(val * 10) / 10}${unit === 'in' ? '"' : 'cm'}`, word, cls };
	})();
</script>

<section class="fit">
	<div class="panel">
		<div class="unit-row">
			<h2>Measurements</h2>
			<div class="toggle">
				<button class:active={unit === 'in'} on:click={() => (unit = 'in')}>in</button>
				<button class:active={unit === 'cm'} on:click={() => (unit = 'cm')}>cm</button>
			</div>
		</div>

		<div class="import-box">
			<div class="import-label">🔗 Import garment from a link</div>
			<div class="import-meas">
				<input type="text" placeholder="Paste a product URL" bind:value={linkUrl} />
				<button class="primary-sm" on:click={fetchLink} disabled={linkBusy}>
					{linkBusy ? '…' : 'Fetch'}
				</button>
			</div>
			<details class="paste">
				<summary>or paste the size-guide text</summary>
				<textarea
					rows="3"
					placeholder="e.g. Waist 33 in · Hip 41 in · Rise 11 in · Inseam 34 in · Thigh 24 in · Leg opening 15 in"
					bind:value={sizeText}
				></textarea>
				<button class="ghost" on:click={parseText}>Parse text</button>
			</details>
			{#if importMsg}
				<p class="import-msg">{importMsg}</p>
			{/if}
		</div>

		<h3>Your avatar</h3>
		<div class="avatar-grid">
			{#each AVATARS as a}
				<button
					class="avatar-chip"
					class:active={$avatarUrl === a.url}
					title={a.bare ? 'Bare body — best for try-on' : 'Already dressed — hide its clothes to try garments on'}
					on:click={() => avatarUrl.set(a.url)}>
					{a.id}{#if a.bare}<span class="bare-dot" title="bare body">•</span>{/if}
				</button>
			{/each}
		</div>
		<p class="avatar-hint">
			{#if currentBare}
				Bare body — trousers drape directly on the legs. 👍
			{:else}
				This avatar is already dressed; its body is part of its clothing, so hiding
				clothes removes the legs. Pick a dotted avatar (2 or 4) for try-on.
			{/if}
		</p>

		<div class="import-row">
			<label class="upload">
				{uploadBusy ? 'Loading…' : '⬆️ Upload .glb/.gltf'}
				<input type="file" accept=".glb,.gltf,model/gltf-binary" on:change={onUpload} />
			</label>
			<button class="ghost" on:click={() => (showCreator = true)}>📸 Selfie (RPM)</button>
		</div>
		<div class="url-row">
			<input type="text" placeholder="…or paste a model URL" bind:value={importUrl} />
			<button class="ghost" on:click={loadFromUrl}>Load</button>
		</div>
		{#if $avatarUrl}
			<p class="avatar-status">
				✓ Avatar loaded ·
				<button class="link" on:click={removeAvatar}>remove (show mannequin)</button>
			</p>
		{/if}

		<h3>Your body</h3>
		<div class="grid2">
			<label>Height (in)<input type="number" bind:value={body.heightIn} /></label>
			<label>Weight (lb)<input type="number" bind:value={body.weightLb} /></label>
			<label>Waist<input type="number" bind:value={body.waist} /></label>
			<label>Shoe (US)<input type="number" bind:value={body.shoe} /></label>
		</div>
		<p class="readout">{heightFtIn} · {body.weightLb} lb · foot ≈ {label(footLenCm)}</p>

		<h3>Trousers</h3>
		<div class="grid2">
			<label>Waist<input type="number" bind:value={g.waist} /></label>
			<label>Hip<input type="number" bind:value={g.hip} /></label>
			<label>Front rise<input type="number" bind:value={g.rise} /></label>
			<label>Inseam<input type="number" bind:value={g.inseam} /></label>
			<label>Thigh<input type="number" bind:value={g.thigh} /></label>
			<label>Leg opening<input type="number" bind:value={g.legOpening} /></label>
		</div>

		<div class="ease ease-{waistEase.cls}">
			Waist fit vs your body: <strong>{waistEase.word}</strong> ({waistEase.text} ease)
		</div>

		<label class="color">Garment color
			<input type="color" bind:value={garmentColor} />
		</label>

		<p class="note">
			Measurements are circumferences; the figure is scaled to your height so the
			trouser dimensions read true-to-size against your body.
		</p>
	</div>

	<div class="stage">
		<div class="view-toggle">
			<button class:active={view === '3d'} on:click={() => (view = '3d')}>🧍 3D</button>
			<button class:active={view === 'diagram'} on:click={() => (view = 'diagram')}>📐 Diagram</button>
		</div>

		{#if view === '3d'}
			<div class="opts">
				<div class="seg">
					<button class:on={garmentMode === 'cloth'} on:click={() => (garmentMode = 'cloth')}>🧵 Cloth sim</button>
					<button class:on={garmentMode === 'parametric'} on:click={() => (garmentMode = 'parametric')}>📐 Basic</button>
				</div>
				{#if garmentMode === 'cloth'}
					<label class="fab">Fabric
						<select bind:value={fabric}>
							{#each FABRICS as f}<option value={f}>{f}</option>{/each}
						</select>
					</label>
				{/if}
				<label><input type="checkbox" bind:checked={hideClothes} /> Hide avatar’s clothes</label>
				<label><input type="checkbox" bind:checked={showLabels} /> Labels</label>
				<label><input type="checkbox" bind:checked={autoRotate} /> Spin</label>
				<label title="Show detected skeleton (yellow) vs garment landmarks (cyan)"><input type="checkbox" bind:checked={debugSkeleton} /> 🦴 Debug</label>
			</div>
			<Viewer3D
				heightCm={body.heightIn * 2.54}
				waistCm={toCm(g.waist)}
				hipCm={toCm(g.hip)}
				riseCm={toCm(g.rise)}
				inseamCm={toCm(g.inseam)}
				thighCm={toCm(g.thigh)}
				legOpeningCm={toCm(g.legOpening)}
				{footLenCm}
				color={garmentColor}
				avatarUrl={resolvedUrl}
				{unit}
				hideAvatarClothes={hideClothes}
				{showLabels}
				{autoRotate}
				mode={garmentMode}
				{fabric}
				{debugSkeleton}
			/>
		{:else}
		<svg viewBox="0 0 {W} {H}" width="100%" height="100%">
			<defs>
				<marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
					<path d="M1,1 L4,4 L1,7" fill="none" stroke="#64748b" stroke-width="1" />
				</marker>
				<marker id="arrow2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
					<path d="M7,1 L4,4 L7,7" fill="none" stroke="#64748b" stroke-width="1" />
				</marker>
			</defs>

			<!-- ground line -->
			<line x1="20" y1={ground} x2={W - 10} y2={ground} stroke="#e2e8f0" stroke-width="1" />

			<!-- body silhouette -->
			<g class="bodyfig">
				<!-- head -->
				<ellipse
					cx={cx}
					cy={yOf(L.crown) + figure.headR}
					rx={figure.headR * 0.8}
					ry={figure.headR}
				/>
				<!-- torso -->
				<path
					d="M {cx - figure.shoulderHalf} {figure.yShoulder}
					   L {cx + figure.shoulderHalf} {figure.yShoulder}
					   L {cx + figure.hipHalf} {figure.yHip}
					   L {cx + trouser.hh * 0.7} {figure.yCrotch}
					   L {cx - trouser.hh * 0.7} {figure.yCrotch}
					   L {cx - figure.hipHalf} {figure.yHip} Z"
				/>
				<!-- legs -->
				<path
					d="M {cx + 2} {figure.yCrotch}
					   L {cx + trouser.hh * 0.7} {figure.yCrotch}
					   L {cx + trouser.hem * 0.6} {figure.yAnkle}
					   L {cx + 4} {figure.yAnkle} Z"
				/>
				<path
					d="M {cx - 2} {figure.yCrotch}
					   L {cx - trouser.hh * 0.7} {figure.yCrotch}
					   L {cx - trouser.hem * 0.6} {figure.yAnkle}
					   L {cx - 4} {figure.yAnkle} Z"
				/>
				<!-- feet -->
				<ellipse cx={cx - trouser.hem * 0.4} cy={ground - 3} rx={px(footLenCm) / 2} ry="5" />
				<ellipse cx={cx + trouser.hem * 0.4} cy={ground - 3} rx={px(footLenCm) / 2} ry="5" />
			</g>

			<!-- trousers overlay -->
			<path d={trouser.path} fill={garmentColor} fill-opacity="0.78" stroke={garmentColor} stroke-width="1.5" />

			<!-- dimensions -->
			{#each dims as d}
				{#if d.o === 'v'}
					<line
						x1={d.x}
						y1={d.y1}
						x2={d.x}
						y2={d.y2}
						stroke="#64748b"
						stroke-width="1"
						marker-start="url(#arrow)"
						marker-end="url(#arrow2)"
					/>
					<text
						x={d.x + (d.side === 'r' ? 5 : -5)}
						y={(d.y1 + d.y2) / 2}
						text-anchor={d.side === 'r' ? 'start' : 'end'}
						transform="rotate(-90 {d.x + (d.side === 'r' ? 5 : -5)} {(d.y1 + d.y2) / 2})"
						class="dimtext"
					>{d.text}</text>
				{:else}
					<line
						x1={d.x1}
						y1={d.y}
						x2={d.x2}
						y2={d.y}
						stroke="#64748b"
						stroke-width="1"
						marker-start="url(#arrow)"
						marker-end="url(#arrow2)"
					/>
					<text x={(d.x1 + d.x2) / 2} y={d.y - 4} text-anchor="middle" class="dimtext"
						>{d.text}</text
					>
				{/if}
			{/each}
		</svg>
		{/if}
	</div>
</section>

{#if showCreator}
	<AvatarCreator on:close={() => (showCreator = false)} />
{/if}

<style>
	.fit {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 24px;
		align-items: start;
	}
	.panel {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 14px;
		padding: 18px;
	}
	h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	h3 {
		margin: 18px 0 8px;
		font-size: 0.78rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #6b7280;
	}
	.unit-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.toggle {
		display: flex;
		background: #f3f4f6;
		border-radius: 8px;
		padding: 3px;
	}
	.toggle button {
		margin: 0;
		border: none;
		background: transparent;
		padding: 0.3em 0.7em;
		border-radius: 6px;
		cursor: pointer;
		color: #4b5563;
	}
	.toggle button.active {
		background: #fff;
		color: #111827;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.grid2 label,
	.color {
		display: flex;
		flex-direction: column;
		font-size: 0.78rem;
		color: #6b7280;
		gap: 3px;
	}
	.grid2 input {
		margin: 0;
		width: 100%;
	}
	.color {
		margin-top: 14px;
	}
	.color input {
		width: 60px;
		height: 34px;
		margin: 4px 0 0;
		padding: 2px;
	}
	.readout {
		margin: 10px 0 0;
		font-size: 0.85rem;
		color: #111827;
		font-weight: 600;
	}
	.avatar-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 6px;
	}
	.avatar-chip {
		margin: 0;
		border: 1px solid #e5e7eb;
		background: #fff;
		padding: 0.5em 0;
		border-radius: 8px;
		cursor: pointer;
		font-size: 0.72rem;
		font-weight: 600;
		color: #374151;
	}
	.bare-dot {
		color: #22c55e;
		font-size: 1.1em;
		line-height: 0;
	}
	.avatar-hint {
		font-size: 0.72rem;
		color: #6b7280;
		margin: 6px 0 0;
		line-height: 1.35;
	}
	.avatar-chip.active {
		background: #111827;
		color: #fff;
		border-color: #111827;
	}
	.import-row {
		display: flex;
		gap: 6px;
		margin-top: 8px;
	}
	.upload {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px dashed #cbd5e1;
		border-radius: 8px;
		padding: 0.5em;
		font-size: 0.74rem;
		color: #4b5563;
		cursor: pointer;
		text-align: center;
	}
	.upload input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
		margin: 0;
	}
	.ghost {
		margin: 0;
		border: 1px solid #e5e7eb;
		background: #fff;
		border-radius: 8px;
		padding: 0.5em 0.7em;
		cursor: pointer;
		font-size: 0.74rem;
		color: #374151;
		white-space: nowrap;
	}
	.ghost:hover {
		border-color: #9ca3af;
	}
	.url-row {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}
	.url-row input {
		flex: 1;
		margin: 0;
		font-size: 0.78rem;
	}
	.import-box {
		background: #f8fafc;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		padding: 12px;
		margin-bottom: 14px;
	}
	.import-label {
		display: block;
		font-size: 0.82rem;
		font-weight: 600;
		color: #111827;
		margin-bottom: 8px;
	}
	.primary-sm {
		margin: 0;
		border: none;
		background: #111827;
		color: #fff;
		border-radius: 8px;
		padding: 0 1em;
		cursor: pointer;
		font-weight: 600;
	}
	.primary-sm:disabled {
		background: #9ca3af;
	}
	.ease {
		font-size: 0.8rem;
		border-radius: 8px;
		padding: 8px 10px;
		margin: 10px 0 4px;
	}
	.ease-ok {
		background: #ecfdf5;
		color: #047857;
	}
	.ease-warn {
		background: #fffbeb;
		color: #b45309;
	}
	.ease-bad {
		background: #fef2f2;
		color: #b91c1c;
	}
	.opts {
		display: flex;
		gap: 14px;
		justify-content: center;
		margin: 0 auto 8px;
		font-size: 0.78rem;
		color: #4b5563;
	}
	.opts label {
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: pointer;
	}
	.opts .seg {
		display: inline-flex;
		border: 1px solid #d1d5db;
		border-radius: 7px;
		overflow: hidden;
	}
	.opts .seg button {
		margin: 0;
		border: none;
		background: #fff;
		padding: 4px 9px;
		font-size: 0.74rem;
		color: #4b5563;
		cursor: pointer;
	}
	.opts .seg button.on {
		background: #111827;
		color: #fff;
	}
	.opts .fab select {
		margin: 0;
		font-size: 0.74rem;
		padding: 2px 4px;
		border-radius: 6px;
		border: 1px solid #d1d5db;
	}
	.opts input {
		margin: 0;
	}
	.import-meas {
		display: flex;
		gap: 6px;
		margin-bottom: 6px;
	}
	.import-meas input {
		flex: 1;
		margin: 0;
		font-size: 0.78rem;
	}
	.paste {
		font-size: 0.78rem;
		color: #6b7280;
		margin-bottom: 6px;
	}
	.paste summary {
		cursor: pointer;
		padding: 2px 0;
	}
	.paste textarea {
		width: 100%;
		margin: 6px 0;
		font-size: 0.78rem;
		font-family: inherit;
		border: 1px solid #ccc;
		border-radius: 6px;
		padding: 6px;
		box-sizing: border-box;
	}
	.import-msg {
		margin: 0 0 8px;
		font-size: 0.76rem;
		color: #2563eb;
		line-height: 1.35;
	}
	.avatar-status {
		margin: 8px 0 0;
		font-size: 0.78rem;
		color: #16a34a;
	}
	.link {
		border: none;
		background: none;
		padding: 0;
		margin: 0;
		color: #2563eb;
		cursor: pointer;
		text-decoration: underline;
		font-size: inherit;
	}
	.note {
		margin-top: 16px;
		font-size: 0.75rem;
		color: #9ca3af;
		line-height: 1.4;
	}
	.stage {
		background: linear-gradient(160deg, #f8fafc, #eef2f7);
		border: 1px solid #e5e7eb;
		border-radius: 18px;
		padding: 8px;
		min-height: 660px;
	}
	.view-toggle {
		display: flex;
		gap: 4px;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 10px;
		padding: 4px;
		width: fit-content;
		margin: 4px auto 10px;
	}
	.view-toggle button {
		margin: 0;
		border: none;
		background: transparent;
		padding: 0.4em 1em;
		border-radius: 7px;
		cursor: pointer;
		color: #4b5563;
		font-weight: 500;
	}
	.view-toggle button.active {
		background: #111827;
		color: #fff;
	}
	.bodyfig :global(*) {
		fill: #cbd5e1;
		stroke: #b8c2cf;
		stroke-width: 1;
	}
	.dimtext {
		font-size: 11px;
		fill: #334155;
		font-weight: 600;
		paint-order: stroke;
		stroke: #f8fafc;
		stroke-width: 3px;
	}
	@media (max-width: 760px) {
		.fit {
			grid-template-columns: 1fr;
		}
	}
</style>
