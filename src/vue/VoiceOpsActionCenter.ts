import { defineComponent, h, type PropType } from 'vue';
import type { VoiceOpsActionDescriptor } from '../client/opsActionCenter';
import {
	createVoiceOpsActionCenterViewModel,
	type VoiceOpsActionCenterWidgetOptions
} from '../client/opsActionCenterWidget';
import { useVoiceOpsActionCenter } from './useVoiceOpsActionCenter';

export const VoiceOpsActionCenter = defineComponent({
	name: 'VoiceOpsActionCenter',
	props: {
		actions: Array as PropType<VoiceOpsActionDescriptor[]>,
		description: String,
		title: String
	},
	setup(props) {
		const options = {
			actions: props.actions,
			description: props.description,
			title: props.title
		} satisfies VoiceOpsActionCenterWidgetOptions;
		const center = useVoiceOpsActionCenter(options);

		return () => {
			const model = createVoiceOpsActionCenterViewModel(
				{
					actions: center.actions.value,
					error: center.error.value,
					isRunning: center.isRunning.value,
					lastResult: center.lastResult.value,
					runningActionId: center.runningActionId.value,
					updatedAt: center.updatedAt.value
				},
				options
			);

			return h(
				'section',
				{
					class: [
						'absolute-voice-ops-action-center',
						`absolute-voice-ops-action-center--${model.status}`
					]
				},
				[
					h('header', { class: 'absolute-voice-ops-action-center__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-ops-action-center__eyebrow' },
							model.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-ops-action-center__label' },
							model.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-ops-action-center__description' },
						model.description
					),
					h(
						'div',
						{ class: 'absolute-voice-ops-action-center__actions' },
						model.actions.map((action) =>
							h(
								'button',
								{
									disabled: action.disabled,
									key: action.id,
									onClick: () => {
										void center.run(action.id).catch(() => {});
									},
									type: 'button'
								},
								action.isRunning ? 'Working...' : action.label
							)
						)
					),
					h(
						'p',
						{ class: 'absolute-voice-ops-action-center__result' },
						model.lastResultLabel
					),
					model.error
						? h(
								'p',
								{ class: 'absolute-voice-ops-action-center__error' },
								model.error
							)
						: null
				]
			);
		};
	}
});
