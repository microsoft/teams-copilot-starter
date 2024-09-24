/* eslint-disable prettier/prettier */
// Import necessary modules and classes
import welcomeCard from "../adaptiveCards/templates/welcome.json";
import historyCard from "../adaptiveCards/templates/history.json";

import {
  Application,
  ActionPlanner,
  Query,
  Memory,
  TeamsAdapter,
  ApplicationBuilder,
  FeedbackLoopData,
  AuthError,
  PredictedSayCommand,
  AI,
} from "@microsoft/teams-ai";
import {
  ActivityTypes,
  TurnContext,
  Storage,
  Activity,
  CardFactory,
  TeamsInfo,
  ConversationReference,
  MemoryStorage,
} from "botbuilder";
import { ApplicationTurnState, ChatParameters, CopilotRoles } from "../models/aiTypes";
import debug from "debug";
import { Utils } from "../helpers/utils";
import * as responses from "../resources/responses";
import { logging } from "../telemetry/loggerManager";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { container } from "tsyringe";
import { Logger } from "../telemetry/logger";
import { CacheHelper } from "../helpers/cacheHelper";
import { Env } from "../env";
import { LocalDocumentIndex } from "vectra";
import { ConsoleLogger } from "../telemetry/consoleLogger";
import { AppInsightLogger } from "../telemetry/appInsightLogger";
import { BlobsStorageLeaseManager } from "../helpers/blobsStorageLeaseManager";
import { BotMessageKeywords } from "../models/botMessageKeywords";
import { RestError } from "@azure/storage-blob";
import adapter from "../adapter";
import * as actionNames from "../actions/actionNames";
import { 
  debugOn,
  debugOff,
  getSemanticInfo,
  chatWithDocument,
  forgetDocuments,
  flaggedInputAction,
  flaggedOutputAction,
  unknownAction,
  webRetrieval,
  formatActionMessage,
  resetIndex
} from "../actions";
import * as functionNames from "../functions/functionNames";
import {
  getActions,
  getDebugStatus,
  getEntityName,
  getAttachedDocuments,
  getUserState,
  incrementFileIndex
} from "../functions";
import { UserHelper } from "../helpers/userHelper";
import * as commandNames from "../messageExtensions/commandNames";
import { searchCmd } from "../messageExtensions";
import { BlobsStorage } from "botbuilder-azure-blobs";
import { MetricNames } from "../types/metricNames";
import { EventNames } from "../types/eventNames";




// Define the TeamsAI class that extends the Application class
export class TeamsAI {
  public readonly app: Application<ApplicationTurnState>;
  private readonly logger: Logger;
  private readonly error: debug.Debugger;
  private readonly planner: ActionPlanner<ApplicationTurnState>;
  private readonly env: Env;
  private readonly stateStorageManager: BlobsStorageLeaseManager | undefined;
  private readonly authConnectionName = "graph";

  // The name of the channel for M365 Message Extensions
  public static readonly M365CopilotSourceName = "copilot";

  // The name of the button in adaptive card for selecting an entity in Message Extensions
  public static readonly MessageExtensionTapSelect = "selectEntity";

  // Turn events that let you do something before or after a turn is run.
  public static readonly BeforeTurn = "beforeTurn";
  public static readonly AfterTurn = "afterTurn";

  // Handoff url template
  public static HandoffUrl = "https://teams.microsoft.com/l/chat/0/0?users=28:${botId}&continuation=${continuation}";

  public static ConversationReferences: Record<string, Partial<ConversationReference>> = {};


  private configureLogging(): Logger {
    // Configure logging
    const consoleLogger = new ConsoleLogger();
    const appInsightLogger = new AppInsightLogger();

    logging
      .configure({
        minLevels: {
          "": "trace",
        },
      })
      .registerLogger(consoleLogger)
      .registerLogger(appInsightLogger);

    return logging.getLogger("bot.TeamsAI");
  }

