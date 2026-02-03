import React, { useRef, useState, useEffect } from 'react';
import { Upload, AlertCircle, Server, Folder, FileText, RefreshCw, Check, HardDrive } from 'lucide-react';
import { RawRow } from '../types';

interface FileUploadProps {
  onDataLoaded: (data: RawRow[], headers: string[]) => void;
}

const DEFAULT_SERVER_PATH = '/public/home/wangyg/project/Ushort_forcast/data';

const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [mode, setMode] = useState<'local' | 'server'>('local');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Server Mode State ---
  const [serverPath, setServerPath] = useState(DEFAULT_SERVER_PATH);
  const [fileList, setFileList] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // --- Mock Server Logic (Replace with real API in deployment) ---
  const fetchFileList = () => {
    setLoadingList(true);
    setError(null);
    // 模拟 API 调用延迟
    setTimeout(() => {
        // 这里模拟服务器返回的文件列表
        setFileList([
            'station_shanxi_202501.csv',
            'station_shanxi_202502.csv',
            'station_northwest_batch_01.csv',
            'test_data_realtime.csv'
        ]);
        setLoadingList(false);
    }, 600);
  };

  useEffect(() => {
      if (mode === 'server') {
          fetchFileList();
      }
  }, [mode]);

  const handleServerFileLoad = async (filename: string) => {
      setSelectedFile(filename);
      setLoading(true);
      setError(null);

      try {
          // ============================================================
          // 真实部署时，请替换为如下代码:
          // const response = await fetch(`/api/file?path=${serverPath}&name=${filename}`);
          // const csvText = await response.text();
          // ============================================================
          
          // --- 模拟生成 CSV 数据 (Mock Data Generator) ---
          await new Promise(r => setTimeout(r, 800)); // Simulate network
          const now = new Date();
          let mockCsv = "time,real_power,forecast_1,forecast_2\n";
          for(let i=0; i<96 * 30; i++) { // 30 days of 15min data
             const t = new Date(now.getTime() - (96 * 30 - i) * 15 * 60000);
             const timeStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
             
             // Generate random wave
             const base = Math.sin(i / 20) * 50 + 100;
             const real = base + (Math.random() - 0.5) * 10;
             const fore1 = base + (Math.random() - 0.5) * 20;
             const fore2 = base * 0.95 + (Math.random() - 0.5) * 5;
             
             mockCsv += `${timeStr},${real.toFixed(2)},${fore1.toFixed(2)},${fore2.toFixed(2)}\n`;
          }
          // -----------------------------------------------------------

          const { data, headers } = parseCSV(mockCsv);
          onDataLoaded(data, headers);
      } catch (err) {
          console.error(err);
          setError("无法加载服务器文件，请检查网络或文件格式。");
          setSelectedFile(null);
      } finally {
          setLoading(false);
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
    if (lines.length < 2) throw new Error("File too short");

    const headers = lines[0].split(',').map(h => h.trim());
    
    // Find time column automatically to sort, but keep others dynamic
    const timeIdx = headers.findIndex(h => {
        const lower = h.toLowerCase();
        return lower.includes('time') || lower.includes('timestamp') || lower.includes('时间');
    });

    if (timeIdx === -1) {
      throw new Error("Could not auto-detect a Time column.");
    }

    const result: RawRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i].split(',');
      if (currentLine.length < headers.length) continue;

      const row: RawRow = {
        time: currentLine[timeIdx],
        timestamp: 0,
      };

      // Try to parse time
      const timeStr = currentLine[timeIdx];
      const timestamp = new Date(timeStr.replace(/-/g, '/')).getTime();
      
      if (isNaN(timestamp)) continue; // Skip invalid time rows
      row.timestamp = timestamp;

      // Parse all other columns as numbers if possible
      headers.forEach((header, index) => {
        if (index === timeIdx) return;
        const val = parseFloat(currentLine[index]);
        row[header] = isNaN(val) ? 0 : val;
      });

      result.push(row);
    }

    if (result.length === 0) throw new Error("No valid data rows found");

    // Sort by timestamp asc
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
              <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">当前数据源路径</label>
                  <div className="flex items-center space-x-2">
                      <div className="flex-1 bg-slate-100 border border-slate-300 rounded px-3 py-2 text-sm font-mono text-slate-600 flex items-center overflow-hidden">
                          <Folder className="w-4 h-4 mr-2 flex-shrink-0 text-slate-400" />
                          <input 
                            type="text" 
                            value={serverPath} 
                            onChange={(e) => setServerPath(e.target.value)}
                            className="bg-transparent w-full focus:outline-none"
                          />
                      </div>
                      <button 
                        onClick={fetchFileList}
                        className="p-2 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-600 transition"
                        title="刷新列表"
                      >
                          <RefreshCw className={`w-5 h-5 ${loadingList ? 'animate-spin text-blue-500' : ''}`} />
                      </button>
                  </div>
              </div>

              <div className="border border-slate-200 rounded-md overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-500 flex justify-between">
                      <span>文件名</span>
                      <span>操作</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto bg-white">
                      {loadingList ? (
                          <div className="p-8 text-center text-slate-400 text-sm">加载文件列表中...</div>
                      ) : fileList.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 text-sm">该目录下未找到 CSV 文件</div>
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
                                               <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> 加载中
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
              <p className="mt-3 text-xs text-slate-400">
                  * 此功能需要后端 API 支持。当前为模拟数据模式，点击任意文件将生成测试数据。
              </p>
          </div>
      )}
      
      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center text-red-700 animate-fade-in">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
    </div>
  );
};

export default FileUpload;