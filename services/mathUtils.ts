// Basic math helpers to replace numpy behavior

export const mean = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

export const sum = (arr: number[]): number => {
  return arr.reduce((a, b) => a + b, 0);
};

export const rmse = (real: number[], fore: number[]): number => {
  if (real.length !== fore.length || real.length === 0) return 0;
  const squaredDiffs = real.map((r, i) => Math.pow(r - fore[i], 2));
  return Math.sqrt(mean(squaredDiffs));
};

export const mae = (real: number[], fore: number[]): number => {
  if (real.length !== fore.length || real.length === 0) return 0;
  const absDiffs = real.map((r, i) => Math.abs(r - fore[i]));
  return mean(absDiffs);
};
