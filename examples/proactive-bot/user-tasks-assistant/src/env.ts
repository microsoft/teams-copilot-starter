/* eslint-disable no-case-declarations */
import path from "path";
import "reflect-metadata";
import { injectable, singleton } from "tsyringe";
import { z, RefinementCtx } from "zod";

const OpenAIType = z.enum(["OpenAI", "AzureOpenAI", "CustomAI"]);
type OpenAIType = z.infer<typeof OpenAIType>;

const botRequiredFields = ["BOT_ID", "BOT_PASSWORD", "BOT_DOMAIN"];
const authRequiredFields = [
  "AAD_APP_CLIENT_ID",
  "AAD_APP_CLIENT_SECRET",
  "AAD_APP_OAUTH_AUTHORITY_HOST",
  "AAD_APP_TENANT_ID",
];
const azureSearchRequiredFields = [
  "AZURE_SEARCH_ENDPOINT",
  "AZURE_SEARCH_KEY",
  "AZURE_SEARCH_INDEX_NAME",
  "AZURE_SEARCH_SOURCE_NAME",
  "STORAGE_SAS_TOKEN",
];
const customApiRequiredFields = [
  "CUSTOM_OPEN_API_BASE_URL",
  "CUSTOM_API_CLIENT_ID",
  "CUSTOM_API_CLIENT_SECRET",
];

@injectable()
@singleton()
class Env {
  public readonly data: z.infer<any>;
  public readonly environment = process.env.TEAMSFX_ENV || "local";
  private readonly openAIHostName = "api.openai.com";
  private readonly azureOpenAIHostName = "openai.azure.com";

  /**
   * Constructor
   */
  constructor() {
    try {
      switch (this.environment) {
        case "local":
          {
            const partialFields = this.schema.partial();
            this.data = partialFields
              .superRefine(this.openAIRefiner)
              .superRefine(this.azureSearchRefiner)
              .superRefine(this.customOpenApiRefiner)
              .superRefine((data: any, ctx: RefinementCtx) =>
                this.specialFieldsRefiner(data, ctx, botRequiredFields)
              )
              .superRefine((data: any, ctx: RefinementCtx) =>
                this.specialFieldsRefiner(data, ctx, authRequiredFields)
              )
              .parse(process.env);
          }
          return;
        case "testtool":
          {
            const partialFields = this.schema.partial();
            this.data = partialFields
              .superRefine(this.openAIRefiner)
              .superRefine(this.azureSearchRefiner)
              .superRefine(this.customOpenApiRefiner)
              .parse(process.env);
          }
          return;
        default:
          throw new Error(`Unknown environment: ${this.environment}`);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const { fieldErrors } = error.flatten();
        const errorMessage = Object.entries(fieldErrors)
          .map(([field, errors]) =>
            errors ? `${field}: ${errors.join(", ")}` : field
          )
          .join("\n  ");
        throw new Error(`Missing environment variables:\n  ${errorMessage}`);
      }
      throw error;
    }
  }

  public isProvided = (key: string): boolean => {
    return (
      this.data[key] !== undefined &&
      !this.valueStartsWithPlaceholder(this.data[key])
    );
  };

  /**
   * Refiner for OpenAI fields that require additional validation
   * @param data
   * @param ctx
   * @returns
   */
  private openAIRefiner = (data: any, ctx: RefinementCtx) => {
    // based on the OpenAI Endpoint, set the OpenAI Type and validate the required fields
    let isValid = true;

    // if the endpoint contains api.openai.com using OpenAI
    if (this.urlEndsWithHostname(data.OPENAI_ENDPOINT, this.openAIHostName)) {
      data.OPENAI_TYPE = OpenAIType.Enum.OpenAI;
    } else if (
      this.urlEndsWithHostname(data.OPENAI_ENDPOINT, this.azureOpenAIHostName)
    ) {
      // if the endpoint contains openai.azure.com using Azure OpenAI
      data.OPENAI_TYPE = OpenAIType.Enum.AzureOpenAI;
      if ((data.OPENAI_API_VERSION?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "OPENAI_API_VERSION is required.",
          path: [data.OPENAI_TYPE],
        });
        isValid = false;
      }
    } else {
      // Using a custom OpenAI endpoint
      // An endpoint, client id, and client secret are required
      // This is used for authentication to the custom AI endpoint
      // But can also be modified to work with your system requirements
      data.OPENAI_TYPE = OpenAIType.Enum.CustomAI;
    }

    // Build the vectra index path
    data.VECTRA_INDEX_PATH = this.buildVectraIndexPath(
      data.VECTRA_INDEX_PATH,
      data.TEAMSFX_ENV === "local"
    );

