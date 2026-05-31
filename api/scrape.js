import { stripHtml, parseMeasurements } from '../src/lib/parseMeasurements.js';

// Serverless function: fetch a product page server-side (no browser CORS) and
// try to extract garment measurements. Many sites — especially luxury — block
// automated requests (403); in that case the client falls back to letting the
// user paste the size-guide text.
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
				error: `The site returned ${r.status} (often bot protection). Paste the size-guide text instead.`
			});
			return;
		}

		const html = await r.text();
		const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
		const title = titleMatch ? titleMatch[1].trim() : '';
		const text = stripHtml(html);
		const { fields, detectedUnit } = parseMeasurements(text);

		res.status(200).json({ ok: true, found: fields, detectedUnit, title });
	} catch (e) {
		res.status(200).json({
			ok: false,
			error: 'Could not fetch the page (' + (e && e.message ? e.message : 'network error') + ').'
		});
	}
}
