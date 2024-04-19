import { ActionPlanner } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { BaseAISkill } from "./baseAISkill";
import { usePolicy } from "cockatiel";
import CompanyInfo from "../models/companyInfo";
import { apiCustomDataService } from "../api/apiCustomDataSource";

import { logging } from "../telemetry/loggerManager";

// Get an instance of the Logger singleton object
const logger = logging.getLogger("bot.TeamsAI");

/**
 * Skill that uses searches a custom data source.
 * @category Skills
 * @category Custom
 * @extends {BaseAISkill}
 * @example
 */
export class CustomDataSourceSkill extends BaseAISkill {
  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>
  ) {
    super(context, state, planner, "");
  }

  /**
   * Returns a random list of companies.
   * @param {string} input The query to sent by the user.
   * @returns {Promise<string[]>} A promise that resolves to a string array containing the random companies.
   * @throws {Error} If an error occurred when retreiving the companies.
   */
  @usePolicy(BaseAISkill.RetryPolicy)
  public override async run(input: string): Promise<CompanyInfo[]> {
    try {
      const customDataService = new apiCustomDataService();
      const companies = customDataService.getRandomCompanies(input);

      if (!companies) {
        throw new Error(
          "Error occurred while retrieving companies from custom data source."
        );
      }

      return companies;
    } catch (error: any) {
      logger.error(`Error parsing entity response: ${error}`);
      throw error;
    }
  }
}
