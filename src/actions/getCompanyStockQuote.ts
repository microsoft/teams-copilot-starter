import { CardFactory, TurnContext } from "botbuilder";
import { AI, ActionPlanner } from "@microsoft/teams-ai";
import { ApplicationTurnState, ChatParameters } from "../models/aiTypes";
import customData from "../resources/customDataSource.json";
import axios from "axios";

/**
 * Enables debug mode for the conversation.
 * @param context The turn context.
 * @param state The application turn state.
 * @returns A promise that resolves to a string representing the stop command name.
 */
export async function getCompanyStockQuote(
  context: TurnContext,
  state: ApplicationTurnState,
  parameters: ChatParameters,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<string> {
  const companyName = parameters.entity;

  // Get the company from the custom data source.
  const company = customData.find(
    (c) => c.name.toLowerCase() === companyName.toLowerCase()
  );
  if (!company) {
    await context.sendActivity("Company not found.");
    return AI.StopCommandName;
  }

  // Get the company stock quote.
  try {
    // Call the API to get the company stock quote.
    // The API requires an access token to be passed in the Authorization header.
    const url = `https://${process.env.BOT_DOMAIN}/api/quotes/${company?.ticker}`;
    const accessToken = state.temp.authTokens["graph"];

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = response.data;
    if (!data) {
      await context.sendActivity("Ticker not found.");
      return AI.StopCommandName;
    }

    const card = {
      type: "AdaptiveCard",
      version: "1.0",
      body: [
        {
          type: "TextBlock",
          text: `Company: ${company.name}`,
          size: "Large",
          weight: "Bolder",
          style: "heading",
        },
        {
          type: "TextBlock",
          text: `Country: ${company.worldRegion}`,
          size: "Large",
        },
        {
          type: "FactSet",
          facts: [
            {
              title: "Time:",
              value: `${new Date().toLocaleString()}`,
            },
            {
              title: "Ticker:",
              value: `${data.ticker}`,
            },
            {
              title: "Quote:",
              value: `$${data.quote}`,
            },
          ],
        },
      ],
    };

    const adaptiveCard = CardFactory.adaptiveCard(card);
    await context.sendActivity({ attachments: [adaptiveCard] });
    return AI.StopCommandName;
  } catch (error) {
    await context.sendActivity(
      "An error occurred while getting the company address."
    );
    return AI.StopCommandName;
  }
}
