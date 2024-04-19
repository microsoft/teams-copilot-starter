import { TurnContext } from "botbuilder";
import { ActionPlanner } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../../models/aiTypes";
import { ChatGPTSkill } from "../../skills";
import { Utils } from "../../helpers/utils";
import { logging } from "../../telemetry/loggerManager";
import * as responses from "../../resources/responses";
import { PromptMessage } from "../../models/promptMessage";
import copilotCard from "../templates/copilotResponse.json";

/**
 * Sends a suggested prompt to the user and displays the response using an Adaptive Card.
 * @param {TurnContext} context - The context object for the current turn of the conversation.
 * @param {ApplicationTurnState} state - The application turn state.
 * @param {PromptMessage} data - The prompt message data.
 * @param {ActionPlanner<ApplicationTurnState>} planner - The action planner.
 * @returns {Promise<string>} A promise that resolves to a string indicating the result of the operation.
 */
export async function suggestedPrompt(
  context: TurnContext,
  state: ApplicationTurnState,
  data: PromptMessage,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");

  // notify user that the bot is working
  await context.sendActivity(responses.promptReturned());

  // Show typing indicator
  await Utils.startTypingTimer(context, state);

  // call Chat GPT Skill to get the generic response
  const chatGPTSkill = new ChatGPTSkill(context, state, planner);

  // Run the skill
  const promptResponse = await chatGPTSkill.run(data.request);
  if (!promptResponse) {
    // No prompt response found
    logger.info(`Prompt response not found for '${data.request}'`);
    await context.sendActivity(responses.promptNotFound());
    return "";
  }

  const moreInfoUrl = `https://www.bing.com/search?q=${encodeURIComponent(
    data.request
  )}`;

  const promptMessage: PromptMessage = {
    request: data.request,
    response: promptResponse,
    citations: [
      {
        id: "1",
        text: "Learn More",
        url: moreInfoUrl,
        source_url: moreInfoUrl,
      },
    ],
  };

  // Send Adaptive Card with the prompt response
  const card = Utils.renderAdaptiveCard(copilotCard, {
    prompt: promptMessage,
    citations: promptMessage.citations,
  });

  // Render the Adaptive Card based on the generated prompt response
  await context.sendActivity({ attachments: [card] });
  return "Copilot has provided a response.";
}
