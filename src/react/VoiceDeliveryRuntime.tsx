import {
	createVoiceDeliveryRuntimeViewModel,
	type VoiceDeliveryRuntimeWidgetOptions
} from '../client/deliveryRuntimeWidget';
import { useVoiceDeliveryRuntime } from './useVoiceDeliveryRuntime';

export type VoiceDeliveryRuntimeProps = VoiceDeliveryRuntimeWidgetOptions & {
	className?: string;
	includeActions?: boolean;
	path?: string;
};

export const VoiceDeliveryRuntime = ({
	className,
	includeActions = true,
	path = '/api/voice-delivery-runtime',
	...options
}: VoiceDeliveryRuntimeProps) => {
	const snapshot = useVoiceDeliveryRuntime(path, options);
	const model = createVoiceDeliveryRuntimeViewModel(snapshot, options);
	const hasDeadLetters = model.surfaces.some(
		(surface) => surface.deadLettered > 0
	);

	return (
		<section
			className={[
				'absolute-voice-delivery-runtime',
				`absolute-voice-delivery-runtime--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-delivery-runtime__header">
				<span className="absolute-voice-delivery-runtime__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-delivery-runtime__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-delivery-runtime__description">
				{model.description}
			</p>
			<ul className="absolute-voice-delivery-runtime__surfaces">
				{model.surfaces.map((surface) => (
					<li
						className={`absolute-voice-delivery-runtime__surface absolute-voice-delivery-runtime__surface--${surface.status}`}
						key={surface.id}
					>
						<span>{surface.label}</span>
						<strong>{surface.detail}</strong>
						<small>
							{surface.failed} failed / {surface.deadLettered} dead-lettered
						</small>
					</li>
				))}
			</ul>
			{includeActions ? (
				<div className="absolute-voice-delivery-runtime__actions">
					<button
						disabled={model.actionStatus === 'running'}
						onClick={() => {
							void snapshot.tick().catch(() => {});
						}}
						type="button"
					>
						{model.actionStatus === 'running' ? 'Working...' : 'Tick workers'}
					</button>
					<button
						disabled={model.actionStatus === 'running' || !hasDeadLetters}
						onClick={() => {
							void snapshot.requeueDeadLetters().catch(() => {});
						}}
						type="button"
					>
						Requeue dead letters
					</button>
				</div>
			) : null}
			{model.actionError ? (
				<p className="absolute-voice-delivery-runtime__error">
					{model.actionError}
				</p>
			) : null}
			{model.error ? (
				<p className="absolute-voice-delivery-runtime__error">
					{model.error}
				</p>
			) : null}
		</section>
	);
};
