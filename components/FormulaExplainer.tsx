import React from 'react';
import { Region, CalculationParams, DataPoint } from '../types';
import { getFormulaInfo } from '../services/formulas';
import { mean, sum } from '../services/mathUtils';
import { Calculator, HelpCircle } from 'lucide-react';

interface FormulaExplainerProps {
  region: Region;
  params: CalculationParams;
  sampleDayData: DataPoint[]; // Just one day or a slice of data
  dateStr: string;
}

const FormulaExplainer: React.FC<FormulaExplainerProps> = ({ region, params, sampleDayData, dateStr }) => {
  const info = getFormulaInfo(region);
  const data = sampleDayData || [];
  
  // -- Table Generation Logic --
  // We calculate row-by-row values for display based on the region logic
  // This duplicates some logic from formulas.ts but focuses on display (intermediate steps)
  
  const renderTableContent = () => {
    // Shared Helper
    const getFore = (d: DataPoint) => d.forecasts && d.forecasts.length > 0 ? mean(d.forecasts) : d.forecast;

    if (region === 'Shanxi') {
      // Logic: (R-F)^2 * |R-F| / Sum(|R-F|)
      const totalAbsDiff = sum(data.map(d => Math.abs(d.real - getFore(d))));
      
      return (
        <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-slate-500">Time</th>
              <th className="px-3 py-2 text-right text-slate-500">Real (R)</th>
              <th className="px-3 py-2 text-right text-slate-500">Fore (F)</th>
              <th className="px-3 py-2 text-right text-slate-500">Diff (R-F)</th>
              <th className="px-3 py-2 text-right text-slate-500">|Diff|</th>
              <th className="px-3 py-2 text-right text-slate-500">Sq.Err (D²)</th>
              <th className="px-3 py-2 text-right text-blue-600 font-medium">Weighted Sq.Err</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((row, i) => {
              const f = getFore(row);
              const diff = row.real - f;
              const absDiff = Math.abs(diff);
              const sqErr = Math.pow(diff, 2);
              const weight = totalAbsDiff === 0 ? 0 : absDiff / totalAbsDiff;
              const weightedSqErr = sqErr * weight;
              
              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1 text-slate-700 whitespace-nowrap">{row.time}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{row.real.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{f.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-400">{diff.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-400">{absDiff.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-400">{sqErr.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right font-mono text-blue-700">{weightedSqErr.toFixed(4)}</td>
                </tr>
              );
            })}
            <tr className="bg-blue-50 font-bold">
              <td colSpan={4} className="px-3 py-2 text-right">Sum |Diff|: {totalAbsDiff.toFixed(2)}</td>
              <td colSpan={3} className="px-3 py-2 text-right text-blue-700">Sum Weighted: {sum(data.map(d => {
                 const f = getFore(d);
                 const diff = d.real - f;
                 const absDiff = Math.abs(diff);
                 return Math.pow(diff, 2) * (totalAbsDiff === 0 ? 0 : absDiff/totalAbsDiff);
              })).toFixed(4)}</td>
            </tr>
          </tbody>
        </table>
      );
    } 
    
    else if (region === 'Northwest') {
      // Northwest Logic: | R/(R+F) - 0.5 | * |R-F| / Sum(|R-F|)
      // Filter dead band
      const thresholdVal = params.cap * params.threshold;
      
      // We calculate total P_sum based on valid rows only
      const validRows = data.filter(d => {
          const f = getFore(d);
          return !(d.real < thresholdVal && f < thresholdVal);
      });
      const pSum = sum(validRows.map(d => Math.abs(d.real - getFore(d))));

      return (
        <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-slate-500">Time</th>
              <th className="px-3 py-2 text-right text-slate-500">Real (R)</th>
              <th className="px-3 py-2 text-right text-slate-500">Fore (F)</th>
              <th className="px-3 py-2 text-center text-slate-500">Status</th>
              <th className="px-3 py-2 text-right text-slate-500">Term 1: |R/(R+F)-0.5|</th>
              <th className="px-3 py-2 text-right text-slate-500">Term 2: |R-F|/Σ</th>
              <th className="px-3 py-2 text-right text-blue-600">Step Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((row, i) => {
              const f = getFore(row);
              const r = row.real;
              const isDeadBand = (r < thresholdVal && f < thresholdVal);
              
              if (isDeadBand) {
                 return (
                    <tr key={i} className="bg-gray-50 text-gray-400">
                        <td className="px-3 py-1">{row.time}</td>
                        <td className="px-3 py-1 text-right">{r.toFixed(2)}</td>
                        <td className="px-3 py-1 text-right">{f.toFixed(2)}</td>
                        <td className="px-3 py-1 text-center text-xs">免考 (DeadBand)</td>
                        <td className="px-3 py-1 text-right">-</td>
                        <td className="px-3 py-1 text-right">-</td>
                        <td className="px-3 py-1 text-right">0</td>
                    </tr>
                 )
              }

              const denom = r + f;
              const term1 = denom === 0 ? 0 : Math.abs((r/denom) - 0.5);
              const absDiff = Math.abs(r - f);
              const term2 = pSum === 0 ? 0 : absDiff / pSum;
              const stepVal = term1 * term2;

              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1 text-slate-700 whitespace-nowrap">{row.time}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{r.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{f.toFixed(2)}</td>
                  <td className="px-3 py-1 text-center text-green-600 text-xs">Valid</td>
                  <td className="px-3 py-1 text-right text-slate-500">{term1.toFixed(4)}</td>
                  <td className="px-3 py-1 text-right text-slate-500">{term2.toFixed(4)}</td>
                  <td className="px-3 py-1 text-right font-mono text-blue-700">{stepVal.toFixed(6)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    } 

    else if (region === 'Northeast') {
      // Northeast Logic: RMSE based with Dead Band
      const thresholdVal = params.cap * params.threshold;
      
      let sumSqError = 0;
      let count = 0;

      return (
        <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-slate-500">Time</th>
              <th className="px-3 py-2 text-right text-slate-500">Real (R)</th>
              <th className="px-3 py-2 text-right text-slate-500">Fore (F)</th>
              <th className="px-3 py-2 text-center text-slate-500">Status</th>
              <th className="px-3 py-2 text-right text-slate-500">Diff (R-F)</th>
              <th className="px-3 py-2 text-right text-blue-600">Sq.Error (D²)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((row, i) => {
              const f = getFore(row);
              const r = row.real;
              const isDeadBand = (r < thresholdVal && f < thresholdVal);
              
              if (isDeadBand) {
                 count++; // Still counts towards N usually in some systems, but effectively 0 error. 
                 // If standard says "Excluded points", we shouldn't inc count, but typically for daily RMSE it is N=96.
                 // Assuming Fixed 96 points per day for RMSE denominator usually.
                 return (
                    <tr key={i} className="bg-gray-50 text-gray-400">
                        <td className="px-3 py-1">{row.time}</td>
                        <td className="px-3 py-1 text-right">{r.toFixed(2)}</td>
                        <td className="px-3 py-1 text-right">{f.toFixed(2)}</td>
                        <td className="px-3 py-1 text-center text-xs">免考 (DeadBand)</td>
                        <td className="px-3 py-1 text-right">-</td>
                        <td className="px-3 py-1 text-right">0.00</td>
                    </tr>
                 )
              }

              const diff = r - f;
              const sqErr = Math.pow(diff, 2);
              sumSqError += sqErr;
              count++;

              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1 text-slate-700 whitespace-nowrap">{row.time}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{r.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{f.toFixed(2)}</td>
                  <td className="px-3 py-1 text-center text-green-600 text-xs">Valid</td>
                  <td className="px-3 py-1 text-right text-slate-400">{diff.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right font-mono text-blue-700">{sqErr.toFixed(2)}</td>
                </tr>
              );
            })}
             <tr className="bg-blue-50 font-bold">
              <td colSpan={4} className="px-3 py-2 text-right">Count: {data.length}</td>
              <td colSpan={2} className="px-3 py-2 text-right text-blue-700">
                RMSE = √({sumSqError.toFixed(2)} / {data.length}) = {Math.sqrt(sumSqError/data.length).toFixed(4)}
                <br/>
                Acc = 1 - (RMSE / {params.cap})
              </td>
            </tr>
          </tbody>
        </table>
      );
    }
    
    else {
      // General Table (Difference & Square Error)
      return (
        <table className="min-w-full divide-y divide-slate-200 text-xs md:text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-slate-500">Time</th>
              <th className="px-3 py-2 text-right text-slate-500">Real (R)</th>
              <th className="px-3 py-2 text-right text-slate-500">Fore (F)</th>
              <th className="px-3 py-2 text-right text-slate-500">Diff (R-F)</th>
              <th className="px-3 py-2 text-right text-blue-600">Sq.Error (R-F)²</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((row, i) => {
              const f = getFore(row);
              const diff = row.real - f;
              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-1 text-slate-700 whitespace-nowrap">{row.time}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{row.real.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-600">{f.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right text-slate-400">{diff.toFixed(2)}</td>
                  <td className="px-3 py-1 text-right font-mono text-blue-700">{Math.pow(diff, 2).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow mt-8 border border-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center">
          <Calculator className="w-5 h-5 text-blue-600 mr-2" />
          <h3 className="text-lg font-bold text-slate-800">计算公式与步骤详情 (Calculation Steps)</h3>
        </div>
        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
          示例日期: {dateStr}
        </span>
      </div>
      
      <div className="p-6">
        {/* Formula Description */}
        <div className="mb-6 bg-slate-50 p-4 rounded-md border border-slate-200">
           <div className="flex items-start mb-2">
             <HelpCircle className="w-4 h-4 text-slate-500 mt-1 mr-2 flex-shrink-0" />
             <div>
               <h4 className="font-semibold text-slate-800">{info.name}</h4>
               <p className="text-sm text-slate-600 mt-1">{info.desc}</p>
             </div>
           </div>
           <div className="mt-3 p-3 bg-white rounded border border-slate-200 font-mono text-sm text-center text-slate-800 overflow-x-auto">
             {info.formula}
           </div>
           {(region === 'Northwest' || region === 'Northeast') && (
             <p className="text-xs text-slate-500 mt-2 text-right">
               *免考阈值: {params.threshold*100}% Cap ({params.cap * params.threshold} MW)
             </p>
           )}
        </div>

        {/* Calculation Table */}
        <div className="overflow-x-auto border rounded-lg border-slate-200 max-h-96">
          {renderTableContent()}
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">
          * 表格展示当日每个时间点的中间计算变量。最终准确率由上述变量汇总计算得出。
        </p>
      </div>
    </div>
  );
};

export default FormulaExplainer;