import React, { useMemo, useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { DailyResult, CalculationStats } from '../types';
import { X, Maximize2, Calendar, PieChart as PieChartIcon, Activity, Settings2, AlertCircle } from 'lucide-react';
import { mean } from '../services/mathUtils';

interface AccuracyChartsProps {
  results: DailyResult[];
  stats: CalculationStats;
}

const COLORS = ['#10B981', '#F59E0B', '#EF4444']; // Green, Yellow, Red

// Helper to format chart data
const formatChartData = (data: DailyResult[]) => {
    return data.map(r => ({
        ...r,
        accuracyPct: parseFloat((r.accuracy * 100).toFixed(2)),
        shortDate: r.date.substring(8), // DD only for monthly view, or MM-DD for full
        fullShortDate: r.date.substring(5) // MM-DD
    }));
};

const AccuracyCharts: React.FC<AccuracyChartsProps> = ({ results, stats }) => {
  // --- State for Dynamic Thresholds ---
  const [thresholds, setThresholds] = useState({ high: 80, medium: 60 });
  const [isEditingThresholds, setIsEditingThresholds] = useState(false);

  // --- Modal State ---
  const [zoomedView, setZoomedView] = useState<{
      type: 'trend' | 'distribution';
      month: string;
      data: DailyResult[];
      stats?: any;
  } | null>(null);

  // --- Dynamic Calculations based on Local Thresholds ---
  
  // 1. Overall Distribution (Re-calculated locally to support dynamic changes)
  const pieData = useMemo(() => {
    const highThres = thresholds.high / 100;
    const medThres = thresholds.medium / 100;

    const high = results.filter(r => r.accuracy >= highThres).length;
    const medium = results.filter(r => r.accuracy >= medThres && r.accuracy < highThres).length;
    const low = results.filter(r => r.accuracy < medThres).length;

    return [
      { name: `高 (≥${thresholds.high}%)`, value: high },
      { name: `中 (${thresholds.medium}-${thresholds.high}%)`, value: medium },
      { name: `低 (<${thresholds.medium}%)`, value: low },
    ].filter(d => d.value > 0); // Hide zero sections
  }, [results, thresholds]);

  // Overall Trend Data
  const overallChartData = useMemo(() => formatChartData(results), [results]);

  // 2. Monthly Grouping (With dynamic distribution stats)
  const monthlyGroups = useMemo(() => {
    const highThres = thresholds.high / 100;
    const medThres = thresholds.medium / 100;
    
    const grouped: Record<string, DailyResult[]> = {};
    results.forEach(r => {
        const m = r.date.substring(0, 7);
        if (!grouped[m]) grouped[m] = [];
        grouped[m].push(r);
    });

    return Object.keys(grouped).sort().map(m => {
        const data = grouped[m];
        const meanAcc = mean(data.map(d => d.accuracy));
        
        return {
            month: m,
            data: data,
            meanAccuracy: meanAcc,
            chartData: formatChartData(data),
            distStats: [
                { name: `高`, value: data.filter(d => d.accuracy >= highThres).length },
                { name: `中`, value: data.filter(d => d.accuracy >= medThres && d.accuracy < highThres).length },
                { name: `低`, value: data.filter(d => d.accuracy < medThres).length },
            ]
        };
    });
  }, [results, thresholds]);

  // --- Handlers ---
  const handleThresholdChange = (key: 'high' | 'medium', value: string) => {
      const num = parseInt(value);
      if (isNaN(num)) return;
      // Simple validation handled in UI feedback or clamp
      setThresholds(prev => ({ ...prev, [key]: num }));
  };

  // --- Zoom Modal Component ---
  const renderModal = () => {
      if (!zoomedView) return null;
      
      const { type, month, data, stats: modalStats } = zoomedView;
      const formattedData = formatChartData(data);

      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[500px] flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                      <div className="flex items-center space-x-2">
                          <Calendar className="w-5 h-5 text-blue-600" />
                          <h3 className="text-xl font-bold text-slate-800">
                              {month} - {type === 'trend' ? '准确率趋势放大视图' : '准确率分布放大视图'}
                          </h3>
                      </div>
                      <button 
                        onClick={() => setZoomedView(null)}
                        className="p-2 hover:bg-slate-200 rounded-full transition"
                      >
                          <X className="w-6 h-6 text-slate-500" />
                      </button>
                  </div>
                  <div className="flex-1 p-6 bg-white">
                      <ResponsiveContainer width="100%" height="100%">
                          {type === 'trend' ? (
                            <LineChart data={formattedData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="fullShortDate" stroke="#64748B" />
                                <YAxis domain={[0, 100]} unit="%" />
                                <Tooltip contentStyle={{ borderRadius: '8px' }} />
                                <Legend />
                                <Line type="monotone" dataKey="accuracyPct" name="准确率 (%)" stroke="#3B82F6" strokeWidth={3} dot={{r:4}} activeDot={{r:8}} />
                            </LineChart>
                          ) : (
                            <PieChart>
                                <Pie
                                    data={modalStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={140}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({name, value}) => `${name}: ${value}天`}
                                >
                                    {modalStats.map((entry: any, index: number) => {
                                        // Match colors based on name if filtered
                                        let colorIdx = 0; // default Green
                                        if (entry.name.includes('中')) colorIdx = 1;
                                        if (entry.name.includes('低')) colorIdx = 2;
                                        return <Cell key={`cell-${index}`} fill={COLORS[colorIdx]} />;
                                    })}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                          )}
                      </ResponsiveContainer>
                  </div>
              </div>
          </div>
      );
  };

  return (
    <div className="space-y-8 mb-8">
      {renderModal()}

      {/* 1. Overall Big Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Trend Line */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow border border-slate-200">
          <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-blue-500" />
                总体准确率趋势 (Overall Trend)
             </h3>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overallChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="fullShortDate" stroke="#64748B" fontSize={12} minTickGap={30} />
                <YAxis domain={[0, 100]} stroke="#64748B" fontSize={12} unit="%" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="accuracyPct" 
                  name="准确率 (%)" 
                  stroke="#3B82F6" 
                  strokeWidth={2} 
                  dot={{ r: 2, fill: '#3B82F6' }} 
                  activeDot={{ r: 6 }} 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Overall Distribution Pie with Configuration */}
        <div className="bg-white p-6 rounded-lg shadow border border-slate-200 flex flex-col">
          <div className="flex justify-between items-start mb-2">
             <h3 className="text-lg font-semibold text-slate-800 flex items-center">
                 <PieChartIcon className="w-5 h-5 mr-2 text-orange-500" />
                 总体分布
             </h3>
             <button 
                onClick={() => setIsEditingThresholds(!isEditingThresholds)}
                className={`p-1 rounded hover:bg-slate-100 transition ${isEditingThresholds ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}
                title="修改统计区间"
             >
                <Settings2 className="w-5 h-5" />
             </button>
          </div>
          
          {/* Threshold Editor */}
          {isEditingThresholds && (
              <div className="mb-4 bg-slate-50 p-3 rounded border border-slate-200 text-sm animate-fade-in">
                  <div className="flex items-center space-x-2 mb-2 text-slate-600">
                      <Settings2 className="w-3 h-3" />
                      <span className="font-bold">自定义统计区间 (%)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="block text-xs text-slate-500 mb-1 text-green-600 font-medium">高准确率 (≥)</label>
                          <input 
                            type="number" min="0" max="100" 
                            value={thresholds.high}
                            onChange={(e) => handleThresholdChange('high', e.target.value)}
                            className="w-full border-slate-300 rounded px-2 py-1 text-xs focus:ring-green-500"
                          />
                      </div>
                      <div>
                          <label className="block text-xs text-slate-500 mb-1 text-yellow-600 font-medium">中准确率 (≥)</label>
                          <input 
                            type="number" min="0" max="100" 
                            value={thresholds.medium}
                            onChange={(e) => handleThresholdChange('medium', e.target.value)}
                            className="w-full border-slate-300 rounded px-2 py-1 text-xs focus:ring-yellow-500"
                          />
                      </div>
                  </div>
                  {thresholds.high <= thresholds.medium && (
                      <div className="flex items-center text-red-500 text-[10px] mt-2">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          高阈值必须大于中阈值
                      </div>
                  )}
              </div>
          )}

          <div className="flex-1 min-h-[200px] flex flex-col justify-center items-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => {
                      // Logic to map dynamic names to fixed colors
                      let colorIdx = 0; 
                      if (entry.name.includes('中')) colorIdx = 1;
                      if (entry.name.includes('低')) colorIdx = 2;
                      return <Cell key={`cell-${index}`} fill={COLORS[colorIdx]} />;
                  })}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconSize={10} wrapperStyle={{fontSize: '11px'}}/>
              </PieChart>
            </ResponsiveContainer>
            
            {!isEditingThresholds && (
                <div className="text-center mt-2">
                    <span className="text-3xl font-bold text-slate-700">{(stats.meanAccuracy * 100).toFixed(1)}%</span>
                    <p className="text-xs text-slate-500">平均准确率</p>
                </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Monthly Trend Grid (Small Multiples) */}
      {monthlyGroups.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow border border-slate-200">
              <div className="mb-4 pb-2 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center">
                      <Calendar className="w-5 h-5 mr-2 text-indigo-500" />
                      月度准确率趋势图 (Monthly Trends)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">点击任意图表可放大查看详情</p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {monthlyGroups.map((group) => (
                      <div 
                        key={group.month} 
                        className="border border-slate-100 rounded-lg p-3 hover:shadow-md transition cursor-pointer group bg-slate-50 hover:bg-white relative flex flex-col"
                        onClick={() => setZoomedView({ type: 'trend', month: group.month, data: group.data })}
                      >
                          <div className="flex justify-between items-center mb-2">
                              <span className="font-semibold text-sm text-slate-700">{group.month}</span>
                              <Maximize2 className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
                          </div>
                          <div className="h-28">
                              <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={group.chartData}>
                                      <Line type="monotone" dataKey="accuracyPct" stroke="#3B82F6" strokeWidth={2} dot={false} />
                                      <YAxis domain={[0, 100]} hide />
                                      <XAxis dataKey="shortDate" hide />
                                      <Tooltip labelStyle={{fontSize:'10px'}} itemStyle={{fontSize:'10px'}} />
                                  </LineChart>
                              </ResponsiveContainer>
                          </div>
                          {/* Average Accuracy Label */}
                          <div className="mt-2 pt-2 border-t border-slate-100 text-center">
                              <span className="text-xs text-slate-500 mr-2">平均:</span>
                              <span className={`text-sm font-bold ${
                                  group.meanAccuracy >= (thresholds.high/100) ? 'text-green-600' : 
                                  group.meanAccuracy >= (thresholds.medium/100) ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                  {(group.meanAccuracy * 100).toFixed(2)}%
                              </span>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* 3. Monthly Distribution Grid (Small Multiples) */}
      {monthlyGroups.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow border border-slate-200">
              <div className="mb-4 pb-2 border-b border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center">
                      <PieChartIcon className="w-5 h-5 mr-2 text-purple-500" />
                      月度准确率分布图 (Monthly Distribution)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                      统计区间: 高≥{thresholds.high}%, 中≥{thresholds.medium}%
                  </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {monthlyGroups.map((group) => (
                      <div 
                        key={group.month} 
                        className="border border-slate-100 rounded-lg p-3 hover:shadow-md transition cursor-pointer group bg-slate-50 hover:bg-white relative flex flex-col h-56"
                        onClick={() => setZoomedView({ type: 'distribution', month: group.month, data: group.data, stats: group.distStats })}
                      >
                          <div className="flex justify-between items-center mb-2">
                              <span className="font-semibold text-sm text-slate-700">{group.month}</span>
                              <Maximize2 className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
                          </div>
                          <div className="h-32 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                      <Pie
                                          data={group.distStats}
                                          cx="50%"
                                          cy="50%"
                                          innerRadius="50%"
                                          outerRadius="80%"
                                          dataKey="value"
                                          isAnimationActive={false}
                                      >
                                          {group.distStats.map((entry, index) => {
                                              let colorIdx = 0; 
                                              if (entry.name.includes('中')) colorIdx = 1;
                                              if (entry.name.includes('低')) colorIdx = 2;
                                              return <Cell key={`cell-${index}`} fill={COLORS[colorIdx]} />;
                                          })}
                                      </Pie>
                                      <Tooltip />
                                  </PieChart>
                              </ResponsiveContainer>
                          </div>
                          
                          {/* Detailed Legend for Small Charts */}
                          <div className="mt-auto grid grid-cols-3 gap-1 border-t border-slate-100 pt-2">
                              {['高', '中', '低'].map((label, i) => {
                                  const stat = group.distStats.find(s => s.name.startsWith(label));
                                  return (
                                      <div key={label} className="flex flex-col items-center justify-center">
                                          <div className="flex items-center text-[10px] text-slate-400 mb-0.5">
                                              <div className="w-1.5 h-1.5 rounded-full mr-1" style={{backgroundColor: COLORS[i]}}></div>
                                              {label}
                                          </div>
                                          <span className="text-xs font-semibold text-slate-700">
                                              {stat ? stat.value : 0}
                                          </span>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}

      {/* 4. Power Comparison */}
      <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">日均功率对比 (Daily Average Power MW)</h3>
        <div className="h-64">
           <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={overallChartData}>
              <defs>
                <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorFore" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#82ca9d" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="fullShortDate" stroke="#64748B" fontSize={12} minTickGap={30} />
              <YAxis stroke="#64748B" fontSize={12} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="avgReal" name="实际功率" stroke="#8884d8" fillOpacity={1} fill="url(#colorReal)" />
              <Area type="monotone" dataKey="avgFore" name="预测功率" stroke="#82ca9d" fillOpacity={1} fill="url(#colorFore)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AccuracyCharts;