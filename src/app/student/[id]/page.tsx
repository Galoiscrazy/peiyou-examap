'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface KnowledgePoint {
  id: number;
  seq: number;
  confirmed: number;
  level3: string;
  level1: string;
  level2: string;
  difficulty: number;
}

interface Question {
  id: number;
  image_path: string;
  ai_solution: string;
  ai_answer: string;
  ocr_text?: string;
  error_reason?: string;
  created_at: string;
  knowledge_points: KnowledgePoint[];
}

interface MasteryItem {
  seq_number: number;
  level1: string;
  level2: string;
  level3: string;
  difficulty: number;
  tag_type: string;
  confirmed_count: number;
  total_asked: number;
}

interface StudentData {
  id: number;
  name: string;
  school: string;
  initial_grade: number;
  enrollment_year: number;
  current_grade: string;
  questions: Question[];
  mastery: MasteryItem[];
}

interface StatsData {
  byLevel1: { level1: string; kp_count: number; ask_count: number }[];
  byDifficulty: { difficulty: number; count: number }[];
  totalQuestions: number;
  totalKnowledgePoints: number;
  allKnowledgePoints: number;
  coveragePercent: number;
}

function getMasteryClass(confirmedCount: number): string {
  if (confirmedCount <= 0) return 'mastery-none';
  if (confirmedCount === 1) return 'mastery-red';
  if (confirmedCount === 2) return 'mastery-yellow';
  return 'mastery-green';
}

function getMasteryLabel(confirmedCount: number): string {
  if (confirmedCount <= 0) return '';
  if (confirmedCount === 1) return '1次';
  if (confirmedCount === 2) return '2次';
  return `${confirmedCount}次`;
}

function getAcademicYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

