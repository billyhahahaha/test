import * as THREE from 'three';

// Position-Based-Dynamics cloth trousers generated from measurements.
//
// We build a low-ish-res tubular mesh (pelvis tube + two leg tubes) sized from
// the garment measurements with a little ease, then relax it under gravity with
// distance + bending constraints while colliding against capsule/sphere
// colliders approximating the legs and hips. Bending stiffness is driven by the
// fabric: gabardine is stiff, so it forms broad, crisp folds rather than soft
// crumples.
//
// This is a real (if lightweight) cloth solve — folds and drape emerge from the
// measurements + material, not from hand-modelled geometry. It is not a
// production cloth simulator and won't match a photoreal render.

const GRAV = new THREE.Vector3(0, -9.8, 0);

// Fabric presets: bending = how much the cloth resists folding (0..1),
// stretch = structural stiffness, mass scales drape.
export const FABRICS = {
	gabardine: { bend: 0.92, stretch: 0.98, mass: 1.0, roughness: 0.58, sheen: 0.55 },
	wool: { bend: 0.7, stretch: 0.95, mass: 1.2, roughness: 0.8, sheen: 0.25 },
	cotton: { bend: 0.55, stretch: 0.9, mass: 1.0, roughness: 0.85, sheen: 0.1 },
	denim: { bend: 0.85, stretch: 0.97, mass: 1.4, roughness: 0.9, sheen: 0.08 },
	silk: { bend: 0.18, stretch: 0.8, mass: 0.7, roughness: 0.4, sheen: 0.9 },
	linen: { bend: 0.6, stretch: 0.92, mass: 0.9, roughness: 0.9, sheen: 0.12 }
};

