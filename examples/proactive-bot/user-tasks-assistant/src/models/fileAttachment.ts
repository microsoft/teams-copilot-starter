export type FileAttachment = {
  type: string;
  url: string;
  fileName: string;
  blobName?: string | undefined;
  fileHash?: string | undefined;
  completeUrl?: string | undefined;
};
