'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Student {
  id: number;
  name: string;
  school: string;
  initial_grade: number;
  enrollment_year: number;
  current_grade: string;
  question_count: number;
  created_at: string;
}

function getAcademicYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

const emptyForm = () => ({ name: '', school: '', current_grade: 1 });

export default function HomePage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    const res = await fetch('/api/students', { cache: 'no-store' });
    const data = await res.json();
    setStudents(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // 用户只选"当前年级"，系统自动反推 initial_grade 和 enrollment_year
    // 逻辑：initial_grade = current_grade, enrollment_year = academicYear
    // 这样 getCurrentGrade() = initial_grade + (academicYear - enrollment_year) = current_grade + 0 = current_grade
    const academicYear = getAcademicYear();
    const payload = {
      name: form.name,
      school: form.school,
      initial_grade: form.current_grade,
      enrollment_year: academicYear,
    };
    if (editingStudent) {
      await fetch(`/api/students/${editingStudent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    await fetchStudents();
    setShowForm(false);
    setEditingStudent(null);
    setForm(emptyForm());
  }

  function handleEdit(e: React.MouseEvent, student: Student) {
    e.preventDefault();
    e.stopPropagation();
    setEditingStudent(student);
    // 从 current_grade 字符串反推数字：高一=1, 高二=2, 高三=3
    const gradeMap: Record<string, number> = { '高一': 1, '高二': 2, '高三': 3 };
    const gradeNum = gradeMap[student.current_grade] || student.initial_grade;
    setForm({
      name: student.name,
      school: student.school,
      current_grade: gradeNum,
    });
    setShowForm(true);
  }

  async function handleDelete(e: React.MouseEvent, student: Student) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`确定删除学生「${student.name}」吗？该学生的所有题目数据也会被删除。`)) return;
    await fetch(`/api/students/${student.id}`, { method: 'DELETE' });
    fetchStudents();
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditingStudent(null);
    setForm(emptyForm());
  }

  const filtered = students.filter(s =>
    s.name.includes(search) || s.school.includes(search)
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">学生管理</h1>
        <button
          onClick={() => { setEditingStudent(null); setForm(emptyForm()); setShowForm(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 添加学生
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="搜索学生姓名或学校..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Add/Edit student modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseForm}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editingStudent ? '编辑学生' : '添加学生'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">姓名/微信昵称 *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">学校</label>
                <input
                  type="text"
                  value={form.school}
                  onChange={e => setForm({ ...form, school: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">当前年级 *</label>
                <select
                  value={form.current_grade}
                  onChange={e => setForm({ ...form, current_grade: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>高一</option>
                  <option value={2}>高二</option>
                  <option value={3}>高三</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={handleCloseForm} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingStudent ? '保存修改' : '确认添加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(student => (
          <Link
            key={student.id}
            href={`/student/${student.id}`}
            className="block bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg">{student.name}</h3>
                <p className="text-sm text-slate-500 mt-1">{student.school || '未填写学校'}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                  {student.current_grade}
                </span>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={(e) => handleEdit(e, student)}
                    className="text-slate-400 hover:text-blue-600 p-1 rounded"
                    title="编辑"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, student)}
                    className="text-slate-400 hover:text-red-600 p-1 rounded"
                    title="删除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-slate-600">
              <span>提问 <strong className="text-blue-600">{student.question_count}</strong> 题</span>
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-slate-400 py-16">
          {students.length === 0 ? '暂无学生，点击上方按钮添加' : '没有匹配的搜索结果'}
        </div>
      )}
    </div>
  );
}
