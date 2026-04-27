import { useVoiceTurnLatency } from './useVoiceTurnLatency';
import {
	createVoiceTurnLatencyViewModel,
	type VoiceTurnLatencyWidgetOptions
} from '../client/turnLatencyWidget';

export type VoiceTurnLatencyProps = VoiceTurnLatencyWidgetOptions & {
	className?: string;
	path?: string;
};

export const VoiceTurnLatency = ({
	className,
	path = '/api/turn-latency',
	...options
}: VoiceTurnLatencyProps) => {
	const latency = useVoiceTurnLatency(path, options);
	const model = createVoiceTurnLatencyViewModel(latency, options);

	return (
		<section
			className={[
				'absolute-voice-turn-latency',
				`absolute-voice-turn-latency--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-turn-latency__header">
				<span className="absolute-voice-turn-latency__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-turn-latency__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-turn-latency__description">
				{model.description}
			</p>
			{model.showProofAction ? (
				<button
					className="absolute-voice-turn-latency__proof"
					onClick={() => {
						void latency.runProof().catch(() => {});
					}}
					type="button"
				>
					{model.proofLabel}
				</button>
			) : null}
			{model.turns.length ? (
				<div className="absolute-voice-turn-latency__turns">
					{model.turns.map((turn) => (
						<article
							className={[
								'absolute-voice-turn-latency__turn',
								`absolute-voice-turn-latency__turn--${turn.status}`
							].join(' ')}
							key={`${turn.sessionId}:${turn.turnId}`}
						>
							<header>
								<strong>{turn.label}</strong>
								<span>{turn.status}</span>
							</header>
							<dl>
								{turn.rows.map((row) => (
									<div key={row.label}>
										<dt>{row.label}</dt>
										<dd>{row.value}</dd>
									</div>
								))}
							</dl>
						</article>
					))}
				</div>
			) : (
				<p className="absolute-voice-turn-latency__empty">
					Complete a voice turn to see latency diagnostics.
				</p>
			)}
			{model.error ? (
				<p className="absolute-voice-turn-latency__error">{model.error}</p>
			) : null}
		</section>
	);
};
