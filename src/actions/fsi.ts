import { TurnContext } from "botbuilder";
import { AI, ActionPlanner } from "@microsoft/teams-ai";
import { ApplicationTurnState, ChatParameters } from "../models/aiTypes";
import { ChatGPTSkill, EntityRecognitionSkill } from "../skills";
import { Utils } from "../helpers/utils";
import { UserHelper } from "../helpers/userHelper";
import { logging } from "../telemetry/loggerManager";
import * as responses from "../resources/responses";
import EntityInfo from "../models/entityInfo";
import { ActionsHelper } from "../helpers/actionsHelper";

/**
 * Retrieves company information using the Chat GPT Skill.
 * @param context The turn context.
 * @param state The application turn state.
 * @param planner The action planner.
 * @returns A promise that resolves to a string representing the response from the Chat GPT Skill.
 */
export async function getCompanyInfo(
  context: TurnContext,
  state: ApplicationTurnState,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  // Show typing indicator
  await Utils.startTypingTimer(context, state);

  // Get the user's information
  const user = await UserHelper.updateUserInfo(context, state);

  // Get the user's message
  const input = context.activity.text;

  // call Chat GPT Skill to get the generic response
  const chatGPTSkill = new ChatGPTSkill(context, state, planner);

  // Run the skill
  const response = await chatGPTSkill.run(input);
  if (response) {
    await context.sendActivity(response);
    logger.info(`Chat response sent: '${response}'`);
  } else {
    // No adaptive card found
    logger.info(`No response from GPT has been generated for '${input}'`);
    await context.sendActivity(responses.companyNotFound(input));
    return AI.StopCommandName;
  }

  // Continue action command execution
  return response;
}

/**
 * Retrieves company details using the Entity Recognition Skill.
 * @param context The turn context.
 * @param state The application turn state.
 * @param parameters The chat parameters.
 * @param planner The action planner.
 * @returns A promise that resolves to a string representing the entity name.
 */
export async function getCompanyDetails(
  context: TurnContext,
  state: ApplicationTurnState,
  parameters: ChatParameters,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  // Show typing indicator
  await Utils.startTypingTimer(context, state);

  // Get the user's information
  const user = await UserHelper.updateUserInfo(context, state);

  // Get the user's message
  const input = context.activity.text;

  // call Entity Info Skill to get the entity details from Teams Copilot Starter API
  const entityRecognitionSkill = new EntityRecognitionSkill(
    context,
    state,
    planner
  );

  let entity: EntityInfo | undefined;
  // Inspect the parameters to see if the entity name is present
  for (const key in parameters) {
    // Run the entity recognition skill to try and find the company name
    entity = (await entityRecognitionSkill.run(
      (parameters as any)[key]
    )) as EntityInfo;
    if (entity) {
      // Retrieve the company name from the returned response
      parameters.entity = entity.companyInfo.name;
      break;
    }
  }

  // Retrieve the company name from the returned response
  if (!entity) {
    logger.error(`Entity name is not found in the parameters: ${parameters}`);
    await context.sendActivity(
      "I'm sorry, I could not find the company name in your request. Please try again or make your command shorter."
    );
    return AI.StopCommandName;
  }

  // Generate and display Adaptive Card for the provided company name
  const card = await ActionsHelper.generateAdaptiveCardForEntity(
    context,
    state,
    entity,
    planner
  );

  if (card) {
    // Render the Adaptive Card based on the retrieved company details
    await context.sendActivity({ attachments: [card] });
  } else {
    // No adaptive card found
    logger.info(`Adaptive card failed to be generated for '${input}'`);
    await context.sendActivity(responses.companyNotFound(input));
    return AI.StopCommandName;
  }

  // Continue action command execution
  return parameters.entity;
}
