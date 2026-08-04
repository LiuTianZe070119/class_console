

<h1 align="center">班级办事通</h1>
<p align="center"><strong>ClassConsole</strong> — 一站式班级管理平台</p>
<p align="center">意见箱 · 树洞 · 课表统计 · AI 助手</p>
<p align="center">
  <img src="https://img.shields.io/badge/version-1.7.1-blue" alt="version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
  <img src="https://img.shields.io/badge/WHUT-武汉理工-1a5c8a" alt="whut">
</p>

---

## 功能一览

| 模块 | 页面 | 功能描述 |
|------|------|----------|
| **登录系统** | `index.html` | 学号+密码登录、注册、记住密码、智慧理工大统一认证 |
| **控制台** | `main.html` | 班级仪表盘、AI 名人名言、通知中心、快捷入口、新手导览 |
| **意见箱** | `opinions.html` | 提交意见/反馈、分配班委处理、状态追踪、评分、图片上传、AI 审核 |
| **匿名树洞** | `treehole.html` | 匿名便利贴墙、点赞、回复、表情反应、AI 审核 |
| **课表统计** | `schedule.html` | 编辑个人课表、管理员查看全班上课分布 |
| **个人设置** | `settings.html` | 主题切换（4 种配色）、头像自定义、Bug 反馈、通知管理 |

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML5 · CSS3 · Vanilla JavaScript（无框架） |
| 后端服务 | Supabase |
| AI | 智谱 GLM-4-Flash（名人名言 + 内容安全审核） |
| SSO | Cloudflare Workers（CAS 统一认证代理） |
| 存储 | Supabase Storage（头像/意见箱图片） |
| 字体 | Noto Serif SC |


## 目录结构

```
ClassConsole/
├── index.html                   # 登录/注册
├── main.html                    # 主页控制台
├── opinions.html                # 班级意见箱
├── treehole.html                # 匿名树洞
├── schedule.html                # 课表统计
├── settings.html                # 个人设置
├── sso.js                       # 智慧理工大 SSO 模块
├── ai-moderation.js             # AI 内容审核模块
├── config.js                    # 版本配置
├── supabase/functions/
│   ├── _shared/cors.ts          # 共享 CORS 头
│   ├── ai-moderation/index.ts   # AI 内容审核
│   ├── ai-quote/index.ts        # AI 名人名言
│   ├── ai-reply/index.ts        # AI 树洞自动回复
│   └── weather/index.ts         # 天气数据代理
├── workers/whut-sso/
│   ├── index.js                 # CAS 认证 Worker
│   └── wrangler.toml            # Cloudflare 部署配置
└── .claude/skills/              # Claude Code 技能包
```

---

## 更新日志

### 1.7.1
- AI自动回复树洞内容
- 主页新增贴心天气数据（开发完毕，暂未开放）

### 1.7.0
- 新增 AI 内容安全审核

### 1.6.3
- 初步实现智慧理工大统一认证接口（是否启用有待商榷）
- 修复 Bug 反馈通道的问题

### 1.6.2
- 修复若干 Bug

### 1.6.1
- 修复头像同步 Bug
- 新增意见反馈通道
- 新增版本号显示

### 1.6.0
- 新增头像更改功能（预设/自定义图片）
- 修复意见箱回复 Bug
- 优化意见箱时间线展示

### 1.5.9
- 修复 AI 生成 Bug
- 优化意见箱 UI
- 新增意见箱筛选展示功能

### 1.5.8
- 新增登录时记住密码功能
- 修复 UI 问题

### 1.5.7
- 修复 UI 问题
- 修复登录重定位 Bug
- 新增编辑暂存机制
- 修复 AI 名言显示问题

### 1.5.6
- 修复评分问题
- 修复 UI 问题
- 访客也允许访问主页（互动/AI 功能受限）

### 1.5.5
- 修复 UI 问题

### 1.5.4
- 新增新手引导
- 修复 UI 问题

### 1.5.3
- 提升系统运行速度
- 修复 UI 问题
- 提升 UI 统一性

### 1.5.2
- 重做主页
- 修复 UI 问题

### 1.5.1
- 关键安全性升级
- 修复 UI 问题
- 修复默认匿名 Bug

### 1.5.0
- 新增个人设置功能
- 新增主题颜色更换功能
- 重做提醒/确认弹窗
- 留言箱可设置默认匿名
- 课表选择 UI 及逻辑重做

### 1.4.1
- 新增意见删除功能
- 管理员可选择拒绝受理意见
- 更新对应通知内容
- 重做历史信息展示

### 1.4.0
- 意见箱支持上传图片

### 1.3.8
- 适配移动端布局

### 1.3.7
- 新增页脚
- UI 整体协调性优化
- 图标微调

### 1.3.6
- 名人名言板块接入 AI
- 支持深入了解名言背景

### 1.3.5
- UI 及字体升级
- 控制台更加灵动

### 1.3.4
- 重做通知系统
- 课表未填提醒
- 修复树洞删除 Bug
- 增加必要通知

### 1.3.3
- 树洞新增删除功能
- 修复已知问题

### 1.3.2
- 新增树洞功能
- 全新首页控制台页面

### 1.3.1
- 系统性重构框架
- 修复若干问题

### 1.2.1
- 新增课表统计功能
- 修复已知问题

### 1.1.0
- 支持学号+姓名验证快速注册
- 云端存储登录及问题信息

### 1.0.0
- 项目初始化

<p align="center"><strong>END</strong></p>