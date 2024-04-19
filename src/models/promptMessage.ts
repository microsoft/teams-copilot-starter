export interface Citation {
  id: string;
  text: string;
  url: string;
  source_url: string;
}

export interface PromptMessage {
  request: string;
  response: string;
  citations?: Citation[];
}
