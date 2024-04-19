import CompanyInfo from "./companyInfo";
import { CompanyNewsSummary } from "./companyNews";
import { ESGScore } from "./scores";

interface EntityInfo {
  companyInfo: CompanyInfo;
  watchListStatus: string;
  lastUpdated: string;
  employees: string;
  annualRevenue: string;
  industry: string;
  esg?: ESGScore;
  companyNewsSummary?: CompanyNewsSummary;
  prompts?: string[];
  otherCompanies?: CompanyInfo[];
}

export default EntityInfo;
