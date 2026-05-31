<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
	import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

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
	export let avatarUrl = '';

	let container;
	let renderer, scene, camera, controls, frame;
	let bodyGroup, garmentGroup, avatarGroup;
	let ready = false;
	let loading = false;
	let loadError = '';
	let loadedUrl = null;
	let avatarBase = null; // { height, minY, cx, cz }

	const M = (cm) => cm / 100; // cm -> meters
	const rad = (circCm) => circCm / 100 / (2 * Math.PI); // circumference cm -> radius m

	$: useAvatar = !!avatarGroup;

	// ---------------- procedural mannequin (fallback) ----------------
	function buildBody() {
		clearGroup('bodyGroup');
		if (useAvatar) return;
		bodyGroup = new THREE.Group();
		const H = M(heightCm);
		const mat = new THREE.MeshStandardMaterial({ color: 0xcdd6e0, roughness: 0.9 });
		const lm = {
			ankle: 0.05 * H,
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
			bodyGroup.add(m);
		};
		add(new THREE.SphereGeometry(headR, 24, 24), 0, lm.crown - headR, 0);
		add(new THREE.CylinderGeometry(headR * 0.45, headR * 0.5, 0.06, 16), 0, lm.neck, 0);
		add(new THREE.CylinderGeometry(chestR, waistR, lm.shoulder - lm.waist, 28), 0, (lm.shoulder + lm.waist) / 2, 0);
		add(new THREE.CylinderGeometry(waistR, hipR, lm.waist - lm.crotch, 28), 0, (lm.waist + lm.crotch) / 2, 0);
		add(new THREE.SphereGeometry(chestR * 0.98, 24, 16), 0, lm.shoulder, 0);
		const legX = hipR * 0.5;
		for (const sx of [-1, 1]) {
			add(new THREE.CylinderGeometry(legR, legR * 0.7, lm.crotch - lm.ankle, 20), sx * legX, (lm.crotch + lm.ankle) / 2, 0);
			add(new THREE.BoxGeometry(legR * 1.6, lm.ankle, M(footLenCm)), sx * legX, lm.ankle / 2, M(footLenCm) / 2 - legR);
		}
		const armH = (lm.shoulder - lm.waist) * 1.35;
		const armX = chestR + armR;
		for (const sx of [-1, 1]) {
			add(new THREE.CylinderGeometry(armR, armR * 0.7, armH, 16), sx * armX, lm.shoulder - armH / 2, 0);
		}
		scene.add(bodyGroup);
	}

	// ---------------- garment (always) ----------------
	function buildGarment() {
		clearGroup('garmentGroup');
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
			opacity: 0.92,
			side: THREE.DoubleSide
		});
		const add = (geo, x, y) => {
			const m = new THREE.Mesh(geo, mat);
			m.position.set(x, y, 0);
			garmentGroup.add(m);
		};
		add(new THREE.CylinderGeometry(waistR, hipR, waistY - crotchY, 32, 1, true), 0, (waistY + crotchY) / 2);
		add(new THREE.CylinderGeometry(waistR * 1.04, waistR * 1.04, Math.min(0.04, (waistY - crotchY) * 0.25), 32, 1, true), 0, waistY - 0.02);
		const legX = hipR * 0.5;
		for (const sx of [-1, 1]) {
			add(new THREE.CylinderGeometry(thighR, hemR, crotchY - hemY, 28, 1, true), sx * legX, (crotchY + hemY) / 2);
			add(new THREE.CylinderGeometry(hemR, hemR, 0.015, 28, 1, true), sx * legX, hemY);
		}
		scene.add(garmentGroup);
	}

	function clearGroup(name) {
		const g = name === 'bodyGroup' ? bodyGroup : name === 'garmentGroup' ? garmentGroup : avatarGroup;
		if (!g) return;
		scene.remove(g);
		g.traverse((o) => {
			if (o.geometry) o.geometry.dispose();
			if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
		});
		if (name === 'bodyGroup') bodyGroup = null;
		else if (name === 'garmentGroup') garmentGroup = null;
		else avatarGroup = null;
	}

	// ---------------- avatar (Ready Player Me GLB) ----------------
	function makeLoader() {
		const draco = new DRACOLoader();
		draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
		const loader = new GLTFLoader();
		loader.setDRACOLoader(draco);
		loader.setMeshoptDecoder(MeshoptDecoder);
		loader.setCrossOrigin('anonymous');
		return loader;
	}

	function loadAvatar(url) {
		loadError = '';
		if (!url) {
			clearGroup('avatarGroup');
			avatarBase = null;
			loadedUrl = '';
			buildBody();
			return;
		}
		loading = true;
		const sep = url.includes('?') ? '&' : '?';
		const full = `${url}${sep}meshLod=1&textureSizeLimit=1024&useDracoMeshCompression=false`;
		makeLoader().load(
			full,
			(gltf) => {
				clearGroup('avatarGroup');
				avatarGroup = gltf.scene;
				avatarGroup.traverse((o) => {
					if (o.isMesh) {
						o.castShadow = true;
						o.frustumCulled = false;
					}
				});
				avatarGroup.scale.setScalar(1);
				avatarGroup.updateMatrixWorld(true);
				const box = new THREE.Box3().setFromObject(avatarGroup);
				avatarBase = {
					height: box.max.y - box.min.y || 1.7,
					minY: box.min.y,
					cx: (box.max.x + box.min.x) / 2,
					cz: (box.max.z + box.min.z) / 2
				};
				scene.add(avatarGroup);
				clearGroup('bodyGroup');
				loadedUrl = url;
				loading = false;
				scaleAvatar();
			},
			undefined,
			(err) => {
				console.error('avatar load failed', err);
				loading = false;
				loadError = 'Could not load avatar — showing mannequin instead.';
				avatarGroup = null;
				avatarBase = null;
				loadedUrl = url; // don't retry endlessly
				buildBody();
			}
		);
	}

	function scaleAvatar() {
		if (!avatarGroup || !avatarBase) return;
		const s = M(heightCm) / avatarBase.height;
		avatarGroup.scale.setScalar(s);
		avatarGroup.position.set(-avatarBase.cx * s, -avatarBase.minY * s, -avatarBase.cz * s);
	}

	function update() {
		if (!ready) return;
		buildGarment();
		if (useAvatar) {
			clearGroup('bodyGroup');
			scaleAvatar();
		} else {
			buildBody();
		}
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
		renderer.outputColorSpace = THREE.SRGBColorSpace;
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
		scene.add(new THREE.GridHelper(4, 16, 0xc7d0db, 0xdce3ea));
		ready = true;
		if (avatarUrl) loadAvatar(avatarUrl);
		else update();
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
		camera.aspect = container.clientWidth / container.clientHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(container.clientWidth, container.clientHeight);
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

	// react to avatar url changes
	$: if (ready && avatarUrl !== loadedUrl && !loading) loadAvatar(avatarUrl);
	// react to measurement / color changes
	$: heightCm, waistCm, hipCm, riseCm, inseamCm, thighCm, legOpeningCm, footLenCm, color, update();
</script>

<div class="viewer" bind:this={container}>
	{#if loading}
		<div class="status">Loading your avatar…</div>
	{:else if loadError}
		<div class="status err">{loadError}</div>
	{/if}
</div>
<p class="hint">Drag to rotate · scroll to zoom · right-drag to pan</p>

<style>
	.viewer {
		position: relative;
		width: 100%;
		height: 600px;
		border-radius: 16px;
		overflow: hidden;
		background: #eef2f7;
	}
	.status {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: rgba(17, 24, 39, 0.8);
		color: #fff;
		padding: 6px 14px;
		border-radius: 999px;
		font-size: 0.8rem;
		z-index: 2;
	}
	.status.err {
		background: rgba(220, 38, 38, 0.9);
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
