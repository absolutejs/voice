import { Elysia } from 'elysia';
import {
	summarizeVoiceOpsStatus,
	type VoiceOpsStatusReport,
	type VoiceOpsStatusRoutesOptions
} from './opsStatus';

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');

export const renderVoiceOpsStatusHTML = (
	report: VoiceOpsStatusReport,
	options: { title?: string } = {}
) => {
	const title = options.title ?? 'AbsoluteJS Voice Ops Status';
	const surfaces = Object.entries(report.surfaces)
		.map(([key, surface]) => {
			const value =
				'recovered' in surface
					? surface.total === 0
						? '0 events'
						: `${surface.recovered}/${surface.total}`
					: 'auditTotal' in surface
						? `${surface.auditTotal + surface.traceTotal} deliveries`
					: 'total' in surface
					? `${Math.max(surface.total - ('failed' in surface ? surface.failed : 'degraded' in surface ? surface.degraded : 0), 0)}/${surface.total}`
					: surface.status;
			return `<article class="surface ${escapeHtml(surface.status)}"><span>${escapeHtml(surface.status.toUpperCase())}</span><h2>${escapeHtml(key)}</h2><strong>${escapeHtml(value)}</strong></article>`;
		})
		.join('');

	return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{background:#0d141b;color:#f8f3e7;font-family:ui-sans-serif,system-ui,sans-serif;margin:0}main{margin:auto;max-width:980px;padding:32px}.hero{background:linear-gradient(135deg,rgba(20,184,166,.2),rgba(245,158,11,.12));border:1px solid #283544;border-radius:28px;margin-bottom:18px;padding:28px}.eyebrow{color:#5eead4;font-weight:900;letter-spacing:.12em;text-transform:uppercase}h1{font-size:clamp(2.4rem,6vw,5rem);line-height:.9;margin:.2rem 0 1rem}.status{border:1px solid #3f3f46;border-radius:999px;display:inline-flex;font-weight:900;padding:8px 12px}.surfaces{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.surface{background:#151d26;border:1px solid #283544;border-radius:20px;padding:18px}.surface span{color:#aab5c0;font-size:.78rem;font-weight:900;letter-spacing:.08em}.surface strong{font-size:1.5rem}.pass{border-color:rgba(34,197,94,.55)}.fail{border-color:rgba(239,68,68,.75)}a{color:#5eead4}</style></head><body><main><section class="hero"><p class="eyebrow">Ops status</p><h1>${escapeHtml(title)}</h1><p>Compact pass/fail status for framework widgets, demos, and small customer-facing health badges.</p><p class="status ${escapeHtml(report.status)}">Overall: ${escapeHtml(report.status.toUpperCase())}</p><p>${report.passed}/${report.total} checks passing</p></section><section class="surfaces">${surfaces || '<article class="surface pass"><span>PASS</span><h2>No checks configured</h2><strong>0/0</strong></article>'}</section></main></body></html>`;
};

export const createVoiceOpsStatusRoutes = (
	options: VoiceOpsStatusRoutesOptions
) => {
	const path = options.path ?? '/api/voice/ops-status';
	const routes = new Elysia({
		name: options.name ?? 'absolutejs-voice-ops-status'
	});

	routes.get(path, async () => summarizeVoiceOpsStatus(options));
	routes.get(`${path}/html`, async () => {
		const report = await summarizeVoiceOpsStatus(options);
		return new Response(renderVoiceOpsStatusHTML(report), {
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				...options.headers
			}
		});
	});

	return routes;
};
