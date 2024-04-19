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
        //this.logger.error(`Missing environment variables:\n  ${errorMessage}`);
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

  private buildVectraIndexPath(value: string, localEnv: boolean): string {
    return localEnv ? path.join(__dirname, value) : value;
  }

  private schema = z
    .object({
      TEAMSFX_ENV: z.string().min(1),
      APP_VERSION: z.string().min(1),
      BOT_ID: z.string().min(1),
      BOT_PASSWORD: z.string().min(1),
      BOT_APP_TYPE: z.enum(["UserAssignedMsi", "SingleTenant", "MultiTenant"]),
      OPENAI_KEY: z.string().min(1),
      OPENAI_ENDPOINT: z.string().url(),
      OPENAI_MODEL: z.string().min(1), // For Azure OpenAI this is the name of the deployment to use.
      OPENAI_EMBEDDING_MODEL: z.string().min(1), // For Azure OpenAI this is the name of the embeddings deployment to use.
      STORAGE_ACCOUNT_NAME: z.string().min(1),
      STORAGE_ACCOUNT_KEY: z.string().min(1),
      OPENAI_TYPE: OpenAIType.optional(),
      VECTRA_INDEX_PATH: z.string().min(1),
      OPENAI_API_VERSION: z.string().optional(),
      DEFAULT_PROMPT_NAME: z.string().min(1),
      STORAGE_CONTAINER_NAME: z.string().min(1),
      WEBDATA_SOURCE_NAME: z.string().min(1),
      DOCUMENTDATA_SOURCE_NAME: z.string().min(1),
      APPLICATIONINSIGHTS_INSTRUMENTATION_KEY: z.string().optional(),
      CUSTOM_API_CLIENT_ID: z.string().optional(),
      CUSTOM_API_CLIENT_SECRET: z.string().optional(),
      MAX_TURNS: z.coerce.number().int().positive(),
      MAX_FILE_SIZE: z.coerce.number().int().positive(),
      MAX_PAGES: z.coerce.number().int().positive(),
    })
    .superRefine(this.openAIRefiner);

  public data: z.infer<typeof this.schema> = {} as z.infer<typeof this.schema>;
}

export { Env, OpenAIType };
