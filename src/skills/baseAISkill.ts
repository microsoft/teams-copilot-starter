import { ActionPlanner, DataSource, PromptManager } from "@microsoft/teams-ai";
import { TurnContext } from "botbuilder";
import { ApplicationTurnState } from "../models/aiTypes";
import { ISkill } from "./ISkill";
import { handleWhen, retry } from "cockatiel";
import { AxiosError } from "axios";
import path from "path";
import crypto from "crypto";
import { FileAttachment } from "../models/fileAttachment";
import { FileFetcher, LocalDocumentIndex, WebFetcher } from "vectra";
import { VectraDataSource } from "../dataSources/vectraDataSource";
import { logging } from "../telemetry/loggerManager";
import { PDFFetcher } from "../fetchers/pdfFetcher";
import { MetricNames } from "../types/metricNames";

// Get an instance of the Logger singleton object
const logger = logging.getLogger("bot.TeamsAI");

/**
 * Base class for AI skills.
 * @abstract
 * @category Skills
 * @category AI
 */
export abstract class BaseAISkill implements ISkill {
  protected readonly context: TurnContext;
  protected readonly state: ApplicationTurnState;
  protected readonly planner: ActionPlanner<ApplicationTurnState>;
  protected readonly promptTemplate: string;
  protected readonly dataSource?: DataSource;
  protected readonly vectraIndex?: LocalDocumentIndex;
  protected static RetryPolicy = retry(
    handleWhen(
      (err) => err instanceof AxiosError && err.response?.status === 429
    ),
    { maxAttempts: 3 }
  );

  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>,
    promptTemplate: string,
    dataSource?: DataSource
  ) {
    this.context = context;
    this.state = state;
    this.promptTemplate = promptTemplate;
    this.dataSource = dataSource;
    const model = planner.model;

    const prompts = new PromptManager({
      promptsFolder: path.join(__dirname, "../", "./prompts"),
    });

    // Create the action planner
    this.planner = new ActionPlanner({
      model,
      prompts,
      defaultPrompt: promptTemplate,
    });

    // Add the data source to the planner, if it was provided
    if (dataSource) {
      if (this.planner.prompts.hasDataSource(dataSource.name)) {
        // this.planner.prompts.removeDataSource(dataSource.name); // TODO: ask PG to add this method
        throw new Error("Data source already exists. Please reset the skill.");
      }
      this.planner.prompts.addDataSource(dataSource);
      // Set the local index for the Vectra data source
      this.vectraIndex = (dataSource as VectraDataSource).index;
    }
  }

  /**
   * Runs the skill.
   * @param {string | any} input The input to send to OpenAI.
   * @returns {Promise<any>} A promise that resolves to the skill's response.
   * @throws {Error} If the request to OpenAI was rate limited.
   * @abstract
   */
  public abstract run(input: string | any): Promise<any>;

  /**
   * Adds external content to the local index.
   * @param links - The web urls or local files to fetch and index.
   * @returns {Promise<any>} A promise that resolves when the web content has been added to the index.
   * @throws {Error} If the web content could not be added to the index.
   */
  public async addExternalContent(links: FileAttachment[]): Promise<any> {
    if (!this.vectraIndex) {
      throw new Error("Vectra index is not set.");
    }
    // Fetch document from web urls
    for (const item of links) {
      try {
        const hashFromUri = crypto
          .createHash("sha256")
          .update(item.url)
          .digest("hex");
        const docId = await this.vectraIndex.getDocumentId(hashFromUri);
        this.state.conversation.documentIds =
          this.state.conversation.documentIds ?? [];
        // If the document is not in the index, add it
        if (!docId || !this.state.conversation.documentIds?.includes(docId)) {
          let fetcher;
          // Determine if the path is a web url or a local file path
          switch (item.type) {
            case "text/html":
              logger.debug(`Fetching web content for ${item.fileName}`);
              fetcher = new WebFetcher();
              break;
            case "pdf":
              logger.debug(`Fetching PDF content for ${item.fileName}`);
              fetcher = new PDFFetcher();
              break;
            default:
              logger.debug(`Fetching text content for ${item.fileName}`);
              fetcher = new FileFetcher();
              break;
          }
          logger.debug(`Using fetcher: ${fetcher.constructor.name}`);
          // Fetch the document and add it to the index
          await fetcher.fetch(
            item.url,
            async (uri: string, text: string, docType?: string | undefined) => {
              if (!this.vectraIndex) {
                throw new Error("Vectra index is not set.");
              }
              logger.debug(`Indexing ${item.url} ...`);
              const indexStartTime = Date.now();
              // Hash the uri to use as the document id to avoid collisions and have smaller uri in index
              const localDoc = await this.vectraIndex.upsertDocument(
                hashFromUri,
                text,
                docType
              );
              logger.trackDurationMetric(
                indexStartTime,
                MetricNames.VectraIndexingTime
              );
              // Add the document to the conversation's documentIds
              this.state.conversation.documentIds.push(localDoc.id);
              logger.debug(
                `The document: '${localDoc.id}' of ${docType} format has been added to the index.`
              );
              return true;
            }
          );
        }
      } catch (err: unknown) {
        logger.error(`Failed adding ${item.url}\n${(err as Error).message}`);
        throw err;
      }
    }
  }

  /**
   * Delete external content from the local index.
   * @param links - The web urls or local files to fetch and index.
   */
  public async deleteExternalContent(links: FileAttachment[]): Promise<void> {
    if (!this.vectraIndex) {
      throw new Error("Vectra index is not set.");
    }
    for (const item of links) {
      try {
        const hashFromUri = crypto
          .createHash("sha256")
          .update(item.url)
          .digest("hex");
        const docId = await this.vectraIndex.getDocumentId(hashFromUri);
        if (docId) {
          await this.vectraIndex.deleteDocument(hashFromUri);
          logger.debug(`Deleted ${item.url} from the index`);
        }
      } catch (err: unknown) {
        logger.error(`Failed deleting ${item.url}\n${(err as Error).message}`);
        throw err;
      }
    }
  }
  /**
   * Formats a timestamp into a date string.
   * @param {number} timestamp The timestamp to format.
   * @returns {string} The formatted date string.
   */
  protected formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const options: Intl.DateTimeFormatOptions = {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    };
    return new Intl.DateTimeFormat("en-US", options).format(date); //check this
    // const day = String(date.getDate()).padStart(2, "0");
    // const month = String(date.getMonth() + 1).padStart(2, "0"); // Month is zero-based
    // const year = String(date.getFullYear());
    // return `${month}/${day}/${year}`;
  }

  /**
   * Formats a revenue string into a USD string.
   * @param {string} revenueStr The revenue string to format.
   * @returns {string} The formatted revenue string.
   */
  protected formatRevenue(revenueStr: string): string {
    const revenue = parseFloat(revenueStr);
    if (!isNaN(revenue)) {
      let formattedRevenue: string;
      if (revenue >= 1e9) {
        formattedRevenue = `$${(revenue / 1e9).toFixed(2)}B`;
      } else if (revenue >= 1e6) {
        formattedRevenue = `$${(revenue / 1e6).toFixed(2)}M`;
      } else {
        formattedRevenue = `$${revenue.toFixed(2)}`;
      }
      return `${formattedRevenue} of USD`;
    }

    return revenueStr;
  }
}
