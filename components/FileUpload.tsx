import React, { useRef, useState, useEffect } from 'react';
import { Upload, AlertCircle, Server, Folder, FileText, RefreshCw, Check, HardDrive, Settings, Link as LinkIcon, ToggleLeft, ToggleRight } from 'lucide-react';
import { RawRow } from '../types';

interface FileUploadProps {
  onDataLoaded: (data: RawRow[], headers: string[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [mode, setMode] = useState<'local' | 'server'>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // --- Connection State ---
  // Smart default: Assume backend is on the same host as frontend, port 8000
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(() => {
      const hostname = window.location.hostname;
      return `http://${hostname}:8000/api`;
  });
  const [serverPath, setServerPath] = useState<string>('/public/home/wangyg/project/Ushort_forcast/data');
  const [useMock, setUseMock] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  // --- Data State ---
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // --- Fetch File List ---
  const fetchFileList = async () => {
    setLoadingList(true);
    setError(null);
    setFileList([]);

    if (useMock) {
        // --- Mock Implementation ---
        setTimeout(() => {
            setFileList([
                'station_shanxi_202501.csv',
                'station_shanxi_202502.csv',
                'station_northwest_batch_01.csv',
                'test_data_realtime.csv'
            ]);
            setLoadingList(false);
        }, 600);
    } else {
        // --- Real API Implementation ---
        try {
            // Expected Backend: GET /api/files?path=...
            const response = await fetch(`${apiBaseUrl}/files?path=${encodeURIComponent(serverPath)}`);
            if (!response.ok) {
                 if (response.status === 404) throw new Error("API 路径未找到 (404)。请检查后端代码。");
                 throw new Error(`API Error: ${response.statusText}`);
            }
            
            const list = await response.json();
            if (Array.isArray(list)) {
                setFileList(list);
            } else {
                throw new Error("API 返回格式错误: 需要 JSON 字符串数组");
            }
        } catch (err: any) {
            console.error(err);
            let msg = err.message;
            if (msg === 'Failed to fetch') {
                msg = `连接失败: 无法访问 ${apiBaseUrl}。请确认后端服务已启动 (python server.py) 且端口未被防火墙拦截。`;
            }
            setError(msg);
        } finally {
            setLoadingList(false);
        }
    }
  };

  // Trigger fetch when mode changes to server, or when config changes (if already in server mode)
  useEffect(() => {
      if (mode === 'server') {
          fetchFileList();
      }
  }, [mode, useMock]); // Removed apiBaseUrl/serverPath from deps to avoid auto-refetch on every keystroke, user must click refresh

  // --- Fetch File Content ---
  const handleServerFileLoad = async (filename: string) => {
      setSelectedFile(filename);
      setLoading(true);
      setError(null);

      if (useMock) {
          // --- Mock Data Generation ---
          try {
            await new Promise(r => setTimeout(r, 800)); 
            const now = new Date();
            let mockCsv = "time,real_power,forecast_1,forecast_2\n";
            for(let i=0; i<96 * 30; i++) { 
                const t = new Date(now.getTime() - (96 * 30 - i) * 15 * 60000);
                const timeStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
                
                // Generate random wave
                const base = Math.sin(i / 20) * 50 + 100;
                const real = base + (Math.random() - 0.5) * 10;
                const fore1 = base + (Math.random() - 0.5) * 20;
                const fore2 = base * 0.95 + (Math.random() - 0.5) * 5;
                
                mockCsv += `${timeStr},${real.toFixed(2)},${fore1.toFixed(2)},${fore2.toFixed(2)}\n`;
            }
            const { data, headers } = parseCSV(mockCsv);
            onDataLoaded(data, headers);
          } catch(e) {
             setError("模拟数据生成失败"); 
          } finally {
             setLoading(false);
          }
      } else {
          // --- Real API Call ---
          try {
              const response = await fetch(`${apiBaseUrl}/file-content?path=${encodeURIComponent(serverPath)}&filename=${encodeURIComponent(filename)}`);
              
              if (!response.ok) {
                  const errorJson = await response.json().catch(() => ({}));
                  throw new Error(errorJson.detail || response.statusText);
              }
              
              let csvText = await response.text();
              
              // Handle potential double-encoding
              if (csvText.startsWith('"') && csvText.endsWith('"')) {
                 try { csvText = JSON.parse(csvText); } catch(e) {}
              }

              const { data, headers } = parseCSV(csvText);
              onDataLoaded(data, headers);
          } catch (err: any) {
              console.error(err);
              setError(`无法加载文件内容: ${err.message}`);
          } finally {
              setLoading(false);
          }
      }
  };

  // --- Local Mode Logic ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const { data, headers } = parseCSV(text);
        onDataLoaded(data, headers);
      } catch (err) {
        console.error(err);
        setError('无法解析 CSV 文件，请确保文件格式正确。');
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  // --- Shared CSV Parser ---
  const parseCSV = (csvText: string): { data: RawRow[], headers: string[] } => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) throw new Error("文件内容过短");

    const headers = lines[0].split(',').map(h => h.trim());
    
    // Auto-detect time column
    const timeIdx = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('time') || lower.includes('timestamp') || lower.includes('时间');
    });

    if (timeIdx === -1) {
      throw new Error("无法自动识别时间列 (需包含 time/timestamp/时间)");
    }

    const result: RawRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i].split(',');
      if (currentLine.length < headers.length) continue;

      const row: RawRow = {
        time: currentLine[timeIdx],
        timestamp: 0,
      };

      const timeStr = currentLine[timeIdx];
      // Robust Date Parsing
      const timestamp = new Date(timeStr.replace(/-/g, '/')).getTime();
      
      if (isNaN(timestamp)) continue;
      row.timestamp = timestamp;

      headers.forEach((header, index) => {
        if (index === timeIdx) return;
        const val = parseFloat(currentLine[index]);
        row[header] = isNaN(val) ? 0 : val;
      });

      result.push(row);
    }

    if (result.length === 0) throw new Error("No valid data rows found");

    result.sort((a, b) => a.timestamp - b.timestamp);
    return { data: result, headers };
  };

  return (
    <div className="w-full max-w-2xl mx-auto mb-8 animate-fade-in">
        {/* Tabs */}
        <div className="flex border-b border-slate-200 mb-6">
            <button
                onClick={() => setMode('local')}
                className={`flex items-center px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                    mode === 'local' 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
                <HardDrive className="w-4 h-4 mr-2" />
                本地文件上传
            </button>
            <button
                onClick={() => setMode('server')}
                className={`flex items-center px-6 py-3 font-medium text-sm transition-colors border-b-2 ${
                    mode === 'server' 
                    ? 'border-blue-600 text-blue-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
                <Server className="w-4 h-4 mr-2" />
                服务器数据选择
            </button>
        </div>

      {mode === 'local' ? (
          // Local Upload View
          <div 
            className="border-2 border-dashed border-slate-300 rounded-lg p-10 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="bg-blue-50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                <Upload className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">点击上传场站数据</h3>
            <p className="text-sm text-slate-500 mt-2">支持 CSV 格式 (UTF-8)</p>
            <p className="text-xs text-slate-400 mt-1">系统将自动识别时间列与功率列</p>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".csv"
              className="hidden" 
            />
            {loading && <p className="mt-4 text-blue-600 font-medium flex items-center"><RefreshCw className="w-4 h-4 mr-2 animate-spin"/> 正在解析数据...</p>}
          </div>
      ) : (
          // Server File View
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
              
              {/* Header with Settings Toggle */}
              <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-2">
                     <h3 className="text-sm font-bold text-slate-700 flex items-center">
                        <Folder className="w-4 h-4 mr-2 text-blue-500" />
                        服务器文件浏览
                     </h3>
                     {useMock && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">MOCK MODE</span>}
                  </div>
                  <button 
                    onClick={() => setShowConfig(!showConfig)}
                    className={`p-1.5 rounded transition ${showConfig ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                    title="API 连接设置"
                  >
                      <Settings className="w-4 h-4" />
                  </button>
              </div>

              {/* Collapsible Configuration Panel */}
              {showConfig && (
                  <div className="mb-6 p-4 bg-slate-50 rounded border border-slate-200 animate-fade-in text-sm space-y-3">
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">API 基础地址 (Base URL)</label>
                          <div className="flex items-center">
                             <LinkIcon className="w-4 h-4 text-slate-400 mr-2" />
                             <input 
                                type="text" 
                                value={apiBaseUrl} 
                                onChange={(e) => setApiBaseUrl(e.target.value)}
                                className="flex-1 border-slate-300 rounded px-2 py-1.5 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="http://localhost:8000/api"
                             />
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">服务器数据目录</label>
                          <div className="flex items-center">
                             <Folder className="w-4 h-4 text-slate-400 mr-2" />
                             <input 
                                type="text" 
                                value={serverPath} 
                                onChange={(e) => setServerPath(e.target.value)}
                                className="flex-1 border-slate-300 rounded px-2 py-1.5 focus:ring-blue-500 focus:border-blue-500"
                             />
                          </div>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                          <label className="flex items-center cursor-pointer">
                              <button onClick={() => setUseMock(!useMock)} className="mr-2 focus:outline-none">
                                  {useMock ? <ToggleRight className="w-8 h-8 text-amber-500" /> : <ToggleLeft className="w-8 h-8 text-slate-300" />}
                              </button>
                              <span className="text-slate-600">启用演示模式 (Mock Data)</span>
                          </label>
                          <button 
                            onClick={fetchFileList}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition flex items-center"
                          >
                              <RefreshCw className="w-3 h-3 mr-1" /> 更新列表
                          </button>
                      </div>
                  </div>
              )}

              {/* File List */}
              <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-500 flex justify-between items-center">
                      <span>文件列表</span>
                      {!showConfig && (
                        <button onClick={fetchFileList} title="刷新" className="text-slate-400 hover:text-blue-600">
                             <RefreshCw className={`w-3 h-3 ${loadingList ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                  </div>
                  <div className="max-h-60 overflow-y-auto bg-white min-h-[120px]">
                      {loadingList ? (
                          <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-sm">
                              <RefreshCw className="w-6 h-6 mb-2 animate-spin text-blue-500" />
                              正在连接服务器...
                          </div>
                      ) : error ? (
                          <div className="p-6 text-center">
                              <div className="inline-flex bg-red-100 p-2 rounded-full mb-3">
                                  <AlertCircle className="w-6 h-6 text-red-500" />
                              </div>
                              <p className="text-red-600 text-sm font-medium mb-1">{error}</p>
                              <p className="text-xs text-red-400 mb-4">请点击右上角设置图标检查 API 地址，或开启演示模式。</p>
                              <button 
                                onClick={() => { setUseMock(true); setShowConfig(true); }}
                                className="text-xs bg-white border border-red-200 text-red-600 px-3 py-1 rounded hover:bg-red-50 transition"
                              >
                                  切换到演示模式
                              </button>
                          </div>
                      ) : fileList.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-sm">
                              <Folder className="w-8 h-8 mb-2 text-slate-200" />
                              <p>目录为空或未找到 CSV 文件</p>
                          </div>
                      ) : (
                          <ul className="divide-y divide-slate-100">
                              {fileList.map((file) => (
                                  <li key={file} className={`flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition cursor-pointer ${selectedFile === file ? 'bg-blue-50 ring-1 ring-inset ring-blue-200' : ''}`} onClick={() => handleServerFileLoad(file)}>
                                      <div className="flex items-center">
                                          <FileText className="w-4 h-4 text-slate-400 mr-3" />
                                          <span className="text-sm text-slate-700 font-medium">{file}</span>
                                      </div>
                                      {selectedFile === file && loading ? (
                                           <span className="text-xs text-blue-600 flex items-center">
                                               <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> 读取中
                                           </span>
                                      ) : selectedFile === file ? (
                                           <span className="text-xs text-green-600 flex items-center">
                                               <Check className="w-3 h-3 mr-1" /> 已选择
                                           </span>
                                      ) : (
                                          <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100">点击加载</span>
                                      )}
                                  </li>
                              ))}
                          </ul>
                      )}
                  </div>
              </div>
              
              {!showConfig && !error && (
                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                   <span>
                      {useMock ? '* 演示模式' : `* 连接至: ${apiBaseUrl}`}
                   </span>
                   <span>
                      路径: {serverPath.length > 20 ? '...' + serverPath.slice(-20) : serverPath}
                   </span>
                </div>
              )}
          </div>
      )}
      
      {error && !loadingList && mode === 'local' && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center text-red-700 animate-fade-in">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUpload;