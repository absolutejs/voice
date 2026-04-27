import { computed, defineComponent, h, type PropType } from 'vue';
import { createVoiceProviderSimulationControlsViewModel } from '../client/providerSimulationControlsWidget';
import type {
	VoiceProviderSimulationControlsOptions,
	VoiceProviderSimulationProvider
} from '../client/providerSimulationControls';
import { useVoiceProviderSimulationControls } from './useVoiceProviderSimulationControls';

export const VoiceProviderSimulationControls = defineComponent({
	name: 'VoiceProviderSimulationControls',
	props: {
		class: { default: '', type: String },
		fallbackRequiredMessage: { default: undefined, type: String },
		fallbackRequiredProvider: { default: undefined, type: String },
		failureMessage: { default: undefined, type: String },
		failureProviders: {
			default: undefined,
			type: Array as PropType<readonly string[] | undefined>
		},
		kind: { default: 'stt', type: String },
		pathPrefix: { default: undefined, type: String },
		providers: {
			required: true,
			type: Array as PropType<readonly VoiceProviderSimulationProvider[]>
		},
		title: { default: undefined, type: String }
	},
	setup(props) {
		const options = {
			fallbackRequiredMessage: props.fallbackRequiredMessage,
			fallbackRequiredProvider: props.fallbackRequiredProvider,
			failureMessage: props.failureMessage,
			failureProviders: props.failureProviders,
			kind: props.kind,
			pathPrefix: props.pathPrefix,
			providers: props.providers,
			title: props.title
		} satisfies VoiceProviderSimulationControlsOptions;
		const controls = useVoiceProviderSimulationControls(options);
		const model = computed(() =>
			createVoiceProviderSimulationControlsViewModel(
				{
					error: controls.error.value,
					isRunning: controls.isRunning.value,
					lastResult: controls.lastResult.value,
					mode: controls.mode.value,
					provider: controls.provider.value,
					updatedAt: controls.updatedAt.value
				},
				options
			)
		);
		const run = (provider: string, mode: 'failure' | 'recovery') => {
			void controls.run(provider, mode).catch(() => {});
		};

		return () =>
			h(
				'section',
				{
					class: [
						'absolute-voice-provider-simulation',
						`absolute-voice-provider-simulation--${controls.error.value ? 'error' : controls.isRunning.value ? 'running' : 'ready'}`,
						props.class
					]
				},
				[
					h('header', { class: 'absolute-voice-provider-simulation__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-provider-simulation__eyebrow' },
							model.value.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-provider-simulation__label' },
							model.value.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-provider-simulation__description' },
						model.value.description
					),
					model.value.canSimulateFailure
						? null
						: h(
								'p',
								{ class: 'absolute-voice-provider-simulation__empty' },
								props.fallbackRequiredMessage ??
									'Configure fallback providers before simulating failure.'
							),
					h(
						'div',
						{ class: 'absolute-voice-provider-simulation__actions' },
						[
							...model.value.failureProviders.map((provider) =>
								h(
									'button',
									{
										disabled:
											!model.value.canSimulateFailure ||
											controls.isRunning.value,
										key: `fail-${provider.provider}`,
										onClick: () => run(provider.provider, 'failure'),
										type: 'button'
									},
									`Simulate ${provider.provider} ${props.kind.toUpperCase()} failure`
								)
							),
							...model.value.providers.map((provider) =>
								h(
									'button',
									{
										disabled: controls.isRunning.value,
										key: `recover-${provider.provider}`,
										onClick: () => run(provider.provider, 'recovery'),
										type: 'button'
									},
									`Mark ${provider.provider} recovered`
								)
							)
						]
					),
					controls.error.value
						? h(
								'p',
								{ class: 'absolute-voice-provider-simulation__error' },
								controls.error.value
							)
						: null,
					model.value.resultText
						? h(
								'pre',
								{ class: 'absolute-voice-provider-simulation__result' },
								model.value.resultText
							)
						: null
				]
			);
	}
});
