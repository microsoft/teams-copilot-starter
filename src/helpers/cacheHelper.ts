import "reflect-metadata";
import { Message } from "@microsoft/teams-ai";
import { ApplicationTurnState, TData, CopilotRoles } from "../models/aiTypes";
import { container } from "tsyringe";
import { User } from "../models/user";
import { Env } from "../env";

export type HistoryRecord<T extends string> = Record<T, any[]>;

export enum ApiTypes {
  Copilot = "copilot",
  Omni = "omni",
}

export enum CacheTypes {
  Conversation = "conversation",
  Token = "token",
}

/**
 * A class that provides methods to set and get cache records.
 */
export class CacheHelper {
  /**
   * Gets the cache record for the current conversation from the provided conversation state cache.
   * @param state - The conversation state cache to retrieve the cache record from.
   * @returns The value of the cache record if found, otherwise undefined.
   */
  public static getChatHistory(
    state: ApplicationTurnState,
    maxTurnsToRemember = 10
  ): Message<string>[] {
    // Check if the conversation cache has expired, then clear it and return empty array
    if (CacheHelper.hasCacheExpired(state, CacheTypes.Conversation)) {
      CacheHelper.clearCache(CacheTypes.Conversation, state);
      return [];
    }

    if (!state.conversation) {
      return [];
    }

    const env = container.resolve(Env);

    // return the conversation history
    const chatHistoryPropertyName = `${env.data.DEFAULT_PROMPT_NAME}_history`;
    const chatHistory: Message[] =
      state.conversation.history ??
      (state.conversation as any)[chatHistoryPropertyName]?.map((turn: any) => {
        if (
          typeof turn.content === "object" &&
          turn.content.commands?.length > 0
        ) {
          return {
            role: turn.role,
            content: turn.content.commands[0].response,
          };
        } else {
          return { role: turn.role, content: turn.content };
        }
      }) ??
      [];
    const history = chatHistory.filter((c: any) =>
      [CopilotRoles.user, CopilotRoles.copilot, CopilotRoles.system].includes(
        c.role as CopilotRoles
      )
    );

    // remove the oldest items from the chat history
    const itemsToDelete = history.length - maxTurnsToRemember;

    if (itemsToDelete > 0) {
      history.splice(0, itemsToDelete);
    }

    return history;
  }

  /**
   * Returns the current cache timestamp.
   * @returns The current cache timestamp.
   */
  public static getTimestamp(): TData {
    return {
      tokenUpdatedOn: new Date().toISOString(),
      chatUpdatedOn: new Date().toISOString(),
    };
  }

  /**
   * Checks if the cache has expired.
   * @returns True if the cache has expired, otherwise false.
   */
  public static hasCacheExpired(
    state: ApplicationTurnState,
    cacheTypes: CacheTypes
  ): boolean {
    if (!state.conversation || !state.conversation.headers) {
      return false;
    }
    // get the current cache timestamp
    const conversation = state.conversation;
    if (
      conversation !== undefined &&
      typeof conversation.headers === "object" &&
      Object.prototype.hasOwnProperty.call(conversation.headers, "timestamp")
    ) {
      const timestamp =
        cacheTypes === CacheTypes.Conversation
          ? conversation.headers.timestamp?.chatUpdatedOn
          : conversation.headers.timestamp?.tokenUpdatedOn;
      if (!timestamp) {
        return true;
      }
    }
    return false;
  }

  /**
   * Updates the cache timestamp.
   * @returns void
   */
  public static updateCacheTimestamp(
    cacheType: CacheTypes,
    state: ApplicationTurnState
  ): void {
    if (!state.conversation) {
      return;
    }
    // store the Auth token in the conversation state cache
    const conversation = state.conversation;
    if (typeof state.conversation.headers !== "object") {
      conversation.headers = {};
    }

    if (conversation.headers) {
      if (
        Object.prototype.hasOwnProperty.call(conversation.headers, "timestamp")
      ) {
        // update the timestamp for the cache record
        if (cacheType === CacheTypes.Conversation)
          conversation.headers.timestamp.chatUpdatedOn =
            new Date().toISOString();
        else
          conversation.headers.timestamp.tokenUpdatedOn =
            new Date().toISOString();
      } else {
        // add the timestamp to the cache record
        conversation.headers.timestamp = CacheHelper.getTimestamp();
      }
    }
  }

  /**
   * Clears the cache.
   * @param CacheTypes - The cache type to clear.
   * @returns void
   */
  public static clearCache(
    cacheTypes: CacheTypes,
    state: ApplicationTurnState
  ): void {
    if (!state.conversation) {
      return;
    }
    // store the Auth token in the conversation state cache
    const conversation = state.conversation;
    if (cacheTypes === CacheTypes.Token) {
      (<any>conversation.headers).copilot = undefined;
      (<any>conversation.headers).omni = undefined;
      (<any>conversation.headers).timestamp.tokenUpdatedOn = undefined;
      return;
    } else if (cacheTypes === CacheTypes.Conversation) {
      CacheHelper.updateCacheTimestamp(CacheTypes.Conversation, state);
    }
    state.deleteConversationState();
    state.deleteUserState();
    CacheHelper.clearCurrentUser(state);
    conversation.listCompanies = undefined;
    conversation.entities = undefined;
    conversation.promptMessages = undefined;
  }

  /**
   * Sets the user profile in the user state cache.
   * @param state - The application state cache.
   * @param user - The user profile to be stored in the user state cache.
   * @returns void
   */
  public static setCurrentUser(state: ApplicationTurnState, user: User): void {
    const userState = state.user ?? {};

    if (typeof userState?.user === "object") {
      userState.user = user;
    } else {
      userState.user = {};
    }

    if (
      typeof userState?.user === "object" &&
      Object.prototype.hasOwnProperty.call(userState, "user")
    ) {
      userState.user = user;
    }
  }

  /**
   * Sets the user profile in the user state cache.
   * @param user - The user profile to be stored in the user state cache.
   * @returns void
   */
  public static clearCurrentUser(state: ApplicationTurnState): void {
    state.user = {};
  }

  /**
   * Sets the conversation history in the conversation state cache.
   * @param state - The application state cache.
   * @param history - The conversation history to be stored in the conversation state cache.
   * @returns void
   */
  public static setConversationHistory(
    state: ApplicationTurnState,
    history: Message[]
  ): void {
    // store the entity info in the user state cache
    if (state.conversation === undefined) {
      return;
    }
    if (typeof state.conversation.history !== "object") {
      state.conversation.history = [];
    }
    state.conversation.history = history;
    // update cache timestamp
    CacheHelper.updateCacheTimestamp(CacheTypes.Conversation, state);
  }

  /**
   * Clears the conversation history.
   * @returns void
   */
  public static clearConversationHistory(state: ApplicationTurnState): void {
    if (state.conversation?.history) {
      state.conversation.history = [];
    }
  }
}
