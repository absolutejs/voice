import { useVoiceProofTrends } from './useVoiceProofTrends';
import {
	createVoiceProofTrendsViewModel,
	type VoiceProofTrendsWidgetOptions
} from '../client/proofTrendsWidget';

export type VoiceProofTrendsProps = VoiceProofTrendsWidgetOptions & {
	className?: string;
	path?: string;
};

export const VoiceProofTrends = ({
	className,
	path = '/api/voice/proof-trends',
	...options
}: VoiceProofTrendsProps) => {
	const snapshot = useVoiceProofTrends(path, options);
	const model = createVoiceProofTrendsViewModel(snapshot, options);

	return (
		<section
			className={[
				'absolute-voice-proof-trends',
				`absolute-voice-proof-trends--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-proof-trends__header">
				<span className="absolute-voice-proof-trends__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-proof-trends__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-proof-trends__description">
				{model.description}
			</p>
			{model.metrics.length ? (
				<div className="absolute-voice-proof-trends__metrics">
					{model.metrics.map((metric) => (
						<article key={metric.label}>
							<span>{metric.label}</span>
							<strong>{metric.value}</strong>
						</article>
					))}
				</div>
			) : (
				<p className="absolute-voice-proof-trends__empty">
					{model.error ??
						'Run the sustained proof trends script to populate evidence.'}
				</p>
			)}
			{model.links.length ? (
				<p className="absolute-voice-proof-trends__links">
					{model.links.map((link) => (
						<a href={link.href} key={link.href}>
							{link.label}
						</a>
					))}
				</p>
			) : null}
			{model.error ? (
				<p className="absolute-voice-proof-trends__error">{model.error}</p>
			) : null}
		</section>
	);
};
