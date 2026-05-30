<script>
	import { onMount } from 'svelte';

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

	let garmentColor = '#2f3a4a';
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

		<label class="color">Garment color
			<input type="color" bind:value={garmentColor} />
		</label>

		<p class="note">
			Measurements are circumferences; the figure is scaled to your height so the
			trouser dimensions read true-to-size against your body.
		</p>
	</div>

	<div class="stage">
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
	</div>
</section>

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
