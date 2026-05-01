import { expect, test } from 'bun:test';
import {
	fetchVoiceProofTarget,
	mapVoiceProofTargetsWithConcurrency,
	runVoiceProofTargets
} from '../src';

test('fetchVoiceProofTarget captures json proof responses and artifacts', async () => {
	const artifacts: Record<string, string> = {};
	const result = await fetchVoiceProofTarget(
		{
			kind: 'json',
			name: 'productionReadiness',
			path: '/api/production-readiness'
		},
		{
			baseUrl: 'http://localhost',
			fetch: async () =>
				Response.json({
					checks: [{ status: 'pass' }],
					ok: true,
					status: 'pass'
				}),
			now: () => 100,
			writeArtifact: ({ content, name }) => {
				artifacts[name] = content;
			}
		}
	);

	expect(result).toMatchObject({
		body: {
			ok: true,
			status: 'pass'
		},
		kind: 'json',
		method: 'GET',
		name: 'productionReadiness',
		ok: true,
		path: '/api/production-readiness',
		status: 200,
		summary: {
			checks: { count: 1 },
			ok: true,
			status: 'pass'
		},
		url: 'http://localhost/api/production-readiness'
	});
	expect(artifacts['productionReadiness.json']).toContain('"status": "pass"');
});

test('fetchVoiceProofTarget fails logical failures and missing text', async () => {
	const jsonResult = await fetchVoiceProofTarget(
		{
			kind: 'json',
			name: 'providerRouting',
			path: '/api/provider-routing'
		},
		{
			baseUrl: 'http://localhost/',
			fetch: async () => Response.json({ pass: false })
		}
	);
	const textResult = await fetchVoiceProofTarget(
		{
			kind: 'text',
			name: 'markdownProof',
			path: '/proof.md',
			requiredText: ['required phrase']
		},
		{
			baseUrl: 'http://localhost',
			fetch: async () => new Response('other text')
		}
	);

	expect(jsonResult).toMatchObject({
		error: 'Response pass is false.',
		ok: false
	});
	expect(textResult).toMatchObject({
		error: 'Missing required text: required phrase',
		ok: false
	});
});

test('runVoiceProofTargets preserves input order with concurrency', async () => {
	const seen: string[] = [];
	const results = await runVoiceProofTargets(
		[
			{ kind: 'json', name: 'one', path: '/one' },
			{ kind: 'json', name: 'two', path: '/two' },
			{ kind: 'json', name: 'three', path: '/three' }
		],
		{
			baseUrl: 'http://localhost',
			concurrency: 2,
			fetch: async (url) => {
				seen.push(String(url));
				return Response.json({ ok: true, url });
			}
		}
	);

	expect(results.map((result) => result.name)).toEqual(['one', 'two', 'three']);
	expect(seen).toHaveLength(3);
});

test('mapVoiceProofTargetsWithConcurrency handles empty lists', async () => {
	expect(
		await mapVoiceProofTargetsWithConcurrency([], 3, async (item: string) => item)
	).toEqual([]);
});