  /**
   * Configure the AI application for the Teams environment
   * @param botId - The bot id to use for the AI.
   * @param storage - The storage to use for the conversation store.
   * @param planner - The planner to use for the AI.
   * @returns The configured AI application.
   */
  private configureAI(botId: string, storage: Storage, planner: ActionPlanner<ApplicationTurnState>): Application<ApplicationTurnState> {
    const ai = new ApplicationBuilder<ApplicationTurnState>()
      .withStorage(storage)
      .withLongRunningMessages(adapter as TeamsAdapter, botId)
      .withAIOptions({
        planner: planner,
        allow_looping: false, // set false for sequence augmentation to prevent sending the return value of the last action to the AI.run method
        enable_feedback_loop: true, // enables the user feedback functionality
      })
      .withAuthentication(adapter as TeamsAdapter, {
        settings: {
            graph: {
                scopes: [`api://botid-${this.env.data.BOT_ID}/access_as_user`],
                msalConfig: {
                    auth: {
                        clientId: this.env.data.AAD_APP_CLIENT_ID!,
                        clientSecret: this.env.data.AAD_APP_CLIENT_SECRET!,
                        authority: `${this.env.data.AAD_APP_OAUTH_AUTHORITY_HOST}/${this.env.data.AAD_APP_TENANT_ID}`
                    }
                },
                signInLink: `https://${this.env.data.BOT_DOMAIN}/auth-start.html`,
                endOnInvalidMessage: true
            }
        },
        autoSignIn: false, // NOTE: Set to true to enable Single Sign On scenario.
      })
      .build();
    return ai;
  };

  /**
   * Configure the AI application for the test tool environment
   * @param storage - The storage to use for the conversation store.
   * @param planner - The planner to use for the AI.
   * @returns The configured AI application.
   */
  private configureAIForTestTool(storage: Storage, planner: ActionPlanner<ApplicationTurnState>): Application<ApplicationTurnState> {
      const ai = new ApplicationBuilder<ApplicationTurnState>()
      .withStorage(storage)
      .withAIOptions({
        planner: planner,
        allow_looping: false, // set false for sequence augmentation to prevent sending the return value of the last action to the AI.run method
        enable_feedback_loop: true, // enables the user feedback functionality
      })
      .build();
    return ai;
  };
  
