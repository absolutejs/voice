import { expect, test } from 'bun:test';
import {
	assertVoiceProviderContractMatrixEvidence,
	assertVoiceProviderStackEvidence,
	buildVoiceProviderContractMatrix,
	createVoiceProviderContractMatrixRoutes,
	createVoiceProviderContractMatrixPreset,
	evaluateVoiceProviderContractMatrixEvidence,
	evaluateVoiceProviderStackEvidence,
	evaluateVoiceProviderStackGaps,
	renderVoiceProviderContractMatrixHTML,
	recommendVoiceProviderStack
} from '../src';

test('recommendVoiceProviderStack recommends low-latency phone-agent stack', () => {
	const recommendation = recommendVoiceProviderStack({
		profile: 'phone-agent',
		providers: {
			llm: ['gemini', 'openai', 'anthropic'],
			stt: ['assemblyai', 'deepgram'],
			tts: ['elevenlabs', 'openai']
		}
	});

	expect(recommendation).toMatchObject({
		profile: 'phone-agent',
		recommended: {
			llm: 'openai',
			stt: 'deepgram',
			tts: 'openai'
		}
	});
	expect(recommendation.reasons).toEqual(
		expect.arrayContaining([
			'phone-agent favors low-latency realtime transcription'
		])
	);
	expect(recommendation.stacks.stt?.alternatives).toEqual(['assemblyai']);
});

test('recommendVoiceProviderStack falls back to configured provider order', () => {
	const recommendation = recommendVoiceProviderStack({
		profile: 'meeting-recorder',
		providers: {
			llm: ['custom-llm'],
			stt: ['custom-stt']
		}
	});

	expect(recommendation.recommended).toMatchObject({
		llm: 'custom-llm',
		stt: 'custom-stt'
	});
	expect(recommendation.recommended.tts).toBeUndefined();
	expect(recommendation.stacks.tts?.reasons).toEqual(
		expect.arrayContaining(['no TTS providers are configured'])
	);
});

test('evaluateVoiceProviderStackGaps reports missing profile capabilities', () => {
	const report = evaluateVoiceProviderStackGaps({
		capabilities: {
			llm: {
				openai: ['tool calling', 'JSON result shaping', 'fallback routing']
			},
			stt: {
				deepgram: ['realtime STT']
			},
			tts: {
				openai: ['streaming speech']
			}
		},
		profile: 'phone-agent',
		providers: {
			llm: ['openai'],
			stt: ['deepgram'],
			tts: ['openai']
		}
	});

	expect(report.status).toBe('warn');
	expect(report.missing).toBe(2);
	expect(report.gaps.find((gap) => gap.kind === 'stt')?.missing).toEqual([
		'VAD events'
	]);
	expect(report.gaps.find((gap) => gap.kind === 'tts')?.missing).toEqual([
		'barge-in friendly'
	]);
});

test('evaluateVoiceProviderStackGaps fails when a required lane has no provider', () => {
	const report = evaluateVoiceProviderStackGaps({
		profile: 'phone-agent',
		providers: {
			llm: ['openai'],
			stt: ['deepgram']
		}
	});

	expect(report.status).toBe('fail');
	expect(report.gaps.find((gap) => gap.kind === 'tts')?.provider).toBeUndefined();
});

test('evaluateVoiceProviderStackEvidence verifies required provider stack capability coverage', () => {
	const report = evaluateVoiceProviderStackGaps({
		capabilities: {
			llm: {
				openai: ['tool calling', 'JSON result shaping', 'fallback routing']
			},
			stt: {
				deepgram: ['realtime STT', 'VAD events']
			},
			tts: {
				openai: ['streaming speech', 'barge-in friendly']
			}
		},
		profile: 'phone-agent',
		providers: {
			llm: ['openai'],
			stt: ['deepgram'],
			tts: ['openai']
		}
	});

	expect(
		evaluateVoiceProviderStackEvidence(report, {
			requiredCapabilities: {
				llm: ['tool calling'],
				stt: ['VAD events'],
				tts: ['barge-in friendly']
			},
			requiredKinds: ['llm', 'stt', 'tts'],
			requiredProviders: ['openai', 'deepgram']
		})
	).toMatchObject({
		missing: 0,
		ok: true,
		status: 'pass'
	});
	expect(assertVoiceProviderStackEvidence(report).ok).toBe(true);
});

