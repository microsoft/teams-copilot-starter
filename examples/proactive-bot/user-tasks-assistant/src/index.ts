// Import required packages
import "reflect-metadata";
import * as restify from "restify";
import * as path from "path";
import { container } from "tsyringe";
import { configureTeamsAI } from "./configTeamsAI";
import { Env } from "./env";
import { BlobsStorageLeaseManager } from "./helpers/blobsStorageLeaseManager";
import { BlobsStorage } from "botbuilder-azure-blobs";
import { Logger } from "./telemetry/logger";
import adapter from "./adapter";
import { MemoryStorage } from "botbuilder";
import { GraphApi } from "./api/graphApi";
import { notifyUserTasks } from "./conversationStarter";

// Create an instance of the environment variables
const envVariables: Env = container.resolve(Env);

// Get logging
const logger = container.resolve(Logger);

// Due to bug in teams-ai, sso does not work correctly with BlobsStorage. T
// The method onUserSignInSuccess in the TeamsAdapter class is not called when using BlobsStorage.
// Therefore, MemoryStorage is used instead for the SSO use case.
// See: https://github.com/microsoft/teams-ai/issues/1457
let storage: BlobsStorage | MemoryStorage;
if (envVariables.isProvided("STORAGE_ACCOUNT_NAME")) {
  // NOTE: Comment out the following lines (68-72) to use MemoryStorage instead of BlobsStorage to enable SSO for now
  logger.info("Creating BlobsStorage");
  storage = new BlobsStorage(
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
} else {
  // Use MemoryStorage instead of BlobsStorage to enable SSO and for test tool environment
  storage = new MemoryStorage();
}

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

// Listen for incoming messages from the external clients
server.get("/api/messages", async (req, res) => {
  const fullUrl = new URL(req.url!, `https://${req.headers.host}`);
  const queryParams = Object.fromEntries(fullUrl.searchParams.entries());
  logger.info(`Message received: ${JSON.stringify(queryParams)}`);

  // Create a Graph API client instance
  const graphApi = new GraphApi(logger);
  //get all users tasks
  const userTasks = await graphApi.getUserTasks();

  // Start a new conversation with the user
  await notifyUserTasks(userTasks, bot, adapter, logger);

  res.setHeader("Content-Type", "text/html");
  res.writeHead(200);
  res.write(
    "<html><body><h1>A new conversation with a user has been started.</h1></body></html>"
  );
  res.end();
});

logger.info(
  `User tasks pull time trigger is set to: ${envVariables.data.USER_TASK_PULL_INTERVAL} minutes`
);
if (
  envVariables.data.USER_TASK_PULL_INTERVAL &&
  envVariables.data.USER_TASK_PULL_INTERVAL > 0
) {
  // Set up a timer to trigger the user tasks are pulled from Microsoft Graph
  const timeInterval = envVariables.data.USER_TASK_PULL_INTERVAL * 60 * 1000; // in milliseconds
  setInterval(async () => {
    // Create a Graph API client instance
    const graphApi = new GraphApi(logger);
    //get all users tasks
    const userTasks = await graphApi.getUserTasks();

    // Start a new conversation with the user
    await notifyUserTasks(userTasks, bot, adapter, logger);
  }, timeInterval);
}
