import * as msal from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { Env } from "../env";
import { UserTask } from "../models/userTask";
import { getISODateString } from "../helpers/dateHelper";
import { UserTaskDetails } from "../models/userTaskDetails";
import { Logger } from "../telemetry/logger";

export class GraphApi {
  private readonly env: Env = new Env();
  private readonly logger: Logger;
  private readonly graphClient: Client;
  constructor(logger: Logger) {
    this.logger = logger;
    const msalConfig = {
      auth: {
        clientId: this.env.data.AAD_APP_CLIENT_ID!,
        authority: `https://login.microsoftonline.com/${this.env.data.AAD_APP_TENANT_ID}`,
        clientSecret: this.env.data.AAD_APP_CLIENT_SECRET!,
      },
    };

    const cca = new msal.ConfidentialClientApplication(msalConfig);

    // Create the Graph client
    const clientOptions = {
      authProvider: {
        getAccessToken: async () => {
          const result = await cca.acquireTokenByClientCredential({
            scopes: ["https://graph.microsoft.com/.default"],
          });
          if (result === null) {
            this.logger.error("Failed to retrieve access token from MSAL.");
            throw new Error("Failed to retrieve access token from MSAL.");
          }
          return result.accessToken;
        },
      },
    };

    this.graphClient = Client.initWithMiddleware(clientOptions);
  }

  /**
   * Get the user tasks from Microsoft Graph.
   * @returns The user tasks.
   */
  public async getUserTasks(): Promise<UserTask[]> {
    try {
      //get all users
      const { value: users } = await this.graphClient.api("/users").get();

      // fetch tasks for each user
      const userPlannerTasks: any[] = [];
      for (const user of users) {
        const plannerTasksApiUrl = `/users/${user.id}/planner/tasks`;
        const select = [
          "id",
          "planId",
          "title",
          "createdDateTime",
          "dueDateTime",
          "percentComplete",
          "createdBy",
          "assignments",
        ];
        const selectDetails = ["description", "references"];

        // Set the end of the day to 23:59:59.999
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        const startDateUtcString = getISODateString(startDate);

        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const endDateUtcString = getISODateString(endDate);

        // Getting the event that are from beginning of the day to end of the day in users timezone
        const filter = `percentComplete ne 100 and dueDateTime ge ${startDateUtcString} and dueDateTime le ${endDateUtcString}`;

        // Get all planner tasks for the user
        const { value: tasks } = await this.graphClient
          .api(plannerTasksApiUrl)
          .select(select)
          .filter(filter)
          .get();

        // Get the details of the tasks
        if (tasks.length > 0) {
          tasks
            .filter(
              (task: any) =>
                task.percentComplete < 100 &&
                task.dueDateTime >= startDateUtcString &&
                task.dueDateTime <= endDateUtcString
            )
            .forEach(async (task: any) => {
              //save task's eTag
              const eTag = task["@odata.etag"];
              const taskDetailsApiUrl = `/planner/tasks/${task.id}/details`;
              const taskDetails = await this.graphClient
                .api(taskDetailsApiUrl)
                .select(selectDetails)
                .get();
              //overwrite the eTag of the details object
              taskDetails["@odata.etag"] = eTag;
              userPlannerTasks.push({ ...task, ...taskDetails, user });
            });
        }
      }

      // map the Graph API response to the flatten userTasks array
      const userTasks: (UserTask & UserTaskDetails)[] = userPlannerTasks.map(
        (task) => ({
          id: task.id,
          eTag: task["@odata.etag"],
          userId: task.user.id,
          userPrincipalName: task.user.userPrincipalName,
          userDisplayName: task.user.displayName,
          planId: task.planId,
          title: task.title,
          dueDateTime: task.dueDateTime,
          percentComplete: task.percentComplete,
          createdBy: task.createdBy.user.id,
          createdDateTime: task.createdDateTime,
          assignedId: Object.keys(task.assignments)[0],
          assignedDateTime:
            task.assignments[Object.keys(task.assignments)[0]].assignedDateTime,
          status: task.percentComplete < 100 ? "Pending" : "Complete",
          description: task.description ?? "",
          referenceUri:
            task.references &&
            Object.keys(task.references) &&
            Object.keys(task.references).length > 0
              ? decodeURIComponent(Object.keys(task.references)[0])
              : "",
          referenceName:
            task.references &&
            Object.keys(task.references) &&
            Object.keys(task.references).length > 0
              ? task.references[Object.keys(task.references)[0]].alias
              : "",
        })
      );

      return userTasks;
    } catch (error) {
      this.logger.error(`Failed to get the user tasks. Error: ${error}`);
      return [];
    }
  }

  /**
   * Update the user task status in Microsoft Graph.
   * @returns The user tasks.
   */
  public async updateUserTaskStatus(
    taskId: string,
    eTag: string,
    percentComplete: number
  ): Promise<void> {
    try {
      await this.graphClient
        .api(`/planner/tasks/${taskId}`)
        .header("If-Match", eTag)
        .header("Content-Type", "application/json")
        .patch({
          percentComplete,
        });
    } catch (error) {
      this.logger.error(
        `Failed to update the user task status. Error: ${error}. Additionally, you may need to check that the application "Task.ReadWrite.All" permission is granted.`
      );
    }
  }
}
