# Vectra

Teams Copilot Starter illustrates how to use [Retrieval Augmented Generation (RAG)](https://en.wikipedia.org/wiki/Prompt_engineering#Retrieval-augmented_generation) to easily inject contextual relevant information into the prompt sent to the model. This results in better and more accurate replies from the bot.

This Starter kit uses a local Vector Database, called [Vectra](https://github.com/Stevenic/vectra), to find the most relevant information when chatting with either a document (Text or PDF) or a website content to include in the prompt for the users input.

Vectra is a local vector database for Node.js with features similar to [Pinecone](https://www.pinecone.io/) or [Qdrant](https://qdrant.tech/), but built using local files. Each Vectra index is a folder on disk. It is also true when the Teams Copilot Starter bot is deployed to Azure. When it is run locally, the local folder is referenced as the absolute file path combined with the value of the environment variable `VECTRA_INDEX_PATH`. And when it is run on Azure, this folder path is defined in `.env.dev` by the value of the same variable, default to `D:\\Home\\index`, as bot has write/read access to `D` drive.

There's an `index.json` file in the folder that contains all the vectors for the index along with any indexed metadata.  When you create an index you can specify which metadata properties to index and only those fields will be stored in the `index.json` file. All of the other metadata for an item will be stored on disk in a separate file keyed by a GUID. To add metadata properties to index, modify the line in `BYODSkill` class that invokes `vectraIndex.upsertDocument(...)` function by adding the metadata object to the fourth argument:
`upsertDocument(uri: string, text: string, docType?: string, metadata?: Record<string, MetadataTypes>)`

Later, when queryng Vectra every item in the index will first be filtered by metadata and then ranked for simularity.

>Keep in mind that your entire Vectra index is loaded into memory so it's not well suited for scenarios like long term chat bot memory. Use a real vector DB for that. Vectra is intended to be used in scenarios where you have a small corpus of mostly static data that you'd like to include in your prompt. Infinite few shot examples would be a great use case for Vectra or even just a single document you want to ask questions over.

## Usage

Here is an example of the Vectra usage by Teams Copilot Starter:

```typescript
// Inside of chatWithDocument.ts

const questionDocument = new BYODSkill(
  context,
  state,
  planner,
  AIPrompts.QuestionDocument,
  logger,
  new VectraDataSource({
    name: env.data.DOCUMENTDATA_SOURCE_NAME,
    model: env.data.OPENAI_MODEL_ID,
    apiKey: env.data.OPENAI_KEY,
    azureApiKey: env.data.OPENAI_KEY,
    azureEndpoint: env.data.OPENAI_ENDPOINT,
    azureDeployment: env.data.OPENAI_EMBEDDING_DEPLOYMENT_ID,
    indexFolder: env.data.VECTRA_INDEX_PATH,
  })
);

...

// Add the uploaded documents to the vectra index
await questionDocument.addExternalContent(
  state.conversation.uploadedDocuments
);
```

Inside the prompt's `config.json` here, `documentdata` denotes the name of the _VectraDataSource_, and 1200 is `maxTokens` parameter.

```json

"augmentation": {
  "augmentation_type": "sequence",
  "data_sources": {
    "documentdata": 1200
  }
}
```
