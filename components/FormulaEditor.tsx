import React, { useState, useEffect } from 'react';
import { Code, RotateCcw, Play, Check, AlertCircle, Plus, Table2, FunctionSquare, ArrowDown, Calculator } from 'lucide-react';
import { generateBatchScript, runRowPreview } from '../services/formulas';
import { Region } from '../types';

interface FormulaEditorProps {
  region: Region;
  code: string;
  setCode: (code: string) => void;
  sampleData: {
      date: string;
      real: number[];
      fore: number[];
      foreRaw: number[][];
      cap: number;
      threshold: number;
  } | null;
}

// Default row logic templates
const ROW_TEMPLATES: Record<string, string> = {
  'Shanxi': `# 变量说明: real(实测值), fore(预测均值), cap(容量)
diff = real - fore
weight = abs(diff) # 权重暂时存为中间变量，最后聚合时使用
# 山西规则较复杂，通常建议使用完整脚本模式，但在原子模式下，
# 我们可以计算单点的 (R-F)^2 * |R-F|
result = (diff ** 2) * abs(diff)`,
  
  'Northeast': `# 变量说明: real(实测), fore_list(预测列表), cap(容量)
import numpy as np

# 1. 获取该时刻的预测均值 (fore_list 是该时刻的多家预测值列表)
mean_fore = np.mean(fore_list)

# 2. 判断死区 (实测和预测均值都小于 10% Cap)
if real < cap * 0.1 and mean_fore < cap * 0.1:
    result = 0.0
else:
    # 3. 计算归一化误差
    if mean_fore == 0:
        result = 0.0
    else:
        err = abs((mean_fore - real) / mean_fore)
        result = min(err, 1.0) # 误差最大限制为 1

# 结果 result 将被收集，最后取均值计算准确率`,

  'General': `diff = abs(real - fore)
result = diff ** 2  # 计算平方误差`
};

