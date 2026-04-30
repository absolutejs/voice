import { defineComponent, h } from 'vue';
import {
	createVoiceProofTrendsViewModel,
	type VoiceProofTrendsWidgetOptions
} from '../client/proofTrendsWidget';
import { useVoiceProofTrends } from './useVoiceProofTrends';

export const VoiceProofTrends = defineComponent({
	name: 'VoiceProofTrends',
	props: {
		description: String,
		intervalMs: Number,
		path: {
			default: '/api/voice/proof-trends',
			type: String
		},
		title: String
	},
	setup(props) {
		const state = useVoiceProofTrends(props.path, {
			description: props.description,
			intervalMs: props.intervalMs,
			title: props.title
		} as VoiceProofTrendsWidgetOptions);

		return () => {
			const model = createVoiceProofTrendsViewModel(
				{
					error: state.error.value,
					isLoading: state.isLoading.value,
					report: state.report.value,
					updatedAt: state.updatedAt.value
				},
				{
					description: props.description,
					intervalMs: props.intervalMs,
					title: props.title
				}
			);

			return h(
				'section',
				{
					class: [
						'absolute-voice-proof-trends',
						`absolute-voice-proof-trends--${model.status}`
					]
				},
				[
					h('header', { class: 'absolute-voice-proof-trends__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-proof-trends__eyebrow' },
							model.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-proof-trends__label' },
							model.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-proof-trends__description' },
						model.description
					),
					model.metrics.length
						? h(
								'div',
								{ class: 'absolute-voice-proof-trends__metrics' },
								model.metrics.map((metric) =>
									h('article', { key: metric.label }, [
										h('span', metric.label),
										h('strong', metric.value)
									])
								)
							)
						: h(
								'p',
								{ class: 'absolute-voice-proof-trends__empty' },
								model.error ??
									'Run the sustained proof trends script to populate evidence.'
							),
					model.links.length
						? h(
								'p',
								{ class: 'absolute-voice-proof-trends__links' },
								model.links.map((link) =>
									h('a', { href: link.href, key: link.href }, link.label)
								)
							)
						: null,
					model.error
						? h(
								'p',
								{ class: 'absolute-voice-proof-trends__error' },
								model.error
							)
						: null
				]
			);
		};
	}
});
