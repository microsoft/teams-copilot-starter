import { ActionPlanner } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { BaseAISkill } from "./baseAISkill";
import EntityInfo from "../models/entityInfo";
import { AIPrompts } from "../prompts/aiPromptTypes";

import { logging } from "../telemetry/loggerManager";

// Get an instance of the Logger singleton object
const logger = logging.getLogger("bot.TeamsAI");

/**
 * Skill that uses OpenAI to get the details for the given entity.
 * @category Skills
 * @category AI
 * @extends {BaseAISkill}
 * @example
 * // Create the skill
 * const entityInfoSkill = new EntityInfoSkill(
 *   context,
 *   state,
 *   ai,
 *   AIPrompts.Entity
 * );
 * // Get the entity's details
 * const entityInfo = await entityInfoSkill.run(entity);
 * if (entityInfo) {
 *    await context.sendActivity(`I found the details for ${entityInfo.companyInfo.name}!`);
 * } else {
 *    await context.sendActivity("I couldn't find an entity's details.");
 * }
 */
export class EntityInfoSkill extends BaseAISkill {
  private readonly minScore = 75;
  private readonly maxScore = 98;

  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>
  ) {
    super(context, state, planner, AIPrompts.Entity);
  }

  /**
   * Returns the company's info details.
   * @param {string} query The prompt to send to OpenAI.
   * @returns {Promise<string>} A promise that resolves to a string containing the generated hint.
   * @throws {Error} If the request to OpenAI was rate limited.
   */
  public override async run(input: EntityInfo): Promise<EntityInfo> {
    try {
      const [score, rating, e, s, g] = this.getESGScores(
        this.minScore,
        this.maxScore
      );
      const companyDetails: EntityInfo = {
        ...input,
        esg: {
          score: score,
          rating: rating,
          date: this.formatDate(Date.now()),
          factors: {
            e: e,
            s: s,
            g: g,
          },
        },
      };
      return companyDetails;
    } catch (error: any) {
      logger.error(`Error parsing entity response: ${error}`);
      throw error;
    }
  }

  private getESGScores(
    min: number,
    max: number
  ): [number, string, number, number, number] {
    const ratings: string[] = [
      "Strong Performance",
      "Robust Performance",
      "Excellent Performance",
    ];
    const range = max - min + 1;
    const partSize = range / 3;
    const score = Math.floor(Math.random() * (max - min + 1)) + min;
    let rating: string;
    if (score <= min + partSize) {
      rating = ratings[0];
    } else if (score <= min + partSize * 2) {
      rating = ratings[1];
    } else {
      rating = ratings[2];
    }

    const e = Math.floor(Math.random() * (100 - min + 1)) + min;
    const s = Math.floor(Math.random() * (100 - min + 1)) + min;
    const g = Math.floor(Math.random() * (100 - min + 1)) + min;

    return [score, rating, e, s, g];
  }
}
