'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ClassInfo {
  id: number;
  name: string;
  description: string;
  student_count: number;
  created_at: string;
}

interface Student {
  id: number;
  name: string;
  school: string;
  current_grade: string;
}

const emptyForm = () => ({ name: '', description: '', student_ids: [] as number[] });

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    fetchClasses();
    fetch('/api/students').then(r => r.json()).then(setStudents);
  }, []);

  async function fetchClasses() {
    const res = await fetch('/api/classes');
    setClasses(await res.json());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingClass) {
      await fetch(`/api/classes/${editingClass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    } else {
      await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
    }
    handleCloseForm();
    fetchClasses();
  }

  async function handleEdit(e: React.MouseEvent, cls: ClassInfo) {
    e.preventDefault();
    e.stopPropagation();
    // Fetch class detail to get current student_ids
    const res = await fetch(`/api/classes/${cls.id}`);
    const detail = await res.json();
    const studentIds = (detail.students || []).map((s: { id: number }) => s.id);
    setEditingClass(cls);
    setForm({ name: cls.name, description: cls.description || '', student_ids: studentIds });
    setShowForm(true);
  }

  async function handleDelete(e: React.MouseEvent, cls: ClassInfo) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`确定删除班级「${cls.name}」吗？`)) return;
    await fetch(`/api/classes/${cls.id}`, { method: 'DELETE' });
    fetchClasses();
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditingClass(null);
    setForm(emptyForm());
  }

  function toggleStudent(sid: number) {
    setForm(prev => ({
      ...prev,
      student_ids: prev.student_ids.includes(sid)
        ? prev.student_ids.filter(id => id !== sid)
        : [...prev.student_ids, sid],
    }));
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">班级管理</h1>
        <button
          onClick={() => { setEditingClass(null); setForm(emptyForm()); setShowForm(true); }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          + 创建班级
        </button>
      </div>

      {/* Create/Edit class modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseForm}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editingClass ? '编辑班级' : '创建班级'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">班级名称 *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="例如：高二培优A班"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">选择学生</label>
                <div className="border border-slate-200 rounded-lg max-h-48 overflow-auto p-2 space-y-1">
                  {students.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.student_ids.includes(s.id)}
                        onChange={() => toggleStudent(s.id)}
                        className="rounded border-slate-300"
                      />
                      <span className="text-sm">{s.name}</span>
                      <span className="text-xs text-slate-400">{s.current_grade} - {s.school}</span>
                    </label>
                  ))}
                  {students.length === 0 && (
                    <p className="text-sm text-slate-400 py-2 text-center">暂无学生，请先添加学生</p>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">已选 {form.student_ids.length} 名学生</p>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={handleCloseForm} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
                  取消
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {editingClass ? '保存修改' : '创建'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Class cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(cls => (
          <Link
            key={cls.id}
            href={`/classes/${cls.id}`}
            className="block bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-lg">{cls.name}</h3>
                {cls.description && <p className="text-sm text-slate-500 mt-1">{cls.description}</p>}
              </div>
              <div className="hidden group-hover:flex items-center gap-1">
                <button
                  onClick={(e) => handleEdit(e, cls)}
                  className="text-slate-400 hover:text-blue-600 p-1 rounded"
                  title="编辑"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button
                  onClick={(e) => handleDelete(e, cls)}
                  className="text-slate-400 hover:text-red-600 p-1 rounded"
                  title="删除"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
            <div className="mt-3 text-sm text-slate-600">
              <strong className="text-blue-600">{cls.student_count}</strong> 名学生
            </div>
          </Link>
        ))}
      </div>

      {classes.length === 0 && (
        <div className="text-center text-slate-400 py-16">暂无班级，点击上方按钮创建</div>
      )}
    </div>
  );
}
