import React, { useState, useEffect } from 'react';
import { Code, RotateCcw, Play, Check, AlertCircle, Plus, Table2, FunctionSquare, ArrowDown, Calculator, Bot, Wand2, Loader2, Save } from 'lucide-react';
import { generateBatchScript, runRowPreview, generateFormulaWithAI, getDefaultFormulaState, saveFormulaToStorage, loadFormulaFromStorage, clearFormulaFromStorage } from '../services/formulas';
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

const FormulaEditor: React.FC<FormulaEditorProps> = ({ region, code, setCode, sampleData }) => {
  // Mode: 'atomic' (Table based) or 'script' (Full Python)
  
  // Initial state is just a placeholder, useEffect handles loading correct logic
  const [rowLogic, setRowLogic] = useState('');
  const [aggMethod, setAggMethod] = useState<'mean' | 'sum' | 'rmse' | 'custom'>('mean');
  
  const [previewResults, setPreviewResults] = useState<(number | string)[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // AI State
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // Sync initial logic when region changes (Load from Storage or Defaults)
  useEffect(() => {
    const saved = loadFormulaFromStorage(region);
    
    if (saved) {
        setRowLogic(saved.rowLogic);
        setAggMethod(saved.aggMethod as any);
    } else {
        const defaults = getDefaultFormulaState(region);
        setRowLogic(defaults.rowLogic);
        setAggMethod(defaults.aggMethod as any);
    }
  }, [region]);

  // Run Preview on the Sample Data (First 10 rows) whenever row logic changes
  useEffect(() => {
    if (!sampleData || !rowLogic) return;

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

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    setPreviewError(null);
    try {
      const generatedCode = await generateFormulaWithAI(aiPrompt, region);
      setRowLogic(generatedCode);
      setShowAiInput(false);
      setAiPrompt('');
    } catch (e: any) {
        setPreviewError(e.message);
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleSave = () => {
      saveFormulaToStorage(region, rowLogic, aggMethod);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const handleReset = () => {
      if(!confirm(`确认重置 ${region} 区域的计算公式为默认模板吗？此操作无法撤销。`)) return;
      
      clearFormulaFromStorage(region);
      const defaults = getDefaultFormulaState(region);
      setRowLogic(defaults.rowLogic);
      setAggMethod(defaults.aggMethod as any);
  };

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
                <button
                    onClick={() => setShowAiInput(!showAiInput)}
                    className={`flex items-center px-2 py-0.5 ml-4 rounded transition text-[10px] ${showAiInput ? 'bg-blue-600 text-white' : 'bg-[#3e3e42] text-slate-300 hover:bg-[#505055]'}`}
                >
                    <Bot className="w-3 h-3 mr-1" />
                    AI 智能生成
                </button>
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

        {/* AI Input Panel */}
        {showAiInput && (
            <div className="bg-[#2d2d2d] p-3 border-b border-[#3e3e42] animate-in slide-in-from-top-2">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder="描述计算逻辑，例如：如果实测值小于 3% 容量，则结果为 0，否则为绝对误差的平方..."
                        className="flex-1 bg-[#1e1e1e] border border-[#3e3e42] text-slate-200 text-xs px-3 py-2 rounded focus:outline-none focus:border-blue-500 placeholder-slate-500"
                        onKeyDown={e => e.key === 'Enter' && handleAiGenerate()}
                    />
                    <button 
                        onClick={handleAiGenerate}
                        disabled={isAiGenerating || !aiPrompt.trim()}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2 rounded disabled:opacity-50 flex items-center transition"
                    >
                        {isAiGenerating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                        生成代码
                    </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1 flex items-center">
                    <Bot className="w-3 h-3 mr-1" />
                    AI 将根据您的描述自动编写 Python 代码。生成后请观察下方代码变化并自动测试。
                </p>
            </div>
        )}
        
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

      {/* 3. Bottom Section: Aggregation Settings & Save Actions */}
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

          <div className="flex items-center space-x-2">
               <button 
                  onClick={handleReset}
                  className="flex items-center px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition border border-transparent hover:border-red-200"
                  title="恢复默认公式"
               >
                   <RotateCcw className="w-3.5 h-3.5 mr-1" />
                   恢复默认
               </button>
               <div className="h-6 w-px bg-slate-300 mx-2"></div>
               <button 
                  onClick={handleSave}
                  className={`flex items-center px-4 py-1.5 text-xs font-bold text-white rounded shadow-sm transition ${
                      saveStatus === 'saved' ? 'bg-green-600' : 'bg-slate-700 hover:bg-slate-800'
                  }`}
               >
                   {saveStatus === 'saved' ? (
                       <>
                           <Check className="w-3.5 h-3.5 mr-1" />
                           已保存
                       </>
                   ) : (
                       <>
                           <Save className="w-3.5 h-3.5 mr-1" />
                           保存配置
                       </>
                   )}
               </button>
          </div>
      </div>
    </div>
  );
};

export default FormulaEditor;