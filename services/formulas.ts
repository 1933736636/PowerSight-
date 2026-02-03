import { DataPoint, CalculationParams } from '../types';

// --- Pyodide Setup ---

let pyodideInstance: any = null;

declare global {
  interface Window {
    loadPyodide: any;
  }
}

export const initPyodide = async () => {
  if (pyodideInstance) return pyodideInstance;
  
  if (typeof window.loadPyodide !== 'function') {
    throw new Error('Pyodide script not loaded');
  }

  // Initialize Pyodide
  pyodideInstance = await window.loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.4/full/"
  });
  
  // Load Numpy explicitly as it is commonly used in custom logic
  await pyodideInstance.loadPackage("numpy");
  
  return pyodideInstance;
};

// --- Helper: Generate Batch Script from Atomic Logic ---

export const generateBatchScript = (
    rowLogic: string, 
    aggMethod: 'mean' | 'sum' | 'rmse' | 'custom',
    region: string
): string => {
    // Prevent "UnboundLocalError: local variable 'np' referenced before assignment"
    // This happens if user code imports numpy as np inside the function, making 'np' local,
    // but we use 'np' in the boilerplate before the user code runs.
    let cleanRowLogic = rowLogic;
    
    // Comment out 'import numpy as np' or 'import numpy' found in user logic
    // We already import numpy as np at the top level of the generated script
    cleanRowLogic = cleanRowLogic.replace(/^(\s*)(import\s+numpy(?:\s+as\s+np)?\s*;?\s*$)/gm, '$1# $2 # Pre-imported globally');

    // Indent the user's row logic twice (for function body)
    const indentedLogic = cleanRowLogic.split('\n').map(line => '        ' + line).join('\n');

    let aggregationCode = '';
    
    if (aggMethod === 'mean') {
        aggregationCode = `
# Aggregation: 1 - Mean(Results)
mean_val = np.mean(row_results)
result = max(0, 1 - mean_val)`;
    } else if (aggMethod === 'rmse') {
        if (region === 'Shanxi') {
           // Shanxi special aggregation logic
           // Note: This relies on global 'real' and 'fore' lists being available and intact
           aggregationCode = `
# Aggregation: 1 - Sqrt(Sum(Results))/Cap or similar
# Assuming row_results contains Squared Errors or Weighted Squared Errors
sum_val = sum(row_results)
import math
# Try to detect if it is weighted sum (Shanxi) or simple MSE
if len(row_results) > 0:
    mse = sum_val / len(row_results)
    rmse_val = math.sqrt(mse)
    result = max(0, 1 - (rmse_val / cap))
else:
    result = 1.0`;
           // Override for Shanxi if the row logic was the template
           if (rowLogic.includes('weight = abs(diff)')) {
               aggregationCode = `
# Shanxi Aggregation
total_weight = sum([abs(r-f) for r,f in zip(real, fore)])
if total_weight == 0:
    result = 1.0
else:
    # row_results should contain (diff**2)*abs(diff)
    weighted_sum = sum(row_results) / total_weight
    import math
    error = math.sqrt(weighted_sum) / cap
    result = max(0, 1 - error)`;
           }
        } else {
             // General RMSE
             aggregationCode = `
# Aggregation: RMSE based
# Assuming row_results are Squared Errors ((R-F)^2)
mse = np.mean(row_results)
import math
rmse_val = math.sqrt(mse)
result = max(0, 1 - (rmse_val / cap))`;
        }
    } else {
        aggregationCode = `result = 0 # Custom aggregation not fully auto-generated`;
    }

    return `# Auto-Generated Batch Script
import numpy as np

def _calculate_batch(real_arr, fore_arr, fore_list_arr, cap, threshold):
    results = []
    count = len(real_arr)

    for i in range(count):
        # Context Variables (Scalars)
        # These local variables 'real', 'fore' do not overwrite the global lists
        # because we are inside a function scope.
        
        real = real_arr[i] 
        fore = fore_arr[i] 
        
        # Current Forecast List
        if i < len(fore_list_arr) and len(fore_list_arr[i]) > 0:
            fore_list = np.array(fore_list_arr[i])
        else:
            fore_list = np.array([fore])
        
        # --- User Row Logic Start ---
${indentedLogic}
        # --- User Row Logic End ---
        
        # Ensure result is defined
        if 'result' not in locals():
            result = 0.0
            
        results.append(result)
        
    return results

# Execute the batch function
# We use 'globals()' check for fore_list to be safe, though it should be initialized
_fore_list_arg = fore_list if 'fore_list' in globals() else []

row_results = _calculate_batch(real, fore, _fore_list_arg, cap, threshold)

${aggregationCode}

result
`;
};

