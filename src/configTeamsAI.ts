import { ApplicationTurnState } from "./models/aiTypes";
import {
  AI,
  ActionPlanner,
  OpenAIModel,
  PromptCompletionModel,
  PromptManager,
  TeamsAdapter,
} from "@microsoft/teams-ai";
import path from "path";
import { TeamsAI } from "./bot/teamsAI";
import { TurnContext, Storage } from "botbuilder";
import { Logger } from "./telemetry/logger";
import { CustomOpenAIModel } from "./ai/customOpenAIModel";
import * as responses from "./resources/responses";
import { Env, OpenAIType } from "./env";
import { ActionPlannerMiddleware } from "./middleware/actionPlannerMiddleware";
import { Utils } from "./helpers/utils";

/**
 * Configure the Teams AI components
 * @param useOpenAI True to use Azure OpenAI, false to use Copilot AI
 * @param storage The ConversationBlobStore instance
 * @returns Nothing
 */
export function configureTeamsAI(
  storage: Storage,
  adapter: TeamsAdapter,
  logger: Logger,
  env: Env
): TeamsAI {
  logger.info("Configuring Teams AI");
  // Retrieve all configuration settings asynchronously
  logger.info("Retrieving configuration settings for Teams AI");
  const botAppId = env.data.BOT_ID!;

  let model: PromptCompletionModel;

  // Create the AI model
  switch (env.data.OPENAI_TYPE) {
    case OpenAIType.Enum.OpenAI:
      model = new OpenAIModel({
        apiKey: env.data.OPENAI_KEY,
        defaultModel: env.data.OPENAI_MODEL,
      });
      break;
    case OpenAIType.Enum.AzureOpenAI:
      model = new OpenAIModel({
        azureApiKey: env.data.OPENAI_KEY,
        azureDefaultDeployment: env.data.OPENAI_MODEL,
        azureEndpoint: env.data.OPENAI_ENDPOINT,
        azureApiVersion: env.data.OPENAI_API_VERSION,
      });
      break;
    case OpenAIType.Enum.CustomAI:
      model = new CustomOpenAIModel(
        {
          apiKey: env.data.OPENAI_KEY,
          defaultModel: env.data.OPENAI_MODEL,
          endpoint: env.data.OPENAI_ENDPOINT,
        },
        logger
      );
      break;
    default:
      throw new Error("Invalid OPENAI_TYPE");
  }

  const prompts = new PromptManager({
    promptsFolder: path.join(__dirname, "./prompts"),
  });

  const planner = new ActionPlanner({
    model,
    prompts,
    defaultPrompt: async (
      context: TurnContext,
      state: ApplicationTurnState,
      planner: ActionPlanner<ApplicationTurnState>
    ) => {
      // Send the waiting message before the plan is ready
      await context.sendActivity(responses.waitingForResponse());

      // Show typing indicator
      await Utils.startTypingTimer(context, state);

      if (state.conversation.promptFolder) {
        return prompts.getPrompt(state.conversation.promptFolder);
      }
      return prompts.getPrompt(env.data.DEFAULT_PROMPT_NAME);
    },
  });

  // Create the bot that will handle incoming messages.
  const bot = new TeamsAI(botAppId, adapter, storage, planner);

  // Create the Teams AI Action Planner Middleware
  const actionPlannerMiddleware = new ActionPlannerMiddleware(bot, logger);

  // Attach the middleware to the Teams AI bot's Plan ready action
  actionPlannerMiddleware.attachMiddleware(AI.PlanReadyActionName);

  // Attach the middleware to the Teams AI bot's Do command action
  actionPlannerMiddleware.attachMiddleware(AI.DoCommandActionName);

  logger.info("Teams AI configured");

  return bot;
}
