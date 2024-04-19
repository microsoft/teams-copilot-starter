/* eslint-disable prettier/prettier */
import { ActionPlanner, DataSource } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { BaseAISkill } from "./baseAISkill";
import * as responses from "../resources/responses";
import { usePolicy } from "cockatiel";
import { AxiosError } from "axios";
import { Utils } from "../helpers/utils";
import { logging } from "../telemetry/loggerManager";

// Get an instance of the Logger singleton object
const logger = logging.getLogger("bot.TeamsAI");

/**
 * Represents the BYOD (Bring Your Own Data) skill.
 */
export class BYODSkill extends BaseAISkill {

  // The constructor for the BYODSkill class
  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>,
    promptTemplate: string,
    dataSource: DataSource
  ) {
    super(context, state, planner, promptTemplate, dataSource);
  }

  /**
   * Generates a Chat GPT response for the user input.
   * @returns {Promise<string>} A promise that resolves to a string containing the generated hint.
   * @throws {Error} If the request to OpenAI was rate limited.
   */
  @usePolicy(BaseAISkill.RetryPolicy)
  public override async run(input: string): Promise<any> {
    logger.debug("Running Bring Your Own Data skill.");
    logger.debug(`Input: ${input}`);
    this.state.temp.input = input;

    // Show typing indicator
    Utils.startTypingTimer(this.context, this.state);

    try {
      const response = await this.planner.completePrompt(
        this.context,
        this.state,
        this.promptTemplate!
      );

      if (response.status !== "success") {
        if (response.error?.name === "AxiosError") {
          // The response is an AxiosError.
          const errMessage = ((response.error as AxiosError).response?.data as any).error?.message;
          logger.error(
            `Chat with the external content operation failed. Error: ${errMessage ?? responses.openAIRateLimited()}`
          );
          await this.context.sendActivity({
            type: "message",
            textFormat: "markdown",
            text: `**Error:** ${errMessage ?? responses.openAIRateLimited()}`});
        } else {
          // The response isn't valid.
          logger.error(
            `Chat with the external content operation failed. Error: ${response.error?.message}`
          );
          await this.context.sendActivity({
            type: "message",
            textFormat: "markdown",
            text: `**Error:** ${response.error?.message ?? responses.openAIRateLimited()}`});
        }
        return undefined;
      }

      // Convert the action plan json text into the content response and return it
      return Utils.extractJsonResponse(response.message?.content);
    } catch (error: any) {
      if (error.name === "AxiosError" && error.message.includes("429")) {
        await this.context.sendActivity(responses.openAIRateLimited());
      } else {
        throw error;
      }
    }
  }
}
