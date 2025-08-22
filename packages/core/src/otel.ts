import { NodeSdk } from "@effect/opentelemetry";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

export const createOtelLayer = (serviceName: string, url: string = "http://localhost:4318/v1/traces") =>
  NodeSdk.layer(() => ({
    resource: { serviceName },
    logRecordProcessor: new BatchLogRecordProcessor(
      new OTLPLogExporter({ url: url.replace("/v1/traces", "/v1/logs") }),
    ),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: url.replace("/v1/traces", "/v1/metrics"),
      }),
      exportIntervalMillis: 1000, // Export metrics every 1 second
    }),
    spanProcessor: new BatchSpanProcessor(
      new OTLPTraceExporter({
        url,
      }),
    ),
  }));
