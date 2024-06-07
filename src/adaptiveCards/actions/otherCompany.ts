import { TurnContext } from "botbuilder";
import { ActionPlanner } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../../models/aiTypes";
import { ChatGPTSkill, EntityRecognitionSkill } from "../../skills";
import { Utils } from "../../helpers/utils";
import { logging } from "../../telemetry/loggerManager";
import * as responses from "../../resources/responses";
import EntityInfo from "../../models/entityInfo";
import { ActionsHelper } from "../../helpers/actionsHelper";

/**
 * Retrieves information about a company and generates an Adaptive Card for display.
 *
 * @param {TurnContext} context - The context object for the current turn of the conversation.
 * @param {ApplicationTurnState} state - The application turn state object.
 * @param {any} data - The prompt message data containing the user's selected company name.
 * @param {ActionPlanner<ApplicationTurnState>} planner - The action planner for the current turn.
 * @returns {Promise<string>} A promise that resolves to an empty string.
 */
export async function otherCompany(
  context: TurnContext,
  state: ApplicationTurnState,
  data: any,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");

  // notify user that the bot is working
  await context.sendActivity(responses.promptReturned());

  // Show typing indicator
  await Utils.startTypingTimer(context, state);

  // clear the conversation history
  state.deleteConversationState();

  try {
    // Get the user's selected company name
    const companyName = data;

    logger.info(`User's selection received: '${companyName}'`);

    // call Chat GPT Skill to get the generic response
    const chatGPTSkill = new ChatGPTSkill(context, state, planner);

    // Run the skill
    const response = await chatGPTSkill.run(
      `get company info on ${companyName}`
    );
    if (response) {
      await context.sendActivity(response);
      logger.info(`Chat response sent: '${response}'`);
    }

    // send a work in progress message
    const msg = responses.searchingForCompany(`<b>${companyName}</b>`);
    await context.sendActivity(msg);

    // Show typing indicator
    await Utils.startTypingTimer(context, state);

    // call Entity Info Skill to get the entity details from Teams Copilot Starter API
    const entityRecognitionSkill = new EntityRecognitionSkill(
      context,
      state,
      planner
    );

    // Run the skill to get the entity details
    const entityInfo = (await entityRecognitionSkill.run(
      companyName
    )) as EntityInfo;

    // Generate and display Adaptive Card for the provided company name
    const card = await ActionsHelper.generateAdaptiveCardForEntity(
      context,
      state,
      entityInfo,
      planner
    );

    if (card) {
      // Render the Adaptive Card based on the retrieved company details
      await context.sendActivity({ attachments: [card] });
    } else {
      // No adaptive card found
      logger.info(`Adaptive card failed to be generated for '${companyName}'`);
      await context.sendActivity(responses.companyNotFound(companyName));
      return `Adaptive card failed to be generated for '${companyName}'`;
    }
  } catch (error) {
    logger.error(`Error processing message: ${error}`);
    await context.sendActivity("Sorry, something went wrong.");
  }

  return "";
}
