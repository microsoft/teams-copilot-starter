import { ActivityTypes, Channels, TurnContext } from "botbuilder";
import {
  AI,
  ClientCitation,
  Message,
  PredictedSayCommand,
} from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../models/aiTypes";
import { Utils } from "../helpers/utils";
import { AIEntity } from "@microsoft/teams-ai/lib/actions";

/**
 * Formats the response from the AI and sends it to the user.
 * @param context The turn context.
 * @param state The application turn state.
 * @param command The predicted say command or message.
 * @param action The action to return.
 * @returns A promise that resolves to a string representing the action.
 */
export async function formatterAction(
  context: TurnContext,
  state: ApplicationTurnState,
  command: PredictedSayCommand | Message<string>,
  action?: string
): Promise<string> {
  const response = (command as PredictedSayCommand).response ?? command;
  if (!response?.content) {
    return "";
  }

  let content = response.content;
  const isTeamsChannel = context.activity.channelId === Channels.Msteams;

  if (isTeamsChannel) {
    content = content.split("\n").join("<br>");
  }

  // If the response from AI includes citations, they will be parsed and added to the response
  let citations: ClientCitation[] | undefined = undefined;

  if (response.context && response.context.citations.length > 0) {
    citations = response.context.citations.map((citation, i) => {
      return {
        "@type": "Claim",
        position: `${i + 1}`,
        appearance: {
          "@type": "DigitalDocument",
          name: citation.title,
          abstract: Utils.extractSnippet(citation.content, 500),
        },
      } as ClientCitation;
    });
  }

  // If there are citations, modify the content so that the sources are numbered instead of [doc1]
  const contentText = !citations
    ? content
    : Utils.formatCitationsResponse(content);

  // If there are citations, filter out the citations unused in content. TODO: Implement this
  // const referencedCitations = citations ? Utilities.getUsedCitations(contentText, citations) : undefined;
  const referencedCitations = citations;

  // Send the response
  await context.sendActivity({
    type: ActivityTypes.Message,
    text: contentText,
    ...(isTeamsChannel ? { channelData: { feedbackLoopEnabled: true } } : {}),
    entities: [
      {
        type: "https://schema.org/Message",
        "@type": "Message",
        "@context": "https://schema.org",
        "@id": "",
        additionalType: ["AIGeneratedContent"],
        ...(referencedCitations ? { citation: referencedCitations } : {}),
      },
    ] as AIEntity[],
  });

  return action ?? "";
}
