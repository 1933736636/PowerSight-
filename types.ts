export type Region = 'Shanxi' | 'Northwest' | 'Northeast' | 'South' | 'East' | 'Central';

export interface RawRow {
  time: string;
  timestamp: number;
  [key: string]: number | string; // Dynamic columns
}

export interface DataPoint {
  time: string;
  timestamp: number;
  real: number;
  forecast: number;
  forecasts: number[]; 
}

export interface DailyResult {
  date: string;
  accuracy: number;
  mae: number;
  rmse: number;
  avgReal: number;
  avgFore: number;
}

export interface CalculationParams {
  cap: number;
  threshold: number;
  ignoreDeadBand: boolean;
}

export interface CalculationStats {
  meanAccuracy: number;
  maxAccuracy: number;
  minAccuracy: number;
  stdDev: number;
  distribution: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface MonthlyStats {
  month: string; // YYYY-MM
  meanAccuracy: number;
  meanRmse: number;
  meanMae: number;
  distribution: {
    high: number;
    medium: number;
    low: number;
  };
  daysCount: number;
}