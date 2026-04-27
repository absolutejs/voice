import { useVoiceProviderCapabilities } from './useVoiceProviderCapabilities';
import {
	createVoiceProviderCapabilitiesViewModel,
	type VoiceProviderCapabilitiesWidgetOptions
} from '../client/providerCapabilitiesWidget';

export type VoiceProviderCapabilitiesProps =
	VoiceProviderCapabilitiesWidgetOptions & {
		className?: string;
		path?: string;
	};

export const VoiceProviderCapabilities = ({
	className,
	path = '/api/provider-capabilities',
	...options
}: VoiceProviderCapabilitiesProps) => {
	const snapshot = useVoiceProviderCapabilities(path, options);
	const model = createVoiceProviderCapabilitiesViewModel(snapshot, options);

	return (
		<section
			className={[
				'absolute-voice-provider-capabilities',
				`absolute-voice-provider-capabilities--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-provider-capabilities__header">
				<span className="absolute-voice-provider-capabilities__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-provider-capabilities__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-provider-capabilities__description">
				{model.description}
			</p>
			{model.capabilities.length ? (
				<div className="absolute-voice-provider-capabilities__providers">
					{model.capabilities.map((capability) => (
						<article
							className={[
								'absolute-voice-provider-capabilities__provider',
								`absolute-voice-provider-capabilities__provider--${capability.status}`
							].join(' ')}
							key={`${capability.kind}:${capability.provider}`}
						>
							<header>
								<strong>{capability.label}</strong>
								<span>{capability.status}</span>
							</header>
							<p>{capability.detail}</p>
							<dl>
								{capability.rows.map((row) => (
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
				<p className="absolute-voice-provider-capabilities__empty">
					Configure provider capabilities to see deployment coverage.
				</p>
			)}
			{model.error ? (
				<p className="absolute-voice-provider-capabilities__error">
					{model.error}
				</p>
			) : null}
		</section>
	);
};
