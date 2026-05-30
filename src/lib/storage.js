import { writable } from 'svelte/store';

// Category definitions. `order` controls how items stack on the outfit board
// (lower numbers render higher up). `zone` groups them into board columns.
export const CATEGORIES = [
	{ id: 'headwear', label: 'Headwear', order: 0, zone: 'main' },
	{ id: 'outerwear', label: 'Outerwear', order: 1, zone: 'main' },
	{ id: 'tops', label: 'Tops', order: 2, zone: 'main' },
	{ id: 'bottoms', label: 'Bottoms', order: 3, zone: 'main' },
	{ id: 'footwear', label: 'Footwear', order: 4, zone: 'main' },
	{ id: 'accessories', label: 'Accessories', order: 5, zone: 'side' }
];

export function categoryLabel(id) {
	const c = CATEGORIES.find((cat) => cat.id === id);
	return c ? c.label : id;
}

const ITEMS_KEY = 'wardrobe.items';
const OUTFITS_KEY = 'wardrobe.outfits';

function load(key) {
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : [];
	} catch (e) {
		console.error('Failed to load', key, e);
		return [];
	}
}

// A writable store that mirrors itself into localStorage on every change.
function persisted(key) {
	const store = writable(load(key));
	store.subscribe((value) => {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch (e) {
			console.error('Failed to save', key, e);
		}
	});
	return store;
}

export const items = persisted(ITEMS_KEY);
export const outfits = persisted(OUTFITS_KEY);

export function uid() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function addItem(item) {
	items.update((list) => [{ id: uid(), ...item }, ...list]);
}

export function updateItem(id, patch) {
	items.update((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
}

export function removeItem(id) {
	items.update((list) => list.filter((it) => it.id !== id));
}

export function saveOutfit(outfit) {
	outfits.update((list) => [{ id: uid(), createdAt: Date.now(), ...outfit }, ...list]);
}

export function removeOutfit(id) {
	outfits.update((list) => list.filter((o) => o.id !== id));
}

// Read an image file and downscale it to a JPEG data URL so it fits
// comfortably inside the (~5MB) localStorage quota.
export function fileToResizedDataURL(file, maxSize = 600, quality = 0.8) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(new Error('Could not read file'));
		reader.onload = () => {
			const img = new Image();
			img.onerror = () => reject(new Error('Could not load image'));
			img.onload = () => {
				let { width, height } = img;
				if (width > height && width > maxSize) {
					height = Math.round((height * maxSize) / width);
					width = maxSize;
				} else if (height > maxSize) {
					width = Math.round((width * maxSize) / height);
					height = maxSize;
				}
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(img, 0, 0, width, height);
				resolve(canvas.toDataURL('image/jpeg', quality));
			};
			img.src = reader.result;
		};
		reader.readAsDataURL(file);
	});
}
