'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface KnowledgePoint {
  seq_number: number;
  level1: string;
  level2: string;
  level3: string;
  difficulty: number;
}

interface QuestionKp {
  seq: number;
  level3: string;
  level1: string;
  level2: string;
  difficulty: number;
}

interface Question {
  id: number;
  image_path: string;
  ai_answer: string;
  ocr_text: string;
  student_name: string;
  created_at: string;
  knowledge_points: QuestionKp[];
}

export default function QuestionBankPage() {
  const [allKps, setAllKps] = useState<KnowledgePoint[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedKpSeqs, setSelectedKpSeqs] = useState<Set<number>>(new Set());
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  // KP tree expand state
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());
  const [kpFilterSearch, setKpFilterSearch] = useState('');

  useEffect(() => {
    fetch('/api/knowledge-points').then(r => r.json()).then(setAllKps);
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [page, selectedKpSeqs, search]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchQuestions() {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (search) params.set('search', search);
    if (selectedKpSeqs.size > 0) params.set('kp_seqs', Array.from(selectedKpSeqs).join(','));

    const res = await fetch(`/api/question-bank?${params}`);
    const data = await res.json();
    setQuestions(data.questions);
    setTotal(data.total);
  }

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function toggleKpSeq(seq: number) {
    setSelectedKpSeqs(prev => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq); else next.add(seq);
      return next;
    });
    setPage(1);
  }

  function toggleSelectQuestion(id: number) {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (questions.every(q => selectedQuestionIds.has(q.id))) {
      setSelectedQuestionIds(prev => {
        const next = new Set(prev);
        for (const q of questions) next.delete(q.id);
        return next;
      });
    } else {
      setSelectedQuestionIds(prev => {
        const next = new Set(prev);
        for (const q of questions) next.add(q.id);
        return next;
      });
    }
  }

  async function handleExport() {
    if (selectedQuestionIds.size === 0) {
      alert('请先选择要导出的题目');
      return;
    }
    setExporting(true);
    try {
      const res = await fetch('/api/question-bank/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionIds: Array.from(selectedQuestionIds) }),
      });
      if (!res.ok) {
        let errMsg = '导出失败';
        try { const err = await res.json(); errMsg = err.error || errMsg; } catch { /* ignore */ }
        throw new Error(errMsg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'question-bank-export.docx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`导出失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setExporting(false);
    }
  }

  // Build KP tree for filtering
  const tree: Record<string, Record<string, KnowledgePoint[]>> = {};
  for (const kp of allKps) {
    if (kpFilterSearch) {
      const s = kpFilterSearch.toLowerCase();
      if (!kp.level3.toLowerCase().includes(s) &&
          !kp.level1.toLowerCase().includes(s) &&
          !kp.level2.toLowerCase().includes(s) &&
          String(kp.seq_number) !== kpFilterSearch) {
        continue;
      }
    }
    if (!tree[kp.level1]) tree[kp.level1] = {};
    if (!tree[kp.level1][kp.level2]) tree[kp.level1][kp.level2] = [];
    tree[kp.level1][kp.level2].push(kp);
  }

  const totalPages = Math.ceil(total / pageSize);
  const allCurrentSelected = questions.length > 0 && questions.every(q => selectedQuestionIds.has(q.id));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">题库</h1>

      <div className="flex gap-6">
        {/* Left: KP filter tree */}
        <div className="w-72 shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-6">
            <h2 className="text-sm font-medium mb-3">按知识点筛选</h2>
            <input
              type="text"
              placeholder="搜索知识点..."
              value={kpFilterSearch}
              onChange={e => setKpFilterSearch(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {selectedKpSeqs.size > 0 && (
              <button
                onClick={() => { setSelectedKpSeqs(new Set()); setPage(1); }}
                className="text-xs text-blue-600 hover:underline mb-2"
              >
                清除所有筛选 ({selectedKpSeqs.size}个)
              </button>
            )}

            <div className="max-h-[60vh] overflow-auto space-y-1">
              {Object.entries(tree).map(([l1, l2Map]) => {
                const l1Expanded = expandedL1.has(l1);
                return (
                  <div key={l1}>
                    <button
                      onClick={() => {
                        setExpandedL1(prev => {
                          const next = new Set(prev);
                          if (next.has(l1)) next.delete(l1); else next.add(l1);
                          return next;
                        });
                      }}
                      className="w-full flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded"
                    >
                      <span className="text-slate-400">{l1Expanded ? '▼' : '▶'}</span>
                      <span className="truncate">{l1}</span>
                    </button>

                    {l1Expanded && Object.entries(l2Map).map(([l2, kps]) => {
                      const l2Key = `${l1}::${l2}`;
                      const l2Expanded = expandedL2.has(l2Key);
                      return (
                        <div key={l2Key} className="pl-3">
                          <button
                            onClick={() => {
                              setExpandedL2(prev => {
                                const next = new Set(prev);
                                if (next.has(l2Key)) next.delete(l2Key); else next.add(l2Key);
                                return next;
                              });
                            }}
                            className="w-full flex items-center gap-1 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50 rounded"
                          >
                            <span className="text-slate-400">{l2Expanded ? '▼' : '▶'}</span>
                            <span className="truncate">{l2}</span>
                          </button>

                          {l2Expanded && (
                            <div className="pl-4">
                              {kps.map(kp => (
                                <label
                                  key={kp.seq_number}
                                  className="flex items-center gap-1.5 px-2 py-0.5 text-xs text-slate-600 hover:bg-blue-50 rounded cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedKpSeqs.has(kp.seq_number)}
                                    onChange={() => toggleKpSeq(kp.seq_number)}
                                    className="rounded border-slate-300 w-3.5 h-3.5"
                                  />
                                  <span className="truncate">{kp.level3}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Question list */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 flex items-center gap-2">
              <input
                type="text"
                placeholder="搜索题目内容..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                搜索
              </button>
            </div>

            <button
              onClick={handleExport}
              disabled={selectedQuestionIds.size === 0 || exporting}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {exporting ? '导出中...' : `导出选中 (${selectedQuestionIds.size})`}
            </button>
          </div>

          {/* Summary */}
          <div className="flex items-center gap-3 mb-3 text-sm text-slate-500">
            <span>共 {total} 题</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allCurrentSelected}
                onChange={toggleSelectAll}
                className="rounded border-slate-300"
              />
              全选当前页
            </label>
          </div>

          {/* Question list */}
          <div className="space-y-3">
            {questions.map(q => {
              const imageFilename = q.image_path.split(/[\\/]/).pop();
              return (
                <div
                  key={q.id}
                  className={`bg-white border rounded-xl p-4 flex items-start gap-4 ${
                    selectedQuestionIds.has(q.id) ? 'border-blue-400 bg-blue-50/30' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedQuestionIds.has(q.id)}
                    onChange={() => toggleSelectQuestion(q.id)}
                    className="rounded border-slate-300 mt-1 w-4 h-4 shrink-0"
                  />

                  <Link href={`/question/${q.id}`} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/image/${imageFilename}`}
                      alt="题目"
                      className="w-20 h-20 object-cover rounded-lg border border-slate-200 hover:opacity-80"
                    />
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link href={`/question/${q.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                        #{q.id}
                      </Link>
                      <span className="text-xs text-slate-400">{q.student_name}</span>
                      <span className="text-xs text-slate-400">{q.created_at}</span>
                    </div>

                    {q.ocr_text && (
                      <p className="text-xs text-slate-600 line-clamp-2 mb-1.5 bg-slate-50 px-2 py-1 rounded">
                        {q.ocr_text}
                      </p>
                    )}

                    {q.ai_answer && (
                      <p className="text-sm text-slate-700 line-clamp-1 mb-1.5">
                        答案: {q.ai_answer}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1">
                      {q.knowledge_points.map((kp, i) => (
                        <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          {kp.level3}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {questions.length === 0 && (
              <div className="text-center text-slate-400 py-16">
                {total === 0 ? '暂无题目' : '没有匹配的题目'}
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
              >
                上一页
              </button>
              <span className="text-sm text-slate-600">
                第 {page} / {totalPages} 页
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm disabled:opacity-50 hover:bg-slate-50"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
