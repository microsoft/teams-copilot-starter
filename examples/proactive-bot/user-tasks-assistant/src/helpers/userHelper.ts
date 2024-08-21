import { ApplicationTurnState } from "../models/aiTypes";
import { User } from "../models/user";
import { TeamsInfo, TurnContext } from "botbuilder";

/**
 * A class that provides methods to set and get cache records.
 */
export class UserHelper {
  /**
   * Get the user's information
   * @param context
   * @param state
   * @returns User
   */
  public static async updateUserInfo(
    context: TurnContext,
    state: ApplicationTurnState
  ): Promise<User> {
    // Get the user's information
    let user = state.user?.user;
    if (user === undefined || user.email === undefined) {
      user = await this.getUserInfo(context, state);
    }
    return user;
  }

  // Get the user's info from the Teams Info API
  public static async getUserInfo(
    context: TurnContext,
    state: ApplicationTurnState
  ): Promise<User> {
    // try to fetch the user's info from the cache
    // if the user's info doesn't exist in cache, get the user's info from the Teams Info API
    const user =
      state.user?.user ??
      (await TeamsInfo.getMember(
        context,
        encodeURI(context.activity.from.id!)
      ));
    if (state.user === undefined) {
      state.user = {};
    }
    state.user.user = user;
    return user;
  }
}
