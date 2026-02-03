import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Activity, LayoutDashboard, Database, ArrowRight, Filter, ChevronDown, Check, Play, Settings, FileText, ChevronRight, ChevronLeft, Loader2, Braces, ArrowRightLeft } from 'lucide-react';
import FileUpload from './components/FileUpload';
import Controls from './components/Controls';
import AccuracyCharts from './components/AccuracyCharts';
import DataTable from './components/DataTable';
import SummaryReport from './components/SummaryReport';
import DataPreview from './components/DataPreview';
import FormulaEditor from './components/FormulaEditor';
import { DataPoint, Region, CalculationParams, DailyResult, CalculationStats, RawRow } from './types';
import { getFormulaDefaultCode, executeCustomFormula, initPyodide } from './services/formulas';
import { mean, rmse, mae } from './services/mathUtils';

// Helper to get YYYY-MM-DD from timestamp in Local Time
const toLocalDate = (timestamp: number) => {
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const App: React.FC = () => {
  // --- Wizard State ---
  const [step, setStep] = useState<number>(1); // 1: Data, 2: Config, 3: Results

  // --- Data State ---
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  
  // Step 1 Config
  const [realCol, setRealCol] = useState<string>('');
  const [foreCols, setForeCols] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<{start: string, end: string}>({ start: '', end: '' });
  const [isMultiSelectOpen, setIsMultiSelectOpen] = useState(false);
  const multiSelectRef = useRef<HTMLDivElement>(null);

  // Step 2 Config
  const [region, setRegion] = useState<Region>('Shanxi');
  const [params, setParams] = useState<CalculationParams>({
    cap: 100, 
    threshold: 0.03,
    ignoreDeadBand: true
  });
  const [customFormula, setCustomFormula] = useState<string>('');
  const [isCalculating, setIsCalculating] = useState<boolean>(false);

  // Step 3 Results
  const [results, setResults] = useState<DailyResult[]>([]);
  const [stats, setStats] = useState<CalculationStats | null>(null);

  // --- Effects ---

  // Preload Pyodide
  useEffect(() => {
    initPyodide().catch(err => console.log('Pyodide loading...'));
  }, []);

  // Handle outside click for dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (multiSelectRef.current && !multiSelectRef.current.contains(event.target as Node)) {
        setIsMultiSelectOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update threshold defaults and Formula Code when region changes
  useEffect(() => {
    if (region === 'Northeast') {
      setParams(p => ({ ...p, threshold: 0.10 }));
    } else if (region === 'Northwest') {
      setParams(p => ({ ...p, threshold: 0.03 }));
    }
    // Update the editor code to the default for the new region
    setCustomFormula(getFormulaDefaultCode(region));
  }, [region]);

  const handleDataLoaded = (rows: RawRow[], headers: string[]) => {
    setRawRows(rows);
    setCsvHeaders(headers);

    const lowerHeaders = headers.map(h => h.toLowerCase());
    const realCandidate = headers[lowerHeaders.findIndex(h => h.includes('real') || h.includes('actual') || h.includes('实际') || h.includes('power'))] || headers[1];
    setRealCol(realCandidate);

    let selectedForeCols: string[] = [];
    const valCols = headers.filter(h => h.toLowerCase().startsWith('val_'));
    const foreCandidates = headers.filter(h => {
        const lower = h.toLowerCase();
        return lower.includes('fore') || lower.includes('pred') || lower.includes('预测');
    });

    if (valCols.length > 0) selectedForeCols = valCols;
    else if (foreCandidates.length > 0) selectedForeCols = foreCandidates;
    else selectedForeCols = [headers[2] || headers[headers.length-1]];

    setForeCols(selectedForeCols);

    if (rows.length > 0) {
      // Use toLocalDate to avoid timezone shifts (UTC vs Local)
      const start = toLocalDate(rows[0].timestamp);
      const end = toLocalDate(rows[rows.length - 1].timestamp);
      setDateRange({ start, end });
    }

    const maxVal = Math.max(...rows.map(r => typeof r[realCandidate] === 'number' ? r[realCandidate] as number : 0));
    setParams(prev => ({ ...prev, cap: Math.ceil(maxVal * 1.1) || 100 }));
  };

  const toggleForeCol = (col: string) => {
    setForeCols(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  // --- Helpers for Step 2 ---
  
  // Calculate a sample day of data to pass to the Editor for "Test Run"
  const editorSampleData = useMemo(() => {
    if (rawRows.length === 0 || !realCol || foreCols.length === 0) return null;
    
    // 1. Find the first valid date within range using Local Time
    const validRow = rawRows.find(r => {
        const d = toLocalDate(r.timestamp);
        return d >= dateRange.start && d <= dateRange.end;
    });

    if (!validRow) return null;

    const sampleDate = toLocalDate(validRow.timestamp);
    const dayRows = rawRows.filter(r => toLocalDate(r.timestamp) === sampleDate);
    
    // 2. Extract arrays
    const real = dayRows.map(r => Number(r[realCol]) || 0);
    const foreRaw = dayRows.map(r => foreCols.map(c => Number(r[c]) || 0));
    const fore = foreRaw.map(row => row.length > 0 ? mean(row) : 0);

    return {
        date: sampleDate,
        real,
        fore,
        foreRaw,
        cap: params.cap,
        threshold: params.threshold
    };
  }, [rawRows, realCol, foreCols, params.cap, params.threshold, dateRange]);


  // --- Calculation Logic (Async Triggered on Step 2 -> 3) ---
  const handleCalculate = async () => {
    if (rawRows.length === 0 || !realCol || foreCols.length === 0) return;

    setIsCalculating(true);

    // 1. Prepare Data
    const activeData: DataPoint[] = [];
    for (const row of rawRows) {
      const rowDateStr = toLocalDate(row.timestamp);
      if (rowDateStr < dateRange.start || rowDateStr > dateRange.end) continue;

      const realVal = Number(row[realCol]) || 0;
      const currentForecasts = foreCols.map(col => Number(row[col]) || 0);
      const avgFore = currentForecasts.length > 0 ? mean(currentForecasts) : 0;

      activeData.push({
        time: row.time,
        timestamp: row.timestamp,
        real: realVal,
        forecast: avgFore,
        forecasts: currentForecasts
      });
    }

    if (activeData.length === 0) {
      alert("No data found in the selected date range.");
      setIsCalculating(false);
      return;
    }

    // 2. Group by Date (Local Time)
    const grouped: Record<string, DataPoint[]> = {};
    activeData.forEach(pt => {
      const dateKey = toLocalDate(pt.timestamp);
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(pt);
    });

    // 3. Calculate Daily using CUSTOM PYTHON FORMULA
    const sortedDates = Object.keys(grouped).sort();
    
    // We compute this in a non-blocking way for the UI if possible, 
    // but Pyodide in main thread blocks. We wrap in setTimeout to allow render cycle to show loading state.
    setTimeout(async () => {
      try {
        // Execute sequentially to avoid race conditions with Pyodide globals
        const dailyResults: DailyResult[] = [];

        for (const date of sortedDates) {
          const dayData = grouped[date];
          const real = dayData.map(d => d.real);
          const fore = dayData.map(d => d.forecast); // Average forecast
          const foreRaw = dayData.map(d => d.forecasts); // Matrix forecast
          
          // EXECUTE CUSTOM PYTHON FORMULA
          const acc = await executeCustomFormula(
            customFormula, 
            real, 
            fore, 
            params.cap, 
            params.threshold,
            foreRaw
          );
          
          dailyResults.push({
            date,
            accuracy: acc,
            mae: mae(real, fore),
            rmse: rmse(real, fore),
            avgReal: mean(real),
            avgFore: mean(fore)
          });
        }

        setResults(dailyResults);

        // 4. Calculate Stats
        const accuracies = dailyResults.map(r => r.accuracy);
        if (accuracies.length > 0) {
          setStats({
            meanAccuracy: mean(accuracies),
            maxAccuracy: Math.max(...accuracies),
            minAccuracy: Math.min(...accuracies),
            stdDev: Math.sqrt(mean(accuracies.map(a => Math.pow(a - mean(accuracies), 2)))),
            distribution: {
              high: accuracies.filter(a => a >= 0.8).length,
              medium: accuracies.filter(a => a >= 0.6 && a < 0.8).length,
              low: accuracies.filter(a => a < 0.6).length
            }
          });
        }

        setStep(3); // Move to results
      } catch (error) {
        console.error(error);
        alert("计算过程中发生错误，请检查 Python 代码语法。\n详细错误信息请查看控制台。");
      } finally {
        setIsCalculating(false);
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12 font-inter">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-800">PowerSight 准确率分析系统</h1>
          </div>
          
          {/* Step Indicator */}
          <div className="hidden md:flex items-center space-x-4">
             <div className={`flex items-center ${step >= 1 ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 border ${step >= 1 ? 'border-blue-600 bg-blue-50' : 'border-slate-300'}`}>1</div>
                数据配置
             </div>
             <ChevronRight className="w-4 h-4 text-slate-300" />
             <div className={`flex items-center ${step >= 2 ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 border ${step >= 2 ? 'border-blue-600 bg-blue-50' : 'border-slate-300'}`}>2</div>
                参数与公式
             </div>
             <ChevronRight className="w-4 h-4 text-slate-300" />
             <div className={`flex items-center ${step >= 3 ? 'text-blue-600 font-semibold' : 'text-slate-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 border ${step >= 3 ? 'border-blue-600 bg-blue-50' : 'border-slate-300'}`}>3</div>
                结果分析
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Step 1: Upload & Data Config */}
        {step === 1 && (
          <div className="animate-fade-in">
             {rawRows.length === 0 ? (
                <div className="mt-10">
                   <div className="text-center mb-8">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">第一步：导入与配置数据</h2>
                    <p className="mt-4 text-lg text-slate-500">上传场站 CSV 数据，配置参与计算的列。</p>
                  </div>
                  <FileUpload onDataLoaded={handleDataLoaded} />
                </div>
             ) : (
                <div className="space-y-6">
                   {/* Config Toolbar */}
                   <div className="bg-white p-6 rounded-lg shadow border border-slate-200">
                      <div className="flex items-center justify-between mb-4">
                         <h2 className="text-lg font-bold text-slate-800 flex items-center">
                            <Database className="w-5 h-5 mr-2 text-blue-500" />
                            列映射与筛选
                         </h2>
                         <button onClick={() => setRawRows([])} className="text-sm text-red-500 hover:text-red-700">
                            重新上传
                         </button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">实测功率列 (Real)</label>
                            <select 
                              value={realCol} 
                              onChange={e => setRealCol(e.target.value)}
                              className="w-full border-slate-300 rounded-md shadow-sm p-2 border focus:ring-blue-500"
                            >
                              {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>

                          <div ref={multiSelectRef} className="relative">
                            <label className="block text-sm font-medium text-slate-700 mb-2">预测功率列 (Forecast)</label>
                            <button 
                                type="button" 
                                className="w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default sm:text-sm"
                                onClick={() => setIsMultiSelectOpen(!isMultiSelectOpen)}
                            >
                                <span className="block truncate">
                                {foreCols.length === 0 ? '选择列...' : `已选 ${foreCols.length} 列`}
                                </span>
                                <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                                </span>
                            </button>
                            {isMultiSelectOpen && (
                              <div className="absolute z-30 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto sm:text-sm">
                                {csvHeaders.map((header) => (
                                    <div 
                                      key={header}
                                      className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-blue-50 ${foreCols.includes(header) ? 'text-blue-900 bg-blue-50' : 'text-gray-900'}`}
                                      onClick={() => toggleForeCol(header)}
                                    >
                                      <span className={`block truncate ${foreCols.includes(header) ? 'font-semibold' : 'font-normal'}`}>{header}</span>
                                      {foreCols.includes(header) && (
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                                          <Check className="h-4 w-4" />
                                        </span>
                                      )}
                                    </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                             <label className="block text-sm font-medium text-slate-700 mb-2">时间范围筛选</label>
                             <div className="flex space-x-2">
                                <input 
                                  type="date" 
                                  value={dateRange.start}
                                  onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                  className="w-1/2 border-slate-300 rounded-md shadow-sm p-2 border"
                                />
                                <input 
                                  type="date" 
                                  value={dateRange.end}
                                  onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                  className="w-1/2 border-slate-300 rounded-md shadow-sm p-2 border"
                                />
                             </div>
                          </div>
                      </div>
                   </div>

                   {/* Data Preview */}
                   <DataPreview data={rawRows} realCol={realCol} foreCols={foreCols} dateRange={dateRange} />

                   <div className="flex justify-end mt-6">
                      <button 
                         onClick={() => setStep(2)}
                         disabled={!realCol || foreCols.length === 0}
                         className="flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                         下一步：配置参数与公式
                         <ArrowRight className="ml-2 w-5 h-5" />
                      </button>
                   </div>
                </div>
             )}
          </div>
        )}

        {/* Step 2: Configuration & Formula */}
        {step === 2 && (
            <div className="animate-fade-in space-y-6">
                <div className="flex items-center justify-between mb-2">
                     <button onClick={() => setStep(1)} className="flex items-center text-slate-500 hover:text-blue-600">
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        返回数据配置
                     </button>
                     <h2 className="text-2xl font-bold text-slate-800">第二步：配置计算逻辑</h2>
                </div>

                {/* Data Mapping Visual Guide */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                   <div className="flex items-center space-x-2 text-indigo-900 font-semibold">
                      <Braces className="w-5 h-5" />
                      <span>变量映射指南</span>
                   </div>
                   <div className="flex-1 flex flex-col md:flex-row items-center gap-4 text-sm w-full md:w-auto">
                      <div className="flex items-center bg-white px-3 py-2 rounded border border-indigo-100 shadow-sm flex-1 w-full md:w-auto">
                         <span className="text-slate-500 mr-2">CSV 列 [{realCol}]</span>
                         <ArrowRightLeft className="w-3 h-3 text-indigo-400 mx-2" />
                         <span className="font-mono font-bold text-green-600 bg-green-50 px-1 rounded">real</span>
                         <span className="ml-2 text-xs text-slate-400">(List)</span>
                      </div>
                      <div className="flex items-center bg-white px-3 py-2 rounded border border-indigo-100 shadow-sm flex-1 w-full md:w-auto">
                         <span className="text-slate-500 mr-2">CSV 列 [{foreCols.length > 1 ? 'Multiple' : foreCols[0]}]</span>
                         <ArrowRightLeft className="w-3 h-3 text-indigo-400 mx-2" />
                         <span className="font-mono font-bold text-green-600 bg-green-50 px-1 rounded">fore</span>
                         <span className="ml-2 text-xs text-slate-400">(List)</span>
                      </div>
                      <div className="flex items-center bg-white px-3 py-2 rounded border border-indigo-100 shadow-sm flex-1 w-full md:w-auto">
                         <span className="text-slate-500 mr-2">装机容量 {params.cap}MW</span>
                         <ArrowRightLeft className="w-3 h-3 text-indigo-400 mx-2" />
                         <span className="font-mono font-bold text-yellow-600 bg-yellow-50 px-1 rounded">cap</span>
                         <span className="ml-2 text-xs text-slate-400">(Float)</span>
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Col: Controls */}
                    <div className="lg:col-span-4">
                        <Controls 
                            region={region} 
                            setRegion={setRegion} 
                            params={params} 
                            setParams={setParams} 
                            dataLoaded={true}
                        />
                         <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mt-4">
                            <h4 className="font-bold text-slate-800 mb-2 text-sm flex items-center">
                                <Check className="w-4 h-4 text-green-500 mr-2" />
                                使用说明
                            </h4>
                            <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                                <li><strong>左侧配置</strong>仅用于设置公式中使用的常数 (如 Cap)。</li>
                                <li><strong>右侧代码</strong>是实际执行的逻辑。选择区域会加载该区域的<strong>默认模板</strong>。</li>
                                <li>您可以直接修改 Python 代码，或使用 <strong>AI 助手</strong>用自然语言生成代码。</li>
                                <li>修改后，点击 <strong>"测试运行 (Test Run)"</strong> 按钮，系统会使用第一天的数据进行预演，确保逻辑无误。</li>
                            </ul>
                        </div>
                    </div>
                    
                    {/* Right Col: Formula Editor */}
                    <div className="lg:col-span-8 h-[600px]">
                        <FormulaEditor 
                          region={region} 
                          code={customFormula} 
                          setCode={setCustomFormula} 
                          sampleData={editorSampleData} 
                        />
                    </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-200">
                    <button 
                        onClick={handleCalculate}
                        disabled={isCalculating}
                        className="flex items-center px-8 py-3 bg-green-600 text-white font-bold rounded-lg shadow-lg hover:bg-green-700 hover:shadow-xl transform hover:-translate-y-0.5 transition disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {isCalculating ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            计算全量数据 (Python Engine)...
                          </>
                        ) : (
                          <>
                            <Play className="w-5 h-5 mr-2" />
                            开始计算并生成报表
                          </>
                        )}
                    </button>
                </div>
            </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && stats && (
            <div className="animate-fade-in space-y-6">
                <div className="flex items-center justify-between">
                     <button onClick={() => setStep(2)} className="flex items-center text-slate-500 hover:text-blue-600">
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        返回参数配置
                     </button>
                     <h2 className="text-2xl font-bold text-slate-800">第三步：分析结果</h2>
                </div>

                <SummaryReport 
                  results={results} 
                  stats={stats} 
                  startDate={dateRange.start} 
                  endDate={dateRange.end} 
                />
                
                <AccuracyCharts results={results} stats={stats} />
                
                <DataTable results={results} />
            </div>
        )}

      </main>
    </div>
  );
};

export default App;