test('evaluateVoiceProviderStackEvidence catches missing lanes and capabilities', () => {
	const report = evaluateVoiceProviderStackGaps({
		capabilities: {
			llm: {
				openai: ['tool calling']
			}
		},
		profile: 'phone-agent',
		providers: {
			llm: ['openai']
		}
	});
	const assertion = evaluateVoiceProviderStackEvidence(report, {
		requiredCapabilities: {
			llm: ['JSON result shaping'],
			stt: ['VAD events']
		},
		requiredProviders: ['deepgram']
	});

	expect(assertion).toMatchObject({
		ok: false,
		status: 'fail'
	});
	expect(assertion.issues).toEqual(
		expect.arrayContaining([
			expect.stringContaining('provider stack status'),
			expect.stringContaining('missing provider stack capability'),
			expect.stringContaining('provider: deepgram'),
			expect.stringContaining('capability for llm: JSON result shaping'),
			expect.stringContaining('capability for stt: VAD events'),
			expect.stringContaining('Missing provider stack provider for kind')
		])
	);
	expect(() => assertVoiceProviderStackEvidence(report)).toThrow(
		'Voice provider stack assertion failed'
	);
});

test('buildVoiceProviderContractMatrix certifies provider readiness facts', () => {
	const report = buildVoiceProviderContractMatrix({
		contracts: [
			{
				capabilities: ['tool calling', 'JSON result shaping'],
				env: {
					OPENAI_API_KEY: 'set'
				},
				fallbackProviders: ['anthropic'],
				kind: 'llm',
				latencyBudgetMs: 6000,
				provider: 'openai',
				requiredCapabilities: ['tool calling'],
				requiredEnv: ['OPENAI_API_KEY'],
				selected: true,
				streaming: true
			},
			{
				capabilities: ['spoken playback'],
				env: {},
				kind: 'tts',
				provider: 'openai',
				requiredCapabilities: ['streaming speech'],
				requiredEnv: ['OPENAI_API_KEY']
			}
		]
	});

	expect(report.status).toBe('fail');
	expect(report.failed).toBe(1);
	expect(report.rows[0]?.status).toBe('pass');
	expect(report.rows[1]?.checks).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				key: 'env',
				remediation: expect.objectContaining({
					code: 'provider.env',
					label: 'Add missing env'
				}),
				status: 'fail'
			}),
			expect.objectContaining({
				key: 'capabilities',
				remediation: expect.objectContaining({
					code: 'provider.capabilities',
					label: 'Add capability coverage'
				}),
				status: 'warn'
			})
		])
	);
});

test('evaluateVoiceProviderContractMatrixEvidence verifies provider contract coverage', () => {
	const report = buildVoiceProviderContractMatrix({
		contracts: [
			{
				capabilities: ['tool calling', 'JSON result shaping', 'fallback routing'],
				env: {
					OPENAI_API_KEY: 'set'
				},
				fallbackProviders: ['anthropic'],
				kind: 'llm',
				latencyBudgetMs: 6000,
				provider: 'openai',
				requiredCapabilities: ['tool calling', 'JSON result shaping'],
				requiredEnv: ['OPENAI_API_KEY'],
				selected: true,
				streaming: true
			},
			{
				capabilities: ['realtime STT', 'VAD events'],
				env: {
					DEEPGRAM_API_KEY: 'set'
				},
				fallbackProviders: ['assemblyai'],
				kind: 'stt',
				latencyBudgetMs: 5000,
				provider: 'deepgram',
				requiredCapabilities: ['realtime STT', 'VAD events'],
				requiredEnv: ['DEEPGRAM_API_KEY'],
				selected: true,
				streaming: true
			},
			{
				capabilities: ['streaming speech', 'barge-in friendly'],
				env: {
					OPENAI_API_KEY: 'set'
				},
				fallbackProviders: ['emergency'],
				kind: 'tts',
				latencyBudgetMs: 6000,
				provider: 'openai',
				requiredCapabilities: ['streaming speech', 'barge-in friendly'],
				requiredEnv: ['OPENAI_API_KEY'],
				selected: true,
				streaming: true
			}
		]
	});

	expect(
		evaluateVoiceProviderContractMatrixEvidence(report, {
			minRows: 3,
			requiredCheckKeys: [
				'configured',
				'env',
				'latencyBudget',
				'fallback',
				'streaming',
				'capabilities'
			],
			requiredKinds: ['llm', 'stt', 'tts'],
			requiredProviders: ['openai', 'deepgram'],
			selectedKinds: ['llm', 'stt', 'tts']
		})
	).toMatchObject({
		failed: 0,
		ok: true,
		status: 'pass',
		warned: 0
	});
	expect(
		assertVoiceProviderContractMatrixEvidence(report, {
			requiredKinds: ['llm', 'stt', 'tts']
		}).ok
	).toBe(true);
});

