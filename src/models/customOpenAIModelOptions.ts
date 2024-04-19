import { BaseOpenAIModelOptions } from "@microsoft/teams-ai";

/**
 * Options for configuring an `OpenAIModel` to call the Custom OpenAI hosted model.
 */
export interface CustomOpenAIModelOptions extends BaseOpenAIModelOptions {
  /**
   * API key to use when calling the Custom OpenAI API.
   */
  apiKey: string;

  /**
   * Default model to use for completions.
   */
  defaultModel: string;

  /**
   * Endpoint to use when calling the Custom OpenAI API.
   */
  endpoint: string;
}
