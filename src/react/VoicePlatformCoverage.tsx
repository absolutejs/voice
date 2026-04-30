import { useVoicePlatformCoverage } from './useVoicePlatformCoverage';
import {
	createVoicePlatformCoverageViewModel,
	type VoicePlatformCoverageWidgetOptions
} from '../client/platformCoverageWidget';

export type VoicePlatformCoverageProps = VoicePlatformCoverageWidgetOptions & {
	className?: string;
	path?: string;
};

export const VoicePlatformCoverage = ({
	className,
	path = '/api/voice/platform-coverage',
	...options
}: VoicePlatformCoverageProps) => {
	const snapshot = useVoicePlatformCoverage(path, options);
	const model = createVoicePlatformCoverageViewModel(snapshot, options);

	return (
		<section
			className={[
				'absolute-voice-platform-coverage',
				`absolute-voice-platform-coverage--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-platform-coverage__header">
				<span className="absolute-voice-platform-coverage__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-platform-coverage__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-platform-coverage__description">
				{model.description}
			</p>
			{model.surfaces.length ? (
				<div className="absolute-voice-platform-coverage__surfaces">
					{model.surfaces.map((surface) => (
						<article
							className={[
								'absolute-voice-platform-coverage__surface',
								`absolute-voice-platform-coverage__surface--${surface.status}`
							].join(' ')}
							key={surface.surface}
						>
							<header>
								<strong>{surface.label}</strong>
								<span>{surface.status}</span>
							</header>
							<p>{surface.detail}</p>
							<small>
								{surface.evidence.filter((item) => item.ok).length}/
								{surface.evidence.length} evidence checks passing
							</small>
						</article>
					))}
				</div>
			) : (
				<p className="absolute-voice-platform-coverage__empty">
					{model.error ??
						'Run the proof pack to populate platform coverage evidence.'}
				</p>
			)}
			{model.links.length ? (
				<p className="absolute-voice-platform-coverage__links">
					{model.links.map((link) => (
						<a href={link.href} key={link.href}>
							{link.label}
						</a>
					))}
				</p>
			) : null}
			{model.error ? (
				<p className="absolute-voice-platform-coverage__error">
					{model.error}
				</p>
			) : null}
		</section>
	);
};
