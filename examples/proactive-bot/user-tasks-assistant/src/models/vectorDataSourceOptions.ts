import {
  OSSEmbeddingsOptions,
  OpenAIEmbeddingsOptions,
  AzureOpenAIEmbeddingsOptions,
} from "vectra";

/**
 * Options for creating a `VectraDataSource`.
 */
export interface VectraDataSourceOptions {
  /**
   * Name of the data source and local index.
   */
  name: string;

  /**
   * Options for creating the embeddings model.
   */
  embeddings:
    | OSSEmbeddingsOptions
    | OpenAIEmbeddingsOptions
    | AzureOpenAIEmbeddingsOptions;

  /**
   * Path to the folder containing the local index.
   * @remarks
   * This should be the root folder for all local indexes and the index itself
   * needs to be in a subfolder under this folder.
   */
  indexFolder: string;

  /**
   * Optional. Maximum number of documents to return.
   * @remarks
   * Defaults to `5`.
   */
  maxDocuments?: number;

  /**
   * Optional. Maximum number of chunks to return per document.
   * @remarks
   * Defaults to `50`.
   */
  maxChunks?: number;

  /**
   * Optional. Maximum number of tokens to return per document.
   * @remarks
   * Defaults to `2000`.
   */
  maxTokensPerDocument?: number;

  /**
   * Optional. Maximum number of sections to return per document.
   * @remarks
   * Defaults to `1`.
   */
  sectionCount?: number;
}
