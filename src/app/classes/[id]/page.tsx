'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface Student {
  id: number;
  name: string;
  school: string;
  current_grade: string;
  question_count: number;
}

interface ClassDetail {
  id: number;
  name: string;
  description: string;
  students: Student[];
}

interface HeatmapItem {
  seq_number: number;
  level1: string;
  level2: string;
  level3: string;
  difficulty: number;
  tag_type: string;
  student_count: number;
  total_asks: number;
  confirmed_count: number;
}

interface StatsData {
  heatmap: HeatmapItem[];
  byLevel1: { level1: string; kp_count: number; ask_count: number }[];
  byDifficulty: { difficulty: number; count: number }[];
  topKnowledgePoints: { seq_number: number; level3: string; level1: string; difficulty: number; ask_count: number; student_count: number }[];
  studentCount: number;
}

export default function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [classInfo, setClassInfo] = useState<ClassDetail | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [tab, setTab] = useState<'students' | 'heatmap' | 'stats'>('heatmap');
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/classes/${id}`).then(r => r.json()).then(setClassInfo);
    fetch(`/api/classes/${id}/stats`).then(r => r.json()).then(setStats);
  }, [id]);

  if (!classInfo || !stats) return <div className="p-6">加载中...</div>;

  // Build heatmap tree
  const tree: Record<string, Record<string, HeatmapItem[]>> = {};
  for (const item of stats.heatmap) {
    if (!tree[item.level1]) tree[item.level1] = {};
    if (!tree[item.level1][item.level2]) tree[item.level1][item.level2] = [];
    tree[item.level1][item.level2].push(item);
  }

  const maxAsks = Math.max(...stats.heatmap.map(h => h.total_asks), 1);

  function getHeatBg(totalAsks: number): string {
    if (totalAsks === 0) return '';
    const intensity = totalAsks / maxAsks;
    if (intensity < 0.2) return 'bg-red-50';
    if (intensity < 0.4) return 'bg-red-100';
    if (intensity < 0.6) return 'bg-red-200';
    if (intensity < 0.8) return 'bg-red-300';
    return 'bg-red-400 text-white';
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

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link href="/classes" className="text-blue-600 hover:underline text-sm">&larr; 返回班级列表</Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">{classInfo.name}</h1>
        <span className="text-sm text-slate-500">{classInfo.students.length} 名学生</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {(['heatmap', 'stats', 'students'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'heatmap' ? '考点热力图' : t === 'stats' ? '统计分析' : '学生列表'}
          </button>
        ))}
      </div>

      {/* Heatmap Tab */}
      {tab === 'heatmap' && (
        <div>
          <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
            <span>薄弱点热度:</span>
            <span className="px-2 py-0.5 bg-red-50 rounded">低</span>
            <span className="px-2 py-0.5 bg-red-100 rounded">中</span>
            <span className="px-2 py-0.5 bg-red-200 rounded">高</span>
            <span className="px-2 py-0.5 bg-red-300 rounded">很高</span>
            <span className="px-2 py-0.5 bg-red-400 text-white rounded">极高</span>
            <span className="ml-auto">颜色越深 = 越多学生问 = 班级薄弱点</span>
          </div>

          <div className="space-y-2">
            {Object.entries(tree).map(([l1, l2Map]) => {
              const l1Expanded = expandedL1.has(l1);
              const l1Items = Object.values(l2Map).flat();
              const l1Asks = l1Items.reduce((s, k) => s + k.total_asks, 0);

              return (
                <div key={l1} className="border border-slate-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleL1(l1)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                  >
                    <span className="text-xs text-slate-400">{l1Expanded ? '▼' : '▶'}</span>
                    <span className="font-medium text-sm flex-1">{l1}</span>
                    {l1Asks > 0 && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        {l1Asks}次
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
                              <span className="text-sm text-slate-700 flex-1">{l2}</span>
                            </button>

                            {l2Expanded && (
                              <div className="pl-8 py-1 tree-node-enter">
                                {items.map(item => (
                                  <div
                                    key={item.seq_number}
                                    className={`flex items-center gap-2 px-4 py-1.5 text-sm rounded ${getHeatBg(item.total_asks)}`}
                                  >
                                    <span className="text-xs w-8 opacity-60">{item.seq_number}</span>
                                    <span className="flex-1">{item.level3}</span>
                                    <span className="text-xs opacity-60">{'★'.repeat(item.difficulty)}</span>
                                    {item.total_asks > 0 && (
                                      <span className="text-xs opacity-80">
                                        {item.student_count}人/{item.total_asks}次
                                      </span>
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
        </div>
      )}

      {/* Stats Tab */}
      {tab === 'stats' && (
        <div className="space-y-6">
          {/* Top 20 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="font-medium mb-3">最常被问到的 Top 20 知识点</h3>
            <div className="space-y-2">
              {stats.topKnowledgePoints.map((kp, i) => (
                <div key={kp.seq_number} className="flex items-center gap-3 text-sm">
                  <span className="text-slate-400 w-6 text-right">{i + 1}.</span>
                  <span className="flex-1 truncate">[{kp.seq_number}] {kp.level3}</span>
                  <span className="text-xs text-slate-400">{kp.level1}</span>
                  <span className="text-xs text-amber-500">{'★'.repeat(kp.difficulty)}</span>
                  <span className="text-xs text-red-600 font-medium">{kp.ask_count}次/{kp.student_count}人</span>
                </div>
              ))}
              {stats.topKnowledgePoints.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">暂无数据</p>
              )}
            </div>
          </div>

          {/* By Level1 */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h3 className="font-medium mb-3">按章节提问分布</h3>
            <div className="space-y-2">
              {stats.byLevel1.map(item => {
                const maxCount = Math.max(...stats.byLevel1.map(i => i.ask_count), 1);
                return (
                  <div key={item.level1} className="flex items-center gap-3">
                    <span className="text-xs text-slate-600 w-48 truncate">{item.level1}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                      <div
                        className="bg-red-400 h-full rounded-full"
                        style={{ width: `${(item.ask_count / maxCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 w-16 text-right">{item.ask_count}次</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* By Difficulty */}
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
                        className="absolute bottom-0 left-0 right-0 bg-red-400 rounded-t transition-all"
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

      {/* Students Tab */}
      {tab === 'students' && (
        <div className="space-y-3">
          {classInfo.students.map(s => (
            <Link
              key={s.id}
              href={`/student/${s.id}`}
              className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex-1">
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-slate-500 ml-3">{s.school}</span>
              </div>
              <span className="text-sm bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{s.current_grade}</span>
              <span className="text-sm text-slate-500">{s.question_count} 题</span>
            </Link>
          ))}

          {classInfo.students.length === 0 && (
            <p className="text-center text-slate-400 py-12">班级暂无学生</p>
          )}
        </div>
      )}
    </div>
  );
}
