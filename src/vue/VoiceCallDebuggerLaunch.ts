import { computed, defineComponent, h } from 'vue';
import {
	createVoiceCallDebuggerLaunchViewModel,
	type VoiceCallDebuggerLaunchOptions
} from '../client/callDebuggerWidget';
import { useVoiceCallDebugger } from './useVoiceCallDebugger';

export const VoiceCallDebuggerLaunch = defineComponent({
	name: 'VoiceCallDebuggerLaunch',
	props: {
		class: { default: '', type: String },
		description: { default: undefined, type: String },
		href: { default: undefined, type: String },
		intervalMs: { default: 0, type: Number },
		linkLabel: { default: undefined, type: String },
		path: { required: true, type: String },
		title: { default: undefined, type: String }
	},
	setup(props) {
		const options = {
			description: props.description,
			href: props.href,
			intervalMs: props.intervalMs,
			linkLabel: props.linkLabel,
			title: props.title
		} satisfies VoiceCallDebuggerLaunchOptions;
		const state = useVoiceCallDebugger(props.path, options);
		const model = computed(() =>
			createVoiceCallDebuggerLaunchViewModel(
				props.path,
				{
					error: state.error.value,
					isLoading: state.isLoading.value,
					report: state.report.value,
					updatedAt: state.updatedAt.value
				},
				options
			)
		);

		return () =>
			h(
				'section',
				{
					class: [
						'absolute-voice-call-debugger-launch',
						`absolute-voice-call-debugger-launch--${model.value.status}`,
						props.class
					]
				},
				[
					h(
						'header',
						{ class: 'absolute-voice-call-debugger-launch__header' },
						[
							h(
								'span',
								{ class: 'absolute-voice-call-debugger-launch__eyebrow' },
								model.value.title
							),
							h(
								'strong',
								{ class: 'absolute-voice-call-debugger-launch__label' },
								model.value.label
							)
						]
					),
					h(
						'p',
						{ class: 'absolute-voice-call-debugger-launch__description' },
						model.value.description
					),
					h(
						'a',
						{
							class: 'absolute-voice-call-debugger-launch__link',
							href: model.value.href
						},
						props.linkLabel ?? 'Open debugger'
					),
					model.value.rows.length
						? h(
								'dl',
								model.value.rows.map((row) =>
									h('div', { key: row.label }, [
										h('dt', row.label),
										h('dd', row.value)
									])
								)
							)
						: h(
								'p',
								{ class: 'absolute-voice-call-debugger-launch__empty' },
								'Load a call debugger report to see the latest support artifact.'
							),
					model.value.error
						? h(
								'p',
								{ class: 'absolute-voice-call-debugger-launch__error' },
								model.value.error
							)
						: null
				]
			);
	}
});
