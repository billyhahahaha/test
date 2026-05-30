<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

	// all measurements in cm
	export let heightCm = 190.5;
	export let waistCm = 84;
	export let hipCm = 104;
	export let riseCm = 28;
	export let inseamCm = 86;
	export let thighCm = 61;
	export let legOpeningCm = 38;
	export let footLenCm = 28.8;
	export let color = '#2f3a4a';

	let container;
	let renderer, scene, camera, controls, frame;
	let bodyGroup, garmentGroup;
	let ready = false;

	const M = (cm) => cm / 100; // cm -> meters
	const rad = (circCm) => circCm / 100 / (2 * Math.PI); // circumference cm -> radius m

	function buildBody() {
		if (bodyGroup) {
			scene.remove(bodyGroup);
			bodyGroup.traverse((o) => o.geometry && o.geometry.dispose());
		}
		bodyGroup = new THREE.Group();
		const H = M(heightCm);
		const mat = new THREE.MeshStandardMaterial({ color: 0xcdd6e0, roughness: 0.9, metalness: 0 });

		// landmark heights (m from ground)
		const lm = {
			ankle: 0.05 * H,
			knee: 0.285 * H,
			crotch: 0.47 * H,
			waist: 0.6 * H,
			shoulder: 0.82 * H,
			neck: 0.86 * H,
			crown: H
		};

		const waistR = Math.max(rad(waistCm), 0.06);
		const hipR = Math.max(rad(hipCm), waistR);
		const chestR = hipR * 1.02;
		const legR = Math.max(rad(thighCm) * 0.92, 0.05);
		const armR = legR * 0.55;
		const headR = H / 15;

		const add = (geo, x, y, z = 0) => {
			const m = new THREE.Mesh(geo, mat);
			m.position.set(x, y, z);
			m.castShadow = true;
			bodyGroup.add(m);
			return m;
		};

		// head
		add(new THREE.SphereGeometry(headR, 24, 24), 0, lm.crown - headR, 0);
		// neck
		add(new THREE.CylinderGeometry(headR * 0.45, headR * 0.5, lm.crown - headR * 2 - lm.neck + 0.02, 16), 0, (lm.crown - headR * 2 + lm.neck) / 2, 0);
		// torso (shoulder -> waist), tapered
		const torsoH = lm.shoulder - lm.waist;
		add(new THREE.CylinderGeometry(chestR, waistR, torsoH, 28), 0, (lm.shoulder + lm.waist) / 2, 0);
		// pelvis (waist -> crotch)
		const pelvisH = lm.waist - lm.crotch;
		add(new THREE.CylinderGeometry(waistR, hipR, pelvisH, 28), 0, (lm.waist + lm.crotch) / 2, 0);
		// shoulders cap
		add(new THREE.SphereGeometry(chestR * 0.98, 24, 16), 0, lm.shoulder, 0);

		// legs (crotch -> ankle)
		const legH = lm.crotch - lm.ankle;
		const legX = hipR * 0.5;
		for (const sx of [-1, 1]) {
			add(new THREE.CylinderGeometry(legR, legR * 0.7, legH, 20), sx * legX, (lm.crotch + lm.ankle) / 2, 0);
			// foot
			const foot = add(new THREE.BoxGeometry(legR * 1.6, lm.ankle, M(footLenCm)), sx * legX, lm.ankle / 2, M(footLenCm) / 2 - legR);
		}
		// arms (shoulder -> wrist)
		const armH = (lm.shoulder - lm.waist) * 1.35;
		const armX = chestR + armR;
		for (const sx of [-1, 1]) {
			add(new THREE.CylinderGeometry(armR, armR * 0.7, armH, 16), sx * armX, lm.shoulder - armH / 2, 0);
			add(new THREE.SphereGeometry(armR * 1.05, 16, 12), sx * armX, lm.shoulder, 0);
		}

		scene.add(bodyGroup);
	}

	function buildGarment() {
		if (garmentGroup) {
			scene.remove(garmentGroup);
			garmentGroup.traverse((o) => o.geometry && o.geometry.dispose());
		}
		garmentGroup = new THREE.Group();
		const H = M(heightCm);
		const waistY = 0.6 * H;
		const crotchY = waistY - M(riseCm);
		const hemY = crotchY - M(inseamCm);

		const waistR = rad(waistCm) * 1.06;
		const hipR = rad(hipCm) * 1.06;
		const thighR = rad(thighCm) * 1.06;
		const hemR = rad(legOpeningCm) * 1.06;

		const mat = new THREE.MeshStandardMaterial({
			color: new THREE.Color(color),
			roughness: 0.6,
			metalness: 0.02,
			transparent: true,
			opacity: 0.9,
			side: THREE.DoubleSide
		});

		const add = (geo, x, y, z = 0) => {
			const m = new THREE.Mesh(geo, mat);
			m.position.set(x, y, z);
			garmentGroup.add(m);
		};

		// pelvis block (waist -> crotch)
		const pelvisH = waistY - crotchY;
		add(new THREE.CylinderGeometry(waistR, hipR, pelvisH, 32, 1, true), 0, (waistY + crotchY) / 2, 0);
		// waistband
		add(new THREE.CylinderGeometry(waistR * 1.04, waistR * 1.04, Math.min(0.04, pelvisH * 0.25), 32, 1, true), 0, waistY - 0.02, 0);
		// legs (crotch -> hem)
		const legH = crotchY - hemY;
		const legX = hipR * 0.5;
		for (const sx of [-1, 1]) {
			add(new THREE.CylinderGeometry(thighR, hemR, legH, 28, 1, true), sx * legX, (crotchY + hemY) / 2, 0);
			// hem ring cap
			add(new THREE.CylinderGeometry(hemR, hemR, 0.015, 28, 1, true), sx * legX, hemY, 0);
		}

		scene.add(garmentGroup);
	}

	function rebuild() {
		if (!ready) return;
		buildBody();
		buildGarment();
		frameCamera();
	}

	function frameCamera() {
		const H = M(heightCm);
		controls.target.set(0, H * 0.5, 0);
		controls.update();
	}

	function init() {
		const w = container.clientWidth;
		const h = container.clientHeight;

		scene = new THREE.Scene();
		scene.background = new THREE.Color(0xeef2f7);

		camera = new THREE.PerspectiveCamera(38, w / h, 0.05, 100);
		camera.position.set(0, M(heightCm) * 0.55, M(heightCm) * 1.9);

		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(w, h);
		container.appendChild(renderer.domElement);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.minDistance = 0.8;
		controls.maxDistance = 8;

		scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b2, 1.1));
		const dir = new THREE.DirectionalLight(0xffffff, 1.4);
		dir.position.set(2, 4, 3);
		scene.add(dir);
		const dir2 = new THREE.DirectionalLight(0xffffff, 0.5);
		dir2.position.set(-3, 2, -2);
		scene.add(dir2);

		// ground grid
		const grid = new THREE.GridHelper(4, 16, 0xc7d0db, 0xdce3ea);
		grid.position.y = 0;
		scene.add(grid);

		ready = true;
		rebuild();

		const loop = () => {
			frame = requestAnimationFrame(loop);
			controls.update();
			renderer.render(scene, camera);
		};
		loop();

		window.addEventListener('resize', onResize);
	}

	function onResize() {
		if (!renderer || !container) return;
		const w = container.clientWidth;
		const h = container.clientHeight;
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
		renderer.setSize(w, h);
	}

	onMount(init);

	onDestroy(() => {
		cancelAnimationFrame(frame);
		window.removeEventListener('resize', onResize);
		if (renderer) {
			renderer.dispose();
			renderer.domElement.remove();
		}
	});

	// rebuild geometry whenever measurements/color change
	$: heightCm, waistCm, hipCm, riseCm, inseamCm, thighCm, legOpeningCm, footLenCm, color, rebuild();
</script>

<div class="viewer" bind:this={container}></div>
<p class="hint">Drag to rotate · scroll to zoom · right-drag to pan</p>

<style>
	.viewer {
		width: 100%;
		height: 600px;
		border-radius: 16px;
		overflow: hidden;
		background: #eef2f7;
	}
	.hint {
		text-align: center;
		font-size: 0.78rem;
		color: #9ca3af;
		margin: 8px 0 0;
	}
	.viewer :global(canvas) {
		display: block;
	}
</style>
