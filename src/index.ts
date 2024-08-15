// Import required packages
import "reflect-metadata";
import * as restify from "restify";
import * as path from "path";

// Import required bot services.
// See https://aka.ms/bot-services to learn more about the different parts of a bot.
import { MemoryStorage } from "botbuilder";

import { container } from "tsyringe";
import { logging } from "./telemetry/loggerManager";
import { configureTeamsAI } from "./configTeamsAI";
import { Env } from "./env";
import { ConsoleLogger } from "./telemetry/consoleLogger";
import { AppInsightLogger } from "./telemetry/appInsightLogger";
import { BlobsStorageLeaseManager } from "./helpers/blobsStorageLeaseManager";
import { BlobsStorage } from "botbuilder-azure-blobs";
import { Logger } from "./telemetry/logger";

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
const logger = logging.getLogger(envVariables.data.APP_NAME);

// register the environment variables
container.register<Env>(Env, {
  useValue: envVariables,
});

// register the logger
container.register<Logger>(Logger, {
  useValue: logger,
});

// Create adapter.
import adapter from "./adapter";

// Due to bug in teams-ai, sso does not work correctly with BlobsStorage. T
// The method onUserSignInSuccess in the TeamsAdapter class is not called when using BlobsStorage.
// Therefore, MemoryStorage is used instead for the SSO use case.
// See: https://github.com/microsoft/teams-ai/issues/1457

// NOTE: Comment out the following lines (68-72) to use MemoryStorage instead of BlobsStorage to enable SSO for now
logger.info("Creating BlobsStorage");
const storage = new BlobsStorage(
  `DefaultEndpointsProtocol=https;AccountName=${envVariables.data.STORAGE_ACCOUNT_NAME};AccountKey=${envVariables.data.STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`,
  envVariables.data.STORAGE_CONTAINER_NAME!
);

// NOTE: Uncomment the following line to use MemoryStorage instead of BlobsStorage to enable SSO for now
// const storage = new MemoryStorage();

const storageLeaseManager = new BlobsStorageLeaseManager(
  `DefaultEndpointsProtocol=https;AccountName=${envVariables.data.STORAGE_ACCOUNT_NAME};AccountKey=${envVariables.data.STORAGE_ACCOUNT_KEY};EndpointSuffix=core.windows.net`,
  `${envVariables.data.STORAGE_CONTAINER_NAME!}-state-manager`
);

container.register<BlobsStorageLeaseManager>(BlobsStorageLeaseManager, {
  useValue: storageLeaseManager,
});

// Conversation references cache
const conversationReferences = {};

// Create the bot that will handle incoming messages.
const bot = configureTeamsAI(
  storage,
  logger,
  envVariables,
  conversationReferences
);

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
      await bot.app.run(context);
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
