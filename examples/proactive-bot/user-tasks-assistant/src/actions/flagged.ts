import { TurnContext } from "botbuilder";
import { AI } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../models/aiTypes";

/**
 * Handles the flagged input action and sends a message indicating that the message was flagged.
 * @param context The turn context.
 * @param state The application turn state.
 * @param data Additional data associated with the flagged input action.
 * @returns A promise that resolves to the flagged input action name.
 */
export async function flaggedInputAction(
  context: TurnContext,
  state: ApplicationTurnState,
  data: Record<string, any> | undefined
): Promise<string> {
  await context.sendActivity(
    `I'm sorry your message was flagged: ${JSON.stringify(data)}`
  );
  return AI.FlaggedInputActionName;
}

/**
 * Handles the flagged output action and sends a message indicating that the bot is not allowed to talk about certain things.
 * @param context The turn context.
 * @param state The application turn state.
 * @returns A promise that resolves to the flagged output action name.
 */
export async function flaggedOutputAction(
  context: TurnContext,
  state: ApplicationTurnState
): Promise<string> {
  await context.sendActivity("I'm not allowed to talk about such things.");
  return AI.FlaggedOutputActionName;
}
