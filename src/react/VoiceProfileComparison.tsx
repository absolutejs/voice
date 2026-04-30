import {
	createVoiceProfileComparisonViewModel,
	type VoiceProfileComparisonWidgetOptions
} from '../client/profileComparisonWidget';
import { useVoiceProfileComparison } from './useVoiceProfileComparison';

export type VoiceProfileComparisonProps =
	VoiceProfileComparisonWidgetOptions & {
		className?: string;
		path?: string;
	};

export const VoiceProfileComparison = ({
	className,
	path = '/api/voice/real-call-profile-history',
	...options
}: VoiceProfileComparisonProps) => {
	const snapshot = useVoiceProfileComparison(path, options);
	const model = createVoiceProfileComparisonViewModel(snapshot, options);

	return (
		<section
			className={[
				'absolute-voice-profile-comparison',
				`absolute-voice-profile-comparison--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-profile-comparison__header">
				<span className="absolute-voice-profile-comparison__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-profile-comparison__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-profile-comparison__description">
				{model.description}
			</p>
			{model.profiles.length ? (
				<div className="absolute-voice-profile-comparison__profiles">
					{model.profiles.map((profile) => (
						<article
							className={`absolute-voice-profile-comparison__profile absolute-voice-profile-comparison__profile--${profile.status}`}
							key={profile.profileId}
						>
							<header>
								<span>{profile.status}</span>
								<strong>{profile.label}</strong>
							</header>
							<p>{profile.providerRoutes}</p>
							<div>
								{profile.evidence.map((metric) => (
									<span key={metric.label}>
										<small>{metric.label}</small>
										<b>{metric.value}</b>
									</span>
								))}
							</div>
							<em>{profile.nextMove}</em>
						</article>
					))}
				</div>
			) : (
				<p className="absolute-voice-profile-comparison__empty">
					{model.error ??
						'Run real-call profile collection to populate profile comparisons.'}
				</p>
			)}
			{model.links.length ? (
				<p className="absolute-voice-profile-comparison__links">
					{model.links.map((link) => (
						<a href={link.href} key={link.href}>
							{link.label}
						</a>
					))}
				</p>
			) : null}
			{model.error ? (
				<p className="absolute-voice-profile-comparison__error">
					{model.error}
				</p>
			) : null}
		</section>
	);
};