    return isValid;
  };

  /**
   * Refiner for custom Open API fields that require additional validation
   * @param data
   * @param ctx
   * @returns
   */
  private customOpenApiRefiner = (data: any, ctx: RefinementCtx) => {
    // based on the custom Open API Base URL, validate the required fields, otherwise skip
    return !data.CUSTOM_OPEN_API_BASE_URL ||
      this.valueStartsWithPlaceholder(data.CUSTOM_OPEN_API_BASE_URL)
      ? true
      : this.specialFieldsRefiner(data, ctx, customApiRequiredFields);
  };

  /**
   * Refiner for Azure Search fields that require additional validation
   * @param data
   * @param ctx
   * @returns
   */
  private azureSearchRefiner = (data: any, ctx: RefinementCtx) => {
    // based on the Azure AI Search URL, validate the required fields, otherwise skip
    return !data.AZURE_SEARCH_ENDPOINT ||
      this.valueStartsWithPlaceholder(data.AZURE_SEARCH_ENDPOINT)
      ? true
      : this.specialFieldsRefiner(data, ctx, azureSearchRequiredFields);
  };

  /**
   * Refiner for special fields that require additional validation
   * @param data
   * @param ctx
   * @param requiredFields
   * @returns
   */
  private specialFieldsRefiner = (
    data: any,
    ctx: RefinementCtx,
    requiredFields: any[]
  ) => {
    let isValid = true;

    // Check the presence of all required fields in the data
    requiredFields.forEach((field) => {
      if (
        (data[field]?.length ?? 0) === 0 ||
        this.valueStartsWithPlaceholder(data[field])
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} is required.`,
          path: [data[field]],
        });
        isValid = false;
      }
    });

    return isValid;
  };

  private buildVectraIndexPath(value: string, localEnv: boolean): string {
    return localEnv ? path.join(__dirname, value) : value;
  }

  private urlEndsWithHostname = (endpoint: string, hostname: string) => {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch (error) {
      return false;
    }
    return url.hostname.endsWith(hostname);
  };

  private valueStartsWithPlaceholder = (value: string) => {
    return value.startsWith("<");
  };

  private schema = z.object({
    AAD_APP_CLIENT_ID: z.string(),
    AAD_APP_CLIENT_SECRET: z.string(),
    AAD_APP_OAUTH_AUTHORITY_HOST: z.string(),
    AAD_APP_TENANT_ID: z.string(),
    TEAMSFX_ENV: z.string(),
    APP_NAME: z.string(),
    APP_VERSION: z.string(),
    BOT_ID: z.string(),
    BOT_PASSWORD: z.string(),
    BOT_APP_TYPE: z
      .enum(["UserAssignedMsi", "SingleTenant", "MultiTenant"])
      .optional(),
    BOT_DOMAIN: z.string(),
    OPENAI_KEY: z.string(),
    OPENAI_ENDPOINT: z.string(),
    OPENAI_MODEL: z.string(), // For Azure OpenAI this is the name of the deployment to use.
    OPENAI_EMBEDDING_MODEL: z.string(), // For Azure OpenAI this is the name of the embeddings deployment to use.
    STORAGE_ACCOUNT_NAME: z.string(),
    STORAGE_ACCOUNT_KEY: z.string(),
    STORAGE_SAS_TOKEN: z.string(),
    AZURE_SEARCH_ENDPOINT: z.string(),
    AZURE_SEARCH_KEY: z.string(),
    AZURE_SEARCH_INDEX_NAME: z.string(),
    AZURE_SEARCH_SOURCE_NAME: z.string(),
    OPENAI_TYPE: OpenAIType,
    VECTRA_INDEX_PATH: z.string(),
    OPENAI_API_VERSION: z.string().default("2024-02-01"),
    DEFAULT_PROMPT_NAME: z.string(),
    STORAGE_CONTAINER_NAME: z.string(),
    WEBDATA_SOURCE_NAME: z.string(),
    DOCUMENTDATA_SOURCE_NAME: z.string(),
    APPLICATIONINSIGHTS_INSTRUMENTATION_KEY: z.string(),
    MAX_TURNS: z.coerce.number().int().positive().default(10),
    MAX_FILE_SIZE: z.coerce.number().int().positive().default(4096),
    MAX_PAGES: z.coerce.number().int().positive().default(5),
    ROUTE_UKNOWN_ACTION_TO_SEMANTIC: z.coerce.boolean().default(false),
    CUSTOM_OPEN_API_BASE_URL: z.string(),
    CUSTOM_API_CLIENT_ID: z.string(),
    CUSTOM_API_CLIENT_SECRET: z.string(),
  });

  // public data: z.infer<typeof this.schema> = {} as z.infer<typeof this.schema>;
}

export { Env, OpenAIType };
