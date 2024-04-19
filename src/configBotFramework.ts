import {
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
} from "botbuilder";
import { Logger } from "./telemetry/logger";
import { Env } from "./env";

/**
 * Configure the Bot Framework components
 * @param bot The TeamsAI instance
 * @returns Nothing
 * @remarks This function is called from the main module
 */
export function configureBotFramework(
  logger: Logger,
  env: Env
): ConfigurationBotFrameworkAuthentication {
  // Retrieve all configuration settings asynchronously
  logger.info("Configuring Bot Framework Authentication");
  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: env.data.BOT_ID,
    MicrosoftAppPassword: env.data.BOT_PASSWORD,
    MicrosoftAppType: env.data.BOT_APP_TYPE,
  });

  const botFrameworkAuthentication =
    new ConfigurationBotFrameworkAuthentication({}, credentialsFactory);

  logger.info("Bot Framework configuration complete");

  // Return to the main module and create the adapter
  return botFrameworkAuthentication;
}
