import { TurnContext } from "botbuilder";
import { ActionPlanner, Memory } from "@microsoft/teams-ai";
import { ApplicationTurnState } from "../models/aiTypes";
import { container } from "tsyringe";
import { Env } from "../env";
import { UserHelper } from "../helpers/userHelper";
import { User } from "../models/user";

/**
 * Retrieves the actions for the conversation from the memory and sets the default prompt.
 * @param context The turn context.
 * @param memory The memory object.
 * @param planner The action planner.
 */
export async function getActions(
  context: TurnContext,
  memory: Memory,
  planner: ActionPlanner<ApplicationTurnState>
): Promise<void> {
  const env = container.resolve<Env>(Env);
  const defaultPrompt = await planner.prompts.getPrompt(
    env.data.DEFAULT_PROMPT_NAME
  );
  return memory.setValue("conversation.actions", defaultPrompt.actions);
}

/**
 * Retrieves the debug status from the memory.
 * @param context The turn context.
 * @param memory The memory object.
 * @returns The debug status ('on' or 'off').
 */
export async function getDebugStatus(
  context: TurnContext,
  memory: Memory
): Promise<string> {
  return memory.getValue("conversation.debug") ? "on" : "off";
}

/**
 * Retrieves the entity name from the memory.
 * @param context The turn context.
 * @param memory The memory object.
 * @returns The entity name.
 */
export async function getEntityName(
  context: TurnContext,
  memory: Memory
): Promise<string> {
  return memory.getValue("conversation.entity") ?? "";
}

/**
 * Retrieves the attached documents from the turn context activity.
 * @param context The turn context.
 * @param memory The memory object.
 * @returns A promise that resolves to the attached documents.
 */
export async function getAttachedDocuments(
  context: TurnContext,
  memory: Memory
): Promise<any> {
  const attachments = context.activity.attachments;
  if (
    attachments &&
    attachments.length > 0 &&
    attachments.findIndex(
      (a) =>
        a.contentType === "application/vnd.microsoft.teams.file.download.info"
    ) > -1
  ) {
    // update the user's prompt to indicate the attached document
    context.activity.text += " Use the content of this document";
    memory.setValue("temp.input", context.activity.text);
  }
}

/**
 * Retrieves the user state from the memory.
 * @param context The turn context.
 * @param memory The memory object.
 * @returns A promise that resolves to the user state.
 */
export async function getUserState(
  context: TurnContext,
  memory: Memory
): Promise<User> {
  const state = memory as ApplicationTurnState;
  return await UserHelper.updateUserInfo(context, state);
}

/**
 * Increments the file index and retrieves the content of the file at the new index.
 * @param context The turn context.
 * @param memory The memory object.
 * @returns A promise that resolves to the content of the file.
 */
export async function incrementFileIndex(
  context: TurnContext,
  memory: Memory
): Promise<any> {
  const files: Array<any> = memory.getValue("temp.inputFiles") ?? [];
  const fileIndex: number = memory.getValue("temp.fileIndex") ?? 0;
  if (files.length > 0 && fileIndex < files.length) {
    const content = files[fileIndex].content.toString("utf8");
    memory.setValue(
      "temp.fileIndex",
      fileIndex + 1 < files.length ? fileIndex + 1 : 0
    );
    return content;
  }
}
