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

import { EventEmitter } from "events";
import { Logger } from "./logger";
import { ILogger } from "../types";
import { ConsoleLogger } from "./consoleLogger";

/**
 * The LogManager class is responsible for managing loggers and logging options.
 * It extends the EventEmitter class to allow for listening to log events.
 */
export class LogManager extends EventEmitter {
  private options: LogOptions = {
    minLevels: {
      "": "info",
    },
  };

  // The active logger
  private loggerSinks: ILogger[] = [];

  public get Loggers(): ILogger[] {
    return this.loggerSinks;
  }

  // Prevent the console logger from being added twice
  private consoleLoggerRegistered = false;

  /**
   * Configures the LogManager with the provided options.
   * @param options The options to configure the LogManager with.
   * @returns The LogManager instance.
   */
  public configure(options: LogOptions): LogManager {
    this.options = Object.assign({}, this.options, options);
    return this;
  }

  /**
   * Returns a Logger instance for the specified module.
   * @param module The name of the module to get a logger for.
   * @returns A Logger instance for the specified module.
   */
  public getLogger(module: string): Logger {
    let minLevel = "none";
    let match = "";

    // Find the minimum log level for the specified module
    for (const key in this.options.minLevels) {
      if (module.startsWith(key) && key.length >= match.length) {
        minLevel = this.options.minLevels[key];
        match = key;
      }
    }

    // Create and return a new Logger instance
    return new Logger(this, module, minLevel);
  }

  /**
   * Registers a listener function to be called whenever a log entry is created.
   * @param listener The function to be called when a log entry is created.
   * @returns The LogManager instance.
   */
  public onLogEntry(listener: (logEntry: LogEntry) => void): LogManager {
    this.on("log", listener);
    return this;
  }

  /**
   * Registers a ConsoleLogger instance to log to the console.
   * @returns The LogManager instance.
   */
  public registerLogger(loggerSink?: ILogger): LogManager {
    const logger = loggerSink ? loggerSink : new ConsoleLogger();
    const registered = this.loggerSinks.find(
      (s) => s.constructor.name === logger.constructor.name
    );
    if (registered) {
      // loggerSink is already registered, so can be ignored
      return this;
    }

    this.onLogEntry((logEntry) => {
      switch (logEntry.level) {
        case "trace":
          logger.trace(logEntry);
          break;
        case "debug":
          logger.debug(logEntry);
          break;
        case "info":
          logger.info(logEntry);
          break;
        case "warn":
          logger.warn(logEntry);
          break;
        case "error":
          logger.error(logEntry);
          break;
        default:
          logger.info(logEntry);
      }
    });

    this.addLoggerSink(logger);
    return this;
  }

  /**
   * Add a new logger sink to the list of loggers
   * @param loggerSink The logger sink to add
   * @returns The LogManager instance.
   **/
  private addLoggerSink(loggerSink: ILogger): LogManager {
    // check that the loggerSink is not already in the list
    if (
      this.loggerSinks.find(
        (s) => s.constructor.name === loggerSink.constructor.name
      )
    ) {
      return this;
    }

    // not found, add it
    this.loggerSinks.push(loggerSink);
    return this;
  }
}

/**
 * Represents a log entry.
 */
export interface LogEntry {
  level: string;
  module: string;
  location?: string;
  message: string;
}

/**
 * Represents the options for the LogManager.
 */
export interface LogOptions {
  minLevels: { [module: string]: string };
}

export const logging = new LogManager();
