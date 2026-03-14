'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Student {
  id: number;
  name: string;
  student_code: string;
  school: string;
  current_grade: string;
}

interface KpSuggestion {
  seq: number;
  reason: string;
}

interface KnowledgePoint {
  seq_number: number;
  level1: string;
  level2: string;
  level3: string;
  difficulty: number;
}

interface AnalysisResult {
  solution: string;
  answer: string;
  ocrText: string;
  errorReason: string;
  knowledgePoints: KpSuggestion[];
}

interface ImageItem {
  id: string;
  file: File;
  preview: string;
  studentId: number | '';
  isLargeQuestion: boolean;
  uploadedPath: string | null;
  status: 'pending' | 'uploading' | 'analyzing' | 'done' | 'error';
  progress: { percent: number; message: string; elapsed: number };
  result: AnalysisResult | null;
  saved: boolean;
  errorMsg: string;
  expanded: boolean;
}

function formatElapsed(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}分${sec < 10 ? '0' : ''}${sec}秒` : `${sec}秒`;
}

export default function UploadPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [allKps, setAllKps] = useState<KnowledgePoint[]>([]);
  const [items, setItems] = useState<ImageItem[]>([]);
  const [batchAnalyzing, setBatchAnalyzing] = useState(false);
  const [batchSaving, setBatchSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(setStudents);
    fetch('/api/knowledge-points').then(r => r.json()).then(setAllKps);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const updateItem = useCallback((id: string, updates: Partial<ImageItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  }, []);

  function handleFilesAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newItems: ImageItem[] = Array.from(files).map(file => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      preview: URL.createObjectURL(file),
      studentId: '',
      isLargeQuestion: false,
      uploadedPath: null,
      status: 'pending' as const,
      progress: { percent: 0, message: '', elapsed: 0 },
      result: null,
      saved: false,
      errorMsg: '',
      expanded: false,
    }));
    setItems(prev => [...prev, ...newItems]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeItem(id: string) {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter(i => i.id !== id);
    });
  }

  async function uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    return data.path;
  }

  async function analyzeViaSSE(imagePath: string, isLargeQuestion: boolean, itemId: string): Promise<AnalysisResult> {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_path: imagePath, is_large_question: isLargeQuestion }),
    });

    if (!res.ok || !res.body) throw new Error('分析请求失败');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: AnalysisResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split('\n\n');
      buffer = events.pop()!;

      for (const event of events) {
        const eventMatch = event.match(/^event: (\w+)\ndata: ([\s\S]+)$/);
        if (!eventMatch) continue;
        const [, type, data] = eventMatch;
        const parsed = JSON.parse(data);

        if (type === 'progress') {
          updateItem(itemId, {
            progress: {
              percent: parsed.percent || 0,
              message: parsed.message || '分析中...',
              elapsed: 0, // elapsed updated by timer
            },
          });
        } else if (type === 'result') {
          result = {
            solution: parsed.solution || '',
            answer: parsed.answer || '',
            ocrText: parsed.ocrText || '',
            errorReason: parsed.errorReason || '',
            knowledgePoints: parsed.knowledgePoints || [],
          };
        } else if (type === 'error') {
          throw new Error(parsed.message || '分析失败');
        }
      }
    }

    if (!result) throw new Error('未收到分析结果');
    return result;
  }

  async function handleAnalyzeAll() {
    const pendingItems = items.filter(i => i.status === 'pending' && i.studentId);
    if (pendingItems.length === 0) {
      alert('没有可分析的题目。请确保每张图片都已选择学生。');
      return;
    }

    setBatchAnalyzing(true);

    for (const item of pendingItems) {
      // Upload
      updateItem(item.id, { status: 'uploading', progress: { percent: 0, message: '正在上传图片...', elapsed: 0 } });

      let uploadedPath: string;
      try {
        uploadedPath = await uploadFile(item.file);
        updateItem(item.id, { uploadedPath });
      } catch {
        updateItem(item.id, { status: 'error', errorMsg: '图片上传失败' });
        continue;
      }

      // Start elapsed timer for this item
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, progress: { ...i.progress, elapsed } } : i
        ));
      }, 1000);

      // Analyze via SSE
      updateItem(item.id, { status: 'analyzing' });
      try {
        const result = await analyzeViaSSE(uploadedPath, item.isLargeQuestion, item.id);
        updateItem(item.id, { status: 'done', result, expanded: true });
      } catch (err) {
        updateItem(item.id, { status: 'error', errorMsg: err instanceof Error ? err.message : '分析失败' });
      } finally {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    }

    setBatchAnalyzing(false);
  }

  async function handleSaveAll() {
    const toSave = items.filter(i => i.status === 'done' && !i.saved && i.studentId && i.uploadedPath);
    if (toSave.length === 0) return;

    setBatchSaving(true);
    for (const item of toSave) {
      try {
        await fetch('/api/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: item.studentId,
            image_path: item.uploadedPath,
            ai_solution: item.result?.solution || '',
            ai_answer: item.result?.answer || '',
            ocr_text: item.result?.ocrText || '',
            error_reason: item.result?.errorReason || '',
            knowledge_point_seqs: (item.result?.knowledgePoints || []).map(k => k.seq),
          }),
        });
        updateItem(item.id, { saved: true });
      } catch {
        updateItem(item.id, { errorMsg: '保存失败' });
      }
    }
    setBatchSaving(false);
  }

  function updateItemKps(itemId: string, kps: KpSuggestion[]) {
    setItems(prev => prev.map(i => {
      if (i.id !== itemId || !i.result) return i;
      return { ...i, result: { ...i.result, knowledgePoints: kps } };
    }));
  }

  const pendingCount = items.filter(i => i.status === 'pending' && i.studentId).length;
  const doneUnsavedCount = items.filter(i => i.status === 'done' && !i.saved).length;
  const allAssigned = items.length > 0 && items.every(i => i.studentId);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">批量上传题目</h1>

      {/* Add images area */}
      <div className="mb-6">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
        >
          <div className="text-4xl text-slate-300 mb-2">+</div>
          <div className="text-sm text-slate-500">点击选择图片（可多选）</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFilesAdd}
          className="hidden"
        />
      </div>

      {/* Image list */}
      {items.length > 0 && (
        <div className="space-y-3 mb-6">
          {items.map((item, index) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              {/* Item header row */}
              <div className="flex items-center gap-3 p-3">
                {/* Thumbnail */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.preview} alt="" className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />

                {/* Info and controls */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-400">#{index + 1}</span>
                    <span className="text-sm text-slate-600 truncate">{item.file.name}</span>
                    <StatusBadge status={item.status} saved={item.saved} />
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Student selector */}
                    <select
                      value={item.studentId}
                      onChange={e => updateItem(item.id, { studentId: Number(e.target.value) || '' })}
                      disabled={item.status !== 'pending'}
                      className="text-sm px-2 py-1 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px] disabled:opacity-50"
                    >
                      <option value="">选择学生...</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.student_code ? ` (${s.student_code})` : ''} - {s.current_grade}
                        </option>
                      ))}
                    </select>

                    {/* Large question checkbox */}
                    <label className="flex items-center gap-1 text-sm text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.isLargeQuestion}
                        onChange={e => updateItem(item.id, { isLargeQuestion: e.target.checked })}
                        disabled={item.status !== 'pending'}
                        className="rounded"
                      />
                      大题
                    </label>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.status === 'done' && (
                    <button
                      onClick={() => updateItem(item.id, { expanded: !item.expanded })}
                      className="text-sm text-blue-600 hover:underline px-2"
                    >
                      {item.expanded ? '收起' : '展开'}
                    </button>
                  )}
                  {(item.status === 'pending' || item.status === 'error') && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-slate-400 hover:text-red-500 p-1"
                      title="移除"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar (during analysis) */}
              {(item.status === 'uploading' || item.status === 'analyzing') && (
                <div className="px-3 pb-3">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-purple-700">{item.progress.message}</span>
                      <span className="text-xs text-purple-500">{formatElapsed(item.progress.elapsed)}</span>
                    </div>
                    <div className="w-full bg-purple-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(item.progress.percent, 3)}%` }}
                      >
                        <div className="w-full h-full bg-gradient-to-r from-purple-600 to-purple-400 animate-pulse rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {item.status === 'error' && (
                <div className="px-3 pb-3">
                  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
                    {item.errorMsg}
                  </div>
                </div>
              )}

              {/* Expanded result */}
              {item.expanded && item.result && (
                <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                  {item.result.ocrText && (
                    <div>
                      <h4 className="text-xs font-medium text-slate-500 mb-1">题目原文 (OCR)</h4>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200 leading-relaxed max-h-40 overflow-auto">
                        {item.result.ocrText}
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 mb-1">解题思路</h4>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap bg-white p-3 rounded-lg border border-slate-200 max-h-40 overflow-auto">
                      {item.result.solution}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-slate-500 mb-1">答案</h4>
                    <div className="text-sm text-slate-800 font-medium bg-white p-3 rounded-lg border border-slate-200">
                      {item.result.answer}
                    </div>
                  </div>
                  {item.result.errorReason && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <h4 className="text-xs font-medium text-orange-700 mb-1">错误原因</h4>
                      <div className="text-sm text-orange-800">{item.result.errorReason}</div>
                    </div>
                  )}
                  {/* Knowledge points */}
                  <KpEditor
                    itemId={item.id}
                    kps={item.result.knowledgePoints}
                    allKps={allKps}
                    onUpdate={(kps) => updateItemKps(item.id, kps)}
                  />
                  {item.saved && (
                    <div className="text-sm text-green-600 font-medium">已保存</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action bar */}
      {items.length > 0 && (
        <div className="flex items-center gap-3 sticky bottom-0 bg-white border-t border-slate-200 -mx-6 px-6 py-4">
          <button
            onClick={handleAnalyzeAll}
            disabled={batchAnalyzing || pendingCount === 0 || !allAssigned}
            className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {batchAnalyzing ? '分析中...' : `AI分析 (${pendingCount}张)`}
          </button>

          <button
            onClick={handleSaveAll}
            disabled={batchSaving || doneUnsavedCount === 0}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {batchSaving ? '保存中...' : `全部保存 (${doneUnsavedCount}张)`}
          </button>

          {!allAssigned && items.length > 0 && (
            <span className="text-sm text-orange-500">有图片未选择学生</span>
          )}

          <div className="ml-auto text-sm text-slate-500">
            共 {items.length} 张图片
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, saved }: { status: ImageItem['status']; saved: boolean }) {
  if (saved) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">已保存</span>;
  switch (status) {
    case 'pending': return <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">待分析</span>;
    case 'uploading': return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">上传中</span>;
    case 'analyzing': return <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 animate-pulse">分析中</span>;
    case 'done': return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">已分析</span>;
    case 'error': return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">失败</span>;
  }
}

function KpEditor({ itemId, kps, allKps, onUpdate }: {
  itemId: string;
  kps: KpSuggestion[];
  allKps: KnowledgePoint[];
  onUpdate: (kps: KpSuggestion[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const filtered = search
    ? allKps.filter(kp =>
        kp.level3.includes(search) || kp.level1.includes(search) ||
        kp.level2.includes(search) || String(kp.seq_number) === search
      ).slice(0, 15)
    : [];

  return (
    <div>
      <h4 className="text-xs font-medium text-slate-500 mb-1">知识点标签</h4>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {kps.map(kp => {
          const full = allKps.find(k => k.seq_number === kp.seq);
          return (
            <span key={`${itemId}-kp-${kp.seq}`} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              [{kp.seq}] {full?.level3 || `知识点${kp.seq}`}
              <button onClick={() => onUpdate(kps.filter(k => k.seq !== kp.seq))} className="hover:text-red-600">&times;</button>
            </span>
          );
        })}
        <button onClick={() => setShowPicker(true)} className="text-xs text-blue-600 hover:underline">+ 添加</button>
      </div>
      {showPicker && (
        <div className="border border-slate-200 rounded-lg p-2 bg-white">
          <input
            type="text"
            placeholder="搜索知识点..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-2 py-1 border border-slate-300 rounded text-sm mb-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
          <div className="max-h-32 overflow-auto">
            {filtered.map(kp => (
              <button
                key={kp.seq_number}
                onClick={() => {
                  if (!kps.some(k => k.seq === kp.seq_number)) {
                    onUpdate([...kps, { seq: kp.seq_number, reason: '手动添加' }]);
                  }
                  setShowPicker(false);
                  setSearch('');
                }}
                className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 rounded"
              >
                <span className="text-slate-400 mr-2">{kp.seq_number}</span>
                {kp.level3}
                <span className="text-slate-300 ml-2">{'★'.repeat(kp.difficulty)}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setShowPicker(false); setSearch(''); }} className="text-xs text-slate-400 mt-1 hover:underline">关闭</button>
        </div>
      )}
    </div>
  );
}
