# ChangeLog

## 未发布 · 2026-10-17

保持版本 `0.2.0` / `0.2.0-preview.1`，本节内容通过提交与构建区分。

- 2026-10-18：新增 Alt+Q 选词查词、Alt+S 收藏和插件内录入；支持词卡当前词兜底、iframe、连发／输入保护、旧配置兼容及可选 Chrome 原生入口去重。只更新扩展，无需重装词库或伴随程序。

- 2026-10-18：新增独立本地 SQLite 生词本、词卡星标和选词右键收藏；保存释义快照与原文语境，支持收藏时间／状态／标签／来源筛选、学习笔记、键盘翻卡复习及事务化 JSON 导入导出。词库与程序更新保留收藏，隐身窗口禁用收藏；不调用模型或下载音频。

- 新增 Chrome 选词右键本地词典、词卡、详细词典页与设置；Windows 伴随程序通过 Native Messaging 读取离线英汉词库；读音默认使用浏览器语音，可自配 Google Cloud 官方 API，支持英美音与慢速。不再下载真人录音或大型离线语音模型。
- 新增资源构建、校验、原子导入、Windows 安装／卸载脚本和独立词典构建工作流；实际资源覆盖与验收见项目状态。

- 修复 YouTube 评论可能混入隐藏标签、工具提示及相邻元数据的问题：正文边界和显隐过滤同时生效，Google 请求与仅译文模式增加回归覆盖。

- 弹窗与设置改为浅灰/白卡片/玫粉界面，统一深色主题；设置整理为六个分区。
- 弹窗直接选择全部翻译引擎，悬停开关显示实际触发键；模型配置页先显示当前模型。
- YouTube 双语字幕图标放在 CC 旁，菜单在播放器内向上展开，增加样式子页；设置页支持字幕样式预览。
- 清理旧赞助、收款地址、相关资源、后台入口、多语言文案及旧推广联系链接，保留许可证与源码归属。
- 增加界面操作与播放器布局回归，构建检查覆盖页面资源、语言包及清理结果。

## 0.0.41

- Support start.me
- Support newyorker.com

## 0.0.40

- Support Notion
- Fix p tag with img

## 0.0.39

- Support linkedin.com
- Support discord discussion
- Add shortcut for switch dual show

## 0.0.37

- Support kyivindependent.com
- Support lowendtalk.com/
- Fix zh-CN rules description link break


## 0.0.36

- Change Icon for adapting both light and dark mode
- Add Dark Mode Option

## 0.0.35

- Support Hacker News Modern Extension
- Support stackexchange sites
- Support Twitter Card title translate
- Support getrevue.co
- Support https://www.pixelmator.com
- Better for github issues list

## 0.0.34 

- Fix copy img node, if a block node is only contains img node, then do not copy that node.
- Popup remove always translate lang, if lang is equal to the target lang.

## 0.0.33

- Support google.com
- Add Option for is translate page title in others panel
- Fix chrome extension report errors in extension manager.
- Support www.urbandictionary.com
- Support answers.microsoft.com

## 0.0.32

- Fix popup More option, always translate site
- support app.daily.dev


## 0.0.31

### New Sites

- stackoverflow.com
- mastondon
- substack
- seekingalpha

### Better Adapt

- Hacker News

## 0.0.30

- Change icon
- Support never translate some lang on twitter or discord

## 0.0.28

- Support www.nytimes.com
- Support https://old.reddit.com/.compact
- Improve old.reddit.com title new line
- Support Mobile Always translate from site or language
- Support reader.960960.xyz

## 0.0.25

- Support gist.github.com
- Support slack.com
- Fix 1paragraph.app epub adapt

### Break Changes

- Remove select text to translate, now the extension is focus on web page translate
- Better for Options

## 0.0.24

- Support discord.com
- Support web.telegram.org/z/
- Fix mail.google.com , now it'll be better for long articles.
- Support Custom Page Special Rules

## 0.0.23

- Support mail.google.com
- Support Sidekick browser
- Support Producthunt

## 0.0.19.2

- Support nature.com
- The Dual Style default style to none

## 0.0.19.1

- Support substack.com
- tweetdesk.twitter.com

## 0.0.19

- Support Is Show Dual Language Option
- Support 5 theme for dual language style
  - Mask
  - Highlight
  - Weakening
  - Underline
  - None
- Support custom theme for dual language style

## 0.0.18.1

- Support www.facebook.com


## 0.0.18

- Better for Reddit and old.reddit.com
- Suppor manifest v3, get ready to submit to chrome store and edge store
- Fix some ui issue


## 0.0.16.2

- Support Github
- Support Youtube Comment


## 0.0.16.1

- Support Nitter
- Support https://mail.jabber.org/pipermail/juser/2020-December/007186.html, http://antirez.com/news/137
- Add version to options page

## 0.0.16

- Fix undefined error. Seriouse bug.
