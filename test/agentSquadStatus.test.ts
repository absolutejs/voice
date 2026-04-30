import { expect, test } from 'bun:test';
import {
	buildVoiceAgentSquadStatusReport,
	renderVoiceAgentSquadStatusHTML
} from '../src/client';
import type { VoiceTraceTimelineReport } from '../src/traceTimeline';

const report = {
	checkedAt: 1,
	failed: 0,
	sessions: [
		{
			evaluation: { issues: [], score: 1 },
			events: [
				{
					at: 100,
					id: 'event-1',
					label: 'Agent handoff to billing',
					offsetMs: 0,
					payload: {
						agentId: 'front-desk',
						fromAgentId: 'support',
						status: 'allowed',
						summary: 'Billing question detected.',
						targetAgentId: 'billing'
					},
					status: 'allowed',
					turnId: 'turn-1',
					type: 'agent.handoff'
				},
				{
					at: 120,
					id: 'event-2',
					label: 'Model call',
					offsetMs: 20,
					payload: {
						agentId: 'billing'
					},
					turnId: 'turn-1',
					type: 'agent.model'
				}
			],
			providers: [],
			sessionId: 'session-1',
			status: 'healthy',
			summary: {
				eventCount: 2,
				failed: false,
				sessionId: 'session-1',
				turnCount: 1
			}
		}
	],
	total: 1,
	warnings: 0
} satisfies VoiceTraceTimelineReport;

test('buildVoiceAgentSquadStatusReport exposes current specialist from handoff traces', () => {
	const status = buildVoiceAgentSquadStatusReport(report);

	expect(status.current).toMatchObject({
		fromAgentId: 'support',
		sessionId: 'session-1',
		status: 'handoff',
		summary: 'Billing question detected.',
		targetAgentId: 'billing'
	});
	expect(status.active).toHaveLength(1);
});

test('renderVoiceAgentSquadStatusHTML renders current specialist', () => {
	const status = buildVoiceAgentSquadStatusReport(report);
	const html = renderVoiceAgentSquadStatusHTML({
		error: null,
		isLoading: false,
		report: status
	});

	expect(html).toContain('Current: billing');
	expect(html).toContain('Billing question detected.');
});
