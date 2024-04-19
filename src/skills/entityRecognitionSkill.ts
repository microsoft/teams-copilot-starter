import { ActionPlanner } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { BaseAISkill } from "./baseAISkill";
import EntityInfo from "../models/entityInfo";
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
 * const entityRecognitionSkill = new EntityRecognitionSkill(
 *   context,
 *   state,
 *   ai,
 *   AIPrompts.Entity
 * );
 * // Find the entity
 * const entity = await entityRecognitionSkill.run("Microsoft");
 * if (entity) {
 *    await context.sendActivity(`I found ${entity}!`);
 * } else {
 *    await context.sendActivity("I couldn't find an entity.");
 * }
 */
export class EntityRecognitionSkill extends BaseAISkill {
  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>
  ) {
    super(context, state, planner, AIPrompts.Entity);
  }

  /**
   * Returns the public company name if it is found in the user's input.
   * @param {string} input The prompt to send to OpenAI.
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

      if (!response || !response.message?.content) {
        return undefined;
      }

      const { content } = response.message;
      const startIndex = content.indexOf("{");
      const endIndex = content.lastIndexOf("}");

      if (startIndex !== -1 && endIndex !== -1) {
        const jsonString = content.substring(startIndex, endIndex + 1);

        const jsonResponse = JSON.parse(jsonString);
        if (jsonResponse.company && jsonResponse.company !== "") {
          const entityInfo: EntityInfo = {
            companyInfo: {
              id: jsonResponse.company,
              name: jsonResponse.company,
              ticker: jsonResponse.ticker,
              address: {
                addressLine: jsonResponse.address,
                city: jsonResponse.city,
                country: jsonResponse.country,
                city_state: `${jsonResponse.city}${
                  jsonResponse.country ? ", " + jsonResponse.country : ""
                }`,
              },
              website: jsonResponse.website,
            },
            watchListStatus: "CLEAR",
            lastUpdated: this.formatDate(Date.now()),
            employees: jsonResponse.employees,
            industry: jsonResponse.industry,
            annualRevenue: this.formatRevenue(jsonResponse.revenue),
            companyNewsSummary: {
              summary: jsonResponse.info,
            },
          };
          return entityInfo;
        } else if (jsonResponse.result) {
          return jsonResponse.result.replace(/["]/g, "").replace(/\n/g, " ");
        }
      }
      return undefined;
    } catch (error: any) {
      if (error.name === "AxiosError" && error.message.includes("429")) {
        await this.context.sendActivity(responses.openAIRateLimited());
      } else {
        logger.error(`Error parsing entity response: ${error}`);
        throw error;
      }
    }
  }

  /**
   * Returns the list of similar companies if they are found in the user's input.
   * @param {string} input The prompt to send to OpenAI.
   * @returns {Promise<string[]>} A promise that resolves to a string array containing the generated hints.
   * @throws {Error} If the request to OpenAI was rate limited.
   */
  public async findMatchingCompanies(
    input: string
  ): Promise<CompanyInfo[] | undefined> {
    this.state.temp.input = `get the list of companies whose names begin with: ${input}`;

    try {
      const response = await this.planner.completePrompt(
        this.context,
        this.state,
        AIPrompts.MatchingCompanies
      );

      if (!response || !response.message?.content) {
        return undefined;
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
      return undefined;
    } catch (error: any) {
      if (error.name === "AxiosError" && error.message.includes("429")) {
        await this.context.sendActivity(responses.openAIRateLimited());
      } else {
        logger.error(`Error parsing entity response: ${error}`);
        throw error;
      }
    }
  }

  /**
   * Returns the list of similar companies if they are found in the user's input.
   * @param {string} input The prompt to send to OpenAI.
   * @returns {Promise<string[]>} A promise that resolves to a string array containing the generated hints.
   * @throws {Error} If the request to OpenAI was rate limited.
   */
  public async findSimilarCompanies(
    input: string
  ): Promise<CompanyInfo[] | undefined> {
    this.state.temp.input = `get the list of companies that are competitors to ${input.toLocaleUpperCase()}`;

    try {
      const response = await this.planner.completePrompt(
        this.context,
        this.state,
        AIPrompts.SimilarCompanies
      );

      if (!response || !response.message?.content) {
        return undefined;
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
      return undefined;
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
