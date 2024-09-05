import { TurnContext } from "botbuilder";
import { AI } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../models/aiTypes";
import { logging } from "../telemetry/loggerManager";
import { EventNames } from "../types/eventNames";
import { Utils } from "../helpers/utils";

/**
 * Enables debug mode for the conversation.
 * @param context The turn context.
 * @param state The application turn state.
 * @returns A promise that resolves to a string representing the stop command name.
 */
export async function debugOn(
  context: TurnContext,
  state: ApplicationTurnState
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  logger.trackEvent(
    EventNames.DebugOn,
    Utils.GetUserProperties(context.activity)
  );
  state.conversation.debug = true;
  await context.sendActivity("Debug is on");
  return AI.StopCommandName;
}

/**
 * Disables debug mode for the conversation.
 * @param context The turn context.
 * @param state The application turn state.
 * @returns A promise that resolves to a string representing the stop command name.
 */
export async function debugOff(
  context: TurnContext,
  state: ApplicationTurnState
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  logger.trackEvent(
    EventNames.DebugOff,
    Utils.GetUserProperties(context.activity)
  );
  state.conversation.debug = false;
  await context.sendActivity("Debug is off");
  return AI.StopCommandName;
}
