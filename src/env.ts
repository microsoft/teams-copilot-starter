import path from "path";
import "reflect-metadata";
import { injectable, singleton } from "tsyringe";
import { z, RefinementCtx } from "zod";

const OpenAIType = z.enum(["OpenAI", "AzureOpenAI", "CustomAI"]);
type OpenAIType = z.infer<typeof OpenAIType>;

@injectable()
@singleton()
class Env {
  private openAIHostName = "api.openai.com";
  private azureOpenAIHostName = "openai.azure.com";

  constructor() {
    try {
      this.data = this.schema.parse(process.env);
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
    }
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

      // This is used for authentication to the custom AI endpoint
      if ((data.CUSTOM_API_CLIENT_ID?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CUSTOM_API_CLIENT_ID is required.",
          path: [data.OPENAI_TYPE],
        });
        isValid = false;
      }

      // This is used for authentication to the custom AI endpoint
      if ((data.CUSTOM_API_CLIENT_SECRET?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CUSTOM_API_CLIENT_SECRET is required.",
          path: [data.OPENAI_TYPE],
        });
        isValid = false;
      }
    }

    // Build the vectra index path
    data.VECTRA_INDEX_PATH = this.buildVectraIndexPath(
      data.VECTRA_INDEX_PATH,
      data.TEAMSFX_ENV === "local"
    );

    return isValid;
  };

  private botIDRefiner = (data: any, ctx: RefinementCtx) => {
    // based on the TeamsFX environment, set the BOT_ID and BOT_PASSWORD
    let isValid = true;
    // Check the presence of BOT_ID, BOT_PASSWORD and BOT_DOMAIN when not using TeamsFX Test Toolkit
    if (data.TEAMSFX_ENV !== "testtool") {
      if ((data.BOT_ID?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BOT_ID is required.",
          path: [data.BOT_ID],
        });
        isValid = false;
      }
      if ((data.BOT_PASSWORD?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BOT_PASSWORD is required.",
          path: [data.BOT_PASSWORD],
        });
        isValid = false;
      }
      if ((data.BOT_DOMAIN?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "BOT_DOMAIN is required.",
          path: [data.BOT_DOMAIN],
        });
        isValid = false;
      }
    }

    return isValid;
  };

  private authRefiner = (data: any, ctx: RefinementCtx) => {
    // based on the TeamsFX environment, set the BOT_ID and BOT_PASSWORD
    let isValid = true;
    // Check the presence of AAD_APP_CLIENT_ID, AAD_APP_CLIENT_SECRET, AAD_APP_OAUTH_AUTHORITY and AAD_APP_TENANT_ID
    // when not using TeamsFX Test Toolkit
    if (data.TEAMSFX_ENV !== "testtool") {
      if ((data.AAD_APP_CLIENT_ID?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AAD_APP_CLIENT_ID is required.",
          path: [data.AAD_APP_CLIENT_ID],
        });
        isValid = false;
      }
      if ((data.AAD_APP_CLIENT_SECRET?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AAD_APP_CLIENT_SECRET is required.",
          path: [data.AAD_APP_CLIENT_SECRET],
        });
        isValid = false;
      }
      if ((data.AAD_APP_OAUTH_AUTHORITY_HOST?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AAD_APP_OAUTH_AUTHORITY_HOST is required.",
          path: [data.AAD_APP_OAUTH_AUTHORITY_HOST],
        });
        isValid = false;
      }
      if ((data.AAD_APP_TENANT_ID?.length ?? 0) === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "AAD_APP_TENANT_ID is required.",
          path: [data.AAD_APP_TENANT_ID],
        });
        isValid = false;
      }
    }

    return isValid;
  };

  private buildVectraIndexPath(value: string, localEnv: boolean): string {
    return localEnv ? path.join(__dirname, value) : value;
  }

  private schema = z
    .object({
      AAD_APP_CLIENT_ID: z.string().optional().nullable(),
      AAD_APP_CLIENT_SECRET: z.string().optional().nullable(),
      AAD_APP_OAUTH_AUTHORITY_HOST: z.string().optional().nullable(),
      AAD_APP_TENANT_ID: z.string().optional().nullable(),
      TEAMSFX_ENV: z.string().min(1),
      APP_NAME: z.string().min(1),
      APP_VERSION: z.string().min(1),
      BOT_ID: z.string(),
      BOT_PASSWORD: z.string(),
      BOT_APP_TYPE: z
        .enum(["UserAssignedMsi", "SingleTenant", "MultiTenant"])
        .optional(),
      BOT_DOMAIN: z.string().optional().nullable(),
      OPENAI_KEY: z.string().min(1),
      OPENAI_ENDPOINT: z.string().url(),
      OPENAI_MODEL: z.string().min(1), // For Azure OpenAI this is the name of the deployment to use.
      OPENAI_EMBEDDING_MODEL: z.string().min(1), // For Azure OpenAI this is the name of the embeddings deployment to use.
      STORAGE_ACCOUNT_NAME: z.string().min(1),
      STORAGE_ACCOUNT_KEY: z.string().min(1),
      STORAGE_SAS_TOKEN: z.string().optional().nullable(),
      AZURE_SEARCH_ENDPOINT: z.string().url().optional().nullable(),
      AZURE_SEARCH_KEY: z.string().optional().nullable(),
      AZURE_SEARCH_INDEX_NAME: z.string().optional().nullable(),
      AZURE_SEARCH_SOURCE_NAME: z.string().optional().nullable(),
      OPENAI_TYPE: OpenAIType.optional().nullable(),
      VECTRA_INDEX_PATH: z.string().optional().nullable(),
      OPENAI_API_VERSION: z.string().optional().default("2024-02-01"),
      DEFAULT_PROMPT_NAME: z.string().min(1),
      STORAGE_CONTAINER_NAME: z.string().min(1),
      WEBDATA_SOURCE_NAME: z.string().min(1),
      DOCUMENTDATA_SOURCE_NAME: z.string().min(1),
      APPLICATIONINSIGHTS_INSTRUMENTATION_KEY: z
        .string()
        .optional()
        .default("")
        .nullable(),
      MAX_TURNS: z.coerce.number().int().positive().default(10),
      MAX_FILE_SIZE: z.coerce.number().int().positive().default(4096),
      MAX_PAGES: z.coerce.number().int().positive().default(5),
      ROUTE_UKNOWN_ACTION_TO_SEMANTIC_SEARCH: z.coerce.boolean().default(false),
      OPEN_API_BASE_URL: z.string().url().optional().nullable(),
      USER_TASK_PULL_INTERVAL: z.coerce.number().int().positive().default(60),
      SERVICE_URL: z.string().url().optional().nullable(),
      CUSTOM_API_CLIENT_ID: z.string().optional().nullable(),
      CUSTOM_API_CLIENT_SECRET: z.string().optional().nullable(),
    })
    .superRefine(this.openAIRefiner)
    .superRefine(this.botIDRefiner)
    .superRefine(this.authRefiner);

  public data: z.infer<typeof this.schema> = {} as z.infer<typeof this.schema>;
}

export { Env, OpenAIType };
