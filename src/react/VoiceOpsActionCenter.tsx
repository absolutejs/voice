import {
	createVoiceOpsActionCenterViewModel,
	type VoiceOpsActionCenterWidgetOptions
} from '../client/opsActionCenterWidget';
import { useVoiceOpsActionCenter } from './useVoiceOpsActionCenter';

export type VoiceOpsActionCenterProps = VoiceOpsActionCenterWidgetOptions & {
	className?: string;
};

export const VoiceOpsActionCenter = ({
	className,
	...options
}: VoiceOpsActionCenterProps) => {
	const snapshot = useVoiceOpsActionCenter(options);
	const model = createVoiceOpsActionCenterViewModel(snapshot, options);

	return (
		<section
			className={[
				'absolute-voice-ops-action-center',
				`absolute-voice-ops-action-center--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-ops-action-center__header">
				<span className="absolute-voice-ops-action-center__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-ops-action-center__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-ops-action-center__description">
				{model.description}
			</p>
			<div className="absolute-voice-ops-action-center__actions">
				{model.actions.map((action) => (
					<button
						disabled={action.disabled}
						key={action.id}
						onClick={() => {
							void snapshot.run(action.id).catch(() => {});
						}}
						type="button"
					>
						{action.isRunning ? 'Working...' : action.label}
					</button>
				))}
			</div>
			<p className="absolute-voice-ops-action-center__result">
				{model.lastResultLabel}
			</p>
			{model.error ? (
				<p className="absolute-voice-ops-action-center__error">
					{model.error}
				</p>
			) : null}
		</section>
	);
};
