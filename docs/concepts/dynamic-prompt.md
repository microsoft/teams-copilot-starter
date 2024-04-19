# Dynamic Prompt Templates

Dynamic Prompt Templates in the Teams Copilot Starter project allow developers to create customizable and context-aware prompts that can be dynamically modified at runtime. These templates enable the generation of natural language prompts, responses, extraction of information, invocation of other prompts, and more, all through plain text.

## Syntax

Dynamic Prompt Templates utilize a simple syntax for embedding expressions within text. Developers can use double curly braces `{{ ... }}` to encapsulate expressions in their prompts. Teams AI will parse these templates and execute the logic behind them.

### Custom Variables

To include the value of a variable in a prompt, developers can use the `{{$variableName}}` syntax. For example:

```json
Hello {{$name}}, nice to meet you!
```

Spaces within the curly braces are ignored and the following syntax is also valid:

```json
Hello {{ $name }}, nice to meet you!
```

#### Defining Variables

Variables can be defined and populated in the application code using the `state.temp` object. For example:

```typescript
app.beforeTurn((context, state) => {
  state.temp.post = "Lorem Ipsum...";
});
```

The defined variable `post` can then be accessed in a prompt template:

```json
This is the user's post: {{ $post }}
```

### Default Variables

Teams Copilot Starter provides pre-defined variables accessible in prompt templates without manual configuration. These variables are populated by the library and can be overridden by changing them in the turn state.

| Variable Name | Description                                          |
| ------------- | ---------------------------------------------------- |
| `input`       | Input passed from the user to the AI Library.        |
| `lastOutput`  | Output returned from the last executed action.       |

### Function Calls

To call an external function and embed the result in a prompt, developers can use the `{{ functionName }}` syntax. For example:

```json
The default language this Bot can speak is: {{ getLanguage }}
```

The corresponding function `getLanguage` can be defined and registered in the application code:

```typescript
prompts.addFunction('getLanguage', async (context, state, functions, tokenizer, args) => {
    const langCode = env.DEFAULT_LANG; // get the locale language code, e.g., 'en'
    return langCode;
});
```
