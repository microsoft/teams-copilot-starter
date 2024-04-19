# Customizing Teams Copilot Starter: Skills

## Introduction

Teams Copilot Starter is a project designed to streamline the development of intelligent conversational agents using TypeScript and leveraging OpenAI's Language Model (LLM) capabilities.
By following the outlined below steps and leveraging the provided extensible framework, developers can extend the capabilities of conversational agents efficiently. This document serves as a guide for developers aiming to customize the existing skills or create new semantic skills within this project.

## Supported Skills

Skills are a core component of the Teams Copilot Starter project, providing the conversational agent with the ability to perform various tasks and interact with users effectively. The project includes several pre-built skills that can be extended or customized to meet specific requirements. Here are the supported skills:

### Base AI Skill

  - The `BaseAISkill` class serves as a parent class, providing a foundational structure and common functionality for AI skills within a bot application. Subclasses extend this class to implement specific AI skills by providing their own `run` method. This class accepts input in either a string or EntityInfo format.

### BYOD Skill (Bring Your Own Data)

  The `BYODSkill` allows the user to ask questions against their own data. Currently, two actions use the BYOD Skill (`webRetrieval` and `chatwithDocument`). This skill requires you to pass in a Vectra Datasource, where the embeddings will be stored and indexed. To add data to the index, you can use the `addExternalContent` function. The `run` function will then use the data in the index to generate a response.

### Chat GPT Skill

The `ChatGPTSkill` utilizes OpenAI's AI model to generate responses to user inputs. It enhances conversational capabilities by providing AI-generated responses across a wide range of topics.
  
### Entity Info Skill

The `EntityInfoSkill` randomly generates a company's ESG (Environmental, Social, and Governance) score. This skill is used when asking for information about a company and scores are shown in an [adaptive card](./../prompt-examples.md#get-detailed-company-information).
  
### Entity Recognition Skill

The `EntityRecognitionSkill` uses OpenAI to identity the entity (company) in the user's input. It will also find public information about the entity. 
  
### Generate Prompts Skill

The `GeneratePromptsSkill` generates follow-up prompts based on the user's input. It enriches user interactions by providing contextually relevant follow-up prompts in chatbot applications.

### Matching Entities Skill

The `MatchingEntitiesSkill` finds entities related to companies in the user's input. It returns similar companies found in the user's input, searching for companies whose names begin with the provided input.

### Similar Entities Skill

The `SimilarEntitiesSkill` finds entities related to companies in the user's input. It returns similar companies found in the user's input, specifically searching for companies that are competitors to the provided input company.

## Adding a New Semantic Skill

Adding a new semantic skill involves several steps outlined below:

### 1. Create Prompt Template

- Create a prompt template folder containing two files: `config.json` and `skprompt.txt`.
- Clone an existing prompt template folder and modify the files to reflect the desired skill functionality.
- Understanding prompt engineering is necessary but is out of scope for this document.

### 2. Implement Skill Class

- Create a new class that extends the base abstract class `BaseAISkill`.
- Implement the `run()` function, which executes the AI LLM with the user-provided prompt and optionally any additional external data sources.
- Decide whether the response should be plain text or in the form of a custom adaptive card.

### 3. Add Prompt Folder Name to Enumerator

- Add the prompt folder name to the global enumerator of prompt folders `AIPrompts` defined in `/prompts/aiPromptTypes.ts` file.

### 4. Constructor Implementation

- Pass the prompt template folder name in the class constructor when calling the `super()` method.

### Example Implementation

Here's an excerpt demonstrating the implementation of a new skill class:

```typescript
// chatGPTSkill.ts
import { BaseAISkill } from "./baseAISkill";
import { AIPrompts } from "../prompts/aiPromptTypes";
import { VectraDataSource } from "../dataSources/vectraDataSource";

export class ChatGPTSkill extends BaseAISkill {
  constructor(
    context: TurnContext,
    state: ApplicationTurnState,
    planner: ActionPlanner<ApplicationTurnState>,
    dataSource: DataSource
  ) {
    super(context, state, planner, AIPrompts.ChatGPT, dataSource);
  }

  @usePolicy(BaseAISkill.RetryPolicy)
  public override async run(input: string): Promise<any> {
    // Custom logic here
    const response = await this.planner.completePrompt(
      this.context,
      this.state,
      this.promptTemplate!
    );
    return response.message?.content;
  }
}
```

### Usage

To use the custom skill, create an instance of the class and call its `run()` function:

```typescript
const chatGPTSkill = new ChatGPTSkill(
  context,
  state,
  planner,
  new VectraDataSource({
    // Configuration settings
  })
);

const response = await chatGPTSkill.run("tell me a joke");
if (response) {
   await context.sendActivity(response);
} else {
   await context.sendActivity("I couldn't generate a response.");
}
```

## Extending with External Data Sources

To incorporate external data sources into a skill, follow these steps:

1. Pass an instance of `VectraDataSource` to the skill class constructor.
2. Use the `addExternalContent(urls)` function to add external documents to the Vectra index.
3. Execute the `run()` function to generate a response using the added data.
4. Optionally, use `deleteExternalContent(urls)` to remove the attached data sources.

