/* eslint-disable prettier/prettier */
// Import necessary modules and classes
import welcomeCard from "../adaptiveCards/templates/welcome.json";
import historyCard from "../adaptiveCards/templates/history.json";

import {
  Application,
  ActionPlanner,
  Query,
  Memory,
} from "@microsoft/teams-ai";
import {
  ActivityTypes,
  TaskModuleTaskInfo,
  TurnContext,
  Storage,
  Activity
} from "botbuilder";
import { ApplicationTurnState, ChatParameters, TData } from "../models/aiTypes";
import { Utils } from "../helpers/utils";
import EntityInfo from "../models/entityInfo";
import * as responses from "../resources/responses";
import { PromptMessage } from "../models/promptMessage";
import { logging } from "../telemetry/loggerManager";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { container } from "tsyringe";
import CompanyInfo from "../models/companyInfo";
import { Logger } from "../telemetry/logger";
import {
  EntityRecognitionSkill
} from "../skills";
import { CacheHelper } from "../helpers/cacheHelper";
import { Env } from "../env";
import { LocalDocumentIndex } from "vectra";
import { ConsoleLogger } from "../telemetry/consoleLogger";
import { AppInsightLogger } from "../telemetry/appInsightLogger";
import { BlobsStorageLeaseManager } from "../helpers/blobsStorageLeaseManager";
import { BotMessageKeywords } from "../models/botMessageKeywords";
import { RestError } from "@azure/storage-blob";
import * as actionNames from "../actions/actionNames";
import { 
  debugOn,
  debugOff,
  getCompanyInfo,
  getCompanyDetails,
  chatWithDocument,
  forgetDocuments,
  flaggedInputAction,
  flaggedOutputAction,
  unknownAction,
  webRetrieval
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
import * as acActionNames from "../adaptiveCards/actions/adaptiveCardActionNames";
import {
  suggestedPrompt,
  otherCompany
} from "../adaptiveCards/actions";
import * as commandNames from "../messageExtensions/commandNames";
import {
  searchCmd, selectItem
} from "../messageExtensions";
import { UserHelper } from "../helpers/userHelper";
import { ActionsHelper } from "../helpers/actionsHelper";


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


// Define the TeamsAI class that extends the Application class
export class TeamsAI extends Application<ApplicationTurnState> {
  private readonly logger: Logger;
  private readonly planner: ActionPlanner<ApplicationTurnState>;
  private readonly env: Env;
  private readonly LocalVectraIndex: LocalDocumentIndex;
  private readonly stateStorageManager: BlobsStorageLeaseManager;

  // The name of the channel for M365 Message Extensions
  public static readonly M365CopilotSourceName = "copilot";

  // The name of the button in adaptive card for selecting an entity in Message Extensions
  public static readonly MessageExtensionTapSelect = "selectEntity";

  // Turn events that let you do something before or after a turn is run.
  public static readonly BeforeTurn = "beforeTurn";
  public static readonly AfterTurn = "afterTurn";

  /**
   * The TeamsAI constructor.
   * @param storage - The storage to use for the conversation store.
   * @param planner - The planner to use for the AI.
   * @param defaultAugmentationMode - The default augmentation mode to use for the AI.
   * @remarks
   */
  constructor(
    storage: Storage,
    planner: ActionPlanner<ApplicationTurnState>
  ) {
    if (planner) {
      super({
        storage: storage,
        ai: {
          planner,
          allow_looping: false, // set false for sequence augmentation to prevent sending the return value of the last action to the AI.run method
        }
      });
    } else {
      super({ storage });
    }
    
    this.planner = planner;

    this.logger = logging.getLogger("bot.TeamsAI");
    // Register this.logger singleton, if it is not registered
    if (!container.isRegistered(Logger))
      container.register(Logger, { useValue: this.logger });

    this.env = container.resolve<Env>(Env);
    this.stateStorageManager = container.resolve<BlobsStorageLeaseManager>(BlobsStorageLeaseManager);

    // Create a local Vectra index
    this.LocalVectraIndex = new LocalDocumentIndex({
      folderPath: this.env.data.VECTRA_INDEX_PATH,
    });

    // Listen for new members to join the conversation
    this.conversationUpdate(
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
            }
          }
        }
      }
    );

    // Register a handler to handle unknown actions that might be predicted
    this.ai.action(actionNames.unknownAction, unknownAction);
    this.ai.action(actionNames.flaggedInputAction, flaggedInputAction);
    this.ai.action(actionNames.flaggedOutputAction, flaggedOutputAction);

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
    this.ai.action(actionNames.debugOn, debugOn);

    // Register debug off action
    this.ai.action(actionNames.debugOff, debugOff);

    /******************************************************************
     * ACTION: GET COMPANY INFO
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "getLatestInfo" action
    this.ai.action(actionNames.getCompanyInfo, async (context: TurnContext, state: ApplicationTurnState) => getCompanyInfo(context, state, this.planner));

    /******************************************************************
     * ACTION: GET COMPANY DETAILS
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "getLatestInfo" action
    this.ai.action(
      actionNames.getCompanyDetails, 
      async (context: TurnContext, state: ApplicationTurnState, parameters: ChatParameters) => getCompanyDetails(context, state, parameters, this.planner));

    /******************************************************************
     * ACTION: CHAT WITH YOUR OWN DATA
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "chatWithDocument" action
    this.ai.action(
      actionNames.chatWithDocument, 
      async (context: TurnContext, state: ApplicationTurnState, parameters: ChatParameters) => chatWithDocument(context, state, parameters, this.planner));

    /******************************************************************
     * ACTION: WEB RETRIEVAL
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "webRetrieval" action
    this.ai.action(
      actionNames.webRetrieval,
      async (context: TurnContext, state: ApplicationTurnState, parameters: ChatParameters) => webRetrieval(context, state, parameters, this.planner));

    /******************************************************************
     * ACTION: FORGET DOCUMENTS
     *****************************************************************/
    // Define a prompt action when the user sends a message containing the "forgetDocuments" action
    this.ai.action(actionNames.forgetDocuments, forgetDocuments);

    /******************************************************************
     * ADAPTIVE CARD ACTIONS: GetCompanyDetails
     *****************************************************************/
    this.adaptiveCards.actionExecute(
      acActionNames.suggestedPrompt,
      async (context: TurnContext, state: ApplicationTurnState, data: PromptMessage) => suggestedPrompt(context, state, data, this.planner));

    // Listen for Other Company command on thr adaptive card from the user
    this.adaptiveCards.actionExecute(
      acActionNames.otherCompany,
      async (context: TurnContext, state: ApplicationTurnState, data: PromptMessage) => otherCompany(context, state, data, this.planner));

    // Listen for /forgetDocument command and then delete the document properties from state
    this.adaptiveCards.actionExecute(actionNames.forgetDocuments, forgetDocuments);

    // List for message extension search command
    this.messageExtensions.query(commandNames.searchCmd, async (context: TurnContext, state: ApplicationTurnState, query: Query<Record<string, any>>) => searchCmd(context, state, query, this.planner, this.logger));

    // Listen for message extension select item command
    this.messageExtensions.selectItem(selectItem);

    this.taskModules.fetch(
      actionNames.getCompanyInfo,
      async (
        context: TurnContext,
        state: ApplicationTurnState,
        data: TData
      ): Promise<any> => {
        // Generate detailed information for the selected company
        const entity: CompanyInfo = data.entity;

        // call Entity Info Skill to get the entity details from Teams Copilot Starter API
        const entityRecognitionSkill = new EntityRecognitionSkill(
          context,
          state,
          this.planner
        );

        // Run the skill to get the entity details
        const entityInfo = await entityRecognitionSkill.run(entity.name) as EntityInfo;
        
        // Generate and display Adaptive Card for the provided company name
        const card = await ActionsHelper.generateAdaptiveCardForEntity(context, state, entityInfo, this.planner);

        // if the document has been reviewed, show the approve/reject card
        const taskModuleResponse: TaskModuleTaskInfo = {
          title: entity.name,
          card: card,
        };
        return taskModuleResponse;
      }
    );

    // Listen for /reset command and then delete the conversation state
    this.message(
      BotMessageKeywords.reset,
      async (context: TurnContext, state: ApplicationTurnState) => {
        state.deleteConversationState();
        // change the prompt folder to the default
        state.conversation.promptFolder = this.env.data.DEFAULT_PROMPT_NAME;

        state.deleteConversationState();
        state.deleteUserState();
        CacheHelper.clearCurrentUser(state);
        CacheHelper.clearConversationHistory(state);
        // Delete the local vectra index
        this.LocalVectraIndex.deleteIndex();
        state.conversation.documentIds = [];

        await context.sendActivity(responses.reset());
        // Get the user's information
        const user = await UserHelper.updateUserInfo(context, state);

        this.logger.info(`Conversation state has been reset by ${user.name}.`);
      }
    );

    // Listen for /forget command and then delete the document properties from state
    this.message(
      BotMessageKeywords.forget,
      async (context: TurnContext, state: ApplicationTurnState) => {
        await context.sendActivity("Uploaded document has been forgotten.");
        this.logger.info(
          `${state.conversation.uploadedDocuments?.length} uploaded document have been forgotten.`
        );
        state.conversation.uploadedDocuments = undefined;
        // Delete the local vectra index
        this.LocalVectraIndex.deleteIndex();
        state.conversation.documentIds = [];

        // const appState = container.resolve<ApplicationState>(ApplicationState);
        // appState.set(state, await UserHelper.getUserInfo(context, state));
      }
    );

    // Listen for /welcome command and then delete the conversation state
    this.message(
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
    this.message(
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
    this.message(
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
            `The current uploaded document(s) are ${documents}. Use "/forget" to forget the document(s).`
          );
        } else {
          await context.sendActivity(
            "There are currently no uploaded document."
          );
        }
      }
    );

    // Listen for /document command and show delete the document properties from state
    this.message(
      BotMessageKeywords.debug,
      async (context: TurnContext, state: ApplicationTurnState) => {
        await context.sendActivity(
          state.conversation.debug ? "debug mode is on" : "debug mode is off"
        );
      }
    );

    this.message(
      BotMessageKeywords.chatGPT,
      async (context: TurnContext, state: ApplicationTurnState) => {
        // change the prompt folder to ChatGPT
        state.conversation.promptFolder = AIPrompts.ChatGPT;
        await context.sendActivity("AI Copilot Skills are set to ChatGPT");
      }
    );

    this.message(
      BotMessageKeywords.chatDocument,
      async (context: TurnContext, state: ApplicationTurnState) => {
        // change the prompt folder to ChatGPT
        state.conversation.promptFolder = AIPrompts.QuestionWeb;
        await context.sendActivity("AI Copilot Skills are set to QuestionDocument");
      }
    );

    // In order to avoid the bot from processing multiple messages at the same time, 
    // We need manage the distributed state of the bot instance that is processing the
    // Request for a specific conversation.
    this.turn(TeamsAI.BeforeTurn, async (context: TurnContext, state: ApplicationTurnState) => {
      // if the activity type is not a message, let it continue to process
      // Check if the message is a bot message keyword
      // If it is, let it continue to process without managing state
      if (context.activity.type !== ActivityTypes.Message ||
        Object.values(BotMessageKeywords).some(keyword => context.activity.text.startsWith(keyword as string))) {
        return true;
      }

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

      // Continue processing the request
      return true;
    });

    // After the turn has finished, release the lease for the conversation blob
    // In order for it to be available for the next request from the conversation
    this.turn(TeamsAI.AfterTurn, async (context: TurnContext, state: ApplicationTurnState) => {
      try {
        if (state.temp.leaseId) {
          // Release the lease for the conversation blob
          await this.stateStorageManager.releaseLeaseAsync(this.getConversationKey(context.activity), state.temp.leaseId); 
        }
      } catch (error) {
        this.logger.error(`Error releasing lease: ${error}`);
      }
      return true;
    });
  }

  /**
   * This method is called when the bot is starting
   * @param context
   * @returns
   */
  public async start(context: TurnContext): Promise<void> {
    // Create the local Vectra index, if it does not exist
    const index = new LocalDocumentIndex({ folderPath: this.env.data.VECTRA_INDEX_PATH });
    if (!await index.isIndexCreated()) {
      await index.createIndex({ version: 1, deleteIfExists: true });
    }
  }

  ///////////////////////////
  // Private helper methods //
  ///////////////////////////
  private getConversationKey(activity: Activity): string {
    return `${activity.channelId}/${activity.recipient.id}/conversations/${activity.conversation.id}`;
  }
}
