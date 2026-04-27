import { expect, test } from 'bun:test';
import {
	createVoiceAppKitRoutes,
	createVoiceMemoryTraceEventStore
} from '../src';

test('createVoiceAppKitRoutes mounts the standard operations surfaces', async () => {
	const kit = createVoiceAppKitRoutes({
		llmProviders: ['openai', 'gemini'],
		store: createVoiceMemoryTraceEventStore(),
		sttProviders: ['deepgram'],
		title: 'Demo Voice'
	});

	expect(kit.surfaces).toContain('opsConsole');
	expect(kit.surfaces).toContain('evals');
	expect(kit.links.map((link) => link.href)).toContain('/quality');

	const quality = await kit.routes.handle(
		new Request('http://localhost/quality/json')
	);
	expect(quality.status).toBe(200);
	await expect(quality.json()).resolves.toMatchObject({
		status: 'pass'
	});

	const provider = await kit.routes.handle(
		new Request('http://localhost/api/provider-status')
	);
	expect(provider.status).toBe(200);
	await expect(provider.json()).resolves.toEqual(
		expect.arrayContaining([
			expect.objectContaining({ provider: 'openai' }),
			expect.objectContaining({ provider: 'gemini' })
		])
	);
});

test('createVoiceAppKitRoutes can disable individual surfaces', async () => {
	const kit = createVoiceAppKitRoutes({
		evals: false,
		opsConsole: false,
		store: createVoiceMemoryTraceEventStore()
	});

	expect(kit.surfaces).not.toContain('evals');
	expect(kit.surfaces).not.toContain('opsConsole');
	expect(
		await kit.routes.handle(new Request('http://localhost/evals/json'))
	).toMatchObject({ status: 404 });
});
