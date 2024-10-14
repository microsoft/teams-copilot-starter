import { EventEntry, LogEntry, MetricEntry } from ".";

export interface ILogger {
  getName(): string;
  trace(logEntry: LogEntry): void;
  debug(logEntry: LogEntry): void;
  info(logEntry: LogEntry): void;
  warn(logEntry: LogEntry): void;
  error(logEntry: LogEntry): void;
  trackEvent(eventEntry: EventEntry): void;
  trackMetric(metricEntry: MetricEntry): void;
}