export default function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [student, setStudent] = useState<StudentData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [tab, setTab] = useState<'mastery' | 'stats' | 'history'>('mastery');
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());

  // Edit student modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', school: '', current_grade: 1 });

  // History filters
  const [historySearch, setHistorySearch] = useState('');
  const [historyKpFilter, setHistoryKpFilter] = useState('');

  useEffect(() => {
    fetch(`/api/students/${id}`).then(r => r.json()).then(setStudent);
    fetch(`/api/students/${id}/stats`).then(r => r.json()).then(setStats);
  }, [id]);

  if (!student) return <div className="p-6">加载中...</div>;

  // Build tree structure from mastery data
  const tree: Record<string, Record<string, MasteryItem[]>> = {};
  for (const m of student.mastery) {
    if (!tree[m.level1]) tree[m.level1] = {};
    if (!tree[m.level1][m.level2]) tree[m.level1][m.level2] = [];
    tree[m.level1][m.level2].push(m);
  }

  function toggleL1(l1: string) {
    setExpandedL1(prev => {
      const next = new Set(prev);
      if (next.has(l1)) next.delete(l1); else next.add(l1);
      return next;
    });
  }

  function toggleL2(key: string) {
    setExpandedL2(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleConfirm(qkpId: number, currentVal: number) {
    const newVal = currentVal ? 0 : 1;
    await fetch(`/api/question-kp/${qkpId}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed_mastered: newVal }),
    });
    const data = await fetch(`/api/students/${id}`).then(r => r.json());
    setStudent(data);
  }

  function openEditModal() {
    if (!student) return;
    const gradeMap: Record<string, number> = { '高一': 1, '高二': 2, '高三': 3 };
    const gradeNum = gradeMap[student.current_grade] || student.initial_grade;
    setEditForm({
      name: student.name,
      school: student.school,
      current_grade: gradeNum,
    });
    setShowEditModal(true);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    const academicYear = getAcademicYear();
    const payload = {
      name: editForm.name,
      school: editForm.school,
      initial_grade: editForm.current_grade,
      enrollment_year: academicYear,
    };
    await fetch(`/api/students/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setShowEditModal(false);
    const data = await fetch(`/api/students/${id}`).then(r => r.json());
    setStudent(data);
  }

  // Get unique KP names from student's questions for the filter dropdown
  const allQuestionKps = new Map<string, string>();
  for (const q of student.questions) {
    for (const kp of q.knowledge_points) {
      if (kp.level3 && !allQuestionKps.has(kp.level3)) {
        allQuestionKps.set(kp.level3, kp.level3);
      }
    }
  }

  // Filter history questions
  const filteredQuestions = student.questions.filter(q => {
    if (historySearch) {
      const s = historySearch.toLowerCase();
      const matchOcr = q.ocr_text?.toLowerCase().includes(s);
      const matchAnswer = q.ai_answer?.toLowerCase().includes(s);
      const matchSolution = q.ai_solution?.toLowerCase().includes(s);
      if (!matchOcr && !matchAnswer && !matchSolution) return false;
    }
    if (historyKpFilter) {
      if (!q.knowledge_points.some(kp => kp.level3 === historyKpFilter)) return false;
    }
    return true;
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-blue-600 hover:underline text-sm">&larr; 返回学生列表</Link>
        <div className="flex items-center gap-4 mt-2">
          <h1 className="text-2xl font-bold">{student.name}</h1>
          <span className="bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full">{student.current_grade}</span>
          <button
            onClick={openEditModal}
            className="text-sm text-slate-500 hover:text-blue-600 px-2 py-1 border border-slate-300 rounded-lg hover:border-blue-300 transition-colors"
          >
            编辑信息
          </button>
        </div>
        <p className="text-slate-500 text-sm mt-1">{student.school || '未填写学校'}</p>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">编辑学生信息</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">姓名/微信昵称 *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">学校</label>
                <input
                  type="text"
                  value={editForm.school}
                  onChange={e => setEditForm({ ...editForm, school: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">当前年级 *</label>
                <select
                  value={editForm.current_grade}
                  onChange={e => setEditForm({ ...editForm, current_grade: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>高一</option>
                  <option value={2}>高二</option>
                  <option value={3}>高三</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {(['mastery', 'stats', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'mastery' ? '考点掌握地图' : t === 'stats' ? '统计分析' : '历史提问'}
          </button>
        ))}
      </div>

      {/* Mastery Tab */}
      {tab === 'mastery' && (
        <div className="space-y-2">
          <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="mastery-dot mastery-none"></span> 未涉及</span>
            <span className="flex items-center gap-1"><span className="mastery-dot mastery-red"></span> 掌握1次</span>
            <span className="flex items-center gap-1"><span className="mastery-dot mastery-yellow"></span> 掌握2次</span>
            <span className="flex items-center gap-1"><span className="mastery-dot mastery-green"></span> 掌握3次+</span>
          </div>

          {Object.entries(tree).map(([l1, l2Map]) => {
            const l1Expanded = expandedL1.has(l1);
            const l1Items = Object.values(l2Map).flat();
            const l1HasData = l1Items.some(m => m.confirmed_count > 0);

            return (
              <div key={l1} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleL1(l1)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                >
                  <span className="text-xs text-slate-400">{l1Expanded ? '▼' : '▶'}</span>
                  <span className="font-medium text-sm">{l1}</span>
                  {l1HasData && (
                    <span className="text-xs text-slate-400 ml-auto">
                      {l1Items.filter(m => m.confirmed_count > 0).length}/{l1Items.length} 涉及
                    </span>
                  )}
                </button>

                {l1Expanded && (
                  <div className="pl-4">
                    {Object.entries(l2Map).map(([l2, items]) => {
                      const l2Key = `${l1}::${l2}`;
                      const l2Expanded = expandedL2.has(l2Key);

                      return (
                        <div key={l2Key}>
                          <button
                            onClick={() => toggleL2(l2Key)}
                            className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 text-left border-t border-slate-100"
                          >
                            <span className="text-xs text-slate-400">{l2Expanded ? '▼' : '▶'}</span>
                            <span className="text-sm text-slate-700">{l2}</span>
                          </button>

                          {l2Expanded && (
                            <div className="pl-8 py-1 tree-node-enter">
                              {items.map(m => (
                                <div key={m.seq_number} className="flex items-center gap-2 px-4 py-1.5 text-sm">
                                  <span className={`mastery-dot ${getMasteryClass(m.confirmed_count)}`}></span>
                                  <span className="text-slate-400 text-xs w-8">{m.seq_number}</span>
                                  <span className="flex-1 text-slate-700">{m.level3}</span>
                                  <span className="text-xs text-slate-400">{'★'.repeat(m.difficulty)}</span>
                                  {m.confirmed_count > 0 && (
                                    <span className="text-xs text-slate-500">{getMasteryLabel(m.confirmed_count)}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{stats.totalQuestions}</div>
              <div className="text-sm text-slate-500 mt-1">总提问数</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-green-600">{stats.totalKnowledgePoints}</div>
              <div className="text-sm text-slate-500 mt-1">涉及知识点</div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-amber-600">{stats.coveragePercent}%</div>
              <div className="text-sm text-slate-500 mt-1">考点覆盖率</div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="font-medium mb-3">按章节提问分布</h3>
            <div className="space-y-2">
              {stats.byLevel1.map(item => {
                const maxCount = Math.max(...stats.byLevel1.map(i => i.ask_count), 1);
                return (
                  <div key={item.level1} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-48 truncate" title={item.level1}>{item.level1}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all"
                        style={{ width: `${(item.ask_count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-16 text-right">{item.ask_count}次/{item.kp_count}点</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="font-medium mb-3">按难度提问分布</h3>
            <div className="flex items-end gap-6 justify-center h-40">
              {[1, 2, 3, 4, 5].map(d => {
                const item = stats.byDifficulty.find(i => i.difficulty === d);
                const count = item?.count || 0;
                const maxCount = Math.max(...stats.byDifficulty.map(i => i.count), 1);
                const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                return (
                  <div key={d} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-slate-500">{count}</span>
                    <div className="w-12 bg-slate-100 rounded-t" style={{ height: '120px', position: 'relative' }}>
                      <div
                        className="absolute bottom-0 left-0 right-0 bg-amber-400 rounded-t transition-all"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                    <span className="text-xs star-filled">{'★'.repeat(d)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              placeholder="搜索题目内容、答案..."
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="flex-1 max-w-sm px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={historyKpFilter}
              onChange={e => setHistoryKpFilter(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">全部知识点</option>
              {Array.from(allQuestionKps.keys()).map(kp => (
                <option key={kp} value={kp}>{kp}</option>
              ))}
            </select>
            {(historySearch || historyKpFilter) && (
              <button
                onClick={() => { setHistorySearch(''); setHistoryKpFilter(''); }}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                清除筛选
              </button>
            )}
          </div>

          {filteredQuestions.length === 0 && (
            <div className="text-center text-slate-400 py-12">
              {student.questions.length === 0 ? '暂无提问记录' : '没有匹配的题目'}
            </div>
          )}

          {filteredQuestions.map(q => (
            <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start gap-4">
                <Link href={`/question/${q.id}`} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/image/${q.image_path.split(/[\\/]/).pop()}`}
                    alt="题目截图"
                    className="w-24 h-24 object-cover rounded-lg border border-slate-200 hover:opacity-80"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-slate-400">{q.created_at}</span>
                    <Link href={`/question/${q.id}`} className="text-xs text-blue-600 hover:underline">查看详情</Link>
                  </div>
                  <p className="text-sm text-slate-700 line-clamp-2 mb-2">{q.ai_answer || '未生成答案'}</p>

                  {/* Error reason summary */}
                  {q.error_reason && (
                    <p className="text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded line-clamp-2 mb-2">
                      错因: {q.error_reason}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {q.knowledge_points.map((kp, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          kp.confirmed
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {kp.confirmed ? '✓' : ''} {kp.level3}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Confirm mastery checkboxes */}
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="flex flex-wrap gap-3">
                  {q.knowledge_points.map((kp, i) => (
                    <label key={i} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!kp.confirmed}
                        onChange={() => handleConfirm(kp.id, kp.confirmed)}
                        className="rounded border-slate-300"
                      />
                      确认掌握: {kp.level3}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
