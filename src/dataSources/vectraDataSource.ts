import {
  DataSource,
  Memory,
  RenderedPromptSection,
  Tokenizer,
} from "@microsoft/teams-ai";
import {
  OpenAIEmbeddings,
  LocalDocumentIndex,
  DocumentTextSection,
} from "vectra";
import { TurnContext } from "botbuilder";
import { VectraDataSourceOptions } from "../models/vectorDataSourceOptions";
import { FileAttachment } from "../models/fileAttachment";
import crypto from "crypto";

/**
 * A data source that uses a local Vectra index to inject text snippets into a prompt.
 */
export class VectraDataSource implements DataSource {
  private readonly _options: VectraDataSourceOptions;
  private readonly _index: LocalDocumentIndex;
  private readonly _embeddings: OpenAIEmbeddings;

  /**
   * Name of the data source.
   * @remarks
   * This is also the name of the local Vectra index.
   */
  public readonly name: string;

  /**
   * Creates a new `VectraDataSource` instance.
   * @param {VectraDataSourceOptions} options Options for creating the data source.
   */
  public constructor(options: VectraDataSourceOptions) {
    this._options = options;
    this.name = options.name;

    // Create embeddings model
    this._embeddings = new OpenAIEmbeddings(options.embeddings);

    // Create local index
    this._index = new LocalDocumentIndex({
      embeddings: this._embeddings,
      folderPath: options.indexFolder,
    });
  }

  // Add the public property `index` to the `VectraDataSource` class
  public get index(): LocalDocumentIndex {
    return this._index;
  }

  // Add the public property `Embeddings` to the `VectraDataSource` class
  public get Embeddings(): OpenAIEmbeddings {
    return this._embeddings;
  }

  /**
   * Renders the data source as a string of text.
   * @param {TurnContext} context Turn context for the current turn of conversation with the user.
   * @param {Memory} memory An interface for accessing state values.
   * @param {Tokenizer} tokenizer Tokenizer to use when rendering the data source.
   * @param {number} maxTokens Maximum number of tokens allowed to be rendered.
   * @returns {Promise<RenderedPromptSection<string>>} A promise that resolves to the rendered data source.
   */
  public async renderData(
    context: TurnContext,
    memory: Memory,
    tokenizer: Tokenizer,
    maxTokens: number
  ): Promise<RenderedPromptSection<string>> {
    // Query index
    const query = memory.getValue("temp.input") as string;
    // Get the hash from the uri. This is set when the user uploads a document
    // The document is added to index when uploaded
    // The hash is used to filter the document content from the local index to ensure only content from the uploaded document is returned
    const hashFromUploadedDocument = memory.getValue(
      "temp.hashFromUploadedDocument"
    ) as string;
    const docId = await this.index.getDocumentId(hashFromUploadedDocument);

    const results = await this._index.queryDocuments(query, {
      maxDocuments: this._options.maxDocuments ?? 5,
      maxChunks: this._options.maxChunks ?? 50,
    });

    // Add documents until you run out of tokens
    let length = 0;
    let output = "";
    let connector = "";
    const filterResults =
      docId === undefined
        ? results
        : results.filter((result) => result.id === docId);
    for (const result of filterResults) {
      // Start a new doc
      let doc = `${connector}url: ${result.uri}\n`;
      let docLength = tokenizer.encode(doc).length;
      const remainingTokens = maxTokens - (length + docLength);
      if (remainingTokens <= 0) {
        break;
      }

      // Render document section
      const sections = await result.renderSections(
        Math.min(remainingTokens, this._options.maxTokensPerDocument ?? 600),
        1
      );
      docLength += sections[0].tokenCount;
      doc += sections[0].text;

      // Append do to output
      output += doc;
      length += docLength;
      connector = "\n\n";
    }

    return { output, length, tooLong: length > maxTokens };
  }

  public async getVector(query: string): Promise<number[]> {
    // Create embeddings model
    const embeddings = await this._embeddings.createEmbeddings(query);
    return embeddings.output?.[0] ?? [];
  }

  /**
   * Queries the data source for the given input and returns the results.
   * @param {string} query The input to query the data source with.
   */
  public async queryData(query: string): Promise<DocumentTextSection[]> {
    // Query index
    const results = await this._index.queryDocuments(query, {
      maxDocuments: this._options.maxDocuments ?? 5,
      maxChunks: this._options.maxChunks ?? 50,
    });

    // Render results
    const output: DocumentTextSection[] = [];
    for (const result of results) {
      // Render document section
      const sections = await result.renderSections(
        this._options.maxTokensPerDocument ?? 2000,
        this._options.sectionCount ?? 1
      );
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        output.push(section);
      }
    }

    return output;
  }

  /**
   * Delete external content from the local index.
   * @param links - The web urls or local files to fetch and index.
   */
  public async deleteExternalContent(links: FileAttachment[]): Promise<void> {
    for (const item of links) {
      const hashFromUri = crypto
        .createHash("sha256")
        .update(item.url)
        .digest("hex");
      const docId = await this.index.getDocumentId(hashFromUri);
      if (docId) {
        await this.index.deleteDocument(hashFromUri);
      }
    }
  }
}
