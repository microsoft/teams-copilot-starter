import * as appInsights from "applicationinsights";
import {
  MetricTelemetry,
  SeverityLevel,
} from "applicationinsights/out/Declarations/Contracts";
import { MetricEntry } from "../types";

export class AppInsightsService {
  private client: appInsights.TelemetryClient;
  constructor(instrumentationKey: string) {
    appInsights.setup(instrumentationKey).start();
    this.client = appInsights.defaultClient;
  }

  public trackException(exception: Error): void {
    this.client.trackException({
      exception: exception,
      severity: SeverityLevel.Error,
    });
  }

  public trackTrace(message: string, severityLevel: SeverityLevel): void {
    this.client.trackTrace({
      message: message,
      severity: severityLevel,
    });
  }

  public trackEvent(
    eventName: string,
    properties?: { [key: string]: string }
  ): void {
    this.client.trackEvent({ name: eventName, properties });
  }

  public trackMetric(metricEntry: MetricEntry): void {
    // Track response time as a custom metric
    const metricTelemetry: MetricTelemetry = {
      name: metricEntry.name,
      value: metricEntry.value,
    };
    this.client.trackMetric(metricTelemetry);
  }
}
