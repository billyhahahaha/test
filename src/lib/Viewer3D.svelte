<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
	import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
	import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
	import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

	// measurements in cm
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
	export let unit = 'in';
	export let hideAvatarClothes = true;
	export let showLabels = false;
	export let autoRotate = false;

	let container;
	let renderer, scene, camera, controls, frame, pmrem;
	let bodyGroup, garmentGroup, avatarGroup, labelGroup, shadowPlane;
	let clothingMeshes = [];
	let ready = false;
	let loading = false;
	let loadError = '';
	let loadedUrl = null;
	let avatarBase = null;

	const M = (cm) => cm / 100;
	const rad = (circCm) => circCm / 100 / (2 * Math.PI);
	$: useAvatar = !!avatarGroup;

	const fmtLen = (cm) => (unit === 'in' ? `${Math.round(cm / 2.54)}"` : `${Math.round(cm)}cm`);

	// ---------- procedural mannequin (fallback) ----------
	function buildBody() {
		clearGroup('bodyGroup');
		if (useAvatar) return;
		bodyGroup = new THREE.Group();
		const H = M(heightCm);
		const mat = new THREE.MeshStandardMaterial({ color: 0xc3ccd6, roughness: 0.85, metalness: 0 });
		const lm = { ankle: 0.05 * H, crotch: 0.47 * H, waist: 0.6 * H, shoulder: 0.82 * H, neck: 0.86 * H, crown: H };
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

	// ---------- garment ----------
	function buildGarment() {
		clearGroup('garmentGroup');
		clearGroup('labelGroup');
		garmentGroup = new THREE.Group();
		labelGroup = new THREE.Group();
		const H = M(heightCm);
		const waistY = 0.6 * H;
		const hipY = 0.53 * H;
		const crotchY = waistY - M(riseCm);
		const hemY = crotchY - M(inseamCm);
		const kneeY = crotchY - (crotchY - hemY) * 0.55;
		const ease = 1.06;
		const waistR = rad(waistCm) * ease;
		const hipR = rad(hipCm) * ease;
		const thighR = rad(thighCm) * ease;
		const hemR = rad(legOpeningCm) * ease;
		const kneeR = thighR * 0.62 + hemR * 0.38; // tapered through the knee
		const base = new THREE.Color(color);
		const mat = new THREE.MeshPhysicalMaterial({
			color: base,
			roughness: 0.6,
			metalness: 0.0,
			sheen: 0.6,
			sheenRoughness: 0.55,
			sheenColor: base.clone().lerp(new THREE.Color(0xffffff), 0.35),
			clearcoat: 0.04
		});
		const add = (geo, x, y, z = 0) => {
			const m = new THREE.Mesh(geo, mat);
			m.position.set(x, y, z);
			m.castShadow = true;
			m.receiveShadow = true;
			garmentGroup.add(m);
		};
		// pelvis: waist -> hip -> crotch
		add(new THREE.CylinderGeometry(waistR, hipR, waistY - hipY, 48, 1, true), 0, (waistY + hipY) / 2);
		add(new THREE.CylinderGeometry(hipR, hipR * 1.02, hipY - crotchY, 48, 1, true), 0, (hipY + crotchY) / 2);
		// waistband (solid ring)
		const wbH = Math.min(0.05, (waistY - crotchY) * 0.32);
		add(new THREE.CylinderGeometry(waistR * 1.04, waistR * 1.04, wbH, 48), 0, waistY - wbH / 2);
		// six belt loops
		const loopGeo = new THREE.BoxGeometry(0.012, wbH * 1.5, 0.016);
		for (const deg of [22, -22, 78, -78, 150, -150]) {
			const a = (deg * Math.PI) / 180;
			const m = new THREE.Mesh(loopGeo, mat);
			m.position.set(Math.sin(a) * waistR * 1.05, waistY - wbH / 2, Math.cos(a) * waistR * 1.05);
			m.rotation.y = a;
			m.castShadow = true;
			garmentGroup.add(m);
		}
		// legs: thigh -> knee -> hem (tapered), with a small ankle break + crease
		const legX = hipR * 0.5;
		for (const sx of [-1, 1]) {
			add(new THREE.CylinderGeometry(thighR, kneeR, crotchY - kneeY, 36, 1, true), sx * legX, (crotchY + kneeY) / 2);
			add(new THREE.CylinderGeometry(kneeR, hemR, kneeY - hemY, 36, 1, true), sx * legX, (kneeY + hemY) / 2);
			add(new THREE.CylinderGeometry(hemR, hemR, 0.02, 36), sx * legX, hemY);
			// front leg crease (subtle raised seam)
			const crease = new THREE.Mesh(
				new THREE.BoxGeometry(0.006, crotchY - hemY, 0.004),
				mat
			);
			crease.position.set(sx * legX, (crotchY + hemY) / 2, (thighR + hemR) / 2);
			crease.castShadow = true;
			garmentGroup.add(crease);
		}
		scene.add(garmentGroup);

		// dimension labels
		const L = [
			{ t: `Waist ${fmtLen(waistCm)}`, p: [waistR + 0.12, waistY, 0] },
			{ t: `Hip ${fmtLen(hipCm)}`, p: [hipR + 0.12, hipY, 0] },
			{ t: `Rise ${fmtLen(riseCm)}`, p: [0.02, (waistY + crotchY) / 2, hipR + 0.1] },
			{ t: `Thigh ${fmtLen(thighCm)}`, p: [legX + thighR + 0.1, crotchY - 0.05, 0] },
			{ t: `Inseam ${fmtLen(inseamCm)}`, p: [0.02, (crotchY + hemY) / 2, hemR + 0.12] },
			{ t: `Hem ${fmtLen(legOpeningCm)}`, p: [legX + hemR + 0.1, hemY, 0] }
		];
		for (const item of L) {
			const s = makeLabel(item.t);
			s.position.set(item.p[0], item.p[1], item.p[2]);
			labelGroup.add(s);
		}
		labelGroup.visible = showLabels;
		scene.add(labelGroup);
	}

	function makeLabel(text) {
		const fs = 44;
		const pad = 18;
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		ctx.font = `600 ${fs}px -apple-system, Segoe UI, sans-serif`;
		const w = Math.ceil(ctx.measureText(text).width);
		canvas.width = w + pad * 2;
		canvas.height = fs + pad * 2;
		ctx.font = `600 ${fs}px -apple-system, Segoe UI, sans-serif`;
		const r = 16;
		ctx.fillStyle = 'rgba(17,24,39,0.88)';
		ctx.beginPath();
		ctx.moveTo(r, 0);
		ctx.arcTo(canvas.width, 0, canvas.width, canvas.height, r);
		ctx.arcTo(canvas.width, canvas.height, 0, canvas.height, r);
		ctx.arcTo(0, canvas.height, 0, 0, r);
		ctx.arcTo(0, 0, canvas.width, 0, r);
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, pad, canvas.height / 2);
		const tex = new THREE.CanvasTexture(canvas);
		tex.anisotropy = 4;
		const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
		const sc = 0.0017;
		spr.scale.set(canvas.width * sc, canvas.height * sc, 1);
		return spr;
	}

	function clearGroup(name) {
		const g = { bodyGroup, garmentGroup, avatarGroup, labelGroup }[name];
		if (!g) return;
		scene.remove(g);
		g.traverse((o) => {
			if (o.geometry) o.geometry.dispose();
			if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
				if (m.map) m.map.dispose();
				m.dispose();
			});
		});
		if (name === 'bodyGroup') bodyGroup = null;
		else if (name === 'garmentGroup') garmentGroup = null;
		else if (name === 'labelGroup') labelGroup = null;
		else avatarGroup = null;
	}

	// ---------- avatar ----------
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
		clothingMeshes = [];
		if (!url) {
			clearGroup('avatarGroup');
			avatarBase = null;
			loadedUrl = '';
			buildBody();
			return;
		}
		loading = true;
		const isRPM = /readyplayer\.me/.test(url);
		const full = isRPM
			? `${url}${url.includes('?') ? '&' : '?'}meshLod=1&textureSizeLimit=1024&useDracoMeshCompression=false`
			: url;
		makeLoader().load(
			full,
			(gltf) => {
				clearGroup('avatarGroup');
				avatarGroup = gltf.scene;
				clothingMeshes = [];
				avatarGroup.traverse((o) => {
					if (o.isMesh) {
						o.castShadow = true;
						o.frustumCulled = false;
						if (/avaturn_look|outfit|cloth|bottom|trouser|pant/i.test(o.name)) clothingMeshes.push(o);
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
				applyClothesVisibility();
				scaleAvatar();
			},
			undefined,
			(err) => {
				console.error('avatar load failed', err);
				loading = false;
				loadError = 'Could not load avatar — showing mannequin instead.';
				avatarGroup = null;
				avatarBase = null;
				loadedUrl = url;
				buildBody();
			}
		);
	}

	function applyClothesVisibility() {
		for (const m of clothingMeshes) m.visible = !hideAvatarClothes;
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
		scene.background = new THREE.Color(0xeef2f6);
		camera = new THREE.PerspectiveCamera(35, w / h, 0.05, 100);
		camera.position.set(0.5, M(heightCm) * 0.55, M(heightCm) * 1.7);
		renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		renderer.setSize(w, h);
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.05;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;
		container.appendChild(renderer.domElement);

		pmrem = new THREE.PMREMGenerator(renderer);
		scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.minDistance = 0.7;
		controls.maxDistance = 8;
		controls.autoRotate = autoRotate;
		controls.autoRotateSpeed = 1.4;

		const key = new THREE.DirectionalLight(0xffffff, 2.2);
		key.position.set(1.5, 3, 2.5);
		key.castShadow = true;
		key.shadow.mapSize.set(2048, 2048);
		key.shadow.camera.near = 0.5;
		key.shadow.camera.far = 12;
		key.shadow.camera.left = -1.5;
		key.shadow.camera.right = 1.5;
		key.shadow.camera.top = 3;
		key.shadow.camera.bottom = -0.5;
		key.shadow.bias = -0.0004;
		scene.add(key);
		scene.add(new THREE.HemisphereLight(0xffffff, 0xb9c2cc, 0.5));

		// soft contact shadow
		shadowPlane = new THREE.Mesh(
			new THREE.PlaneGeometry(6, 6),
			new THREE.ShadowMaterial({ opacity: 0.22 })
		);
		shadowPlane.rotation.x = -Math.PI / 2;
		shadowPlane.receiveShadow = true;
		scene.add(shadowPlane);

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
		if (pmrem) pmrem.dispose();
		if (renderer) {
			renderer.dispose();
			renderer.domElement.remove();
		}
	});

	$: if (ready && avatarUrl !== loadedUrl && !loading) loadAvatar(avatarUrl);
	$: if (ready) applyClothesVisibility(hideAvatarClothes);
	$: if (labelGroup) labelGroup.visible = showLabels;
	$: if (controls) controls.autoRotate = autoRotate;
	$: heightCm, waistCm, hipCm, riseCm, inseamCm, thighCm, legOpeningCm, footLenCm, color, unit, update();
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
		background: #eef2f6;
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
