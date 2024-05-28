import { CardFactory, TurnContext } from "botbuilder";
import { AI } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../models/aiTypes";
import { Client } from "@microsoft/microsoft-graph-client";

/**
 * Enables debug mode for the conversation.
 * @param context The turn context.
 * @param state The application turn state.
 * @returns A promise that resolves to a string representing the stop command name.
 */
export async function getMyInformation(
  context: TurnContext,
  state: ApplicationTurnState
): Promise<string> {
  // This is not yet implemented as it requires a token for Graph
  await context.sendActivity("This feature is not yet implemented.");
  return AI.StopCommandName;

  // Below is the code that would be used to get the user's information from Graph
  // const client = await getGraphClient(context, state);
  // if (!client) {
  //   return AI.StopCommandName;
  // }

  // const user = await client.api("/me").get();
  // const card = {
  //   type: "AdaptiveCard",
  //   version: "1.0",
  //   body: [
  //     {
  //       type: "TextBlock",
  //       text: `Name: ${user.displayName}`,
  //       size: "Medium",
  //       weight: "Bolder",
  //     },
  //     {
  //       type: "TextBlock",
  //       text: `Job Title: ${user.jobTitle}`,
  //     },
  //     {
  //       type: "TextBlock",
  //       text: `Email: ${user.mail}`,
  //     },
  //     {
  //       type: "TextBlock",
  //       text: `Business Phone: ${user.businessPhones[0]}`,
  //     },
  //     {
  //       type: "TextBlock",
  //       text: `Email: ${user.mail}`,
  //     },
  //   ],
  // };

  // const adaptiveCard = CardFactory.adaptiveCard(card);
  // await context.sendActivity({ attachments: [adaptiveCard] });
  // return AI.StopCommandName;
}

async function getGraphClient(
  context: TurnContext,
  state: ApplicationTurnState
) {
  const token = state.temp.authTokens["graph"];
  if (!token) {
    await context.sendActivity("Please sign in to get your profile.");
    return null;
  }

  const client = Client.init({
    authProvider: (done) => {
      done(null, token); //first parameter takes an error if you can't get an access token
    },
  });

  return client;
}
