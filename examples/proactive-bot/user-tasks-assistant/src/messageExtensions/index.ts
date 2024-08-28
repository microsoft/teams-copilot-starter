import "reflect-metadata";

import genHandoffCard from "../adaptiveCards/templates/genericHandoffCard.json";

import { Attachment, CardFactory, TurnContext } from "botbuilder";
import { Query } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../models/aiTypes";
import { Logger } from "../telemetry/logger";
import { Utils } from "../helpers/utils";

/**
 * Searches for entities based on a query and returns the results as a list of attachments.
 * @param context The turn context.
 * @param state The application turn state.
 * @param query The query parameters.
 * @param logger The logger.
 * @returns A promise that resolves to the search results as a list of attachments.
 */
export async function searchCmd(
  context: TurnContext,
  state: ApplicationTurnState,
  query: Query<Record<string, any>>,
  logger: Logger
): Promise<any> {
  logger.info(`Query received: ${query.parameters.query}`);
  const searchQuery = query.parameters.query;

  const attachments: Attachment[] = [];

  const card = Utils.renderAdaptiveCard(genHandoffCard);
  const preview = CardFactory.heroCard("Search Results");
  const attachment = { ...CardFactory.adaptiveCard(card), preview };
  attachments.push(attachment);

  return {
    type: "result",
    attachmentLayout: "list",
    attachments: attachments,
  };
}
