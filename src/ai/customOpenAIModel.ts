import {
  Memory,
  Message,
  PromptCompletionModel,
  PromptFunctions,
  PromptResponse,
  PromptTemplate,
  Tokenizer,
} from "@microsoft/teams-ai";
import { AxiosResponse } from "axios";
import { TurnContext } from "botbuilder";
import { Logger } from "../telemetry/logger";
import {
  ChatCompletionRequestMessage,
  CreateChatCompletionRequest,
  CreateChatCompletionResponse,
} from "@microsoft/teams-ai/lib/internals";
import { ApplicationTurnState } from "../models/aiTypes";
import { ApiCopilot } from "../api/apiCopilot";
import { CustomOpenAIModelOptions } from "../models/customOpenAIModelOptions";

/**
 * A `PromptCompletionModel` for calling a Custom OpenAI hosted model.
 */
export class CustomOpenAIModel implements PromptCompletionModel {
  /**
   * Options the client was configured with.
   */
  public readonly options: CustomOpenAIModelOptions;

  private readonly logger: Logger;

  /**
   * Creates a new `OpenAIModel` instance.
   * @param options Options for configuring the model client.
   */
  public constructor(options: CustomOpenAIModelOptions, logger: Logger) {
    this.options = Object.assign(
      {
        completion_type: "chat",
        retryPolicy: [2000, 5000],
        useSystemMessages: false,
      },
      options
    ) as CustomOpenAIModelOptions;

    // Cleanup and validate endpoint
    let endpoint = this.options.endpoint.trim();
    if (endpoint.endsWith("/")) {
      endpoint = endpoint.substring(0, endpoint.length - 1);
    }

    if (!endpoint.toLowerCase().startsWith("https://")) {
      throw new Error(
        `Model created with an invalid endpoint of '${endpoint}'. The endpoint must be a valid HTTPS url.`
      );
    }

    this.options.endpoint = endpoint;

    // Set logger
    this.logger = logger;
  }

  /**
   * Completes a prompt using OpenAI or Azure OpenAI.
   * @param context Current turn context.
   * @param memory An interface for accessing state values.
   * @param functions Functions to use when rendering the prompt.
   * @param tokenizer Tokenizer to use when rendering the prompt.
   * @param template Prompt template to complete.
   * @returns A `PromptResponse` with the status and message.
   */
  public async completePrompt(
    context: TurnContext,
    memory: Memory,
    functions: PromptFunctions,
    tokenizer: Tokenizer,
    template: PromptTemplate
  ): Promise<PromptResponse<string>> {
    const startTime = Date.now();
    const max_input_tokens = template.config.completion.max_input_tokens;
    const model = template.config.completion.model ?? this.options.defaultModel;
    // Render prompt
    const result = await template.prompt.renderAsMessages(
      context,
      memory,
      functions,
      tokenizer,
      max_input_tokens
    );
    if (result.tooLong) {
      return {
        status: "too_long",
        input: undefined,
        error: new Error(
          `The generated chat completion prompt had a length of ${result.length} tokens which exceeded the max_input_tokens of ${max_input_tokens}.`
        ),
      };
    }
    if (
      !this.options.useSystemMessages &&
      result.output.length > 0 &&
      result.output[0].role == "system"
    ) {
      result.output[0].role = "user";
    }
    if (this.options.logRequests) {
      this.logger.info("CHAT PROMPT:");
      result.output.forEach((output) => {
        this.logger.info(`${output.role}: ${output.content}`);
      });
    }

    // Get input message
    // - we're doing this here because the input message can be complex and include images.
    let input: Message<any> | undefined;
    const last = result.output.length - 1;
    if (last > 0 && result.output[last].role == "user") {
      input = result.output[last];
    }

    // Call chat completion API
    const request: CreateChatCompletionRequest =
      this.copyOptionsToRequest<CreateChatCompletionRequest>(
        {
          messages: result.output as ChatCompletionRequestMessage[],
        },
        template.config.completion,
        [
          "max_tokens",
          "temperature",
          "top_p",
          "n",
          "stream",
          "logprobs",
          "echo",
          "stop",
          "presence_penalty",
          "frequency_penalty",
          "best_of",
          "logit_bias",
          "user",
          "functions",
          "function_call",
        ]
      );
    const state = memory as ApplicationTurnState;
    const response = await this.createChatCompletion(
      context,
      state,
      request,
      model
    );
    if (this.options.logRequests) {
      this.logger.info("CHAT RESPONSE:");
      this.logger.info(`status: ${response.status}`);
      this.logger.info(`duration: ${Date.now() - startTime}, 'ms'`);
      response.data.choices.forEach((choice: any) => {
        this.logger.info(`${choice.message?.role}: ${choice.message?.content}`);
      });
    }

    // Process response
    if (response.status < 300) {
      const completion = response.data.choices[0];
      const message = completion.message
        ? this.formatCommands(completion.message, "SAY", 0)
        : undefined;
      return {
        status: "success",
        input,
        message: message ?? { role: "assistant", content: "" },
      };
    } else if (response.status == 429) {
      if (this.options.logRequests) {
        this.logger.info("HEADERS:");
        response.headers.forEach((value: string, key: any) => {
          this.logger.info(value);
        });
      }
      return {
        status: "rate_limited",
        input: undefined,
        error: new Error(
          "The chat completion API returned a rate limit error."
        ),
      };
    } else {
      return {
        status: "error",
        input: undefined,
        error: new Error(
          `The chat completion API returned an error status of ${response.status}: ${response.statusText}`
        ),
      };
    }
  }

  /**
   * @param target
   * @param src
   * @param fields
   * @private
   */
  protected copyOptionsToRequest<TRequest>(
    target: Partial<TRequest>,
    src: any,
    fields: string[]
  ): TRequest {
    for (const field of fields) {
      if (src[field] !== undefined) {
        (target as any)[field] = src[field];
      }
    }

    return target as TRequest;
  }

  /**
   * @param request
   * @param model
   * @private
   */
  protected async createChatCompletion<TData>(
    context: TurnContext,
    state: ApplicationTurnState,
    request: CreateChatCompletionRequest,
    model: string
  ): Promise<AxiosResponse<CreateChatCompletionResponse>> {
    // Create new instances of the Copilot API client
    const api = new ApiCopilot(this.options.endpoint || "");
    const response = await api.completeChat(request.messages);
    const object = response.data as any;
    return {
      status: response.status,
      statusText: response.statusText,
      data: object.data[0],
      headers: response.headers,
      config: response.config,
    };
  }

  /**
   * Formats the outbound commands. For example, it swaps the first two commands in the message. i.e. 'DO' with 'SAY'
   * @param message
   * @param commandType
   * @param index
   * @private
   */
  protected formatCommands(
    message: Message<string>,
    commandType: string,
    index: number
  ): Message<string> | undefined {
    try {
      if (!message.content) return message;
      const jsonContent = JSON.parse(message.content);
      const commands = jsonContent.commands;
      // remove command if it doesn't contain the command type `DO`
      if (commands.length < 2 && commands[0].type !== "SAY") {
        commands.removeAt(0);
        message.content = JSON.stringify(jsonContent);
        return message;
      }
      if (
        jsonContent?.type === "plan" &&
        jsonContent?.commands?.length > index
      ) {
        const firstCommand = commands[index];
        const secondCommand = commands[index + 1];
        if (secondCommand?.type !== commandType) return message;
        commands[index] = secondCommand;
        commands[index + 1] = firstCommand;
        message.content = JSON.stringify(jsonContent);
        return message;
      }
      return message;
    } catch (error) {
      return message;
    }
  }
}
