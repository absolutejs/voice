import { expect, test } from 'bun:test';
import {
	createVoiceRoutingDecisionSummary,
	createVoiceMemoryTraceEventStore,
	createVoiceResilienceRoutes,
	listVoiceRoutingEvents,
	renderVoiceResilienceHTML,
	summarizeVoiceRoutingDecision
} from '../src';
import { createVoiceIOProviderFailureSimulator } from '../src/testing';

test('listVoiceRoutingEvents extracts provider router traces', () => {
	const events = listVoiceRoutingEvents([
		{
			at: 100,
			payload: {
				elapsedMs: 10,
				kind: 'stt',
				provider: 'deepgram',
				providerStatus: 'error',
				routing: 'fastest',
				suppressionRemainingMs: 500,
				timedOut: true
			},
			sessionId: 'session-1',
			type: 'session.error'
		},
		{
			at: 90,
			payload: {
				provider: 'openai',
				providerStatus: 'success'
			},
			sessionId: 'session-2',
			type: 'session.error'
		}
	]);

	expect(events).toMatchObject([
		{
			kind: 'stt',
			provider: 'deepgram',
			routing: 'fastest',
			sessionId: 'session-1',
			status: 'error',
			suppressionRemainingMs: 500,
			timedOut: true
		},
		{
			kind: 'llm',
			provider: 'openai',
			sessionId: 'session-2',
			status: 'success'
		}
	]);
});

test('summarizeVoiceRoutingDecision returns the latest matching routing event', () => {
	const summary = summarizeVoiceRoutingDecision(
		[
			{
				at: 100,
				payload: {
					kind: 'stt',
					provider: 'deepgram',
					providerStatus: 'success',
					routing: 'fastest'
				},
				sessionId: 'session-1',
				type: 'session.error'
			},
			{
				at: 150,
				payload: {
					provider: 'openai',
					providerStatus: 'success',
					routing: 'quality'
				},
				sessionId: 'session-2',
				type: 'session.error'
			},
			{
				at: 200,
				payload: {
					fallbackProvider: 'assemblyai',
					kind: 'stt',
					latencyBudgetMs: 6000,
					provider: 'assemblyai',
					providerStatus: 'fallback',
					routing: 'balanced',
					selectedProvider: 'deepgram'
				},
				sessionId: 'session-3',
				type: 'session.error'
			}
		],
		{ kind: 'stt' }
	);

	expect(summary).toMatchObject({
		fallbackProvider: 'assemblyai',
		kind: 'stt',
		latencyBudgetMs: 6000,
		provider: 'assemblyai',
		routing: 'balanced',
		selectedProvider: 'deepgram',
		sessionId: 'session-3',
		status: 'fallback'
	});
});

test('createVoiceRoutingDecisionSummary reads the latest routing decision from a trace store', async () => {
	const store = createVoiceMemoryTraceEventStore();
	await store.append({
		at: 100,
		payload: {
			kind: 'tts',
			provider: 'openai',
			providerStatus: 'success'
		},
		sessionId: 'session-1',
		type: 'session.error'
	});
	await store.append({
		at: 200,
		payload: {
			kind: 'stt',
			provider: 'deepgram',
			providerStatus: 'success',
			routing: 'quality'
		},
		sessionId: 'session-2',
		type: 'session.error'
	});

	await expect(
		createVoiceRoutingDecisionSummary({ kind: 'stt', store })
	).resolves.toMatchObject({
		kind: 'stt',
		provider: 'deepgram',
		routing: 'quality',
		sessionId: 'session-2',
		status: 'success'
	});
});

test('renderVoiceResilienceHTML renders provider health and simulation controls', () => {
	const html = renderVoiceResilienceHTML({
		llmProviderHealth: [],
		routingEvents: [
			{
				at: 100,
				fallbackProvider: 'assemblyai',
				kind: 'stt',
				provider: 'deepgram',
				sessionId: 'session-1',
				status: 'fallback',
				timedOut: false
			}
		],
		sttProviderHealth: [
			{
				errorCount: 1,
				fallbackCount: 1,
				provider: 'deepgram',
				rateLimited: false,
				recommended: false,
				runCount: 0,
				status: 'suppressed',
				timeoutCount: 0
			}
		],
		sttSimulation: {
			failureProviders: ['deepgram'],
			fallbackRequiredProvider: 'assemblyai',
			providers: [
				{ provider: 'deepgram' },
				{ provider: 'assemblyai' }
			],
			run: async () => ({
				mode: 'failure',
				provider: 'deepgram',
				sessionId: 'session-1',
				status: 'simulated'
			})
		},
		ttsProviderHealth: []
	});

	expect(html).toContain('Provider routing and resilience');
	expect(html).toContain('Simulate deepgram STT failure');
	expect(html).toContain('fallback: assemblyai');
	expect(html).toContain('deepgram');
});

test('createVoiceResilienceRoutes exposes dashboard and simulator endpoints', async () => {
	const store = createVoiceMemoryTraceEventStore();
	const simulator = createVoiceIOProviderFailureSimulator({
		kind: 'stt',
		onProviderEvent: async (event, input) => {
			await store.append({
				at: event.at,
				payload: {
					...event,
					providerStatus: event.status
				},
				sessionId: input.sessionId,
				type: 'session.error'
			});
		},
		providers: ['deepgram', 'assemblyai']
	});
	const app = createVoiceResilienceRoutes({
		sttProviders: ['deepgram', 'assemblyai'],
		sttSimulation: {
			failureProviders: ['deepgram'],
			fallbackRequiredProvider: 'assemblyai',
			providers: [
				{ provider: 'deepgram' },
				{ provider: 'assemblyai' }
			],
			run: simulator.run
		},
		store
	});

	const failure = await app.handle(
		new Request('http://localhost/api/stt-simulate/failure?provider=deepgram', {
			method: 'POST'
		})
	);
	await expect(failure.json()).resolves.toMatchObject({
		fallbackProvider: 'assemblyai',
		mode: 'failure',
		provider: 'deepgram',
		status: 'simulated'
	});

	const page = await app.handle(new Request('http://localhost/resilience'));
	const html = await page.text();
	expect(page.status).toBe(200);
	expect(html).toContain('assemblyai');
	expect(html).toContain('fallback: assemblyai');
});
