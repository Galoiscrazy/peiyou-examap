'use client';

import { useState, useEffect, useRef } from 'react';

interface DataStats {
  students: number;
  classes: number;
  questions: number;
  knowledgePointLinks: number;
  images: number;
}

export default function DataManagePage() {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<DataStats | null>(null);
  const [importDate, setImportDate] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<DataStats | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [importJsonText, setImportJsonText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch current database stats
  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/data/stats');
      const data = await res.json();
      setStats(data);
    } catch {
      setStats(null);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch('/api/data/export');
      if (!res.ok) {
        const err = await res.json();
        alert(`导出失败: ${err.error || '未知错误'}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      a.download = `kaodian_backup_${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`导出出错: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setExporting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportPreview(null);
    setImportResult(null);
    setShowConfirm(false);
    setImportJsonText(null);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const json = JSON.parse(text);

        if (!json.version || !json.data) {
          alert('无效的备份文件格式');
          setImportFile(null);
          return;
        }

        setImportJsonText(text);
        setImportDate(json.exportDate || null);
        setImportPreview({
          students: (json.data.students || []).length,
          classes: (json.data.classes || []).length,
          questions: (json.data.questions || []).length,
          knowledgePointLinks: (json.data.question_knowledge_points || []).length,
          images: Object.keys(json.images || {}).length,
        });
      } catch {
        alert('文件解析失败，请确认是有效的JSON备份文件');
        setImportFile(null);
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!importJsonText) return;

    setImporting(true);
    setShowConfirm(false);

    try {
      const res = await fetch('/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: importJsonText,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(`导入失败: ${data.error || '未知错误'}`);
        return;
      }

      setImportResult(data.stats);
      // Refresh current stats
      fetchStats();
    } catch (err) {
      alert(`导入出错: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setImportFile(null);
    setImportPreview(null);
    setImportResult(null);
    setShowConfirm(false);
    setImportJsonText(null);
    setImportDate(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">数据管理</h1>

      {/* Export Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📦</span> 导出数据
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          将所有学生、题目、班级数据和图片导出为JSON文件，便于备份和迁移。
        </p>

        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.students}</div>
              <div className="text-xs text-slate-500">学生</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.questions}</div>
              <div className="text-xs text-slate-500">题目</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.classes}</div>
              <div className="text-xs text-slate-500">班级</div>
            </div>
          </div>
        )}

        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {exporting ? '导出中...' : '导出数据'}
        </button>
      </div>

      {/* Import Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📥</span> 导入数据
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          从JSON备份文件恢复数据。导入将覆盖现有的所有用户数据。
        </p>

        <div className="space-y-4">
          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
            >
              {importFile ? `已选择: ${importFile.name}` : '选择备份文件 (.json)'}
            </button>
            {importFile && !importResult && (
              <button
                onClick={handleReset}
                className="ml-2 text-sm text-slate-500 hover:text-slate-700"
              >
                取消
              </button>
            )}
          </div>

          {/* Preview */}
          {importPreview && !importResult && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-amber-800 mb-2">备份文件预览</h3>
              {importDate && (
                <p className="text-xs text-amber-600 mb-3">
                  导出时间: {new Date(importDate).toLocaleString('zh-CN')}
                </p>
              )}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-amber-700">{importPreview.students}</div>
                  <div className="text-xs text-slate-500">学生</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-amber-700">{importPreview.questions}</div>
                  <div className="text-xs text-slate-500">题目</div>
                </div>
                <div className="bg-white rounded-lg p-2 text-center">
                  <div className="text-lg font-bold text-amber-700">{importPreview.images}</div>
                  <div className="text-xs text-slate-500">图片</div>
                </div>
              </div>

              {!showConfirm ? (
                <button
                  onClick={() => setShowConfirm(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm font-medium"
                >
                  确认导入
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700 font-medium mb-2">
                    确定要导入吗？现有数据将被完全覆盖！
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleImport}
                      disabled={importing}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm font-medium"
                    >
                      {importing ? '导入中...' : '确定覆盖导入'}
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      disabled={importing}
                      className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-green-800 mb-2">导入成功!</h3>
              <div className="text-sm text-green-700 space-y-1">
                <p>学生: {importResult.students} 条</p>
                <p>题目: {importResult.questions} 条</p>
                <p>班级: {importResult.classes} 条</p>
                <p>知识点关联: {importResult.knowledgePointLinks} 条</p>
                <p>图片: {importResult.images} 张</p>
              </div>
              <button
                onClick={handleReset}
                className="mt-3 px-4 py-2 border border-green-300 rounded-lg hover:bg-green-100 transition-colors text-sm text-green-700"
              >
                完成
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
