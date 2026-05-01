import {
	createVoiceCallDebuggerLaunchViewModel,
	type VoiceCallDebuggerLaunchOptions
} from '../client/callDebuggerWidget';
import { useVoiceCallDebugger } from './useVoiceCallDebugger';

export type VoiceCallDebuggerLaunchProps = VoiceCallDebuggerLaunchOptions & {
	className?: string;
	path: string;
};

export const VoiceCallDebuggerLaunch = ({
	className,
	path,
	...options
}: VoiceCallDebuggerLaunchProps) => {
	const state = useVoiceCallDebugger(path, options);
	const model = createVoiceCallDebuggerLaunchViewModel(path, state, options);

	return (
		<section
			className={[
				'absolute-voice-call-debugger-launch',
				`absolute-voice-call-debugger-launch--${model.status}`,
				className
			]
				.filter(Boolean)
				.join(' ')}
		>
			<header className="absolute-voice-call-debugger-launch__header">
				<span className="absolute-voice-call-debugger-launch__eyebrow">
					{model.title}
				</span>
				<strong className="absolute-voice-call-debugger-launch__label">
					{model.label}
				</strong>
			</header>
			<p className="absolute-voice-call-debugger-launch__description">
				{model.description}
			</p>
			<a className="absolute-voice-call-debugger-launch__link" href={model.href}>
				{options.linkLabel ?? 'Open debugger'}
			</a>
			{model.rows.length ? (
				<dl>
					{model.rows.map((row) => (
						<div key={row.label}>
							<dt>{row.label}</dt>
							<dd>{row.value}</dd>
						</div>
					))}
				</dl>
			) : (
				<p className="absolute-voice-call-debugger-launch__empty">
					Load a call debugger report to see the latest support artifact.
				</p>
			)}
			{model.error ? (
				<p className="absolute-voice-call-debugger-launch__error">
					{model.error}
				</p>
			) : null}
		</section>
	);
};
