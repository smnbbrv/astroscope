import { register } from "node:module";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

// Register the OpenTelemetry ESM loader hook
// See: https://github.com/open-telemetry/opentelemetry-js/issues/4392#issuecomment-2115512083
register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);

const sdk = new NodeSDK({
  serviceName: "demo-opentelemetry-native",
  traceExporter: new OTLPTraceExporter({
    // Defaults to http://localhost:4318/v1/traces
    // Set OTEL_EXPORTER_OTLP_ENDPOINT to override
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log("OpenTelemetry SDK started with native ESM instrumentation");

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OpenTelemetry SDK shut down"))
    .catch((error) => console.error("Error shutting down OpenTelemetry SDK:", error))
    .finally(() => process.exit(0));
});
