import { computed, defineComponent, h } from 'vue';
import {
	createVoiceTurnLatencyViewModel,
	type VoiceTurnLatencyWidgetOptions
} from '../client/turnLatencyWidget';
import { useVoiceTurnLatency } from './useVoiceTurnLatency';

export const VoiceTurnLatency = defineComponent({
	name: 'VoiceTurnLatency',
	props: {
		class: { default: '', type: String },
		description: { default: undefined, type: String },
		intervalMs: { default: 5000, type: Number },
		path: { default: '/api/turn-latency', type: String },
		proofLabel: { default: undefined, type: String },
		proofPath: { default: undefined, type: String },
		title: { default: undefined, type: String }
	},
	setup(props) {
		const options = {
			description: props.description,
			intervalMs: props.intervalMs,
			proofLabel: props.proofLabel,
			proofPath: props.proofPath,
			title: props.title
		} satisfies VoiceTurnLatencyWidgetOptions;
		const latency = useVoiceTurnLatency(props.path, options);
		const model = computed(() =>
			createVoiceTurnLatencyViewModel(
				{
					error: latency.error.value,
					isLoading: latency.isLoading.value,
					report: latency.report.value,
					updatedAt: latency.updatedAt.value
				},
				options
			)
		);

		return () =>
			h(
				'section',
				{
					class: [
						'absolute-voice-turn-latency',
						`absolute-voice-turn-latency--${model.value.status}`,
						props.class
					]
				},
				[
					h('header', { class: 'absolute-voice-turn-latency__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-turn-latency__eyebrow' },
							model.value.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-turn-latency__label' },
							model.value.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-turn-latency__description' },
						model.value.description
					),
					model.value.showProofAction
						? h(
								'button',
								{
									class: 'absolute-voice-turn-latency__proof',
									onClick: () => {
										void latency.runProof().catch(() => {});
									},
									type: 'button'
								},
								model.value.proofLabel
							)
						: null,
					model.value.turns.length
						? h(
								'div',
								{ class: 'absolute-voice-turn-latency__turns' },
								model.value.turns.map((turn) =>
									h(
										'article',
										{
											class: [
												'absolute-voice-turn-latency__turn',
												`absolute-voice-turn-latency__turn--${turn.status}`
											],
											key: `${turn.sessionId}:${turn.turnId}`
										},
										[
											h('header', [
												h('strong', turn.label),
												h('span', turn.status)
											]),
											h(
												'dl',
												turn.rows.map((row) =>
													h('div', { key: row.label }, [
														h('dt', row.label),
														h('dd', row.value)
													])
												)
											)
										]
									)
								)
							)
						: h(
								'p',
								{ class: 'absolute-voice-turn-latency__empty' },
								'Complete a voice turn to see latency diagnostics.'
							),
					model.value.error
						? h(
								'p',
								{ class: 'absolute-voice-turn-latency__error' },
								model.value.error
							)
						: null
				]
			);
	}
});
