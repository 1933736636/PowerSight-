import React, { useState } from 'react';
import { DailyResult } from '../types';
import { ArrowUpDown, Download } from 'lucide-react';

interface DataTableProps {
  results: DailyResult[];
}

const DataTable: React.FC<DataTableProps> = ({ results }) => {
  const [sortConfig, setSortConfig] = useState<{ key: keyof DailyResult; direction: 'asc' | 'desc' } | null>(null);

  const sortedResults = React.useMemo(() => {
    let sortableItems = [...results];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [results, sortConfig]);

  const requestSort = (key: keyof DailyResult) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const exportCSV = () => {
    const header = ['日期', '准确率', 'MAE (MW)', 'RMSE (MW)', '实际均值', '预测均值'];
    const rows = results.map(r => [
      r.date, 
      (r.accuracy * 100).toFixed(2) + '%', 
      r.mae.toFixed(2), 
      r.rmse.toFixed(2), 
      r.avgReal.toFixed(2), 
      r.avgFore.toFixed(2)
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + header.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "accuracy_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 className="font-semibold text-slate-800">详细数据 (Detailed Data)</h3>
        <button 
          onClick={exportCSV}
          className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition"
        >
          <Download className="w-4 h-4 mr-1" />
          导出 CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th onClick={() => requestSort('date')} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100">
                <div className="flex items-center">日期 <ArrowUpDown className="w-3 h-3 ml-1" /></div>
              </th>
              <th onClick={() => requestSort('accuracy')} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100">
                 <div className="flex items-center">准确率 (Accuracy) <ArrowUpDown className="w-3 h-3 ml-1" /></div>
              </th>
              <th onClick={() => requestSort('rmse')} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100">
                RMSE
              </th>
              <th onClick={() => requestSort('mae')} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100">
                MAE
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                实际功率均值
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {sortedResults.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">{row.date}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    row.accuracy >= 0.8 ? 'bg-green-100 text-green-800' : 
                    row.accuracy >= 0.6 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {(row.accuracy * 100).toFixed(2)}%
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{row.rmse.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{row.mae.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{row.avgReal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;
