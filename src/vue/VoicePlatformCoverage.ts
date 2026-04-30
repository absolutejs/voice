import { defineComponent, h } from 'vue';
import { useVoicePlatformCoverage } from './useVoicePlatformCoverage';
import {
	createVoicePlatformCoverageViewModel,
	type VoicePlatformCoverageWidgetOptions
} from '../client/platformCoverageWidget';

export const VoicePlatformCoverage = defineComponent({
	name: 'VoicePlatformCoverage',
	props: {
		description: String,
		intervalMs: Number,
		limit: Number,
		path: {
			default: '/api/voice/platform-coverage',
			type: String
		},
		title: String
	},
	setup(props) {
		const state = useVoicePlatformCoverage(props.path, {
			description: props.description,
			intervalMs: props.intervalMs,
			limit: props.limit,
			title: props.title
		} as VoicePlatformCoverageWidgetOptions);

		return () => {
			const model = createVoicePlatformCoverageViewModel(
				{
					error: state.error.value,
					isLoading: state.isLoading.value,
					report: state.report.value,
					updatedAt: state.updatedAt.value
				},
				{
					description: props.description,
					intervalMs: props.intervalMs,
					limit: props.limit,
					title: props.title
				}
			);

			return h(
				'section',
				{
					class: [
						'absolute-voice-platform-coverage',
						`absolute-voice-platform-coverage--${model.status}`
					]
				},
				[
					h('header', { class: 'absolute-voice-platform-coverage__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-platform-coverage__eyebrow' },
							model.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-platform-coverage__label' },
							model.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-platform-coverage__description' },
						model.description
					),
					model.surfaces.length
						? h(
								'div',
								{ class: 'absolute-voice-platform-coverage__surfaces' },
								model.surfaces.map((surface) =>
									h(
										'article',
										{
											class: [
												'absolute-voice-platform-coverage__surface',
												`absolute-voice-platform-coverage__surface--${surface.status}`
											],
											key: surface.surface
										},
										[
											h('header', [
												h('strong', surface.label),
												h('span', surface.status)
											]),
											h('p', surface.detail),
											h(
												'small',
												`${surface.evidence.filter((item) => item.ok).length}/${surface.evidence.length} evidence checks passing`
											)
										]
									)
								)
							)
						: h(
								'p',
								{ class: 'absolute-voice-platform-coverage__empty' },
								model.error ??
									'Run the proof pack to populate platform coverage evidence.'
							),
					model.links.length
						? h(
								'p',
								{ class: 'absolute-voice-platform-coverage__links' },
								model.links.map((link) =>
									h('a', { href: link.href, key: link.href }, link.label)
								)
							)
						: null,
					model.error
						? h(
								'p',
								{ class: 'absolute-voice-platform-coverage__error' },
								model.error
							)
						: null
				]
			);
		};
	}
});
