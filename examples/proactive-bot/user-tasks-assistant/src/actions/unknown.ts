import { TurnContext } from "botbuilder";
import { AI } from "@microsoft/teams-ai";

/**
 * Handles the unknown action by sending a message to the user indicating that the intent could not be understood.
 * @param context The context object for the current turn of the conversation.
 * @returns A promise that resolves to a string representing the stop command name.
 */
export async function unknownAction(context: TurnContext): Promise<string> {
  await context.sendActivity(
    "I'm sorry, I could not understand your intent. Please try again or make your command shorter."
  );
  return AI.StopCommandName;
}
