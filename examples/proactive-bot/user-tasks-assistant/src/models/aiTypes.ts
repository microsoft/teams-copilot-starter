import {
  DefaultConversationState,
  DefaultTempState,
  TurnState,
  DefaultUserState,
  Message,
  Plan,
  ChatCompletionAction,
  PredictedDoCommand,
} from "@microsoft/teams-ai";
import { User } from "./user";
import { FileAttachment } from "./fileAttachment";
import { ConversationReference } from "botbuilder";

export type TData = Record<string, any | any[]>;

export type UploadedDocument = {
  filename: string;
  url: string;
};

export enum CopilotRoles {
  user = "user",
  copilot = "assistant",
  system = "system",
}

export interface ConversationState extends DefaultConversationState {
  promptFolder?: string;
  history: Message[];
  entities?: TData;
  headers?: Record<string, TData>;
  promptMessages?: TData;
  uploadedDocuments?: FileAttachment[];
  definedWebUrl: string | undefined;
  debug: boolean;
  documentIds: string[];
  actions?: ChatCompletionAction[];
  conversationReferences: Record<string, Partial<ConversationReference>>;
}

export interface UserState extends DefaultUserState {
  greeted?: boolean;
  user?: User;
}

export interface TempState extends DefaultTempState {
  actionPlan: Plan;
  documents: string[];
  fileIndex: number;
  leaseId: string;
  startTime: number;
  typingTimer: NodeJS.Timeout | undefined;
  hashFromUploadedDocument: string | undefined;
  useCache: boolean;
}

export type ApplicationTurnState = TurnState<
  ConversationState,
  UserState,
  TempState
>;

export interface ChatParameters {
  entity: string;
}

export interface ChatCompletionActionExt extends ChatCompletionAction {
  canRunWith?: string[];
}

export interface PredictedDoCommandExt extends PredictedDoCommand {
  parallelActions?: PredictedDoCommand[];
}

export const AllowedFileTypes = [
  "pdf",
  "md",
  "txt",
  "html",
  "yaml",
  "json",
  "csv",
  "tsv",
  "rtf",
  "log",
  "md",
];

/**
 * A text string that can be returned from an action to stop the AI system from continuing
 * to execute the current plan.
 */
export const CompletedCommandName = "DONE";

export const RetryCommandName = "RETRY";
