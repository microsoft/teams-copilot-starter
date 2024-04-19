import { ActionPlanner } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { BaseAISkill } from "./baseAISkill";
import * as responses from "../resources/responses";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { usePolicy } from "cockatiel";
import { logging } from "../telemetry/loggerManager";

// Get an instance of the Logger singleton object
const logger = logging.getLogger("bot.TeamsAI");

/**
 * Skill that uses OpenAI to generate a response to the user's input.
 * @category Skills
 * @category AI
 * @extends {BaseAISkill}
 * @example
 * // Create the skill
 * const generatePromptsSkill = new GeneratePromptsSkill(
 *  context,
 *  state,
 *  ai,
 *  AIPrompts.GeneratePrompts
 * );
 * // Generate a response
 * const response: string[] = await generatePromptsSkill.run("Microsoft");
 * if (response && response.length > 0) {
 *   await context.sendActivity(response[0]);
 * } else {
 *   await context.sendActivity("I couldn't generate prompts.");
 * }
 */
export class GeneratePromptsSkill extends BaseAISkill {
  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>
  ) {
    super(context, state, planner, AIPrompts.GeneratePrompts);
  }

  /**
   * Generates prompts to follow up on the provided company name using OpenAI's GPT API.
   * @returns {Promise<string>} A promise that resolves to a string containing the generated hint.
   * @throws {Error} If the request to OpenAI was rate limited.
   */
  @usePolicy(BaseAISkill.RetryPolicy)
  public override async run(input: string): Promise<any> {
    this.state.temp.input = input;

    try {
      const response = await this.planner.completePrompt(
        this.context,
        this.state,
        this.promptTemplate!
      );

      //response is sometimes a string, sometimes an array of strings as requested in prompt
      if (!response) {
        return undefined;
      }
      const jsonString = response.message?.content ?? "";
      try {
        const jsonResponse = JSON.parse(jsonString);
        return jsonResponse;
      } catch (error) {
        const strResponse = jsonString.split("\n");
        return strResponse;
      }
    } catch (error: any) {
      if (error.name === "AxiosError" && error.message.includes("429")) {
        await this.context.sendActivity(responses.openAIRateLimited());
      } else {
        logger.error(`Error parsing entity response: ${error}`);
        throw error;
      }
    }
  }
}
