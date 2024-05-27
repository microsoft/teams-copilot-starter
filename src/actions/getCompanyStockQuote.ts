import { CardFactory, TurnContext } from "botbuilder";
import { AI, ActionPlanner } from "@microsoft/teams-ai";
import { ApplicationTurnState, ChatParameters } from "../models/aiTypes";
import { Client } from "@microsoft/microsoft-graph-client";
import { apiCustomDataService } from "../api/apiCustomDataSource";
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
  const companyName = parameters.entity.toLowerCase();

  try {
    const url = `https://${process.env.BOT_DOMAIN}/api/data`;
    const accessToken = state.temp.authTokens["graph"];

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = response.data;
    const company = data.find(
      (company: { name: string; quote: string }) =>
        company.name.toLowerCase() === companyName
    );
    if (!company) {
      await context.sendActivity("Quote not found.");
      return AI.StopCommandName;
    }

    const card = {
      type: "AdaptiveCard",
      version: "1.0",
      body: [
        {
          type: "TextBlock",
          text: `Company: ${company.name}`,
          size: "Medium",
          weight: "Bolder",
        },
        {
          type: "TextBlock",
          text: `Quote: ${company.quote}`,
          size: "Medium",
          weight: "Bolder",
        }
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
