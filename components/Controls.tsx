import React from 'react';
import { Settings, MapPin, Zap } from 'lucide-react';
import { Region, CalculationParams } from '../types';

interface ControlsProps {
  region: Region;
  setRegion: (r: Region) => void;
  params: CalculationParams;
  setParams: (p: CalculationParams) => void;
  dataLoaded: boolean;
}

const Controls: React.FC<ControlsProps> = ({ region, setRegion, params, setParams, dataLoaded }) => {
  
  const regions: Region[] = ['Shanxi', 'Northwest', 'Northeast', 'South', 'East', 'Central'];
  const regionNames: Record<Region, string> = {
    'Shanxi': '山西 (Shanxi)',
    'Northwest': '西北 (Northwest)',
    'Northeast': '东北 (Dongbei)',
    'South': '南方 (South)',
    'East': '华东 (Huadong)',
    'Central': '华中 (Central)'
  };

  // Enable threshold for Northwest (usually 3%) and Northeast (usually 10%)
  const showThreshold = region === 'Northwest' || region === 'Northeast';

  if (!dataLoaded) return null;

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex items-center mb-4 pb-4 border-b border-slate-100">
        <Settings className="w-5 h-5 text-slate-500 mr-2" />
        <h2 className="text-lg font-bold text-slate-800">计算参数配置 (Configuration)</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Region Selector */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center">
            <MapPin className="w-4 h-4 mr-1" />
            考核区域 (Region)
          </label>
          <select 
            value={region} 
            onChange={(e) => setRegion(e.target.value as Region)}
            className="w-full border-slate-300 rounded-md shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
          >
            {regions.map(r => (
              <option key={r} value={r}>{regionNames[r]}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            切换区域会自动应用对应的双细则公式
          </p>
        </div>

        {/* Capacity Input */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center">
            <Zap className="w-4 h-4 mr-1" />
            场站装机容量 (Capacity MW)
          </label>
          <input 
            type="number" 
            value={params.cap}
            onChange={(e) => setParams({...params, cap: Number(e.target.value)})}
            className="w-full border-slate-300 rounded-md shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Threshold Input - Conditional */}
        <div className={showThreshold ? 'opacity-100' : 'opacity-40 pointer-events-none grayscale'}>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            考核死区阈值 (Threshold Ratio)
          </label>
          <div className="flex items-center space-x-2">
            <input 
              type="range" 
              min="0" 
              max="0.15" 
              step="0.01"
              value={params.threshold}
              onChange={(e) => setParams({...params, threshold: Number(e.target.value)})}
              className="flex-1"
              disabled={!showThreshold}
            />
            <span className="text-sm font-mono w-12">{(params.threshold * 100).toFixed(0)}%</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {showThreshold ? 
              (region === 'Northeast' ? '东北区域建议 10%' : '西北区域建议 3%') 
              : '当前区域无需配置此项'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Controls;