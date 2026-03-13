'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Student {
  id: number;
  name: string;
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

export default function UploadPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [allKps, setAllKps] = useState<KnowledgePoint[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<number | ''>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [solution, setSolution] = useState('');
  const [answer, setAnswer] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [errorReason, setErrorReason] = useState('');
  const [selectedKps, setSelectedKps] = useState<KpSuggestion[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [kpSearch, setKpSearch] = useState('');
  const [showKpPicker, setShowKpPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(setStudents);
    fetch('/api/knowledge-points').then(r => r.json()).then(setAllKps);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setUploadedPath(null);
    setSolution('');
    setAnswer('');
    setOcrText('');
    setErrorReason('');
    setSelectedKps([]);
    setSaved(false);
  }

  async function handleUpload() {
    if (!imageFile) return;
    const formData = new FormData();
    formData.append('file', imageFile);

    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    setUploadedPath(data.path);
    return data.path;
  }

  async function handleAnalyze() {
    if (!imageFile) return;
    setAnalyzing(true);
    setProgressPercent(0);
    setProgressMessage('正在上传图片...');
    setElapsedSeconds(0);

    // Start elapsed timer
    timerRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    try {
      let imgPath = uploadedPath;
      if (!imgPath) {
        imgPath = await handleUpload();
      }

      setProgressPercent(5);
      setProgressMessage('正在启动AI分析...');

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: imgPath }),
      });

      if (!res.ok || !res.body) {
        throw new Error('分析请求失败');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            setProgressPercent(parsed.percent || 0);
            setProgressMessage(parsed.message || '分析中...');
          } else if (type === 'result') {
            setSolution(parsed.solution || '');
            setAnswer(parsed.answer || '');
            setOcrText(parsed.ocrText || '');
            setErrorReason(parsed.errorReason || '');
            setSelectedKps(parsed.knowledgePoints || []);
          } else if (type === 'error') {
            alert(`分析失败: ${parsed.message}`);
          }
        }
      }
    } catch (err) {
      alert(`分析出错: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setAnalyzing(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }

  function addKnowledgePoint(kp: KnowledgePoint) {
    if (selectedKps.some(s => s.seq === kp.seq_number)) return;
    setSelectedKps([...selectedKps, { seq: kp.seq_number, reason: '手动添加' }]);
    setShowKpPicker(false);
    setKpSearch('');
  }

  function removeKp(seq: number) {
    setSelectedKps(selectedKps.filter(k => k.seq !== seq));
  }

  async function handleSave() {
    if (!selectedStudentId || !uploadedPath) {
      alert('请选择学生并上传图片');
      return;
    }

    setSaving(true);
    try {
      let imgPath = uploadedPath;
      if (!imgPath && imageFile) {
        imgPath = await handleUpload();
      }

      await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedStudentId,
          image_path: imgPath,
          ai_solution: solution,
          ai_answer: answer,
          ocr_text: ocrText,
          error_reason: errorReason,
          knowledge_point_seqs: selectedKps.map(k => k.seq),
        }),
      });
      setSaved(true);
    } catch (err) {
      alert(`保存失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setImageFile(null);
    setImagePreview(null);
    setUploadedPath(null);
    setSolution('');
    setAnswer('');
    setOcrText('');
    setErrorReason('');
    setSelectedKps([]);
    setSaved(false);
    setProgressPercent(0);
    setProgressMessage('');
    setElapsedSeconds(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function formatElapsed(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}分${sec < 10 ? '0' : ''}${sec}秒` : `${sec}秒`;
  }

  const filteredKps = kpSearch
    ? allKps.filter(kp =>
        kp.level3.includes(kpSearch) ||
        kp.level1.includes(kpSearch) ||
        kp.level2.includes(kpSearch) ||
        String(kp.seq_number) === kpSearch
      ).slice(0, 20)
    : [];

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">上传题目</h1>

      {/* Step 1: Select student */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">1. 选择学生</label>
        <select
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(Number(e.target.value) || '')}
          className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">请选择学生...</option>
          {students.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.current_grade} - {s.school})</option>
          ))}
        </select>
      </div>

      {/* Step 2: Upload image */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">2. 上传题目截图</label>
        <div className="flex items-start gap-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-64 h-64 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors overflow-hidden"
          >
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="预览" className="w-full h-full object-contain" />
            ) : (
              <div className="text-center text-slate-400">
                <div className="text-4xl mb-2">+</div>
                <div className="text-sm">点击选择图片</div>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={handleAnalyze}
              disabled={!imageFile || analyzing}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {analyzing ? '分析中...' : '🤖 AI分析'}
            </button>
            {imageFile && !analyzing && (
              <button onClick={handleReset} className="px-4 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">
                重新选择
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {analyzing && (
          <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-700">{progressMessage}</span>
              <span className="text-xs text-purple-500">{formatElapsed(elapsedSeconds)}</span>
            </div>
            <div className="w-full bg-purple-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-purple-600 h-3 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.max(progressPercent, 3)}%` }}
              >
                <div className="w-full h-full bg-gradient-to-r from-purple-600 to-purple-400 animate-pulse rounded-full" />
              </div>
            </div>
            <div className="text-xs text-purple-500 mt-1 text-right">{progressPercent}%</div>
          </div>
        )}
      </div>

      {/* Step 3: AI results */}
      {(solution || answer) && (
        <div className="mb-6 space-y-4">
          <h2 className="text-sm font-medium">3. AI分析结果</h2>

          {/* OCR Text */}
          {ocrText && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-600 mb-2">题目原文 (OCR)</h3>
              <div className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg leading-relaxed">
                {ocrText}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-slate-600 mb-2">解题思路</h3>
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{solution}</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-slate-600 mb-2">答案</h3>
            <div className="text-sm text-slate-800 font-medium">{answer}</div>
          </div>

          {/* Error Reason */}
          {errorReason && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <h3 className="text-sm font-medium text-orange-700 mb-2">错误原因分析</h3>
              <div className="text-sm text-orange-800 leading-relaxed">{errorReason}</div>
            </div>
          )}

          {/* Knowledge points */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-medium text-slate-600 mb-3">知识点标签</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {selectedKps.map(kp => {
                const fullKp = allKps.find(k => k.seq_number === kp.seq);
                return (
                  <span key={kp.seq} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full">
                    [{kp.seq}] {fullKp?.level3 || `知识点${kp.seq}`}
                    <button onClick={() => removeKp(kp.seq)} className="ml-1 hover:text-red-600">&times;</button>
                  </span>
                );
              })}
              <button
                onClick={() => setShowKpPicker(true)}
                className="text-sm text-blue-600 hover:underline"
              >
                + 添加知识点
              </button>
            </div>

            {/* KP Picker */}
            {showKpPicker && (
              <div className="border border-slate-200 rounded-lg p-3 mt-2">
                <input
                  type="text"
                  placeholder="搜索知识点名称或序号..."
                  value={kpSearch}
                  onChange={e => setKpSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <div className="max-h-48 overflow-auto">
                  {filteredKps.map(kp => (
                    <button
                      key={kp.seq_number}
                      onClick={() => addKnowledgePoint(kp)}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 rounded flex items-center gap-2"
                    >
                      <span className="text-slate-400 w-8">{kp.seq_number}</span>
                      <span className="flex-1">{kp.level3}</span>
                      <span className="text-xs text-slate-400">{'★'.repeat(kp.difficulty)}</span>
                    </button>
                  ))}
                  {kpSearch && filteredKps.length === 0 && (
                    <div className="text-sm text-slate-400 py-2 text-center">未找到匹配的知识点</div>
                  )}
                </div>
                <button
                  onClick={() => { setShowKpPicker(false); setKpSearch(''); }}
                  className="mt-2 text-xs text-slate-500 hover:underline"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Save */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!selectedStudentId || !imageFile || saving || saved}
          className="px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {saving ? '保存中...' : saved ? '✓ 已保存' : '保存题目'}
        </button>

        {saved && (
          <span className="text-sm text-green-600">
            保存成功！
            <Link href={`/student/${selectedStudentId}`} className="text-blue-600 hover:underline ml-2">
              查看学生档案
            </Link>
          </span>
        )}
      </div>
    </div>
  );
}
