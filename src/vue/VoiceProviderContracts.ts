import { defineComponent, h } from 'vue';
import { useVoiceProviderContracts } from './useVoiceProviderContracts';
import {
	createVoiceProviderContractsViewModel,
	type VoiceProviderContractsWidgetOptions
} from '../client/providerContractsWidget';

export const VoiceProviderContracts = defineComponent({
	name: 'VoiceProviderContracts',
	props: {
		description: String,
		intervalMs: Number,
		path: {
			default: '/api/provider-contracts',
			type: String
		},
		title: String
	},
	setup(props) {
		const state = useVoiceProviderContracts(props.path, {
			description: props.description,
			intervalMs: props.intervalMs,
			title: props.title
		} as VoiceProviderContractsWidgetOptions);

		return () => {
			const model = createVoiceProviderContractsViewModel(
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
						'absolute-voice-provider-contracts',
						`absolute-voice-provider-contracts--${model.status}`
					]
				},
				[
					h('header', { class: 'absolute-voice-provider-contracts__header' }, [
						h('span', { class: 'absolute-voice-provider-contracts__eyebrow' }, model.title),
						h('strong', { class: 'absolute-voice-provider-contracts__label' }, model.label)
					]),
					h('p', { class: 'absolute-voice-provider-contracts__description' }, model.description),
					model.rows.length
						? h(
								'div',
								{ class: 'absolute-voice-provider-contracts__rows' },
								model.rows.map((row) =>
									h(
										'article',
										{
											class: [
												'absolute-voice-provider-contracts__row',
												`absolute-voice-provider-contracts__row--${row.status}`
											],
											key: `${row.kind}:${row.provider}`
										},
										[
											h('header', [
												h('strong', row.label),
												h('span', row.status)
											]),
											h('p', row.detail),
											row.remediations.length
												? h(
														'ul',
														{
															class:
																'absolute-voice-provider-contracts__remediations'
														},
														row.remediations.map((remediation) =>
															h(
																'li',
																{
																	key: `${row.kind}:${row.provider}:${remediation.label}`
																},
																[
																	remediation.href
																		? h(
																				'a',
																				{ href: remediation.href },
																				remediation.label
																			)
																		: h('strong', remediation.label),
																	h('span', remediation.detail)
																]
															)
														)
													)
												: null,
											h(
												'dl',
												row.rows.map((item) =>
													h('div', { key: item.label }, [
														h('dt', item.label),
														h('dd', item.value)
													])
												)
											)
										]
									)
								)
							)
						: h(
								'p',
								{ class: 'absolute-voice-provider-contracts__empty' },
								'Configure provider contracts to see production coverage.'
							),
					model.error
						? h('p', { class: 'absolute-voice-provider-contracts__error' }, model.error)
						: null
				]
			);
		};
	}
});
