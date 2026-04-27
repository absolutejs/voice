import { computed, defineComponent, h } from 'vue';
import {
	createVoiceRoutingStatusViewModel,
	type VoiceRoutingStatusWidgetOptions
} from '../client/routingStatusWidget';
import { useVoiceRoutingStatus } from './useVoiceRoutingStatus';

export const VoiceRoutingStatus = defineComponent({
	name: 'VoiceRoutingStatus',
	props: {
		class: {
			default: '',
			type: String
		},
		description: {
			default: undefined,
			type: String
		},
		intervalMs: {
			default: 5000,
			type: Number
		},
		path: {
			default: '/api/routing/latest',
			type: String
		},
		title: {
			default: undefined,
			type: String
		}
	},
	setup(props) {
		const options = {
			description: props.description,
			intervalMs: props.intervalMs,
			title: props.title
		} satisfies VoiceRoutingStatusWidgetOptions;
		const status = useVoiceRoutingStatus(props.path, options);
		const model = computed(() =>
			createVoiceRoutingStatusViewModel(
				{
					decision: status.decision.value,
					error: status.error.value,
					isLoading: status.isLoading.value,
					updatedAt: status.updatedAt.value
				},
				options
			)
		);

		return () =>
			h(
				'section',
				{
					class: [
						'absolute-voice-routing-status',
						`absolute-voice-routing-status--${model.value.status}`,
						props.class
					]
				},
				[
					h('header', { class: 'absolute-voice-routing-status__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-routing-status__eyebrow' },
							model.value.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-routing-status__label' },
							model.value.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-routing-status__description' },
						model.value.description
					),
					model.value.rows.length
						? h(
								'div',
								{ class: 'absolute-voice-routing-status__grid' },
								model.value.rows.map((row) =>
									h('div', { key: row.label }, [
										h('span', row.label),
										h('strong', row.value)
									])
								)
							)
						: h(
								'p',
								{ class: 'absolute-voice-routing-status__empty' },
								'Start a voice session to see the selected provider.'
							),
					model.value.error
						? h(
								'p',
								{ class: 'absolute-voice-routing-status__error' },
								model.value.error
							)
						: null
				]
			);
	}
});
