import { TurnContext } from "botbuilder";
import { AI, ActionPlanner } from "@microsoft/teams-ai";
import { ApplicationTurnState, ChatParameters } from "../models/aiTypes";
import { Utils } from "../helpers/utils";
import { logging } from "../telemetry/loggerManager";
import { ActionsHelper } from "../helpers/actionsHelper";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { container } from "tsyringe";
import { Env } from "../env";
import { UserHelper } from "../helpers/userHelper";
import { BYODSkill } from "../skills";
import { VectraDataSource } from "../dataSources/vectraDataSource";
import * as responses from "../resources/responses";
import * as Errors from "../types/errors";
import byodAnswerCard from "../adaptiveCards/templates/byodAnswer.json";
import crypto from "crypto";
import { EventNames } from "../types/eventNames";

/**
 * Initiates a chat session with a document.
 * @param context The turn context.
 * @param state The application turn state.
 * @param parameters The chat parameters.
 * @param planner The action planner.
 * @returns A promise that resolves to a string representing the result of the chat session.
 */
export async function chatWithDocument(
  context: TurnContext,
  state: ApplicationTurnState,
  parameters: ChatParameters,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  logger.trackEvent(
    EventNames.ChatWithDocument,
    Utils.GetUserProperties(context.activity)
  );
  const env = container.resolve<Env>(Env);

  // Show typing indicator
  await Utils.startTypingTimer(context, state);

  // Ensure pdf command is not being used in a group chat
  if (context.activity.conversation.isGroup) {
    await context.sendActivity(
      "File upload is not supported in group chat. \
      You can only analyze documents in direct chat with Copilot."
    );
    return AI.StopCommandName;
  }

  // check if the user has uploaded a document and if so, add properties to state, else stop
  const docs = await ActionsHelper.checkForUploadedFile(context, state);
  if (!docs || docs.length === 0) {
    await context.sendActivity(responses.noUploadedDocument());
    return AI.StopCommandName;
  }

  // Get the user's message
  const input = `${context.activity.text} ${parameters.entity ?? ""}`;

  if (
    !state.conversation.uploadedDocuments ||
    state.conversation.uploadedDocuments.length === 0
  ) {
    await context.sendActivity(responses.noUploadedDocument());
    return AI.StopCommandName;
  }

  // Get the user's information
  const user = await UserHelper.updateUserInfo(context, state);

  // Retrieve an instance of the QuestionWeb skill
  const questionDocument = new BYODSkill(
    context,
    state,
    planner,
    AIPrompts.QuestionDocument,
    new VectraDataSource({
      name: env.data.DOCUMENTDATA_SOURCE_NAME,
      embeddings: ActionsHelper.getEmbeddingsOptions(),
      indexFolder: env.data.VECTRA_INDEX_PATH ?? "",
    })
  );

  try {
    // Show typing indicator
    Utils.startTypingTimer(context, state);

    // Add the web url to the vectra index and wait for the promise to resolve
    await questionDocument.addExternalContent(
      state.conversation.uploadedDocuments
    );
  } catch (error: unknown) {
    logger.error(
      `Failed adding content to the index: ${(error as Error).message}`
    );
    if (error instanceof Errors.FileTooLargeError || Errors.TooManyPagesError) {
      await context.sendActivity(`I'm sorry, I could not add the file to the index. 
              It is too large. Document should not have more than ${env.data.MAX_PAGES} page(s) 
              and ${env.data.MAX_FILE_SIZE} characters of text.`);
    } else {
      await context.sendActivity(
        "I'm sorry, I could not add the content to the index."
      );
    }
    return AI.StopCommandName;
  }

  try {
    if (docs.length > 1) {
      await context.sendActivity(
        `You have uploaded ${docs.length} document(s) or website(s). These will be processed now.'`
      );
    }
    // Send an adaptive cards with the details for each document
    for (const doc of docs) {
      const hashFromUri = crypto
        .createHash("sha256")
        .update(doc.url)
        .digest("hex");
      const response = await questionDocument.run(input, hashFromUri);
      if (!response) {
        return AI.StopCommandName;
      }
      const card = Utils.renderAdaptiveCard(byodAnswerCard, {
        docType: "the document",
        filename: doc.fileName,
        answer: response,
      });
      await context.sendActivity({ attachments: [card] });
    }
  } catch (error: unknown) {
    logger.error(`Failed running skill: ${(error as Error).message}`);
    await context.sendActivity("I'm sorry, I could not process the document.");
    return AI.StopCommandName;
  }
  return "Provided document details.";
}
