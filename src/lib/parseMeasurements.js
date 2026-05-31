// Best-effort extraction of garment (trouser) measurements from free text or
// HTML. Returns values normalized to centimetres so callers can convert.
//
// This is heuristic: size charts vary wildly between retailers and many are
// rendered by JavaScript or hidden behind bot protection, so it will often
// find only some fields (or none). Callers should treat results as a draft.

export function stripHtml(html) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/\s+/g, ' ')
		.trim();
}

// field key -> keyword matcher. Order matters (more specific first).
const FIELDS = [
	{ key: 'inseam', re: /(inseam|inside\s+leg|inner\s+leg)/ },
	{ key: 'rise', re: /(front\s+rise|rise)/ },
	{ key: 'thigh', re: /thigh/ },
	{ key: 'legOpening', re: /(leg\s+opening|leg\s+width|hem\s+width|bottom\s+width|cuff|opening)/ },
	{ key: 'hip', re: /(hip|seat)/ },
	{ key: 'waist', re: /waist/ },
	// length last, and avoid "leg length"/"sleeve length"
	{ key: 'length', re: /(outseam|outside\s+leg|total\s+length|full\s+length|(?<!leg\s)(?<!sleeve\s)length)/ }
];

const NUM = /(\d+(?:[.,]\d+)?)\s*(cm|mm|millimet(?:er|re)s?|centimet(?:er|re)s?|in\b|inch(?:es)?|")?/;

function toCm(value, unit) {
	if (unit == null) return null; // unknown -> resolve later with global unit
	if (/mm|millimet/.test(unit)) return value / 10;
	if (/in|inch|"/.test(unit)) return value * 2.54;
	return value; // cm / centimetre
}

export function parseMeasurements(input) {
	const text = (input || '').toString();
	const lower = text.toLowerCase();

	// global unit hint
	const cmCount = (lower.match(/cm|centimet/g) || []).length;
	const inCount = (lower.match(/inch|\bin\b|"/g) || []).length;
	const detectedUnit = inCount > cmCount ? 'in' : 'cm';

	const fields = {};
	const raw = {};

	for (const { key, re } of FIELDS) {
		if (fields[key] != null) continue;
		const m = re.exec(lower);
		if (!m) continue;
		// search a window after the keyword for a number + optional unit
		const start = m.index + m[0].length;
		const window = lower.slice(start, start + 40);
		const nm = NUM.exec(window);
		if (!nm) continue;
		const value = parseFloat(nm[1].replace(',', '.'));
		if (!isFinite(value) || value <= 0 || value > 400) continue;
		let unit = nm[2] || null;
		let cm = toCm(value, unit);
		if (cm == null) cm = detectedUnit === 'in' ? value * 2.54 : value;
		fields[key] = Math.round(cm * 10) / 10;
		raw[key] = { value, unit: unit || detectedUnit };
	}

	return { fields, raw, detectedUnit };
}
