import { computed, defineComponent, h } from 'vue';
import {
	createVoiceSessionSnapshotViewModel,
	type VoiceSessionSnapshotWidgetOptions
} from '../client/sessionSnapshotWidget';
import { useVoiceSessionSnapshot } from './useVoiceSessionSnapshot';

export const VoiceSessionSnapshot = defineComponent({
	name: 'VoiceSessionSnapshot',
	props: {
		class: { default: '', type: String },
		description: { default: undefined, type: String },
		downloadLabel: { default: undefined, type: String },
		intervalMs: { default: 0, type: Number },
		path: { required: true, type: String },
		title: { default: undefined, type: String },
		turnId: { default: undefined, type: String }
	},
	setup(props) {
		const options = {
			description: props.description,
			downloadLabel: props.downloadLabel,
			intervalMs: props.intervalMs,
			title: props.title,
			turnId: props.turnId
		} satisfies VoiceSessionSnapshotWidgetOptions;
		const state = useVoiceSessionSnapshot(props.path, options);
		const model = computed(() =>
			createVoiceSessionSnapshotViewModel(
				{
					error: state.error.value,
					isLoading: state.isLoading.value,
					snapshot: state.snapshot.value,
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
						'absolute-voice-session-snapshot',
						`absolute-voice-session-snapshot--${model.value.status}`,
						props.class
					]
				},
				[
					h('header', { class: 'absolute-voice-session-snapshot__header' }, [
						h(
							'span',
							{ class: 'absolute-voice-session-snapshot__eyebrow' },
							model.value.title
						),
						h(
							'strong',
							{ class: 'absolute-voice-session-snapshot__label' },
							model.value.label
						)
					]),
					h(
						'p',
						{ class: 'absolute-voice-session-snapshot__description' },
						model.value.description
					),
					model.value.showDownload
						? h(
								'button',
								{
									class: 'absolute-voice-session-snapshot__download',
									onClick: () => state.download(),
									type: 'button'
								},
								props.downloadLabel ?? 'Download snapshot'
							)
						: null,
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
								{ class: 'absolute-voice-session-snapshot__empty' },
								'Load a session snapshot to see support diagnostics.'
							),
					model.value.error
						? h(
								'p',
								{ class: 'absolute-voice-session-snapshot__error' },
								model.value.error
							)
						: null
				]
			);
	}
});
