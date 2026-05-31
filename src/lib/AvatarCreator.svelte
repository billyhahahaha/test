<script>
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { avatarUrl } from './storage.js';

	const dispatch = createEventDispatcher();

	// Ready Player Me iframe creator. `demo` is the public subdomain; swap for
	// your own Studio subdomain to brand/configure it.
	const SUBDOMAIN = 'demo';
	const src = `https://${SUBDOMAIN}.readyplayer.me/avatar?frameApi&bodyType=fullbody&clearCache`;

	let iframe;

	function parse(event) {
		try {
			return typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
		} catch (e) {
			return null;
		}
	}

	function onMessage(event) {
		const json = parse(event);
		if (!json || json.source !== 'readyplayerme') return;

		// handshake: once the frame is ready, subscribe to all events
		if (json.eventName === 'v1.frame.ready' && iframe?.contentWindow) {
			iframe.contentWindow.postMessage(
				JSON.stringify({ target: 'readyplayerme', type: 'subscribe', eventName: 'v1.**' }),
				'*'
			);
		}

		if (json.eventName === 'v1.avatar.exported') {
			avatarUrl.set(json.data.url);
			dispatch('close');
		}
	}

	onMount(() => window.addEventListener('message', onMessage));
	onDestroy(() => window.removeEventListener('message', onMessage));
</script>

<svelte:window on:keydown={(e) => e.key === 'Escape' && dispatch('close')} />
<div class="overlay" role="presentation" on:click|self={() => dispatch('close')}>
	<div class="modal">
		<header>
			<strong>Create your avatar</strong>
			<button class="x" on:click={() => dispatch('close')}>✕</button>
		</header>
		<p class="tip">
			Use a clear, front-facing selfie for the best likeness. When you finish, the
			avatar loads straight into the 3D try-on.
		</p>
		<iframe
			bind:this={iframe}
			title="Ready Player Me avatar creator"
			{src}
			allow="camera *; microphone *; clipboard-write"
		></iframe>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(17, 24, 39, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
		padding: 16px;
	}
	.modal {
		background: #fff;
		border-radius: 16px;
		width: min(900px, 100%);
		height: min(700px, 90vh);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 18px;
		border-bottom: 1px solid #eee;
	}
	.x {
		border: none;
		background: #f3f4f6;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		cursor: pointer;
		margin: 0;
	}
	.tip {
		margin: 0;
		padding: 10px 18px;
		font-size: 0.82rem;
		color: #6b7280;
		background: #fafafa;
	}
	iframe {
		flex: 1;
		width: 100%;
		border: 0;
	}
</style>
