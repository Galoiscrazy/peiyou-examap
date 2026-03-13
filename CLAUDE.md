# 物理考点地图管理系统

## 项目概述

高中物理培优知识点管理系统，用于管理学生、题目上传、AI分析、班级管理和考点地图。

## 技术栈

- **框架**: Next.js 15 (App Router) + React 19 + TypeScript
- **样式**: TailwindCSS 4
- **数据库**: SQLite (better-sqlite3, WAL mode, foreign_keys ON)
- **AI集成**: Claude Code CLI (`claude --print`) 分析物理题目图片
- **运行环境**: Windows, 通过 `启动系统.bat` 一键启动
- **端口**: 3210

## 项目结构

```
考点地图/
├── data/
│   ├── physics.db          # SQLite数据库
│   ├── uploads/            # 上传的题目图片 (question_*.jpg)
│   ├── _claude_debug.txt   # Claude CLI 调试日志
│   └── knowledge_points.xlsx  # 533个知识点源数据
├── src/
│   ├── lib/
│   │   ├── db.ts           # 数据库初始化 (6张表)
│   │   └── claude.ts       # Claude CLI 集成 (AI分析核心)
│   ├── components/
│   │   └── Sidebar.tsx     # 侧边栏导航 (3个分组: 学生视角/考点视角/系统)
│   ├── app/
│   │   ├── page.tsx                 # 学生管理
│   │   ├── upload/page.tsx          # 上传题目 + AI分析
│   │   ├── knowledge-map/page.tsx   # 考点地图
│   │   ├── classes/page.tsx         # 班级管理
│   │   ├── data-manage/page.tsx     # 数据导入导出
│   │   └── api/
│   │       ├── students/            # 学生CRUD
│   │       ├── questions/           # 题目CRUD
│   │       ├── knowledge-points/    # 知识点查询
│   │       ├── classes/             # 班级CRUD
│   │       ├── analyze/route.ts     # AI分析接口
│   │       ├── upload/route.ts      # 图片上传
│   │       ├── image/[filename]/    # 图片访问
│   │       └── data/
│   │           ├── export/route.ts  # 全量数据导出 (JSON+base64图片)
│   │           ├── import/route.ts  # 全量数据导入 (事务性覆盖)
│   │           └── stats/route.ts   # 数据统计
├── 启动系统.bat             # 一键启动脚本 (端口3210, ASCII英文, CRLF)
└── .claude/launch.json      # Dev server 配置
```

## 数据库表结构 (src/lib/db.ts)

1. **knowledge_points** — 533个预设知识点 (不参与导入导出)
2. **students** — 学生信息 (name, school, initial_grade, enrollment_year, graduation_year)
3. **questions** — 题目 (student_id, image_path, ai_solution, ai_answer)
4. **question_knowledge_points** — 题目-知识点关联 (question_id, knowledge_point_seq, confirmed_mastered)
5. **classes** — 班级
6. **class_students** — 班级-学生关联

## AI分析关键细节 (src/lib/claude.ts)

### Claude CLI 调用方式
```
claude --print --output-format text --dangerously-skip-permissions --allowedTools Read --max-turns 5
```
- 通过 `spawn` (异步, 非 spawnSync) 调用, 避免阻塞 Node.js 事件循环
- Prompt 通过 stdin 传入
- 超时 300 秒 (5 分钟), 因为完整分析含533个知识点约需 3-4 分钟
- 必须删除 `CLAUDECODE` 环境变量防止嵌套检测

### 关键经验教训
1. **必须用 `--dangerously-skip-permissions`**: 在非交互式环境 (BAT启动的服务器) 中, 没有它 Claude CLI 会卡在权限确认prompt上, 导致 0 输出超时
2. **`--max-turns` 不能太小**: 设为 2 会导致错误退出 (Claude 读取图片就用了1-2轮), 设为 5 足够
3. **不能用 `spawnSync`**: 会阻塞事件循环 3-5 分钟, 导致 HMR WebSocket 断开 → Next.js 全页面重载 → React state 丢失 → 用户看到结果闪现后消失
4. **JSON解析需要多层容错**: Claude 输出的 JSON 有时包含未转义的双引号 (如 `"消失"`), 需要 `fixJsonUnescapedQuotes()` 状态机修复
5. **Claude CLI 路径**: Windows 上在 `%APPDATA%\npm\claude.cmd`

### 调试方法
- 每次调用后自动写入 `data/_claude_debug.txt`, 包含命令、输出长度、stdout/stderr
- 简单测试: `echo "Say hi" | claude --print --output-format text --max-turns 5`
- 图片测试: `echo "Read file C:\path\to\image.jpg and describe" | claude --print --output-format text --dangerously-skip-permissions --allowedTools Read --max-turns 5`

## 数据导入导出

- **导出**: `GET /api/data/export` → 包含 5 张用户数据表 + base64 图片的 JSON 文件
- **导入**: `POST /api/data/import` → 事务性覆盖 (清空旧数据 → 导入新数据 → 写入图片)
- **统计**: `GET /api/data/stats` → 各表 COUNT 和图片数
- 知识点 (533条) 是预设基础数据, 不参与导入导出

## 启动方式

双击 `启动系统.bat`, 自动清理 `.next` 缓存并在 3210 端口启动。

## 开发注意事项

- 所有中文提示和 UI 文字使用中文
- BAT 脚本必须是 CRLF 换行 + 纯 ASCII 英文 (中文会乱码)
- package.json 的 dev 脚本硬编码了 `--port 3210`
- 图片存储路径: `data/uploads/question_{timestamp}.jpg`
- 图片访问API: `/api/image/{filename}`
