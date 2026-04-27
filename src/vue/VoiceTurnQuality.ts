import { computed, defineComponent, h } from 'vue';
import {
	createVoiceTurnQualityViewModel,
	type VoiceTurnQualityWidgetOptions
} from '../client/turnQualityWidget';
import { useVoiceTurnQuality } from './useVoiceTurnQuality';

export const VoiceTurnQuality = defineComponent({
	name: 'VoiceTurnQuality',
	props: {
		class: { default: '', type: String },
		description: { default: undefined, type: String },
		intervalMs: { default: 5000, type: Number },
		path: { default: '/api/turn-quality', type: String },
		title: { default: undefined, type: String }
	},
	setup(props) {
		const options = {
			description: props.description,
			intervalMs: props.intervalMs,
			title: props.title
		} satisfies VoiceTurnQualityWidgetOptions;
		const quality = useVoiceTurnQuality(props.path, options);
		const model = computed(() =>
			createVoiceTurnQualityViewModel(
				{
					error: quality.error.value,
					isLoading: quality.isLoading.value,
					report: quality.report.value,
					updatedAt: quality.updatedAt.value
				},
				options
			)
		);

		return () =>
			h(
				'section',
				{
					class: [
						'absolute-voice-turn-quality',
						`absolute-voice-turn-quality--${model.value.status}`,
						props.class
					]
				},
				[
					h('header', { class: 'absolute-voice-turn-quality__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-turn-quality__eyebrow' },
							model.value.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-turn-quality__label' },
							model.value.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-turn-quality__description' },
						model.value.description
					),
					model.value.turns.length
						? h(
								'div',
								{ class: 'absolute-voice-turn-quality__turns' },
								model.value.turns.map((turn) =>
									h(
										'article',
										{
											class: [
												'absolute-voice-turn-quality__turn',
												`absolute-voice-turn-quality__turn--${turn.status}`
											],
											key: `${turn.sessionId}:${turn.turnId}`
										},
										[
											h('header', [
												h('strong', turn.label),
												h('span', turn.status)
											]),
											h('p', turn.detail),
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
								{ class: 'absolute-voice-turn-quality__empty' },
								'Complete a voice turn to see STT quality diagnostics.'
							),
					model.value.error
						? h(
								'p',
								{ class: 'absolute-voice-turn-quality__error' },
								model.value.error
							)
						: null
				]
			);
	}
});
