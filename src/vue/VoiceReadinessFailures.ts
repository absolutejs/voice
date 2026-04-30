import { defineComponent, h } from 'vue';
import {
	createVoiceReadinessFailuresViewModel,
	type VoiceReadinessFailuresWidgetOptions
} from '../client/readinessFailuresWidget';
import type { VoiceProductionReadinessReport } from '../productionReadiness';
import { useVoiceReadinessFailures } from './useVoiceReadinessFailures';

export const VoiceReadinessFailures = defineComponent({
	name: 'VoiceReadinessFailures',
	props: {
		description: String,
		intervalMs: Number,
		path: {
			default: '/api/production-readiness',
			type: String
		},
		title: String
	},
	setup(props) {
		const state = useVoiceReadinessFailures(props.path, {
			description: props.description,
			intervalMs: props.intervalMs,
			title: props.title
		} as VoiceReadinessFailuresWidgetOptions);

		return () => {
			const model = createVoiceReadinessFailuresViewModel(
				{
					error: state.error.value,
					isLoading: state.isLoading.value,
					report: state.report.value as VoiceProductionReadinessReport | undefined,
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
						'absolute-voice-readiness-failures',
						`absolute-voice-readiness-failures--${model.status}`
					]
				},
				[
					h('header', { class: 'absolute-voice-readiness-failures__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-readiness-failures__eyebrow' },
							model.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-readiness-failures__label' },
							model.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-readiness-failures__description' },
						model.description
					),
					model.failures.length
						? h(
								'div',
								{ class: 'absolute-voice-readiness-failures__items' },
								model.failures.map((failure) =>
									h(
										'article',
										{
											class: [
												'absolute-voice-readiness-failures__item',
												`absolute-voice-readiness-failures__item--${failure.status}`
											],
											key: failure.label
										},
										[
											h('span', failure.status.toUpperCase()),
											h('strong', failure.label),
											h(
												'p',
												`Observed ${failure.observed} against ${failure.thresholdLabel} ${failure.threshold}.`
											),
											h('p', failure.remediation),
											h(
												'p',
												{ class: 'absolute-voice-readiness-failures__links' },
												[
													failure.evidenceHref
														? h(
																'a',
																{ href: failure.evidenceHref },
																'Evidence'
															)
														: null,
													failure.sourceHref
														? h(
																'a',
																{ href: failure.sourceHref },
																'Threshold source'
															)
														: null
												]
											)
										]
									)
								)
							)
						: h(
								'p',
								{ class: 'absolute-voice-readiness-failures__empty' },
								model.error ??
									'No calibrated readiness gate explanations are open.'
							),
					model.links.length
						? h(
								'p',
								{ class: 'absolute-voice-readiness-failures__links' },
								model.links.map((link) =>
									h('a', { href: link.href, key: link.href }, link.label)
								)
							)
						: null
				]
			);
		};
	}
});
