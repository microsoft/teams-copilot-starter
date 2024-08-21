// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
// tsyringe requires a reflect polyfill. Please add 'import "reflect-metadata"' to the top of your entry point.
import "reflect-metadata";
import { logging } from "../telemetry/loggerManager";
import { ApiProvider } from "./apiProvider";
import { container, injectable, singleton } from "tsyringe";
import axios, { AxiosError, AxiosResponse, isAxiosError } from "axios";
import { Message } from "@microsoft/teams-ai";
import { Env } from "../env";

const logger = logging.getLogger("bot.apiCopilot");

/**
 * This class is a wrapper for the custom Open AI API Endpoint.
 */
@injectable()
@singleton()
export class ApiCopilot extends ApiProvider {
  // constructor
  constructor(baseUrl: string) {
    // Create an instance of the axios API client.
    super(baseUrl);
  }

  // retrieve authentication headers
  public override async retrieveAuthHeaders(): Promise<
    Record<string, string> | undefined
  > {
    const env = container.resolve(Env);
    const headers: Record<string, string> = {
      "X-API-Client-Id": env.data.CUSTOM_API_CLIENT_ID || "",
      "X-API-Secret": env.data.CUSTOM_API_CLIENT_SECRET || "",
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Return the authentication headers.
    return headers;
  }

  /**
   * Returns the completion for the specified prompt.
   * @param query The query to search for.
   */
  public completeChat = async (
    prompts: Message[]
  ): Promise<AxiosResponse<any, any>> => {
    // Construct the URL for the search query
    const completeChatUrl = "/v1/completion";

    try {
      // Make a GET request to the constructed URL using the Axios instance
      const response = await this.instance.get(completeChatUrl, {
        headers: { Accept: "application/json" },
      });

      return response;
    } catch (error: Error | AxiosError | any) {
      // If the request fails, log the error and throw an exception
      const defaultMessage = "Failed to get the response from Copilot API";
      if (error?.response?.status || isAxiosError(error)) {
        logger.error(error.response?.data?.message || defaultMessage);
      } else {
        logger.error(defaultMessage, error);
      }
      throw error;
    }
  };
}
