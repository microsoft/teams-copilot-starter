/* eslint-disable import/named */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestHeaders,
  AxiosResponse,
} from "axios";
import { logging } from "../telemetry/loggerManager";

const logger = logging.getLogger("bot.apiProvider");

/**
 * This class is a wrapper for the API provider.
 */
export abstract class ApiProvider {
  protected readonly instance: AxiosInstance;

  // Maximum number of retry attempts
  private maxRetryAttempts: number;
  // Initial delay between retry attempts in milliseconds
  private initialRetryDelay: number;

  /**
   * Constructor for the ApiProvider class.
   * @param baseUrl The base URL for the API.
   */
  constructor(
    baseUrl: string,
    private readonly retryCounts: Map<string, number> = new Map<
      string,
      number
    >()
  ) {
    // Create an instance of the axios API client.
    this.instance = axios.create({
      baseURL: baseUrl,
      headers: {
        "Content-Type": "application/json",
      },
      // 2 minute timeout, matches copilot backend timeout
      timeout: 120000,
    });

    this.setupInterceptors();

    this.retryCounts.clear();
    this.maxRetryAttempts = 3;
    this.initialRetryDelay = 500;
  }

  /**
   * An abstract method that must be implemented by the derived class to retrieve the authentication headers.
   * @returns A Promise that resolves to the authentication headers if successful, otherwise undefined.
   */
  protected abstract retrieveAuthHeaders(): Promise<
    Record<string, string> | undefined
  >;

  // setup interceptors for the axios instance
  protected setupInterceptors(): void {
    // Set up an interceptor for requests.
    this.instance.interceptors.request.use(
      async (config) => {
        if (this.isTokenRequest(config.url)) {
          return config;
        }

        // Retrieve authentication headers and add them to the request config.
        const headers = await this.retrieveAuthHeaders();
        if (headers) {
          config.headers = {
            ...config.headers,
            ...headers,
          } as AxiosRequestHeaders;
          return config;
        } else {
          return Promise.reject(
            "No authorization header found in the request config."
          );
        }
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Set up an interceptor for responses.
    this.instance.interceptors.response.use(
      (response: AxiosResponse) => {
        return response;
      },
      async (error: AxiosError) => {
        logger.warn(`Response failed: ${error}`);
        const config = error.config;
        if (error.response) {
          // Retry only on specific conditions (e.g., network error, server error, etc.)
          if (
            this.shouldRetry(error) &&
            config &&
            this.getRetryCount(config.url!) <= this.maxRetryAttempts
          ) {
            // Function to retry the request with exponential backoff
            const retryCount = this.incrementRetryCount(config.url!);
            const delay = this.getRetryDelay(retryCount);

            // Retrieve authentication headers and add them to the request config.
            if (
              !this.isTokenRequest(config.url) &&
              !config.headers.Authorization
            ) {
              const accessToken = await this.retrieveAuthHeaders();
              if (accessToken) {
                config.headers.Authorization = `Bearer ${accessToken}`;
              }
            }

            logger.warn(
              `retrying ${
                config.baseURL ? config.baseURL + config.url : ""
              } for ${retryCount} time....`
            );

            return new Promise((resolve) => {
              setTimeout(() => resolve(this.instance(config)), delay);
            });
          }

          // Reset retry count for the given URL.
          this.retryCounts.delete(config?.url ?? "");

          if (!this.shouldSkipErrorLog(error)) {
            logger.error(error.message, error);
          }

          // Reject the request with the error object.
          throw error;
        }

        // Log the error.
        logger.error(error.message, error);

        // Reject the request with the error object.
        return Promise.reject(error);
      }
    );
  }

  /**
   * A private method that checks if the request should be retried.
   * @param error - The error object.
   * @returns True if the request should be retried, false otherwise.
   */
  protected shouldRetry(error: AxiosError): boolean {
    // Define the conditions under which you want to retry (e.g., network errors, server errors, etc.)
    let shouldRetry = false;
    if (!error.response || !error.request) {
      return true;
    }

    const { status: statusCode } = error.response;
    // If the response status code is one of the intermitted network errors, retry the request with new authentication headers.
    if (
      error.config?.url &&
      (statusCode === 401 || // Unauthorized
        statusCode === 403 || // Forbidden
        statusCode === 408 || // Request Timeout
        statusCode === 413 || // Payload Too Large
        statusCode === 422 || // Unprocessable Entity
        statusCode === 429 || // Too Many Requests
        statusCode === 500 || // Internal Server Error
        statusCode === 502 || // Bad Gateway
        statusCode === 503 || // Service Unavailable
        statusCode === 504 || // Gateway Timeout
        statusCode === 404) // Not Found
    ) {
      const retryCount = this.getRetryCount(error.config.url);
      shouldRetry = retryCount < this.maxRetryAttempts ? true : false;
    }

    return shouldRetry;
  }

  protected shouldSkipErrorLog(error: AxiosError): boolean {
    if (!error.response || !error.request) {
      return false;
    }

    const { message } = error;
    if (
      message.includes("No news can be found from NewsEdge") ||
      message.includes(
        "Azure has not provided the response due to a content filter being triggered"
      )
    ) {
      return true;
    }

    return false;
  }

  /**
   * Checks if the given URL is a token request.
   * @param url - The URL to check.
   * @returns True if the given URL is a token request, false otherwise.
   */
  private isTokenRequest(url: string | undefined): boolean {
    if (!url) {
      return false;
    }
    const wordsToCheck = ["access-token", "token", "jwt"];

    return wordsToCheck.some((word) => url.includes(word));
  }

  /**
   * Gets the retry count for the given URL.
   * @param url - The URL to get the retry count for.
   * @returns The retry count for the given URL.
   */
  private getRetryCount(url: string): number {
    const count = this.retryCounts.get(url);
    return count ?? 0;
  }

  /**
   * Increments the retry count for the given URL.
   * @param url - The URL to increment the retry count for.
   * @returns The new retry count for the given URL.
   */
  private incrementRetryCount(url: string): number {
    const count = this.getRetryCount(url) + 1;
    this.retryCounts.set(url, count);
    return count;
  }

  /**
   * Gets the retry delay for the given retry count.
   * @param retryCount - The retry count to get the retry delay for.
   * @returns The retry delay for the given retry count.
   */
  private getRetryDelay(retryCount: number): number {
    return Math.pow(2, retryCount) * this.initialRetryDelay;
  }
}
