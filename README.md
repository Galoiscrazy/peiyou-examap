# 物理培优考点地图管理系统

高中物理培优知识点管理系统，帮助物理培优机构和老师管理学生做题情况、跟踪知识点掌握程度、智能分析错误原因。

## 适用场景

- 物理培优机构管理多个班级和学生
- 老师上传学生做过的试卷/练习题，AI 自动分析并标注涉及的知识点
- 通过考点地图直观查看每个学生的知识点掌握情况
- 题库按知识点分类检索，批量导出为 Word 文档

## 功能一览

- **学生管理** — 添加/编辑/删除学生，自动计算当前年级
- **班级管理** — 创建班级，分配学生
- **题目上传 + AI 分析** — 上传题目截图，AI 自动给出解题过程、答案、关联知识点标签，实时进度显示
- **OCR 题库** — AI 分析时自动 OCR 提取题目文字，按知识点筛选题目，批量导出 .docx
- **错误原因分析** — AI 检测学生做题痕迹，分析错误原因（简洁明确）
- **考点地图** — 可视化展示学生知识点掌握情况
- **数据导入导出** — 全量 JSON 导入导出（含图片），方便备份和迁移

## 技术栈

- **框架**: Next.js 15 (App Router) + React 19 + TypeScript
- **样式**: TailwindCSS 4
- **数据库**: SQLite (better-sqlite3)
- **AI**: Claude CLI 本地调用

## 快速启动

### 前置要求

- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI 已安装并可用（在终端运行 `claude --version` 验证）

### 启动

1. 克隆仓库
2. 双击 `启动系统.bat`
3. 浏览器访问 `http://localhost:3210`

启动脚本会自动完成：安装依赖、从 Excel 导入知识点、启动开发服务器。

## 考点地图 Excel 配置

系统预设的 533 个知识点从 Excel 文件导入。你可以用自己的 Excel 替换 `【物理】考点地图-终版.xlsx`，格式如下：

| A: 一级(章) | B: 二级(节) | C: 三级(知识点) | D: 序号 | E: 难度 | F: 前置知识 | G: 备注 |
|---|---|---|---|---|---|---|
| 力与运动 | 运动的描述 | 匀速直线运动 | 1 | ★★ | | |
| | | 变速直线运动 | 2 | ★★★ | 匀速直线运动 | |
| | 力与运动 | 牛顿第一定律 | 3 | ★★★ | | 高考高频 |
| 能量与动量 | 功和能 | 功的定义 | 4 | ★★ | 力与运动 | |

**规则：**
- A、B 列仅在值变化时填写，空行自动继承上一行的值
- D 列序号必须是唯一的正整数
- E 列用 ★ 数量表示难度（1-5 星），留空默认为 3
- C 列中 `【竞赛】`、`【实验】` 等标签会自动提取为分类标记
- 替换 Excel 后删除 `data/physics.db`，重新启动即可重新导入

## AI 分析说明

本项目通过**本地 Claude CLI** (`claude --print`) 进行 AI 分析，**不使用 API 模式**。

这意味着：
- 需要在本地安装 [Claude Code](https://docs.anthropic.com/en/docs/claude-code)（或其他支持 `claude` CLI 命令的终端工具）
- AI 分析完全在本地运行，无需配置 API Key
- 单次分析约需 3-5 分钟，界面会显示实时进度

---

# Physics Exam Map Management System

A knowledge point management system for high school physics tutoring, helping tutoring institutions and teachers manage student exercises, track knowledge point mastery, and intelligently analyze error causes.

## Use Cases

- Physics tutoring institutions managing multiple classes and students
- Teachers uploading student exam papers/exercises for automatic AI analysis with knowledge point tagging
- Visual exam map showing each student's knowledge point mastery
- Question bank searchable by knowledge points, with batch export to Word documents

## Features

- **Student Management** — Add/edit/delete students with automatic grade calculation
- **Class Management** — Create classes and assign students
- **Question Upload + AI Analysis** — Upload question screenshots; AI provides solutions, answers, and knowledge point tags with real-time progress display
- **OCR Question Bank** — AI automatically extracts question text via OCR; filter by knowledge points; batch export to .docx
- **Error Analysis** — AI detects student work marks and analyzes error causes (concise and clear)
- **Exam Map** — Visual display of student knowledge point mastery
- **Data Import/Export** — Full JSON import/export (including images) for backup and migration

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript
- **Styling**: TailwindCSS 4
- **Database**: SQLite (better-sqlite3)
- **AI**: Claude CLI (local invocation)

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI installed and available (verify with `claude --version` in terminal)

### Launch

1. Clone the repository
2. Double-click `启动系统.bat`
3. Open `http://localhost:3210` in your browser

The startup script automatically handles: dependency installation, knowledge point import from Excel, and dev server launch.

## Knowledge Point Excel Configuration

The system's 533 preset knowledge points are imported from an Excel file. You can replace `【物理】考点地图-终版.xlsx` with your own Excel file in the following format:

| A: Level 1 (Chapter) | B: Level 2 (Section) | C: Level 3 (Knowledge Point) | D: Seq | E: Difficulty | F: Prerequisites | G: Notes |
|---|---|---|---|---|---|---|
| Mechanics | Kinematics | Uniform Motion | 1 | ★★ | | |
| | | Variable Motion | 2 | ★★★ | Uniform Motion | |
| | Dynamics | Newton's First Law | 3 | ★★★ | | Frequently tested |
| Energy & Momentum | Work & Energy | Definition of Work | 4 | ★★ | Mechanics | |

**Rules:**
- Columns A and B are only filled when the value changes; empty cells inherit from the row above
- Column D sequence numbers must be unique positive integers
- Column E uses ★ count for difficulty (1-5 stars); blank defaults to 3
- Tags like `【Competition】` or `【Experiment】` in Column C are automatically extracted as category tags
- After replacing the Excel file, delete `data/physics.db` and restart to reimport

## AI Analysis Note

This project uses the **local Claude CLI** (`claude --print`) for AI analysis, **not the API mode**.

This means:
- You need [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (or another terminal tool supporting the `claude` CLI command) installed locally
- AI analysis runs entirely locally — no API key configuration needed
- Each analysis takes approximately 3-5 minutes, with real-time progress displayed in the UI
