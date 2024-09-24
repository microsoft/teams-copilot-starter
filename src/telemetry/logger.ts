// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License:
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED ""AS IS"", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import EventEmitter from "events";
import { LogEntry } from "./loggerManager";
import { AxiosError } from "axios";
import { MetricEntry } from "../types/logging";
import { EventEntry, LogMethods, StringMap } from "../types";

export class Logger {
  private logManager: EventEmitter;
  private minLevel: number;
  private module: string;
  private readonly levels: { [key: string]: number } = {
    trace: 1,
    debug: 2,
    info: 3,
    warn: 4,
    error: 5,
  };

  constructor(logManager: EventEmitter, module: string, minLevel: string) {
    this.logManager = logManager;
    this.module = module;
    this.minLevel = this.levelToInt(minLevel);
  }

  /**
   * Converts a string level (trace/debug/info/warn/error) into a number
   *
   * @param minLevel
   */
  private levelToInt(minLevel: string): number {
    if (minLevel.toLowerCase() in this.levels)
      return this.levels[minLevel.toLowerCase()];
    else return 99;
  }

  /**
   * Central logging method.
   * @param logLevel
   * @param message
   */
  public log(logLevel: string, message: string): void {
    const level = this.levelToInt(logLevel);
    if (level < this.minLevel) return;

    const logEntry: LogEntry = {
      level: logLevel,
      module: this.module,
      message,
    };

    // Obtain the line/file through a thoroughly hacky method
    // This creates a new stack trace and pulls the caller from it.  If the caller
    // if .trace()
    const error = new Error("");
    if (error.stack) {
      const cla = error.stack.split("\n");
      let idx = 1;
      while (idx < cla.length && cla[idx].includes("at Logger.Object.")) idx++;
      if (idx < cla.length) {
        logEntry.location = cla[idx].slice(
          cla[idx].indexOf("at ") + 3,
          cla[idx].length
        );
      }
    }

    this.logManager.emit("log", logEntry);
  }

  public trace(message: string): void {
    this.log("trace", message);
  }
  public debug(message: string): void {
    this.log("debug", message);
  }
  public info(message: string): void {
    this.log("info", message);
  }
  public warn(message: string): void {
    this.log("warn", message);
  }
  public error(message: string, error?: Error | AxiosError | any): void {
    if (error && error instanceof AxiosError) {
      this.log("error", `${message}`);
      this.log("error", `HTTP Status Code: ${error.response?.status}`);
      this.log("error", `Headers: ${error.request?.headers}`);
      this.log("error", `AxiosError: ${error.response?.data}`);
    } else if (error && error instanceof Error) {
      this.log("error", `${message}`);
      this.log("error", `Error Message: ${error.message}`);
      this.log("error", `Stack Trace: ${error.stack}`);
    } else {
      this.log("error", message);
    }
  }

  public trackEvent(eventName: string, properties: StringMap): void {
    properties["module"] = this.module;
    const eventEntry: EventEntry = {
      name: eventName,
      module: this.module,
      properties: properties,
    };

    if (this.logManager) {
      this.logManager.emit(LogMethods.TrackEvent, eventEntry);
    }
  }

  /**
   * Track a metric for the duration of a process.
   * @param {string} name - The name of the metric.
   * @param {number} value - The value of the metric.
   * @returns {void}
   */
  public trackMetric(name: string, value: number): void {
    const metricEntry: MetricEntry = {
      name: name,
      value: value,
    };

    if (this.logManager) {
      this.logManager.emit(LogMethods.TrackMetric, metricEntry);
    }
  }

  /**
   * Track a metric for the duration of a process.
   *
   * @param {number} startTime - The time the process started.
   * @param {string} name - The name of the metric.
   * @returns {void}
   */
  public trackDurationMetric(startTime: number, name: string): void {
    // Calculate response time
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    // Track response time as a custom metric
    const metricEntry: MetricEntry = {
      name: name,
      value: responseTime,
    };

    if (this.logManager) {
      this.logManager.emit(LogMethods.TrackMetric, metricEntry);
    }
  }
}
