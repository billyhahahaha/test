// Best-effort collection/catalog scraper. Given a listing page URL, tries to
// pull product entries (name, url, image). Many retailers — especially luxury
// — block automated requests (403) or render listings with JavaScript, so this
// frequently returns little or nothing. It is intentionally conservative.
export default async function handler(req, res) {
	const url = (req.query && req.query.url) || '';
	if (!/^https?:\/\//i.test(url)) {
		res.status(400).json({ ok: false, error: 'Provide a valid http(s) URL.' });
		return;
	}

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), 9000);
		const r = await fetch(url, {
			signal: controller.signal,
			redirect: 'follow',
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml',
				'Accept-Language': 'en-US,en;q=0.9'
			}
		});
		clearTimeout(timer);

		if (!r.ok) {
			res.status(200).json({
				ok: false,
				status: r.status,
				error: `The site returned ${r.status} (commonly bot protection on luxury sites). Add items manually instead.`
			});
			return;
		}

		const html = await r.text();
		const base = new URL(url);
		const products = [];
		const seen = new Set();

		// 1) JSON-LD ItemList / Product entries
		const ldMatches = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
		for (const block of ldMatches) {
			const jsonText = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '');
			try {
				const data = JSON.parse(jsonText);
				collectFromLd(data, products, seen, base);
			} catch (e) {
				/* ignore malformed */
			}
		}

		// 2) Fallback: anchors that look like product links with an <img>
		if (products.length === 0) {
			const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
			let m;
			let count = 0;
			while ((m = anchorRe.exec(html)) && count < 60) {
				const href = m[1];
				const inner = m[2];
				if (!/product|\/p\/|\/products\/|\.html/i.test(href)) continue;
				const imgMatch = inner.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
				const alt = inner.match(/alt=["']([^"']+)["']/i);
				const name = (alt && alt[1].trim()) || decodeURIComponent(href.split('/').pop().replace(/[-_]/g, ' ').replace(/\.html?$/, '')).trim();
				if (!name) continue;
				let abs;
				try {
					abs = new URL(href, base).href;
				} catch (e) {
					continue;
				}
				if (seen.has(abs)) continue;
				seen.add(abs);
				products.push({
					name: name.slice(0, 80),
					url: abs,
					image: imgMatch ? new URL(imgMatch[1], base).href : ''
				});
				count++;
			}
		}

		res.status(200).json({ ok: true, count: products.length, products: products.slice(0, 60) });
	} catch (e) {
		res.status(200).json({
			ok: false,
			error: 'Could not fetch the page (' + (e && e.message ? e.message : 'network error') + ').'
		});
	}
}

function collectFromLd(node, products, seen, base) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const n of node) collectFromLd(n, products, seen, base);
		return;
	}
	const type = node['@type'];
	if (node.itemListElement) collectFromLd(node.itemListElement, products, seen, base);
	if (node.item) collectFromLd(node.item, products, seen, base);
	if (type === 'Product' || node.name) {
		const url = node.url || (node.offers && node.offers.url);
		const name = typeof node.name === 'string' ? node.name : '';
		let image = '';
		if (typeof node.image === 'string') image = node.image;
		else if (Array.isArray(node.image)) image = node.image[0];
		else if (node.image && node.image.url) image = node.image.url;
		if (name && url) {
			let abs;
			try {
				abs = new URL(url, base).href;
			} catch (e) {
				return;
			}
			if (!seen.has(abs)) {
				seen.add(abs);
				products.push({ name: name.slice(0, 80), url: abs, image });
			}
		}
	}
}