const FormulaEditor: React.FC<FormulaEditorProps> = ({ region, code, setCode, sampleData }) => {
  // Mode: 'atomic' (Table based) or 'script' (Full Python)
  // We infer mode. If code looks like a full script (has imports, or loops), it's script mode.
  // But for this UI update, we default to Atomic builder and generate the script.
  
  const [rowLogic, setRowLogic] = useState(ROW_TEMPLATES[region === 'Northeast' ? 'Northeast' : region === 'Shanxi' ? 'Shanxi' : 'General']);
  const [aggMethod, setAggMethod] = useState<'mean' | 'sum' | 'rmse' | 'custom'>('mean');
  const [previewResults, setPreviewResults] = useState<(number | string)[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Sync initial logic when region changes
  useEffect(() => {
    // Only reset if it looks like we changed regions fresh
    if (region === 'Northeast') {
        setRowLogic(ROW_TEMPLATES['Northeast']);
        setAggMethod('mean'); // 1 - mean(errors)
    } else if (region === 'Shanxi') {
        setRowLogic(ROW_TEMPLATES['Shanxi']);
        setAggMethod('rmse'); // specialized
    } else {
        setRowLogic(ROW_TEMPLATES['General']);
        setAggMethod('rmse');
    }
  }, [region]);

  // Run Preview on the Sample Data (First 10 rows) whenever row logic changes
  useEffect(() => {
    if (!sampleData) return;

    const timer = setTimeout(async () => {
        setIsRunning(true);
        setPreviewError(null);
        try {
            // Run on top 10 rows
            const limit = 10;
            const inputs = {
                real: sampleData.real.slice(0, limit),
                fore: sampleData.fore.slice(0, limit),
                fore_list: sampleData.foreRaw.slice(0, limit),
                cap: sampleData.cap,
                threshold: sampleData.threshold
            };
            
            const results = await runRowPreview(rowLogic, inputs);
            setPreviewResults(results);
            
            // Also update the Global Full Script code used by the main app
            const fullScript = generateBatchScript(rowLogic, aggMethod, region);
            setCode(fullScript);

        } catch (err: any) {
            setPreviewError(err.message);
            setPreviewResults([]);
        } finally {
            setIsRunning(false);
        }
    }, 800); // Debounce

    return () => clearTimeout(timer);
  }, [rowLogic, aggMethod, sampleData, region, setCode]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden">
      
      {/* 1. Top Section: Data Preview Table (Excel-like) */}
      <div className="flex-1 bg-slate-50 flex flex-col min-h-0 border-b-4 border-slate-200">
        <div className="px-4 py-2 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm z-10">
            <div className="flex items-center space-x-2">
                <Table2 className="w-5 h-5 text-green-600" />
                <h3 className="font-bold text-slate-700 text-sm">逻辑验证预览 (前10行)</h3>
            </div>
            {sampleData && (
                <div className="text-xs text-slate-500">
                    Cap: <span className="font-mono font-bold">{sampleData.cap}</span> | 
                    Date: {sampleData.date}
                </div>
            )}
        </div>
        
        <div className="flex-1 overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 border-separate" style={{borderSpacing: 0}}>
                <thead className="bg-slate-100 sticky top-0 z-10">
                    <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 border-b border-slate-200 w-16">Row</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 border-b border-slate-200 bg-green-50">
                            real <br/><span className="text-[10px] font-normal text-slate-400">实测值</span>
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 border-b border-slate-200 bg-blue-50">
                            fore <br/><span className="text-[10px] font-normal text-slate-400">预测均值</span>
                        </th>
                         <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 border-b border-slate-200 bg-indigo-50 w-32">
                            fore_list <br/><span className="text-[10px] font-normal text-slate-400">预测列表 [ ]</span>
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-bold text-slate-800 border-b border-slate-200 bg-yellow-50 border-l-2 border-l-yellow-200">
                            result <br/><span className="text-[10px] font-normal text-slate-500">单行计算结果</span>
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100 font-mono text-xs">
                    {sampleData?.real.slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 text-slate-400 bg-slate-50 border-r border-slate-100">{i}</td>
                            <td className="px-3 py-2 text-right text-green-700">{r.toFixed(2)}</td>
                            <td className="px-3 py-2 text-right text-blue-700">{sampleData.fore[i]?.toFixed(2)}</td>
                            <td className="px-3 py-2 text-left text-slate-500 truncate max-w-[100px]" title={JSON.stringify(sampleData.foreRaw[i])}>
                                {JSON.stringify(sampleData.foreRaw[i]?.map(v=>Number(v.toFixed(1))))}
                            </td>
                            <td className={`px-3 py-2 text-right font-bold border-l-2 border-l-yellow-100 ${
                                typeof previewResults[i] === 'number' 
                                    ? 'text-slate-800' 
                                    : 'text-red-500'
                            }`}>
                                {isRunning ? (
                                    <span className="animate-pulse text-slate-300">...</span>
                                ) : (
                                    typeof previewResults[i] === 'number' 
                                        ? (previewResults[i] as number).toFixed(4)
                                        : previewResults[i]
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {(!sampleData || sampleData.real.length === 0) && (
                <div className="p-8 text-center text-slate-400 text-sm">
                    等待数据加载...
                </div>
            )}
        </div>
      </div>

      {/* 2. Middle Section: Row Logic Editor */}
      <div className="h-[280px] bg-[#1e1e1e] flex flex-col text-white border-t border-slate-300">
        <div className="flex items-center justify-between px-3 py-2 bg-[#252526] border-b border-[#3e3e42]">
             <div className="flex items-center space-x-2">
                <FunctionSquare className="w-4 h-4 text-yellow-500" />
                <span className="text-xs font-bold text-slate-200">单行计算逻辑 (Row Logic)</span>
             </div>
             <div className="flex space-x-1">
                 {['real', 'fore', 'fore_list', 'cap'].map(v => (
                     <button 
                        key={v}
                        onClick={() => setRowLogic(prev => prev + ` ${v}`)}
                        className="px-2 py-0.5 bg-[#3e3e42] hover:bg-[#505055] text-[10px] rounded text-slate-300 transition"
                     >
                        + {v}
                     </button>
                 ))}
             </div>
        </div>
        
        <div className="flex-1 relative">
            <textarea
                value={rowLogic}
                onChange={(e) => setRowLogic(e.target.value)}
                className="w-full h-full p-3 font-mono text-sm bg-[#1e1e1e] text-[#d4d4d4] focus:outline-none resize-none leading-relaxed"
                spellCheck={false}
                placeholder="# 输入计算逻辑, 最终赋值给 result&#10;if real < cap * 0.1:&#10;    result = 0"
                style={{ fontFamily: "'Fira Code', 'Consolas', monospace" }}
            />
            {previewError && (
                <div className="absolute bottom-2 left-2 right-2 bg-red-900/90 text-red-200 text-xs p-2 rounded border border-red-700 backdrop-blur-sm flex items-start animate-fade-in">
                    <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5" />
                    <pre className="whitespace-pre-wrap font-mono">{previewError}</pre>
                </div>
            )}
        </div>
      </div>

      {/* 3. Bottom Section: Aggregation Settings */}
      <div className="h-16 bg-slate-100 border-t border-slate-200 flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center space-x-4">
              <div className="flex items-center text-slate-600 text-sm">
                  <Calculator className="w-4 h-4 mr-2" />
                  <span className="font-semibold mr-2">聚合方式:</span>
                  <span>Accuracy = </span>
              </div>
              
              <div className="relative">
                  <select 
                    value={aggMethod}
                    onChange={(e) => setAggMethod(e.target.value as any)}
                    className="block w-48 pl-3 pr-10 py-1.5 text-sm border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md shadow-sm"
                  >
                      <option value="mean">1 - Average(Result)</option>
                      <option value="rmse">1 - RMSE(Result)/Cap</option>
                      <option value="sum">1 - Sum(Result)</option>
                  </select>
              </div>
          </div>

          <div className="text-xs text-slate-500 italic max-w-md text-right">
              {aggMethod === 'mean' && '适用于东北区域：计算每行误差后取平均值'}
              {aggMethod === 'rmse' && '适用于山西/通用：计算每行平方差后开根号'}
              {aggMethod === 'sum' && '适用于累加扣分项'}
          </div>
      </div>
    </div>
  );
};

export default FormulaEditor;
