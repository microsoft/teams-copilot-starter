import {
  AI,
  Plan,
  PredictedDoCommand,
  PredictedSayCommand,
} from "@microsoft/teams-ai";
import { TeamsAI } from "../bot/teamsAI";
import { TurnContext } from "botbuilder";
import {
  ApplicationTurnState,
  ChatCompletionActionExt,
  PredictedDoCommandExt,
} from "../models/aiTypes";
import { Utils } from "../helpers/utils";
import { Logger } from "../telemetry/logger";
import { getSemanticInfo } from "../actions/actionNames";
import { Env } from "../env";

export class ActionPlannerMiddleware {
  // Reference to the TeamsAI instance
  private readonly teamsAI: TeamsAI;
  private readonly logger: Logger;
  private readonly env: Env;

  constructor(teamsAI: TeamsAI, logger: Logger, env: Env) {
    this.teamsAI = teamsAI;
    this.logger = logger;
    this.env = env;
  }

  /**
   * Middleware handler of the "PlanReady" action
   * @param context
   * @param state
   * @param plan
   * @returns
   * @memberof ActionPlannerMiddleware
   */
  private async actionPlanReady(
    context: TurnContext,
    state: ApplicationTurnState,
    plan: Plan
  ): Promise<string> {
    const isValid = Array.isArray(plan.commands) && plan.commands.length > 0;

    if (isValid) {
      this.logger.info(
        `Original Action plan: ${JSON.stringify(plan, null, 2)}`
      );

      // Validate that the action plan contains at least one "DO" command
      if (this.env.data.ROUTE_UKNOWN_ACTION_TO_SEMANTIC) {
        if (
          !plan.commands.some(
            (c) => c.type === "DO" && (c as PredictedDoCommand).action
          )
        ) {
          this.logger.warn(
            // eslint-disable-next-line quotes
            `The action plan does not contain any "DO" command. Will fallback to the default ChatGPT action plan`
          );

          // Send the user quick response and continue with the default ChatGPT action plan
          const sayCommand = plan.commands.find(
            (c) => c.type === "SAY"
          ) as PredictedSayCommand;
          if (sayCommand && sayCommand.response?.content) {
            await context.sendActivity(sayCommand.response.content);
          }

          // Replace the SAY command with the default ChatGPT action plan
          plan.commands = plan.commands.filter(
            (c) => c.type !== "SAY"
          ) as PredictedDoCommand[];
          plan.commands.push({
            type: "DO",
            action: getSemanticInfo,
            parameters: {
              entity: state.temp.input,
            },
          } as PredictedDoCommand);
        }
      }

      // Swap places of the "DO" and "SAY" commands
      const newPlan = { ...plan, commands: Utils.swapDoAndSay(plan.commands) };

      // Enhance the action plan with additional information such as the action mode required to execute the plan
      const currentActions = state.conversation.actions ?? [];
      let actionIndex = -1;
      currentActions.forEach(async (action: ChatCompletionActionExt) => {
        if (action.canRunWith && action.canRunWith.length > 0) {
          actionIndex = newPlan.commands.findIndex(
            (c) =>
              c.type === "DO" &&
              (c as PredictedDoCommand).action === action.name
          );
          if (actionIndex >= 0) {
            (
              newPlan.commands[actionIndex] as PredictedDoCommandExt
            ).parallelActions = [];
            const parallelActions =
              (newPlan.commands[actionIndex] as PredictedDoCommandExt)
                .parallelActions ?? [];
            action.canRunWith.forEach((action: string) => {
              const parallelAction = currentActions.find(
                (a) => a.name === action
              );
              if (parallelAction) {
                const cmd: PredictedDoCommand = newPlan.commands.find(
                  (c) =>
                    c.type === "DO" &&
                    (c as PredictedDoCommand).action === parallelAction.name
                ) as PredictedDoCommand;
                if (cmd) {
                  parallelActions.push(cmd);
                  //remove the parallel action from the action plan
                  newPlan.commands = newPlan.commands.filter((c) => c !== cmd);
                }
              }
            });
          }
        }
      });

      this.logger.info(
        `Updated Action plan: ${JSON.stringify(newPlan, null, 2)}`
      );

      // if the action has SAY command, send it to the user
      // if (actionIndex >= 0) {
      //   const sayCommand = newPlan.commands.find((c) => c.type === "SAY");
      //   if (sayCommand) {
      //     await context.sendActivity(
      //       (sayCommand as PredictedSayCommand).response
      //     );
      //   }
      // }

      // Show the user the bot's intention to execute the action plan
      if (state.conversation?.debug) {
        const debugMessage =
          "**[DEBUG INFO]**\n```json\n" +
          JSON.stringify(newPlan, null, 2) +
          "\n```";
        await context.sendActivity(debugMessage);
      }

      // assign the action plan to the temp state
      state.temp.actionPlan = newPlan;
    } else {
      // assign the action plan to the temp state
      state.temp.actionPlan = plan;
    }

    if (state.conversation?.debug) {
      // start monitoring the action plan execution time
      state.temp.startTime = new Date().getTime();
    }

    // Show typing indicator
    await Utils.startTypingTimer(context, state);

    return Promise.resolve(!isValid ? AI.StopCommandName : "");
  }

