import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { container } from "tsyringe";
import { logging } from "../telemetry/loggerManager";
import { Env } from "../env";
import { VectraDataSource } from "../dataSources/vectraDataSource";
import { UserHelper } from "../helpers/userHelper";
import { ActionsHelper } from "../helpers/actionsHelper";

/**
 * Resets the local Vectra index.
 *
 * @param {TurnContext} context - The turn context object.
 * @param {ApplicationTurnState} state - The application turn state object.
 * @returns {Promise<string>} A promise that resolves to a string indicating that the uploaded document has been forgotten.
 */
export async function resetIndex(
  context: TurnContext,
  state: ApplicationTurnState
): Promise<string> {
  const logger = logging.getLogger("bot.TeamsAI");
  const env = container.resolve<Env>(Env);

  // Get the user's information
  const user = await UserHelper.updateUserInfo(context, state);

  const vectraDS = new VectraDataSource({
    name: env.data.WEBDATA_SOURCE_NAME,
    embeddings: ActionsHelper.getEmbeddingsOptions(),
    indexFolder: env.data.VECTRA_INDEX_PATH ?? "",
  });

  // Obtain the local index
  const localIndex = vectraDS.index;

  // Delete the local vectra index
  localIndex.deleteIndex();
  logger.info(
    `The local Vectra index has been reset by ${user.userPrincipalName}.`
  );
  return "The local Vectra index has been reset.";
}
