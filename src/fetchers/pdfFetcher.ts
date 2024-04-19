import { TextFetcher } from "vectra";
import { pdfToPages, pdfToText } from "pdf-ts";
import * as Errors from "../types/errors";
import { Env } from "../env";
import { container } from "tsyringe";

export class PDFFetcher implements TextFetcher {
  private env: Env;
  constructor() {
    this.env = container.resolve(Env);
  }

  public async fetch(
    uri: string,
    onDocument: (
      uri: string,
      text: string,
      docType?: string
    ) => Promise<boolean>
  ): Promise<boolean> {
    const buffer = await this.fetchFile(uri);
    const text = await this.getPDFText(buffer);
    return await onDocument(uri, text, "pdf");
  }

  private async getPDFText(pdfBuffer: Buffer): Promise<string> {
    const pdfPages = await pdfToPages(pdfBuffer);
    if (pdfPages.length > this.env.data.MAX_PAGES) {
      throw new Errors.TooManyPagesError(
        `Number of pages exceeds the maximum allowed number of pages of ${this.env.data.MAX_PAGES}.`
      );
    }
    //get text from pages
    let pdfText = "";
    for (const page of pdfPages) {
      pdfText += page.text;
      pdfText += "\n";
    }
    if (pdfText && pdfText.length > this.env.data.MAX_FILE_SIZE) {
      throw new Errors.FileTooLargeError(
        `File size exceeds the maximum allowed size of ${this.env.data.MAX_FILE_SIZE} bytes.`
      );
    }
    return pdfText;
  }

  private async fetchFile(url: string): Promise<Buffer> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
