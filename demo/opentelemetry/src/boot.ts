import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { trace } from "@opentelemetry/api";

const sdk = new NodeSDK({
  serviceName: "demo-opentelemetry",
  traceExporter: new OTLPTraceExporter(),
  metricReader: new PrometheusExporter({ port: 9464 }),
});

export async function onStartup() {
  // Start the SDK first - required before any spans can be created
  sdk.start();
  console.log("OpenTelemetry SDK started");

  // Wrap startup work in a span to group related operations
  const tracer = trace.getTracer("@astroscope/boot");
  await tracer.startActiveSpan("startup", async (span) => {
    try {
      // This fetch appears as a child of the "startup" span
      const response = await fetch(
        "https://jsonplaceholder.typicode.com/posts/1"
      );
      const post = await response.json();
      console.log("Fetched post during startup:", post.title);
    } finally {
      span.end();
    }
  });
}

export async function onShutdown() {
  await sdk.shutdown();
  console.log("OpenTelemetry SDK shut down");
}