// --- Helper: Run Row Preview (Top 10) ---

export const runRowPreview = async (
    rowLogic: string,
    inputs: { real: number[], fore: number[], fore_list: number[][], cap: number, threshold: number }
): Promise<(number | string)[]> => {
    try {
        const py = await initPyodide();
        
        // Prepare a script that loops 10 times and returns a list of results
        const script = `
import numpy as np

results = []
cap = ${inputs.cap}
threshold = ${inputs.threshold}

real_arr = ${JSON.stringify(inputs.real)}
fore_arr = ${JSON.stringify(inputs.fore)}
fore_list_arr = ${JSON.stringify(inputs.fore_list)}

for i in range(len(real_arr)):
    # Setup Context
    real = real_arr[i]
    fore = fore_arr[i]
    # Handle potentially empty/scalar fore_list logic safely
    if i < len(fore_list_arr) and len(fore_list_arr[i]) > 0:
        fore_list = np.array(fore_list_arr[i]) 
    else:
        fore_list = np.array([fore])
    
    # Reset result
    result = None
    
    try:
${rowLogic.split('\n').map(l => '        ' + l).join('\n')}
        if result is None:
            results.append("No Result")
        else:
            results.append(float(result))
    except Exception as e:
        results.append(f"Error: {str(e)}")

results
`;
        const output = await py.runPythonAsync(script);
        return output.toJs();
        
    } catch (e) {
        console.error("Preview Error", e);
        throw e;
    }
};

// --- AI / Smart Parsing Logic ---

export const aiGenerateFormula = (input: string): string => {
  let code = input.trim();

  // 1. If it looks like a function definition, unwrap it
  if (code.startsWith('def ')) {
    const lines = code.split('\n');
    lines.shift(); // Remove def line
    const firstBodyLine = lines.find(l => l.trim().length > 0);
    if (firstBodyLine) {
      const match = firstBodyLine.match(/^(\s+)/);
      const indentation = match ? match[1] : '';
      if (indentation) {
        code = lines.map(line => line.startsWith(indentation) ? line.substring(indentation.length) : line).join('\n');
      } else {
         code = lines.join('\n');
      }
    } else {
        code = lines.join('\n');
    }
    code = code.replace(/^\s*return\b\s*(.*)$/gm, 'result = $1');
  }

  // 2. Intelligent Variable Mapping
  if (code.includes('.iloc')) {
    code = code.replace(/fore\.iloc/g, 'fore_list'); 
  }

  // 3. Ensure Numpy is imported if used
  if (code.includes('np.') && !code.includes('import numpy')) {
    code = 'import numpy as np\n' + code;
  }

  // 4. Ensure it ends with 'result'
  let footer = '';
  if (!code.trim().endsWith('result')) {
    footer = '\n\nresult';
  }

  const header = `# AI-Parsed Logic
import numpy as np
result = 0.0 # Initialize
`;
  return header + code + footer;
};


// --- Default Formula Source Codes (Python) ---

export const getFormulaDefaultCode = (region: string): string => {
  // Return the batch script format directly to allow "Script Mode" fallback if needed
  // But generally we use the Atomic Builder now.
  // We keep this for backward compat or if user switches to full script mode manually.
  return generateBatchScript(
      region === 'Shanxi' ? 
          `diff = real - fore
result = (diff ** 2) * abs(diff)` : 
      region === 'Northeast' ?
          `mean_fore = np.mean(fore_list)
if real < cap * 0.1 and mean_fore < cap * 0.1:
    result = 0.0
else:
    if mean_fore == 0:
        result = 0.0
    else:
        err = abs((mean_fore - real) / mean_fore)
        result = min(err, 1.0)` :
      `diff = abs(real - fore)
result = diff ** 2`,
      region === 'Shanxi' ? 'rmse' : 'mean',
      region
  );
};

