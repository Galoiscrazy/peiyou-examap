'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const studentLinks = [
  { href: '/', label: '学生管理', icon: '👤' },
  { href: '/upload', label: '上传题目', icon: '📤' },
];

const examLinks = [
  { href: '/knowledge-map', label: '考点地图', icon: '🗺️' },
  { href: '/question-bank', label: '题库', icon: '📚' },
  { href: '/classes', label: '班级管理', icon: '🏫' },
];

const systemLinks = [
  { href: '/data-manage', label: '数据管理', icon: '💾' },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <aside className="w-56 bg-slate-800 text-white min-h-screen flex flex-col shrink-0">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-bold">物理考点地图</h1>
        <p className="text-xs text-slate-400 mt-1">培优知识点管理系统</p>
      </div>

      <nav className="flex-1 p-3 space-y-6">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-2">学生视角</h2>
          <ul className="space-y-1">
            {studentLinks.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive(link.href)
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-2">考点视角</h2>
          <ul className="space-y-1">
            {examLinks.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive(link.href)
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2 px-2">系统</h2>
          <ul className="space-y-1">
            {systemLinks.map(link => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive(link.href)
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
        533 个培优知识点
      </div>
    </aside>
  );
}
