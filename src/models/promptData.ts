export interface PromptEntities {
  name: string;
}

export interface PromptDo {
  type: string;
  action: string;
  entities: PromptEntities;
}

export interface PromptSay {
  type: string;
  response: string;
}

export interface PromptCommand {
  do: PromptDo;
  say: PromptSay;
}

export interface PromptData {
  type: string;
  commands: PromptCommand[];
}
