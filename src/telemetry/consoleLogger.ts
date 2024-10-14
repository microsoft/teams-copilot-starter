import { container } from "tsyringe";
import { EventEntry, ILogger, LogEntry, MetricEntry } from "../types";
import { Env } from "../env";

export class ConsoleLogger implements ILogger {
  private readonly env: Env = container.resolve(Env);

  constructor() {}

  private getMsg(logEntry: LogEntry): string {
    return `[${logEntry.module}]: [appVersion: ${this.env.data.APP_VERSION}] ${logEntry.message}`;
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
    const msg = `Event Entry ${eventEntry.name} [${
      eventEntry.module
    }]: [appVersion: ${this.env.data.APP_VERSION}] ${JSON.stringify(
      eventEntry.properties
    )}`;
    console.log(msg);
  }

  public trackMetric(metricEntry: MetricEntry): void {
    const msg = `Metric Entry [${metricEntry.name}]: [appVersion: ${
      this.env.data.APP_VERSION
    }] ${JSON.stringify(metricEntry)}`;
    console.log(msg);
  }
}
