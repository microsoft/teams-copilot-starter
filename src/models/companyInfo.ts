import CompanyAddress from "./companyAddress";

interface CompanyInfo {
  id: string;
  name: string;
  ticker?: string;
  address?: CompanyAddress;
  website?: string;
  worldRegion?: string;
  logoUrl?: string;
}

export default CompanyInfo;
