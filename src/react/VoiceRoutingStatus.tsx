import { useVoiceRoutingStatus } from './useVoiceRoutingStatus';
import {
	createVoiceRoutingStatusViewModel,
	type VoiceRoutingStatusWidgetOptions
} from '../client/routingStatusWidget';

export type VoiceRoutingStatusProps = VoiceRoutingStatusWidgetOptions & {
	className?: string;
	path?: string;
};

export const VoiceRoutingStatus = ({
	className,
	path = '/api/routing/latest',
	...options
}: VoiceRoutingStatusProps) => {
	const snapshot = useVoiceRoutingStatus(path, options);
	const model = createVoiceRoutingStatusViewModel(snapshot, options);

	return (
		<section
			className={[
				'absolute-voice-routing-status',
				`absolute-voice-routing-status--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-routing-status__header">
				<span className="absolute-voice-routing-status__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-routing-status__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-routing-status__description">
				{model.description}
			</p>
			{model.rows.length ? (
				<div className="absolute-voice-routing-status__grid">
					{model.rows.map((row) => (
						<div key={row.label}>
							<span>{row.label}</span>
							<strong>{row.value}</strong>
						</div>
					))}
				</div>
			) : (
				<p className="absolute-voice-routing-status__empty">
					Start a voice session to see the selected provider.
				</p>
			)}
			{model.error ? (
				<p className="absolute-voice-routing-status__error">{model.error}</p>
			) : null}
		</section>
	);
};
