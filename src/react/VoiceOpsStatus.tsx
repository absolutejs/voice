import { useVoiceOpsStatus } from './useVoiceOpsStatus';
import {
	createVoiceOpsStatusViewModel,
	type VoiceOpsStatusWidgetOptions
} from '../client/opsStatusWidget';

export type VoiceOpsStatusProps = VoiceOpsStatusWidgetOptions & {
	className?: string;
	path?: string;
};

export const VoiceOpsStatus = ({
	className,
	path = '/api/voice/ops-status',
	...options
}: VoiceOpsStatusProps) => {
	const snapshot = useVoiceOpsStatus(path, options);
	const model = createVoiceOpsStatusViewModel(snapshot, options);

	return (
		<section
			className={[
				'absolute-voice-ops-status',
				`absolute-voice-ops-status--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-ops-status__header">
				<span className="absolute-voice-ops-status__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-ops-status__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-ops-status__description">
				{model.description}
			</p>
			<div className="absolute-voice-ops-status__summary">
				<span>{model.passed} passing</span>
				<span>{Math.max(model.total - model.passed, 0)} failing</span>
				<span>{model.total} checks</span>
			</div>
			<ul className="absolute-voice-ops-status__surfaces">
				{model.surfaces.length > 0 ? (
					model.surfaces.map((surface) => (
						<li
							className={`absolute-voice-ops-status__surface absolute-voice-ops-status__surface--${surface.status}`}
							key={surface.id}
						>
							<span>{surface.label}</span>
							<strong>{surface.detail}</strong>
						</li>
					))
				) : (
					<li className="absolute-voice-ops-status__surface">
						<span>Status</span>
						<strong>Waiting for first check</strong>
					</li>
				)}
			</ul>
			{model.error ? (
				<p className="absolute-voice-ops-status__error">{model.error}</p>
			) : null}
			{model.links.length > 0 ? (
				<nav className="absolute-voice-ops-status__links">
					{model.links.slice(0, 4).map((link) => (
						<a href={link.href} key={`${link.label}:${link.href}`}>
							{link.label}
						</a>
					))}
				</nav>
			) : null}
		</section>
	);
};
