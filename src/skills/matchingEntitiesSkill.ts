import { ActionPlanner } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { BaseAISkill } from "./baseAISkill";
import * as responses from "../resources/responses";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { usePolicy } from "cockatiel";
import CompanyInfo from "../models/companyInfo";
import { logging } from "../telemetry/loggerManager";

// Get an instance of the Logger singleton object
const logger = logging.getLogger("bot.TeamsAI");

/**
 * Skill that uses OpenAI to find an entity in the user's input.
 * @category Skills
 * @category AI
 * @extends {BaseAISkill}
 * @example
 * // Create the skill
 * const matchingCompaniesSkill = new MatchingEntitiesSkill(
 *   context,
 *   state,
 *   ai,
 *   AIPrompts.Entity
 * );
 * // Find the entity
 * const entity = await matchingCompaniesSkill.run("Microsoft");
 * if (entity) {
 *    await context.sendActivity(`I found ${entity}!`);
 * } else {
 *    await context.sendActivity("I couldn't find an entity.");
 * }
 */
export class MatchingEntitiesSkill extends BaseAISkill {
  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>
  ) {
    super(context, state, planner, AIPrompts.MatchingCompanies);
  }

  /**
   * Returns the list of similar companies if they are found in the user's input.
   * @param {string} input The prompt to send to OpenAI.
   * @returns {Promise<string[]>} A promise that resolves to a string array containing the generated hints.
   * @throws {Error} If the request to OpenAI was rate limited.
   */
  @usePolicy(BaseAISkill.RetryPolicy)
  public override async run(input: string): Promise<CompanyInfo[]> {
    this.state.temp.input = `get the list of companies whose names begin with: ${input}`;

    try {
      const response = await this.planner.completePrompt(
        this.context,
        this.state,
        this.promptTemplate!
      );

      if (!response || !response.message?.content) {
        throw new Error(
          `Error occurred while processing the LLM request for ${input}`
        );
      }

      const { content } = response.message;
      const companies: CompanyInfo[] = [];
      const startIndex = content.indexOf("{");
      const endIndex = content.lastIndexOf("}");

      if (startIndex !== -1 && endIndex !== -1) {
        const jsonString = content.substring(startIndex, endIndex + 1);
        const jsonResponse = JSON.parse(jsonString);

        if (jsonResponse.entities) {
          jsonResponse.entities.forEach((entity: any) => {
            if (entity.company && entity.company !== "") {
              const companyInfo: CompanyInfo = {
                id: entity.company,
                name: entity.company,
                ticker: entity.ticker,
                worldRegion: entity.location,
                website: entity.website,
              };
              companies.push(companyInfo);
            }
          });
          return companies;
        }
      }
    } catch (error: any) {
      if (error.name === "AxiosError" && error.message.includes("429")) {
        await this.context.sendActivity(responses.openAIRateLimited());
      } else {
        logger.error(`Error parsing entity response: ${error}`);
        throw error;
      }
    }
    return [];
  }
}
