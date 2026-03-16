# 物理考点地图管理系统

## 项目概述

高中物理培优知识点管理系统，用于管理学生、题目上传、AI分析、班级管理、考点地图和题库。

## 技术栈

- **框架**: Next.js 15 (App Router) + React 19 + TypeScript
- **样式**: TailwindCSS 4
- **数据库**: SQLite (better-sqlite3, WAL mode, foreign_keys ON)
- **AI集成**: Claude Code CLI (`claude --print`) 3阶段分析物理题目
- **导出**: docx (Word) + JSZip+LaTeX (ZIP) 双格式导出
- **运行环境**: Windows, 通过 `启动系统.bat` 一键启动
- **端口**: 3210
- **GitHub**: https://github.com/Galoiscrazy/peiyou-examap

## 项目结构

```
考点地图/
├── data/
│   ├── physics.db          # SQLite数据库
│   ├── uploads/            # 上传的题目图片 (question_*.jpg/png)
│   ├── _claude_debug.txt   # Claude CLI 调试日志
│   └── knowledge_points.xlsx  # 533个知识点源数据
├── src/
│   ├── lib/
│   │   ├── db.ts           # 数据库初始化 (6张表 + 迁移)
│   │   └── claude.ts       # Claude CLI 3阶段分析管道 (核心)
│   ├── components/
│   │   └── Sidebar.tsx     # 侧边栏导航 (学生视角/考点视角/系统)
│   ├── app/
│   │   ├── page.tsx                 # 学生管理 (增删改查)
│   │   ├── student/[id]/page.tsx    # 学生详情 (考点掌握+统计+历史)
│   │   ├── upload/page.tsx          # 批量上传题目 + SSE进度条
│   │   ├── question/[id]/page.tsx   # 题目详情 (重新分析/删除)
│   │   ├── question-bank/page.tsx   # 题库 (知识点筛选+导出)
│   │   ├── knowledge-map/page.tsx   # 考点地图
│   │   ├── classes/page.tsx         # 班级管理 (增删改查)
│   │   ├── data-manage/page.tsx     # 数据导入导出
│   │   └── api/
│   │       ├── students/            # 学生CRUD
│   │       ├── questions/           # 题目CRUD
│   │       ├── knowledge-points/    # 知识点查询
│   │       ├── classes/             # 班级CRUD
│   │       ├── analyze/route.ts     # AI分析SSE流接口
│   │       ├── upload/route.ts      # 图片上传
│   │       ├── image/[filename]/    # 图片访问
│   │       ├── question-bank/       # 题库查询
│   │       ├── question-bank/export/ # 题库导出 (LaTeX/docx)
│   │       └── data/                # 数据导入导出统计
├── 启动系统.bat             # 一键启动脚本 (端口3210)
└── .claude/launch.json      # Dev server 配置 (autoPort: true)
```

## 数据库表结构 (src/lib/db.ts)

1. **knowledge_points** — 533个预设知识点 (不参与导入导出)
2. **students** — 学生信息 (name, school, wechat_id, student_code, initial_grade, enrollment_year, graduation_year)
3. **questions** — 题目 (student_id, image_path, ai_solution, ai_answer, ocr_text, error_reason)
4. **question_knowledge_points** — 题目-知识点关联 (question_id, knowledge_point_seq, confirmed_mastered)
5. **classes** — 班级
6. **class_students** — 班级-学生关联

### 迁移 (db.ts 末尾 try/catch)
- `ALTER TABLE questions ADD COLUMN ocr_text TEXT DEFAULT ""`
- `ALTER TABLE questions ADD COLUMN error_reason TEXT DEFAULT ""`
- `ALTER TABLE students ADD COLUMN wechat_id TEXT DEFAULT ""`
- `ALTER TABLE students ADD COLUMN student_code TEXT DEFAULT ""`

## AI分析3阶段管道 (src/lib/claude.ts)

