import React from 'react';
import { RawRow } from '../types';
import { Table, ArrowRight } from 'lucide-react';

interface DataPreviewProps {
  data: RawRow[];
  realCol: string;
  foreCols: string[];
  dateRange: { start: string, end: string };
}

const DataPreview: React.FC<DataPreviewProps> = ({ data, realCol, foreCols, dateRange }) => {
  // Filter preview data based on date range (take first 10 matching)
  const previewRows = [];
  let count = 0;
  
  for (const row of data) {
    // Construct local date string YYYY-MM-DD
    const d = new Date(row.timestamp);
    const rowDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (rowDate >= dateRange.start && rowDate <= dateRange.end) {
      previewRows.push(row);
      count++;
    }
    if (count >= 10) break;
  }

  return (
    <div className="bg-white rounded-lg shadow border border-slate-200 mt-6">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center">
          <Table className="w-5 h-5 text-blue-600 mr-2" />
          <h3 className="font-bold text-slate-800">标准数据预览 (Standard Data Preview - Top 10)</h3>
        </div>
        <span className="text-xs text-slate-500">
            Previewing valid data range
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Time</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                 实测 (Real) <span className="text-xs text-slate-400 font-normal block">{realCol}</span>
              </th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">
                 预测 (Forecast) <span className="text-xs text-slate-400 font-normal block">Avg of {foreCols.length} cols</span>
              </th>
              {foreCols.length > 1 && (
                 <th className="px-4 py-3 text-left font-medium text-slate-400">
                    Forecast Details
                 </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {previewRows.length === 0 ? (
                <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                        当前时间筛选范围内无数据 (No data in selected date range)
                    </td>
                </tr>
            ) : (
                previewRows.map((row, idx) => {
                  const realVal = Number(row[realCol]) || 0;
                  const foreVals = foreCols.map(c => Number(row[c]) || 0);
                  const avgFore = foreVals.reduce((a,b)=>a+b,0) / (foreVals.length || 1);

                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{row.time}</td>
                      <td className="px-4 py-2 font-mono text-blue-700">{realVal.toFixed(2)}</td>
                      <td className="px-4 py-2 font-mono text-green-700">{avgFore.toFixed(2)}</td>
                      {foreCols.length > 1 && (
                          <td className="px-4 py-2 text-xs text-slate-400">
                              [{foreVals.map(v => v.toFixed(1)).join(', ')}]
                          </td>
                      )}
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-xs text-slate-500">
         * 系统将使用上述“实测”和“预测”列数据进行后续准确率计算
      </div>
    </div>
  );
};

export default DataPreview;