  /**
   * The TeamsAI constructor.
   * @param storage - The storage to use for the conversation store.
   * @param planner - The planner to use for the AI.
   * @param defaultAugmentationMode - The default augmentation mode to use for the AI.
   * @remarks
   */
  constructor(
    storage: Storage,
    planner: ActionPlanner<ApplicationTurnState>,
    conversationReferences?: any
  ) {
    // Create the environment variables
    this.env = container.resolve<Env>(Env);

    if (this.env.environment === "testtool") {
      // Create the AI application for the test tool environment
      this.app = this.configureAIForTestTool(new MemoryStorage(), planner);    
    } else {
      // Create the AI application for the Teams environment

      // Set up the handoff URL
      TeamsAI.HandoffUrl = TeamsAI.HandoffUrl.replace("${botId}", this.env.data.BOT_ID);
      
      // Create the AI application
      this.app = this.configureAI(this.env.data.BOT_ID, storage, planner);    
    }

    TeamsAI.ConversationReferences = conversationReferences;

    this.planner = planner;

    // Configure the logger
    this.logger = this.configureLogging();

    // Register this.logger singleton, if it is not registered
    if (!container.isRegistered(Logger))
      container.register(Logger, { useValue: this.logger });

    // Configure the error handler
    this.error = debug("azureopenai:app:error");
    this.error.log = console.log.bind(this.logger);
    this.error.enabled = true;

    if (storage instanceof BlobsStorage) {
      // Resolve the BlobsStorageLeaseManager dependency injection
      this.stateStorageManager = container.resolve<BlobsStorageLeaseManager>(BlobsStorageLeaseManager);
    }

    /**********************************************************************
     * FUNCTION:Handlers for authentication
     **********************************************************************/
    if (this.env.environment !== "testtool") {
      this.app.authentication.get(this.authConnectionName).onUserSignInSuccess(async (context: TurnContext, state: ApplicationTurnState) => {
        // Successfully logged in
        const card = {
          type: "AdaptiveCard",
          version: "1.0",
          body: [
            {
              type: "TextBlock",
              text: "We needed to sign you in.",
              style: "heading",
              size: "ExtraLarge",
              color: "Good"
            },
            {
              type: "TextBlock",
              text: `Your are now signed in as: ${context.activity.from.name}`
            },
          ],
        };
      
        const adaptiveCard = CardFactory.adaptiveCard(card);
        await context.sendActivity({ attachments: [adaptiveCard] }); 
        
        // Echo back users request
        if (context.activity.channelData.source.name === "message"
          && context.activity.text.length > 0) {
            context.activity.type = ActivityTypes.Message;
            state.deleteConversationState();
            await this.app.run(context);
          } 
      });
    
      this.app.authentication
        .get(this.authConnectionName)
        .onUserSignInFailure(async (context: TurnContext, state: ApplicationTurnState, error: AuthError) => {
            // Failed to login
            await context.sendActivity("Failed to login");
            if (state.conversation.debug ?? false) {
              await context.sendActivity(`Error message: ${error.message}`);
            }
      });
    
      this.app.message("/signout", async (context: TurnContext, state: ApplicationTurnState) => {
        await this.app.authentication.signOutUser(context, state, this.authConnectionName);
    
        // Echo back users request
        await context.sendActivity("You have signed out");
      });

      this.app.message("/signin", async (context: TurnContext, state: ApplicationTurnState) => {
        const response = await this.app.authentication.signUserIn(context, state, this.authConnectionName);
    
        // Echo back users request
        await context.sendActivity("Sign in request sent");
      });
    }

    // Listen for new members to join the conversation
    this.app.conversationUpdate(
      "membersAdded",
      async (context: TurnContext, state: ApplicationTurnState) => {
        const membersAdded = context.activity.membersAdded || [];
        for (let member = 0; member < membersAdded.length; member++) {
          // Ignore the bot joining the conversation
          // eslint-disable-next-line security/detect-object-injection
          if (membersAdded[member].id !== context.activity.recipient.id) {
            if (!state.user.greeted) {
              state.user.greeted = true;
              // Welcome user.
              const card = Utils.renderAdaptiveCard(welcomeCard);
              await context.sendActivity({ attachments: [card] });

              // Add the conversation reference to the storage
              this.addConversationReference(context.activity, state);
            }
          }
        }
      }
    );

    // Register a handler to handle unknown actions that might be predicted
    this.app.ai.action(actionNames.unknownAction, unknownAction);
    this.app.ai.action(actionNames.flaggedInputAction, flaggedInputAction);
    this.app.ai.action(actionNames.flaggedOutputAction, flaggedOutputAction);

    // Register a handler to override the say command with custom logic
    this.app.ai.action<PredictedSayCommand>(AI.SayCommandActionName, formatActionMessage);    
    
    /**********************************************************************
     * FUNCTION: GET ACTIONS
     * Register a handler to handle the "getActions" semantic function
     * This action is used to get the action's execution mode, which can be either "sequential" or "parallel"
     **********************************************************************/
    this.planner.prompts.addFunction(functionNames.getActions, async (context: TurnContext, memory: Memory) => getActions(context, memory, this.planner));

    /**********************************************************************
     * FUNCTION: Get Entity Name
     * Register a handler to handle the "getEntityName" action
     **********************************************************************/
    this.planner.prompts.addFunction(functionNames.getEntityName, getEntityName);

    /******************************************************************
     * FUNCTION: User State
     ******************************************************************/
    this.planner.prompts.addFunction(functionNames.getUserState, getUserState);

    /******************************************************************
     * FUNCTION: Debug Status
     ******************************************************************/
    // Define a prompt function for getting the current status of the debug flag
    this.planner.prompts.addFunction(functionNames.getDebugStatus, getDebugStatus);

    /**********************************************************************
     * FUNCTION: INCREMENT FILE INDEX
     * Register a handler to handle the "IncrementFileIndexFunc" function
     **********************************************************************/
    this.planner.prompts.addFunction(functionNames.incrementFileIndex, incrementFileIndex);

    /**********************************************************************
     * FUNCTION: GET ATTACHED DOCUMENTS
     * Register a handler to handle the "GetAttachedDocumentsFunc" function
     **********************************************************************/
    this.planner.prompts.addFunction(functionNames.getAttachedDocuments, getAttachedDocuments);

    /******************************************************************
     * ACTION: DEBUG
     *****************************************************************/
    // Register debug on action
    this.app.ai.action(actionNames.debugOn, debugOn);

    // Register debug off action
    this.app.ai.action(actionNames.debugOff, debugOff);

    /******************************************************************
     * ACTION: GET SEMANTIC GENERIC INFO
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "getSemanticInfo" action
    this.app.ai.action(actionNames.getSemanticInfo, async (context: TurnContext, state: ApplicationTurnState) => getSemanticInfo(context, state, this.planner));


    /******************************************************************
     * ACTION: CHAT WITH YOUR OWN DATA
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "chatWithDocument" action
    this.app.ai.action(
      actionNames.chatWithDocument, 
      async (context: TurnContext, state: ApplicationTurnState, parameters: ChatParameters) => chatWithDocument(context, state, parameters, this.planner));

    /******************************************************************
     * ACTION: WEB RETRIEVAL
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "webRetrieval" action
    this.app.ai.action(
      actionNames.webRetrieval,
      async (context: TurnContext, state: ApplicationTurnState, parameters: ChatParameters) => webRetrieval(context, state, parameters, this.planner));

    /******************************************************************
     * ACTION: FORGET DOCUMENTS
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "forgetDocuments" action
    this.app.ai.action(actionNames.forgetDocuments, forgetDocuments);

    /******************************************************************
     * USER FEEDBACK LOOP
     *****************************************************************/
    this.app.feedbackLoop(async (context: TurnContext, state: ApplicationTurnState, feedback: FeedbackLoopData) => {
      // Log the feedback
      this.logger.info(`Feedback received: ${JSON.stringify(feedback)}`);
      switch (feedback.actionValue.reaction) {
        case "like":
          this.logger.trackMetric(MetricNames.LikeFeedbackCount, 1);
          break;
        case "dislike":
          this.logger.trackMetric(MetricNames.DislikeFeedbackCount, 1);
          break;
        default:
          break;
      }
      this.logger.trackEvent(EventNames.FeedbackReceived, { reaction: feedback.actionValue.reaction, feedback: feedback.actionValue.feedback });
      await context.sendActivity("Thank you for your feedback.");
      if (state.conversation.debug) {
        await context.sendActivity(`Feedback received: ${JSON.stringify(feedback)}`);
      }
    });

    /******************************************************************
     * HANDOFF
     *****************************************************************/
    // Register a handler to handle the handoff action
    this.app.handoff(async (context: TurnContext, state: ApplicationTurnState, continuation: string) => {
      // Log the handoff
      this.logger.info(`Handoff received: ${continuation}`);
      await context.sendActivity("Continuing the conversation from another chat/application.");
      await context.sendActivity(`Handoff received: ${continuation}`);
           
    });

    // Listen for /forgetDocument command and then delete the document properties from state
    this.app.adaptiveCards.actionExecute(actionNames.forgetDocuments, forgetDocuments);

    // Listen for message extension search command
    this.app.messageExtensions.query(commandNames.searchCmd, async (context: TurnContext, state: ApplicationTurnState, query: Query<Record<string, any>>) => searchCmd(context, state, query, this.logger));

    // Listen for /newchat command and then delete the conversation state
    this.app.message(
      BotMessageKeywords.newchat,
      async (context: TurnContext, state: ApplicationTurnState) => {
        // forget documents from index
        await forgetDocuments(context, state);
        
        state.deleteConversationState();
        // change the prompt folder to the default
        state.conversation.promptFolder = this.env.data.DEFAULT_PROMPT_NAME;

        state.deleteConversationState();
        state.deleteUserState();
        CacheHelper.clearCurrentUser(state);
        CacheHelper.clearConversationHistory(state);
        state.conversation.documentIds = [];

        await context.sendActivity(responses.reset());
        // Get the user's information
        const user = await UserHelper.updateUserInfo(context, state);

        this.logger.info(`Conversation state has been reset by ${user.name}.`);
      }
    );

    // Listen for /resetIndex command and then delete the conversation state
    this.app.message(
      BotMessageKeywords.resetIndex,
      async (context: TurnContext, state: ApplicationTurnState) => {
        const result = await resetIndex(context, state);
        await context.sendActivity(result);
      }
    );

    // Listen for /welcome command and then delete the conversation state
    this.app.message(
      BotMessageKeywords.welcome,
      async (context: TurnContext, state: ApplicationTurnState) => {
        state.user.greeted = true;
        // Welcome user.
        const card = Utils.renderAdaptiveCard(welcomeCard);
        await context.sendActivity({ attachments: [card] });
        this.logger.info(
          `Returning the welcome adaptive card for ${state.user.user?.name}.`
        );
      }
    );

    // Listen for /history command and then delete the conversation state
    this.app.message(
      BotMessageKeywords.history,
      async (context: TurnContext, state: ApplicationTurnState) => {
        const maxTurnsToRemember = await Utils.MaxTurnsToRemember();
        const chatHistory = CacheHelper.getChatHistory(
          state,
          maxTurnsToRemember
        );
        if (chatHistory.length > 0) {
          const card = Utils.renderAdaptiveCard(historyCard, {
            history: chatHistory,
          });
          // send the chat history in the adaptive card
          await context.sendActivity({ attachments: [card] });
        } else {
          await context.sendActivity(
            "There is nothing stored in the conversation history"
          );
        }

        // Get the user's information
        const user = await UserHelper.updateUserInfo(context, state);

        this.logger.info(`Conversation history requested by ${user.name}.`);
      }
    );

    // Listen for /document command and show delete the document properties from state
    this.app.message(
      BotMessageKeywords.document,
      async (context: TurnContext, state: ApplicationTurnState) => {
        if (
          state.conversation.uploadedDocuments &&
          state.conversation.uploadedDocuments.length > 0
        ) {
          const documents = state.conversation.uploadedDocuments
            ?.map((doc) => doc.fileName)
            .join(", ");
          await context.sendActivity(
            `The current uploaded document(s) are ${documents}. Use "forget documents" to forget the document(s).`
          );
        } else {
          await context.sendActivity(
            "There are currently no uploaded document."
          );
        }
      }
    );

    // Listen for /document command and show delete the document properties from state
    this.app.message(
      BotMessageKeywords.debug,
      async (context: TurnContext, state: ApplicationTurnState) => {
        await context.sendActivity(
          state.conversation.debug ? "debug mode is on" : "debug mode is off"
        );
      }
    );

    this.app.message(
      BotMessageKeywords.chatGPT,
      async (context: TurnContext, state: ApplicationTurnState) => {
        // change the prompt folder to ChatGPT
        state.conversation.promptFolder = AIPrompts.ChatGPT;
        await context.sendActivity("AI Copilot Skills are set to ChatGPT");
      }
    );

    this.app.message(
      BotMessageKeywords.chatDocument,
      async (context: TurnContext, state: ApplicationTurnState) => {
        // change the prompt folder to QuestionWeb
        state.conversation.promptFolder = AIPrompts.QuestionWeb;
        await context.sendActivity("AI Copilot Skills are set to QuestionDocument");
      }
    );


    // In order to avoid the bot from processing multiple messages at the same time, 
    // We need manage the distributed state of the bot instance that is processing the
    // Request for a specific conversation.
    this.app.turn(TeamsAI.BeforeTurn, async (context: TurnContext, state: ApplicationTurnState) => {
      // if the activity type is not a message, let it continue to process
      // Check if the message is a bot message keyword
      // If it is, let it continue to process without managing state
      switch (context.activity.type) {
        case ActivityTypes.Message:
          if (context.activity.text && Object.values(BotMessageKeywords).some(keyword => context.activity.text.startsWith(keyword as string))) {
            return true;
          }
          break;
        case ActivityTypes.Event:
          switch (context.activity.name) {
            case "ContinueConversation":
              // If the event is a ContinueConversation event, let it continue to process as a message type
              context.activity.type = ActivityTypes.Message;
              return true;
            default:
              return false;
          }
          break;
        default:
          return true;
      }

      if (this.stateStorageManager) {
        try {
          // Acquire a lease for the conversation blob
          const leaseId = await this.stateStorageManager.acquireLeaseAsync(this.getConversationKey(context.activity));
          // Store the leaseId in the temp state
          state.temp.leaseId = leaseId;
        } catch (error) {
          if (error instanceof RestError && error?.code == "LeaseAlreadyPresent") {
            // There was an error acquiring the lease, which means that another thread or 
            // bot instance is currenty processing a request for this conversation.
            this.logger.error(`Error acquiring lease: ${error}`);
            await context.sendActivity("Please wait for the previous action to complete before sending a new request.");
            return false;
          }
          // If we encountered another error that we are not expecting,
          // throw the error, so that the bot can stop processing the request
          throw error;
        }
      }
      // Add the conversation reference to the storage
      this.addConversationReference(context.activity, state);

      // Continue processing the request
      return true;
    });

    // After the turn has finished, release the lease for the conversation blob
    // In order for it to be available for the next request from the conversation
    this.app.turn(TeamsAI.AfterTurn, async (context: TurnContext, state: ApplicationTurnState) => {
      try {
        const chatHistory = CacheHelper.getChatHistory(state, 10);
        // if the assistant response is missing, remove the first user's prompt
        chatHistory.forEach((item, index) => {
          if (item.role === CopilotRoles.user && chatHistory[index + 1]?.role !== CopilotRoles.copilot) {
            chatHistory.shift();
            state.temp.input = JSON.stringify(chatHistory);
          }
        });
        if (this.stateStorageManager && state.temp.leaseId) {
          // Release the lease for the conversation blob
          await this.stateStorageManager.releaseLeaseAsync(this.getConversationKey(context.activity), state.temp.leaseId); 
        }
      } catch (error) {
        this.logger.error(`Error releasing lease: ${error}`);
      }
      return true;
    });


    /******************************************************************
     * ERROR
     * Register a handler to handle the error event
     * This event is triggered when an error occurs during the processing of a turn
     *****************************************************************/
    this.app.error(async (context: TurnContext, err: Error) => {
      // This check writes out errors to the bound logger (eg. console, Application Insights)
      this.error(`[onTurnError] unhandled error: ${err}`);
      this.error(err);

      if (err.message) {
        this.logger.error(err.message);
        this.logger.error(err.stack!);

        // Send a trace activity, which will be displayed in Bot Framework Emulator
        await context.sendTraceActivity(
          "OnTurnError Trace",
          `${err.message}`,
          "https://www.botframework.com/schemas/error",
          "TurnError"
        );
      }
    });
  }

