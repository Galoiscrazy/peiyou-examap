'use client';

import { useState, useEffect } from 'react';

interface KpWithHeat {
  seq_number: number;
  level1: string;
  level2: string;
  level3: string;
  difficulty: number;
  tag_type: string;
  prerequisites: string;
  student_count: number;
  ask_count: number;
}

interface StudentAsk {
  id: number;
  name: string;
  school: string;
  ask_count: number;
  confirmed_count: number;
}

export default function KnowledgeMapPage() {
  const [kps, setKps] = useState<KpWithHeat[]>([]);
  const [search, setSearch] = useState('');
  const [expandedL1, setExpandedL1] = useState<Set<string>>(new Set());
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());
  const [selectedKp, setSelectedKp] = useState<KpWithHeat | null>(null);
  const [kpStudents, setKpStudents] = useState<StudentAsk[]>([]);

  useEffect(() => {
    fetch('/api/knowledge-points?withHeat=true').then(r => r.json()).then(setKps);
  }, []);

  // Build tree
  const tree: Record<string, Record<string, KpWithHeat[]>> = {};
  const filteredKps = search
    ? kps.filter(kp =>
        kp.level3.includes(search) ||
        kp.level1.includes(search) ||
        kp.level2.includes(search) ||
        String(kp.seq_number) === search
      )
    : kps;

  for (const kp of filteredKps) {
    if (!tree[kp.level1]) tree[kp.level1] = {};
    if (!tree[kp.level1][kp.level2]) tree[kp.level1][kp.level2] = [];
    tree[kp.level1][kp.level2].push(kp);
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

  async function showKpDetail(kp: KpWithHeat) {
    setSelectedKp(kp);
    if (kp.ask_count > 0) {
      const res = await fetch(`/api/knowledge-points/${kp.seq_number}/students`);
      const data = await res.json();
      setKpStudents(data);
    } else {
      setKpStudents([]);
    }
  }

  function getHeatColor(askCount: number): string {
    if (askCount === 0) return '';
    if (askCount <= 2) return 'bg-amber-50';
    if (askCount <= 5) return 'bg-amber-100';
    if (askCount <= 10) return 'bg-amber-200';
    return 'bg-amber-300';
  }

  const maxAsk = Math.max(...kps.map(k => k.ask_count), 1);

  return (
    <div className="p-6 flex gap-6">
      {/* Left: Tree */}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold mb-4">考点地图总览</h1>

        <div className="mb-4 flex items-center gap-4">
          <input
            type="text"
            placeholder="搜索知识点..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-3 text-xs text-slate-500 shrink-0">
            <span>热度:</span>
            <span className="px-2 py-0.5 bg-amber-50 rounded">低</span>
            <span className="px-2 py-0.5 bg-amber-100 rounded">中</span>
            <span className="px-2 py-0.5 bg-amber-200 rounded">高</span>
            <span className="px-2 py-0.5 bg-amber-300 rounded">极高</span>
          </div>
        </div>

        <div className="space-y-2">
          {Object.entries(tree).map(([l1, l2Map]) => {
            const l1Expanded = expandedL1.has(l1) || !!search;
            const l1Items = Object.values(l2Map).flat();
            const l1AskCount = l1Items.reduce((s, k) => s + k.ask_count, 0);

            return (
              <div key={l1} className="border border-slate-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleL1(l1)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left"
                >
                  <span className="text-xs text-slate-400">{l1Expanded ? '▼' : '▶'}</span>
                  <span className="font-medium text-sm flex-1">{l1}</span>
                  {l1AskCount > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {l1AskCount}次提问
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{l1Items.length}个知识点</span>
                </button>

                {l1Expanded && (
                  <div className="pl-4">
                    {Object.entries(l2Map).map(([l2, items]) => {
                      const l2Key = `${l1}::${l2}`;
                      const l2Expanded = expandedL2.has(l2Key) || !!search;

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
                              {items.map(kp => (
                                <button
                                  key={kp.seq_number}
                                  onClick={() => showKpDetail(kp)}
                                  className={`w-full flex items-center gap-2 px-4 py-1.5 text-sm text-left hover:bg-blue-50 rounded ${
                                    getHeatColor(kp.ask_count)
                                  } ${selectedKp?.seq_number === kp.seq_number ? 'ring-2 ring-blue-400' : ''}`}
                                >
                                  <span className="text-slate-400 text-xs w-8">{kp.seq_number}</span>
                                  <span className="flex-1 text-slate-700">{kp.level3}</span>
                                  <span className="text-xs text-amber-500">{'★'.repeat(kp.difficulty)}</span>
                                  {kp.ask_count > 0 && (
                                    <span className="text-xs text-slate-400">
                                      {kp.student_count}人/{kp.ask_count}次
                                    </span>
                                  )}
                                  {kp.ask_count > 0 && (
                                    <div className="w-16 bg-slate-200 rounded-full h-1.5">
                                      <div
                                        className="bg-amber-500 h-full rounded-full"
                                        style={{ width: `${(kp.ask_count / maxAsk) * 100}%` }}
                                      />
                                    </div>
                                  )}
                                </button>
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

      {/* Right: KP Detail panel */}
      {selectedKp && (
        <div className="w-80 shrink-0">
          <div className="sticky top-6 bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div>
              <h3 className="font-medium text-sm">[{selectedKp.seq_number}] {selectedKp.level3}</h3>
              <p className="text-xs text-slate-500 mt-1">{selectedKp.level1} &gt; {selectedKp.level2}</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">难度:</span>
              <span className="text-amber-500">{'★'.repeat(selectedKp.difficulty)}{'☆'.repeat(5 - selectedKp.difficulty)}</span>
            </div>

            {selectedKp.tag_type && (
              <div className="text-xs">
                <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{selectedKp.tag_type}</span>
              </div>
            )}

            {selectedKp.prerequisites && (
              <div className="text-xs text-slate-500">
                前置知识点: {selectedKp.prerequisites}
              </div>
            )}

            <div className="border-t border-slate-100 pt-3">
              <h4 className="text-sm font-medium mb-2">提问记录 ({selectedKp.ask_count}次)</h4>
              {kpStudents.length > 0 ? (
                <div className="space-y-2">
                  {kpStudents.map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-slate-400 text-xs">{s.school}</span>
                      <span className="ml-auto text-xs text-slate-500">{s.ask_count}次</span>
                      {s.confirmed_count > 0 && (
                        <span className="text-xs text-green-600">✓{s.confirmed_count}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">暂无学生提问</p>
              )}
            </div>

            <button
              onClick={() => setSelectedKp(null)}
              className="text-xs text-slate-500 hover:underline"
            >
              关闭面板
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