/**
 * Executes custom user-defined PYTHON code using Pyodide.
 * Now accepts fore_list (List of Lists) for matrix calculations.
 */
export const executeCustomFormula = async (
  code: string,
  real: number[],
  fore: number[],
  cap: number,
  threshold: number,
  foreRaw: number[][] = [] 
): Promise<number> => {
  try {
    const py = await initPyodide();

    // Set globals for Python context as JsProxies
    py.globals.set("real_proxy", real);
    py.globals.set("fore_proxy", fore); 
    py.globals.set("fore_list_proxy", foreRaw);
    py.globals.set("cap", cap);
    py.globals.set("threshold", threshold);
    
    // Explicitly convert JsProxies to Python Lists/Arrays
    // This fixes "TypeError: unsupported operand type(s) for /: 'pyodide.ffi.JsProxy' and 'int'"
    // inside Numpy functions like mean()
    py.runPython(`
import numpy as np
real = real_proxy.to_py()
fore = fore_proxy.to_py()
fore_list = fore_list_proxy.to_py()

# Cleanup proxies from namespace (optional but good practice)
del real_proxy
del fore_proxy
del fore_list_proxy
`);
    
    // Initialize result in global scope
    py.runPython("result = 0.0");

    // Execute the code
    const result = await py.runPythonAsync(code);

    // Ensure result is a number
    const numResult = Number(result);
    if (isNaN(numResult)) return 0;
    return numResult;

  } catch (err) {
    console.error("Python Execution Error:", err);
    throw err;
  } finally {
      // Cleanup globals in finally block
      if (pyodideInstance && pyodideInstance.globals) {
          try { pyodideInstance.globals.delete("real"); } catch (e) {}
          try { pyodideInstance.globals.delete("fore"); } catch (e) {}
          try { pyodideInstance.globals.delete("fore_list"); } catch (e) {}
          try { pyodideInstance.globals.delete("cap"); } catch (e) {}
          try { pyodideInstance.globals.delete("threshold"); } catch (e) {}
          try { pyodideInstance.globals.delete("real_proxy"); } catch (e) {}
          try { pyodideInstance.globals.delete("fore_proxy"); } catch (e) {}
          try { pyodideInstance.globals.delete("fore_list_proxy"); } catch (e) {}
      }
  }
};

export const getFormulaInfo = (region: string) => {
  switch (region) {
    case 'Shanxi':
      return {
        name: '山西 (Shanxi) - 双细则',
        desc: '基于误差权重的均方根偏差计算。',
        formula: 'Accuracy = 1 - sqrt( sum((R-F)^2 * |R-F| / sum(|R-F|)) ) / Cap'
      };
    case 'Northwest':
      return {
        name: '西北 (Northwest) - 双细则',
        desc: '引入死区概念的加权调和平均误差计算。',
        formula: 'Accuracy = 1 - 2 * Σ ( | R/(R+F) - 0.5 | * ( |R-F| / Σ|R-F| ) )'
      };
    case 'Northeast':
      return {
        name: '东北 (Northeast)',
        desc: '基于 RMSE 的考核公式，通常包含 10% 容量的死区豁免。',
        formula: 'Accuracy = 1 - ( RMSE / Cap )'
      };
    case 'South':
      return {
        name: '南方 (South)',
        desc: '分段归一化误差计算 (20% Cap 分界)。',
        formula: 'Accuracy = 1 - sqrt( Mean( ((R-F)/Ref)^2 ) )'
      };
    default:
      return {
        name: '通用 RMSE (General)',
        desc: '标准均方根误差计算。',
        formula: 'Accuracy = 1 - ( RMSE / Cap )'
      };
  }
};
