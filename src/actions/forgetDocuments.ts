import { TurnContext } from "botbuilder";
import { ApplicationTurnState, CompletedCommandName } from "../models/aiTypes";
import { container } from "tsyringe";
import { logging } from "../telemetry/loggerManager";
import { Env } from "../env";
import { AI } from "@microsoft/teams-ai";
import { VectraDataSource } from "../dataSources/vectraDataSource";
import { UserHelper } from "../helpers/userHelper";
import { Utils } from "../helpers/utils";
import { ActionsHelper } from "../helpers/actionsHelper";

/**
 * Forgets the uploaded documents and clears the document index.
 *
 * @param {TurnContext} context - The turn context object.
 * @param {ApplicationTurnState} state - The application turn state object.
 * @param {LocalDocumentIndex} localVectraIndex - The local document index object.
 * @returns {Promise<string>} A promise that resolves to a string indicating that the uploaded document has been forgotten.
 */
export async function forgetDocuments(
  context: TurnContext,
  state: ApplicationTurnState
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  const env = container.resolve<Env>(Env);

  // Get the user's information
  const user = await UserHelper.updateUserInfo(context, state);

  // Check if the user has uploaded a document and if so, forget the uploaded documents
  if (
    !state.conversation.uploadedDocuments &&
    !state.conversation.definedWebUrl
  ) {
    await context.sendActivity("There is nothing to forget.");
    return AI.StopCommandName;
  }

  if (state.conversation.uploadedDocuments) {
    // Obtain the Vectra Database Source
    const vectraDS = new VectraDataSource({
      name: env.data.WEBDATA_SOURCE_NAME,
      embeddings: ActionsHelper.getEmbeddingsOptions(),
      indexFolder: env.data.VECTRA_INDEX_PATH ?? "",
    });

    // delete the uploaded documents from the vectra index
    try {
      await vectraDS.deleteExternalContent(
        state.conversation.uploadedDocuments
      );
    } catch (error: unknown) {
      logger.error(
        `Failed deleting content from the index: ${(error as Error).message}`
      );
      await context.sendActivity(
        "I'm sorry, I could not delete the content from the local index embeddings."
      );
    }

    // Log the uploaded documents that have been forgotten
    const documents = state.conversation.uploadedDocuments
      ?.map((doc) => doc.fileName)
      .join(", ");
    logger.info(`Uploaded documents have been forgotten: ${documents}.`);
    await context.sendActivity(
      `Uploaded documents have been forgotten: ${documents}.`
    );
  }

  state.conversation.documentIds = [];
  state.conversation.uploadedDocuments = undefined;

  if (state.conversation.definedWebUrl) {
    logger.info(
      `Defined web url has been forgotten: ${state.conversation.definedWebUrl}.`
    );
    await context.sendActivity(
      `Defined web url has been forgotten: ${state.conversation.definedWebUrl}.`
    );
  }

  // Clear the uploaded documents and defined web url from the state
  state.conversation.uploadedDocuments = undefined;
  state.conversation.definedWebUrl = undefined;

  // Continue action command execution
  return CompletedCommandName;
}
