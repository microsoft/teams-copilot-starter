import { Logger } from "./telemetry/logger";
import { TeamsAI } from "./bot/teamsAI";
import {
  Activity,
  ActivityTypes,
  CloudAdapter,
  ConversationAccount,
  ConversationParameters,
  ConversationReference,
  TeamsChannelData,
  TeamsInfo,
  TurnContext,
} from "botbuilder";
import { TeamsAdapter } from "@microsoft/teams-ai";
import { Env } from "./env";

// Create an instance of the environment variables
const env: Env = new Env();

const serviceUrl = "https://smba.trafficmanager.net/amer/";

/**
 * Start a conversation with the user.
 * @param req The incoming request.
 * @param bot The TeamsAI bot.
 * @param adapter The Teams adapter.
 * @param logger The logger.
 */
export async function startConversation(
  queryParams: any,
  bot: TeamsAI,
  adapter: TeamsAdapter,
  logger: Logger
): Promise<void> {
  // the message format is: userId=<aadObjectId>&query=<query>
  logger.info(`User name: ${queryParams.userId}`);
  logger.info(`User prompt: ${queryParams.query}`);

  logger.info(
    `Conversation References: ${JSON.stringify(TeamsAI.ConversationReferences)}`
  );

  const conversationReferences = Object.values(
    TeamsAI.ConversationReferences
  ) as Partial<ConversationReference>[];
  if (conversationReferences.length > 0) {
    // Send a proactive message to the user, but only if the user name matches the user name in the conversation reference
    for (const conversationReference of conversationReferences) {
      if (conversationReference.user!.aadObjectId === queryParams.userId) {
        await adapter.continueConversationAsync(
          env.data.BOT_ID!,
          conversationReference,
          async (context) => {
            context.activity.text = queryParams.query;
            context.activity.from.aadObjectId = queryParams.userId;
            await bot.app.run(context);
          }
        );
      }
    }
  } else {
    logger.info(
      "No conversation references found. Will create a new user chat."
    );
    try {
      const botAppId = env.data.BOT_ID!; // bot's App ID
      const channelId = ""; // Empty string for creating a new conversation

      // Define the initial activity as a complete Activity object
      const initialActivity: Activity = {
        type: ActivityTypes.Message,
        name: "CreateConversation",
        text: queryParams.query,
        from: { id: `28:${botAppId}`, name: env.data.APP_NAME }, // The bot's ID and name
        recipient: {
          id: queryParams.userId,
          aadObjectId: queryParams.userId,
          name: queryParams.userId,
        },
        channelId: "msteams",
        serviceUrl: serviceUrl,
        conversation: {
          id: "",
          isGroup: false,
        } as ConversationAccount, // Empty string for creating a new conversation
        channelData: {
          tenant: { id: env.data.AAD_APP_TENANT_ID! }, // Replace with your tenant ID
        },
        entities: [],
        localTimezone: "UTC",
        callerId: botAppId,
        label: "User message",
        valueType: "text",
        listenFor: [],
      };

      const conversationParameters: ConversationParameters = {
        isGroup: false,
        topicName: queryParams.query,
        bot: { id: `28:${botAppId}`, name: env.data.APP_NAME }, // bot's ID and name
        members: [{ id: queryParams.userId, name: queryParams.userId }],
        channelData: {
          tenant: { id: env.data.AAD_APP_TENANT_ID! }, // Replace with your tenant ID
        } as TeamsChannelData,
        activity: initialActivity,
      };

      // Logic to execute after the conversation is created
      const logic = async (context: TurnContext) => {
        const teamMembers = await TeamsInfo.getPagedMembers(context);
        const member = teamMembers.members.find(
          (m) => m.aadObjectId === queryParams.userId
        );
        if (!member) {
          logger.error("Member not found.");
          return;
        }
        context.activity.channelId = "msteams";
        context.activity.conversation.conversationType = "personal";
        context.activity.text = queryParams.query;
        context.activity.from = {
          id: member.id,
          aadObjectId: member.aadObjectId,
          name: member.name,
        };
        context.activity.recipient = {
          id: `28:${botAppId}`,
          name: env.data.APP_NAME,
        };
        context.activity.type = ActivityTypes.Message;

        await bot.app.run(context);
      };

      // Create the conversation
      await adapter.createConversationAsync(
        botAppId,
        channelId,
        serviceUrl,
        "",
        conversationParameters,
        logic
      );

      console.log("Private conversation created successfully.");
    } catch (error) {
      logger.error(`Error creating a new conversation: ${error}`);
    }
  }
}

/**
 * Start a conversation with the user.
 * @param req The incoming request.
 * @param bot The TeamsAI bot.
 * @param adapter The Teams adapter.
 * @param logger The logger.
 */
export async function notifyUserTasks(
  userTasks: any[],
  bot: TeamsAI,
  adapter: TeamsAdapter | CloudAdapter,
  logger: Logger
): Promise<void> {
  try {
    const botAppId = env.data.BOT_ID!; // bot's App ID
    const channelId = ""; // Empty string for creating a new conversation
    const userTaskAction = "userTask:Individual";

    userTasks.forEach(async (task: any) => {
      // Define the initial activity as a complete Activity object
      const initialActivity: Activity = {
        type: ActivityTypes.Message,
        name: "CreateConversation",
        text: userTaskAction,
        from: { id: `28:${botAppId}`, name: env.data.APP_NAME }, // The bot's ID and name
        recipient: {
          id: task.assignedId,
          aadObjectId: task.assignedId,
          name: task.assignedId,
        },
        channelId: "msteams",
        serviceUrl: serviceUrl,
        conversation: {
          id: "",
          isGroup: false,
        } as ConversationAccount, // Empty string for creating a new conversation
        channelData: {
          tenant: { id: env.data.AAD_APP_TENANT_ID! }, // Replace with your tenant ID
        },
        entities: [],
        localTimezone: "UTC",
        callerId: botAppId,
        label: "User message",
        valueType: "text",
        listenFor: [],
      };

      const conversationParameters: ConversationParameters = {
        isGroup: false,
        topicName: userTaskAction,
        bot: { id: `28:${botAppId}`, name: env.data.APP_NAME }, // bot's ID and name
        members: [{ id: task.assignedId, name: task.assignedId }],
        channelData: {
          tenant: { id: env.data.AAD_APP_TENANT_ID! }, // Replace with your tenant ID
        } as TeamsChannelData,
        activity: initialActivity,
      };

      // Logic to execute after the conversation is created
      const logic = async (context: TurnContext) => {
        const teamMembers = await TeamsInfo.getPagedMembers(context);
        const member = teamMembers.members.find(
          (m) => m.aadObjectId === task.assignedId
        );
        if (!member) {
          logger.error("Member not found.");
          return;
        }
        context.activity.channelId = "msteams";
        context.activity.conversation.conversationType = "personal";
        context.activity.text = userTaskAction;
        context.activity.from = {
          id: member.id,
          aadObjectId: member.aadObjectId,
          name: member.name,
        };
        context.activity.recipient = {
          id: `28:${botAppId}`,
          name: env.data.APP_NAME,
        };
        context.activity.type = ActivityTypes.Message;
        context.activity.value = task;

        await bot.app.run(context);
      };

      // Create the conversation
      await adapter.createConversationAsync(
        botAppId,
        channelId,
        serviceUrl,
        "",
        conversationParameters,
        logic
      );

      console.log("Private conversation created successfully.");
    });
  } catch (error) {
    logger.error(`Error creating a new conversation: ${error}`);
  }
}
