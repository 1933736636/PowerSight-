import os
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List

app = FastAPI()

# 1. 配置 CORS，允许前端 (React) 访问后端
# 允许所有来源，解决 Failed to fetch 问题
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. 定义允许访问的基础目录 (安全起见，防止访问系统敏感文件)
# 您可以根据需要放宽限制，或者只允许访问特定目录
ALLOWED_BASE_PATH = "/public/home/wangyg/project/Ushort_forcast/data"

@app.get("/")
async def root():
    """
    健康检查接口
    """
    return {"status": "ok", "message": "PowerSight Backend is running", "endpoints": ["/api/files", "/api/file-content"]}

@app.get("/api/files", response_model=List[str])
async def list_files(path: str = Query(..., description="Target directory path")):
    """
    获取指定目录下的 CSV 文件列表
    """
    # 简单的安全检查：确保路径存在
    if not os.path.exists(path):
        # 如果目录不存在，返回空列表
        return []

    try:
        # 获取所有以 .csv 结尾的文件
        files = [f for f in os.listdir(path) if f.endswith('.csv') and not f.startswith('.')]
        return sorted(files)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法读取目录: {str(e)}")

@app.get("/api/file-content")
async def get_file_content(path: str, filename: str):
    """
    读取指定 CSV 文件的文本内容
    """
    full_path = os.path.join(path, filename)

    # 安全检查
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=400, detail="目标不是一个文件")

    try:
        # 读取文件内容 (假设为 UTF-8 编码)
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return content 
    except UnicodeDecodeError:
        # 尝试 GBK 编码 (以防中文乱码)
        try:
            with open(full_path, 'r', encoding='gbk') as f:
                content = f.read()
            return content
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"文件编码无法识别: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")

# 启动入口
if __name__ == "__main__":
    # host="0.0.0.0" 允许外部访问
    # port=8000 后端运行端口
    print(f"Backend running on http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
