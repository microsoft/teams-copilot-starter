import { container } from "tsyringe";
import { Env } from "../env";
import { ActionPlanner } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState, CopilotRoles } from "../models/aiTypes";
import { BaseAISkill } from "./baseAISkill";
import * as responses from "../resources/responses";
import { usePolicy } from "cockatiel";
import { CacheHelper } from "../helpers/cacheHelper";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { AxiosError } from "axios";

import { logging } from "../telemetry/loggerManager";
import { Utils } from "../helpers/utils";
import { ActionsHelper } from "../helpers/actionsHelper";
import { MetricNames } from "../types/metricNames";
import { EventNames } from "../types/eventNames";

// Get an instance of the Logger singleton object
const logger = logging.getLogger("bot.TeamsAI");

/**
 * Skill that uses OpenAI to generate a response to the user's input.
 * @category Skills
 * @category AI
 * @extends {BaseAISkill}
 * @example
 * // Create the skill
 * const chatGPTSkill = new chatGPTSkill(
 *  context,
 *  state,
 *  ai,
 *  AIPrompts.ChatGPT
 * );
 * // Generate a response
 * const response = await chatGPTSkill.run("tell me a joke");
 * if (response) {
 *   await context.sendActivity(response);
 * } else {
 *   await context.sendActivity("I couldn't generate a response.");
 * }
 */
export class ChatGPTSkill extends BaseAISkill {
  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>
  ) {
    super(context, state, planner, AIPrompts.ChatGPT);
  }

  /**
   * Generates a Chat GPT response for the user input using OpenAI's GPT-4 LLM.
   * @returns {Promise<string>} A promise that resolves to a string containing the generated hint.
   * @throws {Error} If the request to OpenAI was rate limited.
   */
  @usePolicy(BaseAISkill.RetryPolicy)
  public override async run(input: string): Promise<any> {
    logger.debug("Running Chat GPT skill.");
    logger.debug(`Input: ${input}`);
    logger.trackEvent(
      EventNames.ChatGPTSkill,
      Utils.GetUserProperties(this.context.activity)
    );

    if (this.state.temp.useCache) {
      const maxTurnsToRemember = await Utils.MaxTurnsToRemember();
      // get the conversation chat history from the state
      const cachedHistory = CacheHelper.getChatHistory(
        this.state,
        maxTurnsToRemember
      );

      // add the user's prompt to the conversation history
      const chatHistory = [
        ...cachedHistory,
        {
          role: CopilotRoles.user,
          content: input,
        },
      ];
      this.state.temp.input = JSON.stringify(chatHistory);
    } else {
      this.state.temp.input = input;
    }

    // Get an instance of the Env singleton object
    const env = container.resolve(Env);

    // If the user has indexed the Azure AI Search RAG data source, add it to the prompt
    if (
      process.env.AZURE_SEARCH_ENDPOINT &&
      env.data.AZURE_SEARCH_ENDPOINT &&
      env.data.AZURE_SEARCH_KEY &&
      env.data.AZURE_SEARCH_INDEX_NAME &&
      env.data.AZURE_SEARCH_SOURCE_NAME
    ) {
      this.planner.prompts.addDataSource(
        await ActionsHelper.addAzureAISearchDataSource(
          AIPrompts.ChatGPT,
          this.planner
        )
      );
    }

    try {
      const startTime = Date.now();
      const response = await this.planner.completePrompt(
        this.context,
        this.state,
        this.promptTemplate!
      );
      logger.trackDurationMetric(startTime, MetricNames.ChatGPTSkillPromptTime);

      if (response.status !== "success") {
        if (response.error?.name === "AxiosError") {
          // The response is an AxiosError.
          const errMessage = (
            (response.error as AxiosError).response?.data as any
          ).error?.message;
          logger.error(
            `Chat GPT operation failed. Error: ${
              errMessage ?? responses.openAIRateLimited()
            }`
          );
          await this.context.sendActivity({
            type: "message",
            textFormat: "markdown",
            text: `**Error:** ${errMessage ?? responses.openAIRateLimited()}`,
          });
        } else {
          // The response isn't valid.
          logger.error(
            `Chat GPT operation failed. Error: ${response.error?.message}`
          );
          await this.context.sendActivity({
            type: "message",
            textFormat: "markdown",
            text: `**Error:** ${
              response.error?.message ?? responses.openAIRateLimited()
            }`,
          });
        }
        return undefined;
      }

      if (!response.message) {
        logger.error("Chat GPT operation failed. No response received.");
        await this.context.sendActivity(responses.openAIRateLimited());
        return undefined;
      }

      return response.message;
    } catch (error: any) {
      if (error.name === "AxiosError" && error.message.includes("429")) {
        await this.context.sendActivity(responses.openAIRateLimited());
      } else {
        throw error;
      }
    }
  }
}
