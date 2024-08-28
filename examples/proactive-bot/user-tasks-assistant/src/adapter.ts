// Import required tsyringe packages
import "reflect-metadata";
import { container } from "tsyringe";
import { TeamsAdapter } from "@microsoft/teams-ai";
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
  TurnContext,
} from "botbuilder";
import { AxiosError } from "axios";
import { Env } from "./env";
import { logging } from "./telemetry/loggerManager";
import { ConsoleLogger } from "./telemetry/consoleLogger";
import { AppInsightLogger } from "./telemetry/appInsightLogger";
import { Logger } from "./telemetry/logger";

let adapter: CloudAdapter;

// create environment variables
const env = new Env();

// register the environment variables
container.register<Env>(Env, {
  useValue: env,
});

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
const logger = logging.getLogger(env.data?.APP_NAME ?? "bot");

// register the logger
container.register<Logger>(Logger, {
  useValue: logger,
});

if (env.environment === "testtool") {
  // Create adapter for Test Tool environment.
  const config = {
    MicrosoftAppId: env.data?.BOT_ID ?? process.env.BOT_ID,
    MicrosoftAppType: env.data?.BOT_APP_TYPE ?? process.env.BOT_APP_TYPE,
    MicrosoftAppTenantId:
      env.data?.AAD_APP_TENANT_ID ?? process.env.AAD_APP_TENANT_ID,
    MicrosoftAppPassword: env.data?.BOT_PASSWORD ?? process.env.BOT_PASSWORD,
  };

  const botFrameworkAuthentication =
    new ConfigurationBotFrameworkAuthentication(
      {},
      new ConfigurationServiceClientCredentialFactory(config)
    );

  // Create Cloud adapter.
  // See https://aka.ms/about-bot-adapter to learn more about how bots work.
  adapter = new CloudAdapter(botFrameworkAuthentication);
} else {
  // Create Team adapter.
  adapter = new TeamsAdapter(
    {},
    new ConfigurationServiceClientCredentialFactory({
      MicrosoftAppId: env.data?.BOT_ID ?? process.env.BOT_ID,
      MicrosoftAppPassword: env.data?.BOT_PASSWORD ?? process.env.BOT_PASSWORD,
      MicrosoftAppType: env.data?.BOT_APP_TYPE ?? process.env.BOT_APP_TYPE,
    })
  );
}

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

// Set the onTurnError for the error handling function.
adapter.onTurnError = onTurnErrorHandler;

export default adapter;
