import { EventEntry, ILogger, LogEntry, MetricEntry } from "../types";
import { Env } from "../env";

export class ConsoleLogger implements ILogger {
  constructor() {}

  private getEnvs(): Env {
    return new Env();
  }

  private getMsg(logEntry: LogEntry): string {
    return `[${logEntry.module}]: [appVersion: ${
      this.getEnvs().data.APP_VERSION
    }] ${logEntry.message}`;
  }

  public getName(): string {
    return this.constructor.name;
  }

  public trace(logEntry: LogEntry): void {
    console.trace(this.getMsg(logEntry));
  }

  public debug(logEntry: LogEntry): void {
    console.debug(this.getMsg(logEntry));
  }

  public info(logEntry: LogEntry): void {
    console.info(this.getMsg(logEntry));
  }

  public warn(logEntry: LogEntry): void {
    console.warn(this.getMsg(logEntry));
  }

  public error(logEntry: LogEntry): void {
    console.error(this.getMsg(logEntry));
  }

  public trackEvent(eventEntry: EventEntry): void {
    const msg = `Event Entry %c${eventEntry.name} [%c${
      eventEntry.module
    }]: [appVersion: ${this.getEnvs().data.APP_VERSION}] %c${JSON.stringify(
      eventEntry.properties
    )}`;
    console.log(msg);
  }

  public trackDurationMetric(metricEntry: MetricEntry): void {
    const msg = `Metric Entry %c${metricEntry.name} [%c${
      metricEntry.name
    }]: [appVersion: ${this.getEnvs().data.APP_VERSION}] %c${JSON.stringify(
      metricEntry
    )}`;
    console.log(msg);
  }
}