test('evaluateVoiceProviderContractMatrixEvidence catches weak provider contracts', () => {
	const report = buildVoiceProviderContractMatrix({
		contracts: [
			{
				capabilities: [],
				configured: false,
				env: {},
				kind: 'llm',
				provider: 'openai',
				requiredCapabilities: ['tool calling'],
				requiredEnv: ['OPENAI_API_KEY']
			}
		]
	});
	const assertion = evaluateVoiceProviderContractMatrixEvidence(report, {
		minRows: 3,
		requiredKinds: ['llm', 'stt', 'tts'],
		requiredProviders: ['deepgram'],
		selectedKinds: ['llm']
	});

	expect(assertion).toMatchObject({
		failed: 1,
		ok: false,
		status: 'fail'
	});
	expect(assertion.issues).toEqual(
		expect.arrayContaining([
			expect.stringContaining('status at most pass'),
			expect.stringContaining('failing provider contract row'),
			expect.stringContaining('at least 3 provider contract row'),
			expect.stringContaining('kind: stt'),
			expect.stringContaining('provider: deepgram'),
			expect.stringContaining('selected provider contract kind: llm')
		])
	);
	expect(() => assertVoiceProviderContractMatrixEvidence(report)).toThrow(
		'Voice provider contract matrix assertion failed'
	);
});

test('createVoiceProviderContractMatrixPreset builds profile provider contracts', () => {
	const preset = createVoiceProviderContractMatrixPreset('phone-agent', {
		env: {
			DEEPGRAM_API_KEY: 'set',
			OPENAI_API_KEY: 'set'
		},
		latencyBudgets: {
			deepgram: 5000,
			openai: 6000
		},
		providers: {
			llm: ['openai'],
			stt: ['deepgram'],
			tts: ['openai']
		},
		remediationHref: '/provider-contracts',
		selected: {
			llm: 'openai',
			stt: 'deepgram',
			tts: 'openai'
		}
	});
	const report = buildVoiceProviderContractMatrix(preset);

	expect(preset.contracts).toHaveLength(3);
	expect(preset.contracts[0]).toMatchObject({
		kind: 'llm',
		provider: 'openai',
		requiredEnv: ['OPENAI_API_KEY'],
		selected: true
	});
	expect(report.status).toBe('warn');
	expect(
		report.rows.find((row) => row.kind === 'stt')?.checks
	).toEqual(
		expect.arrayContaining([
			expect.objectContaining({ key: 'fallback', status: 'warn' })
		])
	);
});

test('renderVoiceProviderContractMatrixHTML renders provider contract rows', () => {
	const html = renderVoiceProviderContractMatrixHTML(
		buildVoiceProviderContractMatrix({
			contracts: [
				{
					capabilities: ['tool calling'],
					kind: 'llm',
					provider: 'openai',
					requiredCapabilities: ['tool calling'],
					streaming: true
				}
			]
		})
	);

	expect(html).toContain('Voice Provider Contract Matrix');
	expect(html).toContain('openai');
	expect(html).toContain('Provider contracts');
	expect(html).toContain('createVoiceProviderContractMatrixPreset');
	expect(html).toContain('Copy into your app');
	expect(html).toContain('createVoiceProductionReadinessRoutes');
});

test('createVoiceProviderContractMatrixRoutes exposes json and html reports', async () => {
	const routes = createVoiceProviderContractMatrixRoutes({
		matrix: {
			contracts: [
				{
					env: {
						OPENAI_API_KEY: 'set'
					},
					kind: 'llm',
					provider: 'openai',
					requiredEnv: ['OPENAI_API_KEY'],
					streaming: true
				}
			]
		}
	});
	const json = await routes.handle(
		new Request('http://localhost/api/provider-contracts')
	);
	const html = await routes.handle(
		new Request('http://localhost/provider-contracts')
	);

	expect(json.headers.get('content-type')).toContain('application/json');
	expect((await json.json()).total).toBe(1);
	expect(html.headers.get('content-type')).toContain('text/html');
	expect(await html.text()).toContain('openai');
});
