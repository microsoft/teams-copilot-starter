// Import required packages
import "reflect-metadata";
import * as restify from "restify";
import * as path from "path";

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
} from "botbuilder";

import { AxiosError } from "axios";
import { container } from "tsyringe";
import { logging } from "./telemetry/loggerManager";
import { configureTeamsAI } from "./configTeamsAI";
import { configureBotFramework } from "./configBotFramework";
import { addResponseFormatter } from "./responseFormatter";
import { Env } from "./env";
import { BlobsStorage } from "botbuilder-azure-blobs";
import { ConsoleLogger } from "./telemetry/consoleLogger";
import { AppInsightLogger } from "./telemetry/appInsightLogger";
import { BlobsStorageLeaseManager } from "./helpers/blobsStorageLeaseManager";

// Create an instance of the environment variables
const envVariables: Env = new Env();

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

// Get logging
const logger = logging.getLogger("index");

// register the environment variables
container.register<Env>(Env, {
  useValue: envVariables,
});

// Configure Bot Framework Authentication
const botFrameworkAuthentication: ConfigurationBotFrameworkAuthentication =
  configureBotFramework(logger, envVariables);

// Create adapter.
const adapter = new CloudAdapter(botFrameworkAuthentication);

logger.info("Creating BlobsStorage");
const storage = new BlobsStorage(
  `DefaultEndpointsProtocol=https;AccountName=${envVariables.data.STORAGE_ACCOUNT_NAME};AccountKey=${envVariables.data.STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`,
  envVariables.data.STORAGE_CONTAINER_NAME!
);

const storageLeaseManager = new BlobsStorageLeaseManager(
  `DefaultEndpointsProtocol=https;AccountName=${envVariables.data.STORAGE_ACCOUNT_NAME};AccountKey=${envVariables.data.STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`,
  `${envVariables.data.STORAGE_CONTAINER_NAME!}-state-manager`
);

container.register<BlobsStorageLeaseManager>(BlobsStorageLeaseManager, {
  useValue: storageLeaseManager,
});

// Create the bot that will handle incoming messages.
const bot = configureTeamsAI(storage, logger, envVariables);

// Add a custom response formatter to convert markdown code blocks to <pre> tags
addResponseFormatter(bot);

// Catch-all for errors.
const onTurnErrorHandler = async (context: TurnContext, error: Error) => {
  // This check writes out errors to console log .vs. app insights.
  // NOTE: In production environment, you should consider logging this to Azure
  //       application insights.
  logger.error(
    `[onTurnError] unhandled error: ${error}, stack: ${error.stack}`
  );

  if (error.name === "AxiosError") {
    const msg =
      `Network Error ${(<AxiosError<any>>error).response?.status}:` +
        (<AxiosError<any>>error).response?.data?.error?.message ??
      (<AxiosError<any>>error).response?.statusText ??
      "unknown error";
    logger.warn(`[onTurnError] error details: ${msg}`);
    await context.sendActivity(msg);
  } else {
    logger.error(`[onTurnError] unhandled error: ${error}`);
  }

  // Send a trace activity, which will be displayed in Bot Framework Emulator
  await context.sendTraceActivity(
    "OnTurnError Trace",
    `${error}`,
    "https://www.botframework.com/schemas/error",
    "TurnError"
  );

  // Send a message to the user
  await context.sendActivity(
    "There was an error generating your response. Please try again. If the error persists, please contact your support team."
  );
};

// Set the onTurnError for the singleton CloudAdapter
adapter.onTurnError = onTurnErrorHandler;

logger.info("Starting bot");

// Create HTTP server.
const server = restify.createServer();
server.use(restify.plugins.bodyParser());
server.listen(process.env.PORT || process.env.port || 3978, () => {
  logger.info(`Bot Started, ${server.name} listening to ${server.url}`);
});

// Listen for incoming requests.
server.post("/api/messages", async (req, res) => {
  await adapter
    .process(req, res, async (context) => {
      // If the bot is not running, start it.
      await bot.start(context);
      // Run the bot's message processing pipeline.
      await bot.run(context);
    })
    .catch((err) => {
      // Error message including "412" means it is waiting for user's consent, which is a normal process of SSO, sholdn't throw this error.
      if (!err.message.includes("412")) {
        throw err;
      }
    });
});

server.get(
  "/auth-:name(start|end).html",
  restify.plugins.serveStatic({
    directory: path.join(__dirname, "public"),
  })
);