  /**
   * Middleware handler of the "DoCommand" action
   * @param context
   * @param state
   * @param cmd
   * @param action
   * @returns
   */
  private async actionDoCommand(
    context: TurnContext,
    state: ApplicationTurnState,
    cmd: PredictedDoCommand,
    action?: string
  ): Promise<string> {
    let actionOutput = "";
    if (!action) {
      this.logger.error(
        `DoCommandActionName: ${action} is not defined in the action plan`
      );
      return AI.StopCommandName;
    }
    this.logger.info(`DoCommandActionName: ${action}`);

    // Chain the previous action outputs together and pass them to the next action
    const actionOutputs = state.temp.actionOutputs ?? {};

    // Iterate over each property of actionOutputs
    for (const key in actionOutputs) {
      // check if the current property precedes the current action
      if (key === action) {
        // stop iteration once the current action is found
        break;
      }
      // Add the output of the previous action to the current parameters
      cmd.parameters[key] = actionOutputs[key];
    }

    // Let the user know what the bot is working
    await Utils.startTypingTimer(context, state);

    // If there are any parallel actions, execute them asynchonously
    const currentCmd = cmd as PredictedDoCommandExt;
    if (currentCmd.parallelActions && currentCmd.parallelActions.length > 0) {
      // Convert the parallel actions to an array of tasks
      const parallelActionTasks = currentCmd.parallelActions.map(
        (action: PredictedDoCommand) => {
          return this.teamsAI.app.ai.doAction(
            context,
            state,
            action.action,
            action.parameters
          );
        }
      );

      // Execute the current action and all its parallel actions in parallel
      [actionOutput] = await Promise.all([
        this.teamsAI.app.ai.doAction(context, state, action, cmd.parameters),
        Promise.all(parallelActionTasks),
      ]);
    } else {
      // Continue executing the current action
      actionOutput = await this.teamsAI.app.ai.doAction(
        context,
        state,
        action,
        cmd.parameters
      );
    }

    // Depending on the last action, send the feedback request
    return (await this.isLastAction(context, state, action))
      ? AI.StopCommandName
      : actionOutput;
  }

  /**
   * Attach the middleware to the bot
   * @param action
   * @returns
   * @memberof ActionPlannerMiddleware
   */
  public async attachMiddleware(action: string) {
    switch (action) {
      case AI.PlanReadyActionName:
        // Replace the default action planner handler with the middleware handler
        this.teamsAI.app.ai.action(
          AI.PlanReadyActionName,
          async (
            context: TurnContext,
            state: ApplicationTurnState,
            plan: Plan
          ) => {
            return await this.actionPlanReady(context, state, plan);
          }
        );
        break;

      case AI.DoCommandActionName:
        this.teamsAI.app.ai.action(
          AI.DoCommandActionName,
          async (
            context: TurnContext,
            state: ApplicationTurnState,
            cmd: PredictedDoCommand,
            action?: string
          ) => {
            return await this.actionDoCommand(context, state, cmd, action);
          }
        );
        break;

      default:
        return;
    }
  }

  /**
   * Check if the specified action is the last action in the action plan
   * @param state
   * @returns boolean
   */
  private async isLastAction(
    context: TurnContext,
    state: ApplicationTurnState,
    actionName: string
  ): Promise<boolean> {
    if (!state.temp.actionPlan) {
      return true;
    }

    const lastDoCommandIndex = state.temp.actionPlan.commands
      .slice()
      .reverse()
      .findIndex(
        (c: any) =>
          c.type === "DO" && (c as PredictedDoCommand).action === actionName
      );

    // show the performance metrics if the last action is reached
    if (
      lastDoCommandIndex === 0 &&
      state.conversation?.debug &&
      state.temp.startTime
    ) {
      const endTime = new Date().getTime();
      const executionTime = (endTime - state.temp.startTime) / 1000;
      const debugMessage = `**[DEBUG INFO]**\nExecution time: ${executionTime} seconds`;
      this.logger.info(debugMessage);
      await context.sendActivity(debugMessage);
    }

    return lastDoCommandIndex === 0;
  }
}
