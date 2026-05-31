(function () {
	var APP = 'https://test-git-claude-outfit-bui-a0804d-lukedacret-gmailcoms-projects.vercel.app';
	function toCm(v, u) {
		if (!u) return null;
		u = u.toLowerCase();
		if (u.indexOf('mm') > -1) return v / 10;
		if (u.indexOf('cm') > -1 || u.indexOf('cent') > -1) return v;
		return v * 2.54;
	}
	var FIELDS = [
		['inseam', /inseam|inside leg|inner leg/],
		['rise', /front rise|rise/],
		['thigh', /thigh/],
		['legOpening', /leg opening|leg width|hem width|bottom width|cuff|hem|opening/],
		['hip', /hip|seat/],
		['waist', /waist/]
	];
	var bodyText = document.body.innerText || '';
	var low = bodyText.toLowerCase();
	var unit = (low.match(/inch|"/g) || []).length > (low.match(/\bcm\b|cent/g) || []).length ? 'in' : 'cm';
	var fields = {};
	var size = null;

	// 1) table-aware: pick the measurements table and the chosen size column
	var tables = [].slice.call(document.querySelectorAll('table'));
	var mt = tables.filter(function (t) {
		var x = t.innerText.toLowerCase();
		return /waist/.test(x) && /(inseam|leg|rise|hip)/.test(x);
	});
	if (mt.length) {
		var rows = [].slice.call(mt[0].querySelectorAll('tr')).map(function (r) {
			return [].slice.call(r.querySelectorAll('th,td')).map(function (c) {
				return c.innerText.trim();
			});
		});
		var header = rows[0] || [];
		size = prompt('Which size column should I read? (e.g. 46)', '46');
		var col = -1,
			i;
		for (i = 0; i < header.length; i++) {
			if (header[i].replace(/[^0-9A-Za-z]/g, '').toLowerCase() === String(size).toLowerCase()) {
				col = i;
				break;
			}
		}
		if (col < 0) for (i = 0; i < header.length; i++) if (header[i].indexOf(size) > -1) { col = i; break; }
		if (col > 0) {
			rows.forEach(function (r) {
				var label = (r[0] || '').toLowerCase();
				var cell = r[col] || '';
				var nm = cell.match(/(\d+(?:[.,]\d+)?)/);
				if (!nm) return;
				var val = parseFloat(nm[1].replace(',', '.'));
				var um = cell.match(/cm|mm|in|inch|"/i) || label.match(/cm|mm|in|inch|"/i);
				var u = um ? um[0] : unit;
				FIELDS.forEach(function (f) {
					if (fields[f[0]] == null && f[1].test(label)) {
						var cm = toCm(val, u);
						if (cm == null) cm = unit === 'in' ? val * 2.54 : val;
						fields[f[0]] = Math.round(cm * 10) / 10;
					}
				});
			});
		}
	}

	// 2) text fallback (first number after each keyword)
	if (!Object.keys(fields).length) {
		FIELDS.forEach(function (f) {
			var m = f[1].exec(low);
			if (!m) return;
			var w = low.slice(m.index + m[0].length, m.index + m[0].length + 40);
			var nm = w.match(/(\d+(?:[.,]\d+)?)\s*(cm|mm|in|inch(?:es)?|")?/);
			if (!nm) return;
			var val = parseFloat(nm[1].replace(',', '.'));
			if (!(val > 0 && val < 400)) return;
			var cm = toCm(val, nm[2]);
			if (cm == null) cm = unit === 'in' ? val * 2.54 : val;
			fields[f[0]] = Math.round(cm * 10) / 10;
		});
	}

	var keys = Object.keys(fields);
	if (!keys.length) {
		alert('No measurements found. Open the PRODUCT MEASURES popup first, then click the bookmarklet again.');
		return;
	}
	var h1 = document.querySelector('h1');
	var name = (h1 && h1.innerText.trim()) || document.title.split('|')[0].trim();
	var ogi = document.querySelector('meta[property="og:image"]');
	var img = (ogi && ogi.content) || (document.querySelector('img') && document.querySelector('img').src) || '';
	var cm = bodyText.match(/Color:\s*([A-Za-z ]+)/i);
	var color = cm ? cm[1].trim() : '';
	var lbl = { waist: 'Waist', hip: 'Hip', rise: 'Rise', inseam: 'Inseam', thigh: 'Thigh', legOpening: 'Leg opening' };
	var line = keys.map(function (k) { return lbl[k] + ' ' + fields[k] + 'cm'; }).join(' · ');
	try { navigator.clipboard.writeText(line); } catch (e) {}
	var payload = { name: name, image: img, url: location.href, color: color, measurements: fields };
	var b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/\+/g, '-').replace(/\//g, '_');
	alert('Captured ' + keys.length + ' measurements' + (size ? ' for size ' + size : '') + ':\n' + line + '\n\nCopied to clipboard. Opening Outfit Studio…');
	window.open(APP + '/?import=' + b64, '_blank');
})();
