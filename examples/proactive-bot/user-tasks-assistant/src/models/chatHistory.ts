export interface ChatHistory {
  role: string;
  content: string;
  timestamp?: string;
}

export interface ChatHistoryBlob {
  name: string;
  index: number;
}
