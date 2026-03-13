'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface KnowledgePointDetail {
  id: number;
  question_id: number;
  knowledge_point_seq: number;
  confirmed_mastered: number;
  level1: string;
  level2: string;
  level3: string;
  difficulty: number;
  tag_type: string;
}

interface QuestionDetail {
  id: number;
  student_id: number;
  student_name: string;
  image_path: string;
  ai_solution: string;
  ai_answer: string;
  ocr_text?: string;
  error_reason?: string;
  created_at: string;
  knowledge_points: KnowledgePointDetail[];
}

export default function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [question, setQuestion] = useState<QuestionDetail | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeProgress, setReanalyzeProgress] = useState('');

  useEffect(() => {
    fetchQuestion();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchQuestion() {
    const res = await fetch(`/api/questions/${id}`);
    const data = await res.json();
    setQuestion(data);
  }

  async function handleConfirm(qkpId: number, currentVal: number) {
    const newVal = currentVal ? 0 : 1;
    await fetch(`/api/question-kp/${qkpId}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmed_mastered: newVal }),
    });
    fetchQuestion();
  }

  async function handleDelete() {
    if (!confirm('确定删除这道题目吗？图片和关联数据都会被删除。')) return;
    await fetch(`/api/questions/${id}`, { method: 'DELETE' });
    if (question) {
      router.push(`/student/${question.student_id}`);
    } else {
      router.push('/');
    }
  }

  async function handleReanalyze() {
    if (!question) return;
    if (!confirm('重新AI分析将覆盖当前的解题思路、答案和知识点，确定继续吗？')) return;

    setReanalyzing(true);
    setReanalyzeProgress('正在启动AI分析...');

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: question.image_path }),
      });

      if (!res.ok || !res.body) {
        throw new Error('分析请求失败');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result: Record<string, unknown> | null = null;

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
            setReanalyzeProgress(parsed.message || '分析中...');
          } else if (type === 'result') {
            result = parsed;
          } else if (type === 'error') {
            throw new Error(parsed.message);
          }
        }
      }

      if (result) {
        // Update the question with new analysis
        await fetch(`/api/questions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ai_solution: result.solution,
            ai_answer: result.answer,
            ocr_text: result.ocrText || '',
            error_reason: result.errorReason || '',
            knowledge_point_seqs: ((result.knowledgePoints as { seq: number }[]) || []).map((kp) => kp.seq),
          }),
        });
        fetchQuestion();
      }
    } catch (err) {
      alert(`重新分析失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setReanalyzing(false);
      setReanalyzeProgress('');
    }
  }

  if (!question) return <div className="p-6">加载中...</div>;

  const imageFilename = question.image_path.split(/[\\/]/).pop();

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <Link href={`/student/${question.student_id}`} className="text-blue-600 hover:underline text-sm">
          &larr; 返回 {question.student_name} 的档案
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReanalyze}
            disabled={reanalyzing}
            className="px-3 py-1.5 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {reanalyzing ? reanalyzeProgress : '重新AI分析'}
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            删除题目
          </button>
        </div>
      </div>

      <h1 className="text-xl font-bold mb-2">题目详情</h1>
      <p className="text-sm text-slate-500 mb-6">
        学生: {question.student_name} | 时间: {question.created_at}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Image */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h2 className="text-sm font-medium text-slate-600 mb-3">题目截图</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/image/${imageFilename}`}
            alt="题目截图"
            className="w-full rounded-lg border border-slate-200"
          />
        </div>

        {/* Right: AI Analysis */}
        <div className="space-y-4">
          {/* OCR Text */}
          {question.ocr_text && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="text-sm font-medium text-slate-600 mb-2">题目原文 (OCR)</h2>
              <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg">
                {question.ocr_text}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-600 mb-2">解题思路</h2>
            <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
              {question.ai_solution || '暂无解题思路'}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-600 mb-2">答案</h2>
            <div className="text-base text-slate-800 font-medium">
              {question.ai_answer || '暂无答案'}
            </div>
          </div>

          {/* Error Reason */}
          {question.error_reason && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <h2 className="text-sm font-medium text-orange-700 mb-2">错误原因分析</h2>
              <div className="text-sm text-orange-800 leading-relaxed">
                {question.error_reason}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <h2 className="text-sm font-medium text-slate-600 mb-3">关联知识点</h2>
            <div className="space-y-3">
              {question.knowledge_points.map(kp => (
                <div key={kp.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <label className="flex items-center gap-2 cursor-pointer shrink-0 mt-0.5">
                    <input
                      type="checkbox"
                      checked={!!kp.confirmed_mastered}
                      onChange={() => handleConfirm(kp.id, kp.confirmed_mastered)}
                      className="rounded border-slate-300 w-5 h-5"
                    />
                    <span className="text-xs text-slate-500">
                      {kp.confirmed_mastered ? '已掌握' : '确认掌握'}
                    </span>
                  </label>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-700">[{kp.knowledge_point_seq}] {kp.level3}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {kp.level1} &gt; {kp.level2}
                    </div>
                    <div className="text-xs text-amber-500 mt-0.5">{'★'.repeat(kp.difficulty)}</div>
                  </div>
                </div>
              ))}

              {question.knowledge_points.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-4">未关联知识点</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
