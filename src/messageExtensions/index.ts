import { MessagingExtensionAttachment, TurnContext } from "botbuilder";
import { ActionPlanner, Query } from "@microsoft/teams-ai";
import { ApplicationTurnState, TData } from "../models/aiTypes";
import { Logger } from "../telemetry/logger";
import { CustomDataSourceSkill } from "../skills/customDataSourceSkill";
import CompanyInfo from "../models/companyInfo";
import { TeamsAI } from "../bot/teamsAI";
import { Utils } from "../helpers/utils";
import companyListCard from "../adaptiveCards/templates/companyList.json";

/**
 * Searches for entities based on a query and returns the results as a list of attachments.
 * @param context The turn context.
 * @param state The application turn state.
 * @param query The query parameters.
 * @param planner The action planner.
 * @param logger The logger.
 * @returns A promise that resolves to the search results as a list of attachments.
 */
export async function searchCmd(
  context: TurnContext,
  state: ApplicationTurnState,
  query: Query<Record<string, any>>,
  planner: ActionPlanner<ApplicationTurnState>,
  logger: Logger
): Promise<any> {
  const searchQuery = query.parameters.queryText ?? "";

  // Every other channel
  // Begin searching for the entity only if the search query is at least 3 characters long
  if (searchQuery?.length < 3) {
    return {
      type: "message",
      text: "Please enter at least 3 characters to search.",
    };
  }

  // call Entity Recognition Skill to extract the entity name from the user's message
  const customDataSourceSkill = new CustomDataSourceSkill(
    context,
    state,
    planner
  );

  // Run the skill
  try {
    const foundEntities = (await customDataSourceSkill.run(
      searchQuery
    )) as CompanyInfo[];

    // if no entities were found, return a message to the user
    if (!foundEntities?.length ?? 0 === 0) {
      return {
        type: "message",
        text: "No entities found.",
      };
    }

    if (
      context.activity.channelData.source.name === TeamsAI.M365CopilotSourceName
    ) {
      logger.info(`entities found:\n ${JSON.stringify(foundEntities)}`);
      // Render the Adaptive Card based on the retrieved company details
      const attachmentsPromise: Promise<MessagingExtensionAttachment>[] =
        foundEntities.map(async (company) => {
          // Create a copy of the object so we don't modify the original
          const companyCopy = Object.assign({}, company);

          // create an adaptive card to be returned to M365 Copilot
          const card = Utils.createM365SearchResultAdaptiveCard(companyCopy);

          // Create a preview card
          const preview = Utils.createM365SearchResultHeroCard(companyCopy);

          // Return the full attachment
          return { ...card, preview };
        });

      const attachments = await Promise.all(attachmentsPromise);
      logger.info(
        `Returning the list of ${foundEntities.length} items for '${searchQuery}'`
      );

      // Return results as a list
      return {
        type: "result",
        attachmentLayout: "list",
        attachments: attachments,
      };
    } else {
      // call Entity Info Skill to get the entity details list
      const attachments = await Utils.createCompanyListAttachments(
        foundEntities
      );

      // log items returned
      logger.info(`Found ${attachments.length} items for '${searchQuery}'`);

      // Return results as a list
      return {
        type: "result",
        attachmentLayout: "list",
        attachments: attachments,
      };
    }
  } catch (error) {
    return {
      type: "message",
      text: "An error occurred while processing the request.",
    };
  }
}

/**
 * Selects an item and generates detailed information for the selected company.
 * @param context The turn context.
 * @param state The application turn state.
 * @param data The data containing the selected company entity.
 * @returns A promise that resolves to the detailed information as an attachment.
 */
export async function selectItem(
  context: TurnContext,
  state: ApplicationTurnState,
  data: TData
): Promise<any> {
  // Generate detailed information for the selected company
  const entity: CompanyInfo = data.entity;

  const card = Utils.renderAdaptiveCard(companyListCard, entity);

  if (context.activity.conversation.conversationType === "personal") {
    await context.sendActivity({ attachments: card ? [card] : [] });
  } else {
    return {
      attachmentLayout: "list",
      attachments: card ? [card] : [],
      type: "result",
    };
  }
}
