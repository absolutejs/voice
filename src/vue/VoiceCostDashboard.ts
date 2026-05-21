import { computed, defineComponent, h, type PropType } from "vue";
import type { StoredVoiceTraceEvent } from "../core/trace";
import {
  buildVoiceCostDashboardReport,
  type VoiceCostDashboardBucket,
  type VoiceCostDashboardOptions,
} from "../client/costDashboard";

const formatUsd = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    currency,
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);

const formatInteger = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

const renderRow = (
  bucket: VoiceCostDashboardBucket,
  currency: string,
  isTotal: boolean,
) =>
  h(
    "tr",
    {
      "data-bucket-key": bucket.bucketKey,
      style: {
        borderTop: isTotal ? "2px solid rgba(255,255,255,0.15)" : undefined,
        fontWeight: isTotal ? 600 : undefined,
      },
    },
    [
      h("td", { style: { padding: "8px 12px" } }, bucket.bucketKey),
      h(
        "td",
        { style: { padding: "8px 12px", textAlign: "right" } },
        formatInteger(bucket.callCount),
      ),
      h(
        "td",
        { style: { padding: "8px 12px", textAlign: "right" } },
        formatUsd(bucket.llmUsd, currency),
      ),
      h(
        "td",
        { style: { padding: "8px 12px", textAlign: "right" } },
        formatUsd(bucket.ttsUsd, currency),
      ),
      h(
        "td",
        { style: { padding: "8px 12px", textAlign: "right" } },
        formatUsd(bucket.sttUsd, currency),
      ),
      h(
        "td",
        { style: { padding: "8px 12px", textAlign: "right" } },
        formatUsd(bucket.telephonyUsd, currency),
      ),
      h(
        "td",
        { style: { padding: "8px 12px", textAlign: "right" } },
        formatUsd(bucket.totalUsd, currency),
      ),
    ],
  );

export const VoiceCostDashboard = defineComponent({
  name: "VoiceCostDashboard",
  props: {
    bucketBy: {
      default: "day",
      type: String as PropType<VoiceCostDashboardOptions["bucketBy"]>,
    },
    currency: { default: "USD", type: String },
    emptyMessage: { default: "No cost events in window.", type: String },
    events: {
      required: true,
      type: Array as PropType<ReadonlyArray<StoredVoiceTraceEvent>>,
    },
    fromMs: Number,
    title: { default: "Voice cost dashboard", type: String },
    toMs: Number,
  },
  setup(props) {
    const report = computed(() =>
      buildVoiceCostDashboardReport({
        bucketBy: props.bucketBy,
        events: props.events,
        fromMs: props.fromMs,
        toMs: props.toMs,
      }),
    );

    return () => {
      const r = report.value;
      const rows = r.buckets.map((bucket) =>
        renderRow(bucket, props.currency, false),
      );
      rows.push(renderRow(r.grandTotal, props.currency, true));

      return h(
        "section",
        {
          "aria-label": "voice-cost-dashboard",
          class: "absolute-voice-cost-dashboard",
          style: {
            background: "#0f172a",
            borderRadius: "16px",
            color: "#f8fafc",
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            padding: "20px",
          },
        },
        [
          h(
            "header",
            {
              style: {
                alignItems: "baseline",
                display: "flex",
                gap: "12px",
                marginBottom: "12px",
              },
            },
            [
              h("strong", { style: { fontSize: "16px" } }, props.title),
              h(
                "span",
                { style: { fontSize: "13px", opacity: "0.7" } },
                `${r.buckets.length} buckets · grand total ${formatUsd(r.grandTotal.totalUsd, props.currency)}`,
              ),
            ],
          ),
          r.buckets.length === 0
            ? h(
                "p",
                { style: { fontSize: "13px", opacity: "0.7" } },
                props.emptyMessage,
              )
            : h(
                "table",
                {
                  style: {
                    borderCollapse: "collapse",
                    fontSize: "13px",
                    width: "100%",
                  },
                },
                [
                  h("thead", [
                    h("tr", { style: { opacity: "0.7", textAlign: "left" } }, [
                      h("th", { style: { padding: "8px 12px" } }, "Bucket"),
                      h(
                        "th",
                        { style: { padding: "8px 12px", textAlign: "right" } },
                        "Calls",
                      ),
                      h(
                        "th",
                        { style: { padding: "8px 12px", textAlign: "right" } },
                        "LLM",
                      ),
                      h(
                        "th",
                        { style: { padding: "8px 12px", textAlign: "right" } },
                        "TTS",
                      ),
                      h(
                        "th",
                        { style: { padding: "8px 12px", textAlign: "right" } },
                        "STT",
                      ),
                      h(
                        "th",
                        { style: { padding: "8px 12px", textAlign: "right" } },
                        "Tel.",
                      ),
                      h(
                        "th",
                        { style: { padding: "8px 12px", textAlign: "right" } },
                        "Total",
                      ),
                    ]),
                  ]),
                  h("tbody", rows),
                ],
              ),
        ],
      );
    };
  },
});
