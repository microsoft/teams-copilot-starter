export interface ESGScore {
  score: number;
  rating: string;
  date: string;
  factors: {
    e: number;
    s: number;
    g: number;
  };
}

export interface Weights {
  cr_weight: number;
  mr_weight: number;
  cli_weight: number;
  esg_weight: number;
}

export interface Thresholds {
  min: number;
  max: number;
  level: string;
}

export interface Score {
  score: number;
  rating: string;
  date: string;
  thresholds: Thresholds;
}

export interface ScoreCard {
  lookupId: number;
  value: number;
  riskLevel: string;
  weights: Weights;
  details: {
    macroScore: Score;
    esgScore: Score;
    creditScore: Score;
    climateScore: Score;
    omniScore: Score;
  };
}
