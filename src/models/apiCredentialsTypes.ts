export declare type ApiCredentials = {
  endpoint: string;
  apiKeyName: string;
  apiKeyValue: string;
};

export declare type OAuthCredentials = {
  endpoint: string;
  clientId: string;
  clientSecret: string;
  tenantId: string;
};

export declare type BasicCredentials = {
  endpoint: string;
  userName: string;
  password: string;
};

export declare type CopilotCredentials = BasicCredentials & {
  chatModel: string;
};
