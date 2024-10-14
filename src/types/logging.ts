import { ILogger } from "./ILogger";

/**
 * Represents a log entry.
 */
export interface LogEntry {
  level: string;
  module: string;
  submodule?: string;
  category?: string;
  location?: string;
  message: string;
  appVersion?: string;
}

/**
 * Represents a string map.
 */
export type StringMap = {
  [key: string]: string;
};

/**
 * Represents a event entry with additional event data.
 */
export interface EventEntry {
  name: string;
  module: string;
  properties: StringMap;
}

// Represents a metric entry with additional metric data.
export interface MetricEntry {
  name: string;
  value: number;
}

/**
 * Represents the options for the LogManager.
 */
/**
 * Represents the options for the LogManager.
 */
export interface LogOptions {
  /**
   * A mapping of module (or module+submodule+category combination) to minimum log level.
   * Example:
   * {
   *    "module1": "info",
   *    "module1.submodule1": "debug",
   *    "module1.submodule1.category1": "error"
   * }
   */
  minLevels: { [module: string]: string };

  log2Console: boolean;

  /**
   * Optional property for submodule. It can be used when configuring LogManager for a specific submodule.
   */
  submodule?: string;

  /**
   * Optional property for category. It can be used when configuring LogManager for a specific category.
   */
  category?: string;
}