### 架构
```
Phase 1: 看题 (读图, needsTools=true)
  输入: 图片文件
  输出: OCR文字 + 错误原因
  超时: 3min / 大题6min
  参数: --allowedTools Read --max-turns 3

Phase 2: 审题+解题 (纯文本, needsTools=false)
  输入: OCR文字
  输出: 审题分析 + 解题过程 + 答案
  超时: 5min / 大题10min
  参数: --max-turns 1 (无工具, 更快)

Phase 3: 归类 (纯文本, needsTools=false)
  输入: OCR文字 + 解题思路 + 533知识点列表
  输出: 1-3个知识点标签
  超时: 2min / 大题4min
  参数: --max-turns 1
```

### runClaude() 关键参数
- `needsTools=true`: 加 `--allowedTools Read --max-turns 3` (读图阶段)
- `needsTools=false`: 只加 `--max-turns 1` (纯文本, 无工具模式, 快很多)
- 必须 `--dangerously-skip-permissions` (非交互环境)
- 必须删除 `CLAUDECODE` 环境变量 (防嵌套检测)

### 关键经验教训
1. **不能用 `spawnSync`**: 阻塞事件循环 → HMR断开 → 页面重载 → state丢失
2. **纯文本阶段不要带 `--allowedTools`**: 带了会进入工具调用模式, 比纯文本慢很多
3. **JSON解析需多层容错**: `fixJsonUnescapedQuotes()` + regex fallback
4. **大题超时翻倍**: `isLargeQuestion` 参数控制, 各阶段 timeout × 2
5. **3阶段 vs 4阶段**: 审题和解题合并为一次调用, 省一次CLI启动(30-60s)

### 调试
- `data/_claude_debug.txt` 自动记录每次调用
- Phase 1 如果超时无输出, 检查图片路径是否包含中文/特殊字符

## SSE进度显示 (analyze API)

- `/api/analyze` 返回 `text/event-stream`
- 事件类型: `progress` (step/message/percent), `result` (完整分析), `error`
- 前端 `upload/page.tsx` 用 `fetch + reader.read()` 消费SSE流
- 进度条: 紫色渐变 + 脉冲动画 + 步骤文字 + 计时器

## 题库导出 (question-bank/export)

- **LaTeX (.zip)**: ZIP包含 .tex + images/ 文件夹, 用XeLaTeX+ctex编译
- **Word (.docx)**: 直接可打开, 含嵌入图片 + 知识点标签 + 答案解析
- **两个都要**: 前端依次下载两个文件
- 前端导出按钮是下拉菜单 (3个选项)
- 图片路径: 数据库存绝对路径, 导出时 `path.isAbsolute` 判断

## 学生年级逻辑

- 用户只选"当前年级" (高一/高二/高三), 无"入档年份"字段
- 系统自动设 `enrollment_year = getAcademicYear()` (学年制: 9月起算)
- `getCurrentGrade() = initial_grade + (academicYear - enrollment_year)` 自动升级

## 批量上传 (upload/page.tsx)

- 支持多选图片, 每张独立指定学生
- 可勾选"大题"(超时翻倍)
- 串行分析 (一张完成再下一张), 每张有独立SSE进度
- 分析完成后可批量保存

## 数据导入导出

- **导出**: `GET /api/data/export` → JSON + base64图片
- **导入**: `POST /api/data/import` → 事务性覆盖 (含 ocr_text, error_reason 兼容)
- 知识点 (533条) 不参与导入导出

## 开发注意事项

- 所有中文提示和 UI 文字使用中文
- BAT 脚本必须是 CRLF 换行 + 纯 ASCII 英文
- package.json dev 脚本硬编码 `--port 3210`
- 图片路径: 数据库存绝对路径 `C:\...\data\uploads\question_{timestamp}.jpg`
- 图片访问API: `/api/image/{filename}`
- `.gitignore` 已排除: node_modules, .next, data/, *.xlsx, git_out.txt, tsc_out.txt
