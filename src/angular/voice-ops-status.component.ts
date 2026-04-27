import { Component, Input, OnDestroy, OnInit, signal } from '@angular/core';
import {
	createVoiceOpsStatusViewModel,
	type VoiceOpsStatusViewModel,
	type VoiceOpsStatusWidgetOptions
} from '../client/opsStatusWidget';
import { createVoiceAppKitStatusStore } from '../client/appKitStatus';

@Component({
	selector: 'absolute-voice-ops-status',
	standalone: true,
	template: `
		<section
			class="absolute-voice-ops-status"
			[class.absolute-voice-ops-status--pass]="model().status === 'pass'"
			[class.absolute-voice-ops-status--fail]="model().status === 'fail'"
			[class.absolute-voice-ops-status--loading]="model().status === 'loading'"
			[class.absolute-voice-ops-status--error]="model().status === 'error'"
		>
			<header class="absolute-voice-ops-status__header">
				<span class="absolute-voice-ops-status__eyebrow">{{
					model().title
				}}</span>
				<strong class="absolute-voice-ops-status__label">{{
					model().label
				}}</strong>
			</header>
			<p class="absolute-voice-ops-status__description">
				{{ model().description }}
			</p>
			<div class="absolute-voice-ops-status__summary">
				<span>{{ model().passed }} passing</span>
				<span>{{ model().total - model().passed }} failing</span>
				<span>{{ model().total }} checks</span>
			</div>
			<ul class="absolute-voice-ops-status__surfaces">
				@if (model().surfaces.length > 0) {
					@for (surface of model().surfaces; track surface.id) {
						<li
							class="absolute-voice-ops-status__surface"
							[class.absolute-voice-ops-status__surface--pass]="
								surface.status === 'pass'
							"
							[class.absolute-voice-ops-status__surface--fail]="
								surface.status === 'fail'
							"
						>
							<span>{{ surface.label }}</span>
							<strong>{{ surface.detail }}</strong>
						</li>
					}
				} @else {
					<li class="absolute-voice-ops-status__surface">
						<span>Status</span>
						<strong>Waiting for first check</strong>
					</li>
				}
			</ul>
			@if (model().error) {
				<p class="absolute-voice-ops-status__error">{{ model().error }}</p>
			}
			@if (model().links.length > 0) {
				<nav class="absolute-voice-ops-status__links">
					@for (link of model().links.slice(0, 4); track link.href) {
						<a [href]="link.href">{{ link.label }}</a>
					}
				</nav>
			}
		</section>
	`
})
export class VoiceOpsStatusComponent implements OnDestroy, OnInit {
	@Input() description?: string;
	@Input() includeLinks = true;
	@Input() intervalMs?: number;
	@Input() path = '/app-kit/status';
	@Input() title?: string;

	private cleanup = () => {};
	private store?: ReturnType<typeof createVoiceAppKitStatusStore>;

	model = signal<VoiceOpsStatusViewModel>(
		createVoiceOpsStatusViewModel({
			error: null,
			isLoading: true
		})
	);

	ngOnInit() {
		const options = this.options();
		this.store = createVoiceAppKitStatusStore(this.path, options);
		const sync = () => {
			this.model.set(
				createVoiceOpsStatusViewModel(this.store!.getSnapshot(), options)
			);
		};
		this.cleanup = this.store.subscribe(sync);
		sync();
		if (typeof window !== 'undefined') {
			void this.store.refresh().catch(() => {});
		}
	}

	ngOnDestroy() {
		this.cleanup();
		this.store?.close();
	}

	private options(): VoiceOpsStatusWidgetOptions {
		return {
			description: this.description,
			includeLinks: this.includeLinks,
			intervalMs: this.intervalMs,
			title: this.title
		};
	}
}