  /**
   * This method is called when the bot is starting
   * @param context
   * @returns
   */
  public async start(context: TurnContext): Promise<void> {
    // Create the local Vectra index, if it does not exist
    const index = new LocalDocumentIndex({ folderPath: this.env.data.VECTRA_INDEX_PATH! });
    if (!await index.isIndexCreated()) {
      await index.createIndex({ version: 1, deleteIfExists: true });
    }
  }

  /**
   * This method is called when the bot sends a proactive message to all users in the team
   * @param context
   * @returns
   */
  public async SendNotificationToAllUsersAsync(context: TurnContext) {
    const TeamMembers = await TeamsInfo.getPagedMembers(context);
    TeamMembers.members.map(async member => {
        const ref = TurnContext.getConversationReference(context.activity);
        ref.user = member;
        const botId = ref.bot ? ref.bot.id : this.env.data.BOT_ID ?? "";
        await context.adapter.continueConversationAsync(botId, ref, async (context) => {
            await context.sendActivity("Proactive hello.");
        });
    });
  }

  ///////////////////////////
  // Private helper methods //
  ///////////////////////////
  private getConversationKey(activity: Activity): string {
    return `${activity.channelId}/${activity.recipient.id}/conversations/${activity.conversation.id}`;
  }

  private addConversationReference(activity: Activity, state: ApplicationTurnState): void {
    // Obtain the conversation reference from the activity
    const conversationReference = TurnContext.getConversationReference(activity);
     // Ad the conversation reference to the cache
    CacheHelper.addConversationReference(state, conversationReference);

    // Add the conversation reference to the memory object
    TeamsAI.ConversationReferences[(conversationReference.conversation)? conversationReference.conversation.id : activity.conversation.id] = conversationReference;
  }
}
