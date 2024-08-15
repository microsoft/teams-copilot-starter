import { TurnContext } from "botbuilder";
import { AI, ActionPlanner } from "@microsoft/teams-ai";
import {
  AllowedFileTypes,
  ApplicationTurnState,
  ChatParameters,
} from "../models/aiTypes";
import { Utils } from "../helpers/utils";
import { logging } from "../telemetry/loggerManager";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { container } from "tsyringe";
import { Env } from "../env";
import { FileAttachment } from "../models/fileAttachment";
import { UserHelper } from "../helpers/userHelper";
import { BYODSkill } from "../skills";
import { VectraDataSource } from "../dataSources/vectraDataSource";
import * as mime from "mime-types";
import * as responses from "../resources/responses";
import * as Errors from "../types/errors";
import byodAnswerCard from "../adaptiveCards/templates/byodAnswer.json";
import { ActionsHelper } from "../helpers/actionsHelper";
import crypto from "crypto";

/**
 * Retrieves web content based on the provided URLs and user input.
 * @param context The turn context.
 * @param state The application turn state.
 * @param parameters The chat parameters.
 * @param planner The action planner.
 * @returns A promise that resolves to a string representing the web response.
 */
export async function webRetrieval(
  context: TurnContext,
  state: ApplicationTurnState,
  parameters: ChatParameters,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  const env = container.resolve<Env>(Env);

  // Show typing indicator
  await Utils.startTypingTimer(context, state);

  // Get the user's message
  const input = context.activity.text;

  // Check if the user provided a single web url or multiple web urls
  if (!state.conversation.uploadedDocuments) {
    state.conversation.uploadedDocuments = [];
  }

  const webSites = parameters.entity.split(",").map((url) => {
    const attachment: FileAttachment = {
      fileName: url.trim(),
      url: url.trim(),
      type:
        AllowedFileTypes.filter((type) => mime.lookup(url) === type)[0] ??
        "text/html",
    };
    return attachment;
  });

  // Add the web urls to the uploaded documents when they are not already in the list
  webSites.forEach((site) => {
    // Remove the anchor from the url as it refers to same site.
    site.completeUrl = site.fileName;
    site.fileName = site.fileName.split("#")[0];
    if (
      !state.conversation.uploadedDocuments?.some(
        (doc) => doc.fileName === site.fileName
      )
    ) {
      state.conversation.uploadedDocuments?.push(site);
    }
  });

  if (
    !state.conversation.uploadedDocuments ||
    state.conversation.uploadedDocuments.length === 0
  ) {
    await context.sendActivity(responses.noUploadedDocument());
    return AI.StopCommandName;
  }
  const docs = state.conversation.uploadedDocuments;

  // Get the user's information
  const user = await UserHelper.updateUserInfo(context, state);

  // Retrieve an instance of the QuestionWeb skill
  const questionDocument = new BYODSkill(
    context,
    state,
    planner,
    AIPrompts.QuestionWeb,
    new VectraDataSource({
      name: env.data.WEBDATA_SOURCE_NAME,
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

  // Remove the urls from the input. Required else AI will state it is not able to retrieve data from an url
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const inputWithoutUrl = input.replace(urlRegex, "");
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
      const response = await questionDocument.run(inputWithoutUrl, hashFromUri);
      if (!response) {
        return AI.StopCommandName;
      }
      const card = Utils.renderAdaptiveCard(byodAnswerCard, {
        docType: "the website",
        filename: doc.completeUrl,
        answer: response,
      });
      await context.sendActivity({ attachments: [card] });
    }
  } catch (error: unknown) {
    logger.error(`Failed running skill: ${(error as Error).message}`);
    await context.sendActivity("I'm sorry, I could not process the document.");
    return AI.StopCommandName;
  }
  return "Provided web details.";
}
