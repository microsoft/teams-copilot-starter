import { ActivityTypes, Channels, TurnContext } from "botbuilder";
import { AI, ClientCitation, PredictedSayCommand } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../models/aiTypes";
import { Utils } from "../helpers/utils";
import { AIEntity } from "@microsoft/teams-ai/lib/actions";

/**
 * Enables debug mode for the conversation.
 * @param context The turn context.
 * @param state The application turn state.
 * @returns A promise that resolves to a string representing the stop command name.
 */
export async function formatterAction(
  context: TurnContext,
  state: ApplicationTurnState,
  command: PredictedSayCommand,
  action?: string
): Promise<string> {
  if (!command.response?.content) {
    return "";
  }

  let content = command.response.content;
  const isTeamsChannel = context.activity.channelId === Channels.Msteams;

  if (isTeamsChannel) {
    content = content.split("\n").join("<br>");
  }

  // If the response from AI includes citations, they will be parsed and added to the response
  let citations: ClientCitation[] | undefined = undefined;

  if (
    command.response.context &&
    command.response.context.citations.length > 0
  ) {
    citations = command.response.context.citations.map((citation, i) => {
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
        ...(citations ? { citation: citations } : {}),
      },
    ] as AIEntity[],
  });

  return action ?? "";
}
