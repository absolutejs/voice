import { Component, Input, OnDestroy, OnInit, signal } from "@angular/core";
import {
  createVoiceDeliveryRuntimeViewModel,
  type VoiceDeliveryRuntimeViewModel,
  type VoiceDeliveryRuntimeWidgetOptions,
} from "../client/deliveryRuntimeWidget";
import { createVoiceDeliveryRuntimeStore } from "../client/deliveryRuntime";

@Component({
  selector: "absolute-voice-delivery-runtime",
  standalone: true,
  template: `
    <section
      class="absolute-voice-delivery-runtime"
      [class.absolute-voice-delivery-runtime--pass]="model().status === 'pass'"
      [class.absolute-voice-delivery-runtime--warn]="model().status === 'warn'"
      [class.absolute-voice-delivery-runtime--loading]="
        model().status === 'loading'
      "
      [class.absolute-voice-delivery-runtime--error]="
        model().status === 'error'
      "
    >
      <header class="absolute-voice-delivery-runtime__header">
        <span class="absolute-voice-delivery-runtime__eyebrow">{{
          model().title
        }}</span>
        <strong class="absolute-voice-delivery-runtime__label">{{
          model().label
        }}</strong>
      </header>
      <p class="absolute-voice-delivery-runtime__description">
        {{ model().description }}
      </p>
      <ul class="absolute-voice-delivery-runtime__surfaces">
        @for (surface of model().surfaces; track surface.id) {
          <li
            class="absolute-voice-delivery-runtime__surface"
            [class.absolute-voice-delivery-runtime__surface--pass]="
              surface.status === 'pass'
            "
            [class.absolute-voice-delivery-runtime__surface--warn]="
              surface.status === 'warn'
            "
            [class.absolute-voice-delivery-runtime__surface--disabled]="
              surface.status === 'disabled'
            "
          >
            <span>{{ surface.label }}</span>
            <strong>{{ surface.detail }}</strong>
            <small
              >{{ surface.failed }} failed /
              {{ surface.deadLettered }} dead-lettered</small
            >
          </li>
        }
      </ul>
      <div class="absolute-voice-delivery-runtime__actions">
        <button
          type="button"
          [disabled]="model().actionStatus === 'running'"
          (click)="tick()"
        >
          {{
            model().actionStatus === "running" ? "Working..." : "Tick workers"
          }}
        </button>
        <button
          type="button"
          [disabled]="
            model().actionStatus === 'running' || deadLettered() === 0
          "
          (click)="requeueDeadLetters()"
        >
          Requeue dead letters
        </button>
      </div>
      @if (model().actionError) {
        <p class="absolute-voice-delivery-runtime__error">
          {{ model().actionError }}
        </p>
      }
      @if (model().error) {
        <p class="absolute-voice-delivery-runtime__error">
          {{ model().error }}
        </p>
      }
    </section>
  `,
})
export class VoiceDeliveryRuntimeComponent implements OnDestroy, OnInit {
  @Input() description?: string;
  @Input() intervalMs?: number;
  @Input() path = "/api/voice-delivery-runtime";
  @Input() title?: string;

  private cleanup = () => {};
  private store?: ReturnType<typeof createVoiceDeliveryRuntimeStore>;

  model = signal<VoiceDeliveryRuntimeViewModel>(
    createVoiceDeliveryRuntimeViewModel({
      actionError: null,
      actionStatus: "idle",
      error: null,
      isLoading: true,
    }),
  );

  ngOnInit() {
    const options = this.options();
    this.store = createVoiceDeliveryRuntimeStore(this.path, options);
    const sync = () => {
      this.model.set(
        createVoiceDeliveryRuntimeViewModel(this.store!.getSnapshot(), options),
      );
    };
    this.cleanup = this.store.subscribe(sync);
    sync();
    if (typeof window !== "undefined") {
      void this.store.refresh().catch(() => {});
    }
  }

  ngOnDestroy() {
    this.cleanup();
    this.store?.close();
  }

  deadLettered() {
    return this.model().surfaces.reduce(
      (total, surface) => total + surface.deadLettered,
      0,
    );
  }

  tick() {
    void this.store?.tick().catch(() => {});
  }

  requeueDeadLetters() {
    void this.store?.requeueDeadLetters().catch(() => {});
  }

  private options(): VoiceDeliveryRuntimeWidgetOptions {
    return {
      description: this.description,
      intervalMs: this.intervalMs,
      title: this.title,
    };
  }
}
