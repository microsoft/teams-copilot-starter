// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import customData from "../resources/customDataSource.json";
import CompanyInfo from "../models/companyInfo";

/**
 * This an example of getting data from a custom data source.
 */
export class apiCustomDataService {
  private getRandomResponses(
    responses: CompanyInfo[],
    n: number
  ): CompanyInfo[] {
    const indicesSet = new Set<number>();

    while (indicesSet.size < n) {
      indicesSet.add(Math.floor(Math.random() * responses.length));
    }

    const indices = Array.from(indicesSet);
    const tmpResponses = indices.map((index) => responses[index]);
    return tmpResponses;
  }

  /**
   * Returns a random company entity
   */
  public getRandomCompanies = (companyName: string): CompanyInfo[] => {
    return this.getRandomResponses(customData, 2);
  };
}