export function buildClothTrousers(opts) {
	const {
		heightCm = 187,
		waistCm = 84,
		hipCm = 104,
		riseCm = 28,
		inseamCm = 86,
		thighCm = 61,
		legOpeningCm = 38,
		color = '#23262b',
		fabric = 'gabardine',
		ease = 1.12
	} = opts;

	const fab = FABRICS[fabric] || FABRICS.gabardine;
	const M = (cm) => cm / 100;
	const rad = (cm) => (cm / 100) / (2 * Math.PI);

	const SEG = 28; // segments around each tube
	const H = M(heightCm);
	const waistY = 0.6 * H;
	const hipY = 0.53 * H;
	const crotchY = waistY - M(riseCm);
	const hemY = crotchY - M(inseamCm);
	const kneeY = crotchY - (crotchY - hemY) * 0.5;

	const waistR = rad(waistCm) * ease;
	const hipR = rad(hipCm) * ease;
	const thighR = rad(thighCm) * ease;
	const hemR = rad(legOpeningCm) * ease;
	const kneeR = thighR * 0.6 + hemR * 0.4;
	const legX = hipR * 0.5;

	// collider radii: the actual limb the cloth rests on (a bit smaller than the
	// garment so there is slack to fold).
	const legColR = thighR * 0.78;
	const kneeColR = kneeR * 0.8;
	const ankleColR = hemR * 0.7;

	// ---- particle buffers ----
	const pos = [];
	const prev = [];
	const invMass = [];
	const uvList = [];
	const tubes = []; // { rings: number[][], seg }

	function addTube(centerX, profile, pinTop) {
		// profile: array of { y, r, v } from top to bottom
		const rings = [];
		for (let ri = 0; ri < profile.length; ri++) {
			const { y, r, v } = profile[ri];
			const ring = [];
			for (let s = 0; s < SEG; s++) {
				const a = (s / SEG) * Math.PI * 2;
				const x = centerX + Math.cos(a) * r;
				const z = Math.sin(a) * r;
				const idx = pos.length / 3;
				pos.push(x, y, z);
				prev.push(x, y, z);
				// pin the very top ring (waistband) so the trousers hang from the waist
				invMass.push(pinTop && ri === 0 ? 0 : 1 / fab.mass);
				uvList.push(s / SEG, v);
				ring.push(idx);
			}
			rings.push(ring);
		}
		tubes.push({ rings });
		return rings;
	}

	// pelvis tube: waist -> hip -> crotch
	addTube(0, [
		{ y: waistY, r: waistR, v: 0 },
		{ y: (waistY + hipY) / 2, r: (waistR + hipR) / 2, v: 0.05 },
		{ y: hipY, r: hipR, v: 0.1 },
		{ y: (hipY + crotchY) / 2, r: hipR * 1.01, v: 0.16 },
		{ y: crotchY, r: hipR * 0.92, v: 0.22 }
	], true);

	// each leg: crotch -> knee -> hem
	for (const sx of [-1, 1]) {
		const legProfile = [];
		const RINGS = 14;
		for (let i = 0; i <= RINGS; i++) {
			const t = i / RINGS;
			const y = crotchY + (hemY - crotchY) * t;
			let r;
			if (y > kneeY) {
				const tt = (crotchY - y) / (crotchY - kneeY);
				r = thighR + (kneeR - thighR) * tt;
			} else {
				const tt = (kneeY - y) / (kneeY - hemY);
				r = kneeR + (hemR - kneeR) * tt;
			}
			legProfile.push({ y, r, v: 0.25 + t * 0.75 });
		}
		addTube(sx * legX, legProfile, false);
	}

	const N = pos.length / 3;
	const P = new Float32Array(pos);
	const PV = new Float32Array(prev);
	const W = new Float32Array(invMass);

	// ---- constraints ----
	const constraints = []; // [i, j, restLen, stiffness]
	const tmp = new THREE.Vector3();
	function dist(i, j) {
		const ix = i * 3, jx = j * 3;
		const dx = P[ix] - P[jx], dy = P[ix + 1] - P[jx + 1], dz = P[ix + 2] - P[jx + 2];
		return Math.hypot(dx, dy, dz);
	}
	function addC(i, j, k) {
		constraints.push([i, j, dist(i, j), k]);
	}

	for (const { rings } of tubes) {
		const R = rings.length;
		for (let ri = 0; ri < R; ri++) {
			const ring = rings[ri];
			// around (structural)
			for (let s = 0; s < SEG; s++) addC(ring[s], ring[(s + 1) % SEG], fab.stretch);
			// down (structural) + bending (skip-one)
			if (ri < R - 1) for (let s = 0; s < SEG; s++) addC(ring[s], rings[ri + 1][s], fab.stretch);
			if (ri < R - 2) for (let s = 0; s < SEG; s++) addC(ring[s], rings[ri + 2][s], fab.bend);
			// shear (diagonals) for a bit of stability
			if (ri < R - 1) for (let s = 0; s < SEG; s++) addC(ring[s], rings[ri + 1][(s + 1) % SEG], fab.stretch * 0.6);
		}
	}

	// stitch pelvis bottom ring to each leg top ring (front + back halves)
	const pelvisBottom = tubes[0].rings[tubes[0].rings.length - 1];
	const legLtop = tubes[1].rings[0];
	const legRtop = tubes[2].rings[0];
	for (let s = 0; s < SEG; s++) {
		// map pelvis segment to nearest leg by x
		const target = Math.cos((s / SEG) * Math.PI * 2) < 0 ? legLtop : legRtop;
		addC(pelvisBottom[s], target[s], fab.stretch * 0.8);
	}

	// ---- colliders ----
	const legColliders = [];
	for (const sx of [-1, 1]) {
		legColliders.push({ x: sx * legX, top: crotchY, mid: kneeY, bot: hemY, rTop: legColR, rMid: kneeColR, rBot: ankleColR });
	}
	const hip = { y: (hipY + crotchY) / 2, r: hipR * 0.82 };

	function collide() {
		for (let i = 0; i < N; i++) {
			if (W[i] === 0) continue;
			const ix = i * 3;
			let x = P[ix], y = P[ix + 1], z = P[ix + 2];
			// hip sphere-ish (xz radius) above crotch
			if (y > crotchY - 0.02) {
				const d = Math.hypot(x, z);
				if (d < hip.r && d > 1e-5) {
					const push = hip.r / d;
					x *= push; z *= push;
				}
			}
			// legs: radial capsule in xz around each leg axis, radius lerped by y
			for (const c of legColliders) {
				if (y > c.top + 0.05 || y < c.bot - 0.02) continue;
				let r;
				if (y > c.mid) {
					const t = (c.top - y) / (c.top - c.mid);
					r = c.rTop + (c.rMid - c.rTop) * t;
				} else {
					const t = (c.mid - y) / (c.mid - c.bot);
					r = c.rMid + (c.rBot - c.rMid) * t;
				}
				const dx = x - c.x, dz = z;
				const d = Math.hypot(dx, dz);
				if (d < r && d > 1e-5) {
					const push = r / d;
					x = c.x + dx * push;
					z = dz * push;
				}
			}
			P[ix] = x; P[ix + 1] = y; P[ix + 2] = z;
		}
	}

	const dt = 1 / 60;
	const damping = 0.97;
	function integrate() {
		const g = GRAV;
		for (let i = 0; i < N; i++) {
			if (W[i] === 0) continue;
			const ix = i * 3;
			for (let a = 0; a < 3; a++) {
				const cur = P[ix + a];
				const vel = (cur - PV[ix + a]) * damping;
				PV[ix + a] = cur;
				P[ix + a] = cur + vel + (a === 1 ? g.y : 0) * dt * dt;
			}
		}
	}

	function solve(iter) {
		for (let k = 0; k < iter; k++) {
			for (let c = 0; c < constraints.length; c++) {
				const [i, j, rest, stiff] = constraints[c];
				const ix = i * 3, jx = j * 3;
				const wi = W[i], wj = W[j];
				const wsum = wi + wj;
				if (wsum === 0) continue;
				let dx = P[ix] - P[jx], dy = P[ix + 1] - P[jx + 1], dz = P[ix + 2] - P[jx + 2];
				const d = Math.hypot(dx, dy, dz) || 1e-6;
				const diff = ((d - rest) / d) * stiff;
				const fx = dx * diff, fy = dy * diff, fz = dz * diff;
				if (wi) { P[ix] -= fx * (wi / wsum); P[ix + 1] -= fy * (wi / wsum); P[ix + 2] -= fz * (wi / wsum); }
				if (wj) { P[jx] += fx * (wj / wsum); P[jx + 1] += fy * (wj / wsum); P[jx + 2] += fz * (wj / wsum); }
			}
		}
	}

	// ---- geometry ----
	const indices = [];
	for (const { rings } of tubes) {
		for (let ri = 0; ri < rings.length - 1; ri++) {
			for (let s = 0; s < SEG; s++) {
				const a = rings[ri][s];
				const b = rings[ri][(s + 1) % SEG];
				const c = rings[ri + 1][s];
				const d = rings[ri + 1][(s + 1) % SEG];
				indices.push(a, c, b, b, c, d);
			}
		}
	}
	const geom = new THREE.BufferGeometry();
	geom.setAttribute('position', new THREE.BufferAttribute(P, 3));
	geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvList, 2));
	geom.setIndex(indices);

	const base = new THREE.Color(color);
	const mat = new THREE.MeshPhysicalMaterial({
		color: base,
		roughness: fab.roughness,
		metalness: 0,
		sheen: fab.sheen,
		sheenRoughness: 0.5,
		sheenColor: base.clone().lerp(new THREE.Color(0xffffff), 0.3),
		side: THREE.DoubleSide,
		clearcoat: 0.03
	});
	const mesh = new THREE.Mesh(geom, mat);
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.frustumCulled = false;

	// settle the drape
	function settle(steps = 90) {
		for (let s = 0; s < steps; s++) {
			integrate();
			solve(8);
			collide();
		}
		geom.computeVertexNormals();
		geom.attributes.position.needsUpdate = true;
	}

	// a few live steps per frame (optional, for gentle motion)
	function step() {
		integrate();
		solve(6);
		collide();
		geom.computeVertexNormals();
		geom.attributes.position.needsUpdate = true;
	}

	settle(110);

	return {
		mesh,
		settle,
		step,
		dispose() {
			geom.dispose();
			mat.dispose();
		}
	};
}
