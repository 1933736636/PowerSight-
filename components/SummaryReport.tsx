import React, { useMemo } from 'react';
import { DailyResult, CalculationStats, MonthlyStats } from '../types';
import { FileText, TrendingUp, TrendingDown } from 'lucide-react';
import { mean } from '../services/mathUtils';

interface SummaryReportProps {
  results: DailyResult[];
  stats: CalculationStats;
  startDate: string;
  endDate: string;
}

const SummaryReport: React.FC<SummaryReportProps> = ({ results, stats, startDate, endDate }) => {

  const monthlyStats = useMemo(() => {
    const grouped: Record<string, DailyResult[]> = {};
    results.forEach(r => {
      const monthKey = r.date.substring(0, 7); // YYYY-MM
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(r);
    });

    const report: MonthlyStats[] = Object.keys(grouped).sort().map(m => {
      const days = grouped[m];
      const accs = days.map(d => d.accuracy);
      return {
        month: m,
        meanAccuracy: mean(accs),
        meanRmse: mean(days.map(d => d.rmse)),
        meanMae: mean(days.map(d => d.mae)),
        distribution: {
            high: accs.filter(a => a >= 0.8).length,
            medium: accs.filter(a => a >= 0.6 && a < 0.8).length,
            low: accs.filter(a => a < 0.6).length
        },
        daysCount: days.length
      };
    });
    return report;
  }, [results]);

  // Comparative Analysis Logic
  const analysisText = useMemo(() => {
      if (monthlyStats.length === 0) return null;
      
      const sortedByAcc = [...monthlyStats].sort((a, b) => b.meanAccuracy - a.meanAccuracy);
      const best = sortedByAcc[0];
      const worst = sortedByAcc[sortedByAcc.length - 1];
      
      const monthDetails = monthlyStats.map(m => 
          `${m.month} (${(m.meanAccuracy * 100).toFixed(1)}%)`
      ).join('，');

      return {
          detailStr: monthDetails,
          best,
          worst,
          diff: (best.meanAccuracy - worst.meanAccuracy) * 100
      };
  }, [monthlyStats]);

  if (results.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow mt-8 border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center">
        <FileText className="w-5 h-5 text-blue-600 mr-2" />
        <h3 className="text-lg font-bold text-slate-800">分析报告总结 (Summary Report)</h3>
      </div>
      
      <div className="p-6 space-y-6">
        {/* Overall Summary */}
        <div>
            <h4 className="text-base font-semibold text-slate-700 mb-2 border-l-4 border-blue-500 pl-2">
                总体概况 ({startDate} 至 {endDate})
            </h4>
            <div className="bg-slate-50 p-4 rounded text-sm text-slate-700 leading-relaxed space-y-3">
                <p>
                    在选定的时间范围内，共计考核 <strong>{results.length}</strong> 天。
                    全时段平均准确率为 <strong className="text-blue-700">{(stats.meanAccuracy * 100).toFixed(2)}%</strong>，
                    平均 RMSE 为 <strong>{mean(results.map(r => r.rmse)).toFixed(2)} MW</strong>。
                </p>
                <p>
                    合格率分布情况：
                    <span className="text-green-600 font-medium">高准确率(≥80%) {stats.distribution.high} 天</span> (占比 {((stats.distribution.high / results.length) * 100).toFixed(1)}%)，
                    <span className="text-yellow-600 font-medium">中等(60-80%) {stats.distribution.medium} 天</span>，
                    <span className="text-red-600 font-medium">低准确率(&lt;60%) {stats.distribution.low} 天</span>。
                </p>
                
                {/* New Monthly Analysis Paragraph */}
                {analysisText && monthlyStats.length > 1 && (
                    <div className="pt-2 border-t border-slate-200 mt-2">
                        <p className="mb-1 font-semibold text-slate-800 flex items-center">
                             月度对比分析：
                        </p>
                        <p>
                            各月平均准确率分别为：{analysisText.detailStr}。
                        </p>
                        <div className="mt-2 flex items-start gap-4 p-3 bg-white border border-slate-100 rounded-md">
                             <div className="flex items-center text-green-700">
                                <TrendingUp className="w-4 h-4 mr-1" />
                                <span>表现最佳：<strong>{analysisText.best.month}</strong> ({(analysisText.best.meanAccuracy * 100).toFixed(2)}%)</span>
                             </div>
                             <div className="w-px h-4 bg-slate-300 mx-2 hidden sm:block"></div>
                             <div className="flex items-center text-red-700">
                                <TrendingDown className="w-4 h-4 mr-1" />
                                <span>表现最差：<strong>{analysisText.worst.month}</strong> ({(analysisText.worst.meanAccuracy * 100).toFixed(2)}%)</span>
                             </div>
                             <div className="w-px h-4 bg-slate-300 mx-2 hidden sm:block"></div>
                             <span className="text-slate-500">极差：{analysisText.diff.toFixed(2)}%</span>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Monthly Breakdown Table */}
        <div>
            <h4 className="text-base font-semibold text-slate-700 mb-2 border-l-4 border-indigo-500 pl-2">
                月度详细数据表
            </h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-100">
                        <tr>
                            <th className="px-4 py-2 text-left font-medium text-slate-500">月份</th>
                            <th className="px-4 py-2 text-left font-medium text-slate-500">天数</th>
                            <th className="px-4 py-2 text-left font-medium text-slate-500">平均准确率</th>
                            <th className="px-4 py-2 text-left font-medium text-slate-500">平均 RMSE</th>
                            <th className="px-4 py-2 text-left font-medium text-slate-500">分布 (高/中/低)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {monthlyStats.map((stat) => (
                            <tr key={stat.month} className="hover:bg-slate-50 transition">
                                <td className="px-4 py-2 font-medium text-slate-700">{stat.month}</td>
                                <td className="px-4 py-2 text-slate-600">{stat.daysCount}</td>
                                <td className="px-4 py-2">
                                    <span className={`font-bold ${stat.meanAccuracy >= 0.8 ? 'text-green-600' : stat.meanAccuracy >= 0.6 ? 'text-yellow-600' : 'text-red-600'}`}>
                                        {(stat.meanAccuracy * 100).toFixed(2)}%
                                    </span>
                                </td>
                                <td className="px-4 py-2 text-slate-600">{stat.meanRmse.toFixed(2)}</td>
                                <td className="px-4 py-2 text-slate-500 text-xs">
                                    <span className="text-green-600 font-semibold">{stat.distribution.high}</span> / 
                                    <span className="text-yellow-600 font-semibold mx-1">{stat.distribution.medium}</span> / 
                                    <span className="text-red-600 font-semibold">{stat.distribution.low}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SummaryReport;