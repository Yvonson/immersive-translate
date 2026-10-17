# Open Bilingual Translate · 开放双语翻译

**这是安装在浏览器里的翻译插件（浏览器扩展）**，可以在网页中显示原文和译文，并接入 Google 翻译、DeepSeek 或本地大模型。

普通用户下载扩展包即可安装，不需要编程，也不需要安装 Node.js。使用本地模型时，才需要另外安装并启动 Ollama 或 LM Studio 等模型软件。本项目目前没有独立的 Windows / macOS 桌面客户端，也没有手机 App。

[下载扩展](https://github.com/Yvonson/immersive-translate/releases/latest) · [报告问题](https://github.com/Yvonson/immersive-translate/issues) · [开发文档](docs/DEVELOPMENT.md)

> 当前源码为 **0.2.0-preview.1**：新增 Ctrl 段落开关、保留原文的段下译文、快捷键配置与播放器字幕菜单。当前重点支持 Chrome；公开稳定 Release 仍为 `v0.1.0`，其下载包不含这些新功能。新能力可从源码构建，或在开发机器加载 `dist/chrome`。字幕适配仍为实验功能，真实验收情况见 [当前状态](docs/memory/STATUS.md)。

## 目录

- [能做什么](#能做什么)
- [安装插件](#安装插件)
- [第一次使用：翻译一个网页](#第一次使用翻译一个网页)
- [选择翻译服务](#选择翻译服务)
- [接入 Google 或 Yandex 翻译](#接入-google-或-yandex-翻译)
- [接入 DeepSeek API](#接入-deepseek-api)
- [接入其他大模型 API](#接入其他大模型-api)
- [接入本地模型](#接入本地模型)
- [使用视频双语字幕](#使用视频双语字幕)
- [费用、联网和隐私](#费用联网和隐私)
- [常见问题](#常见问题)
- [更新、备份和卸载](#更新备份和卸载)
- [开发者：从源码构建](#开发者从源码构建)
- [项目来源与许可证](#项目来源与许可证)

## 能做什么

| 功能 | 当前情况 |
| --- | --- |
| 网页双语阅读 | 保留原文，按段落显示译文，适合阅读外语文章 |
| 动态网页内容 | 继承动态内容翻译和网站规则，可在设置中调整 |
| Google / Yandex | 内置传统翻译引擎，选择后使用，不需要填写 Key |
| DeepSeek | 使用自己的 API Key、API 地址和模型名称 |
| 其他大模型 | 通过“自定义兼容接口”接入支持 Chat Completions 格式的服务 |
| 本地模型 | 连接同一台电脑上的 Ollama / LM Studio 等兼容服务 |
| 视频双语字幕 | 播放器内提供菜单；HTML5、YouTube 文本字幕和 DeepLearning.AI VTT / Vidstack 适配；完整时间轴可预取 |
| Chrome / Edge | 提供可手动加载的扩展包 |
| Firefox | 提供临时加载的开发包，尚未签名上架 |

当前不含无字幕视频的语音识别、画面内字幕 OCR、Safari、手机 App 和桌面客户端。PDF、电子书及其他视频平台的完整使用流程尚未在本项目验收，不作为当前稳定支持范围。

## 安装插件

### Chrome / Edge：下载后直接安装

1. 打开 [Releases 下载页](https://github.com/Yvonson/immersive-translate/releases/latest)。
2. 在该版本的 **Assets（附件）** 中下载 **`chrome.zip`**。Chrome 和 Edge 使用同一个包。
3. 解压到一个长期保留的文件夹，例如 `D:\BrowserExtensions\OpenBilingualTranslate`。加载后的插件会依赖这个文件夹，后续不要随意删除或移动。
4. 在浏览器地址栏输入：Chrome 使用 `chrome://extensions`，Edge 使用 `edge://extensions`。
5. 打开 **开发者模式（Developer mode）**。
6. 点击 **加载已解压的扩展（Load unpacked）**，选择刚才解压的文件夹。**应选择直接包含 `manifest.json` 的那一层文件夹。**
7. 在浏览器工具栏的扩展菜单中找到 **Open Bilingual Translate**，将它固定到工具栏，方便打开。
8. 刷新已经打开的网页，再开始翻译。

不要下载页面中的 `Source code (zip)` 来直接安装：那是源码包，需要构建。不要选择 ZIP 文件本身，也不要选择包含多层目录的上级文件夹。

本项目目前通过手动加载分发，请使用本仓库的 Release 附件。安装方式可参考 [Chrome 官方说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。

### Firefox：临时安装开发包

1. 在同一个 [下载页](https://github.com/Yvonson/immersive-translate/releases/latest) 下载 `firefox.zip`，并解压。
2. 在 Firefox 地址栏输入 `about:debugging#/runtime/this-firefox`。
3. 点击 **临时载入附加组件（Load Temporary Add-on）**。
4. 选择解压目录中的 `manifest.json`，再刷新待翻译网页。

**这是开发用的临时安装，重启 Firefox 后需要重新加载。** 当前包没有经过本项目自己的 Mozilla 签名，不能当作普通商店扩展永久安装。参见 [Firefox 官方临时安装说明](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/)。

## 第一次使用：翻译一个网页

以下先使用内置 Google 引擎，无需准备 API Key。

1. 打开一个有英文正文的普通网页，例如外文文章。首次测试使用普通 `https://` 网页。
2. 点击工具栏中的 **Open Bilingual Translate** 图标。
3. 将目标语言选为你希望阅读的语言，例如简体中文，然后点击 **翻译（Translate）**。
4. 阅读原文与译文的双语对照。需要恢复时，在插件弹窗点击 **显示原文（Show original）**。

如果只显示译文，进入插件的 **选项设置（Options）→ 常用配置（Common）**，将“是否同时显示双语 / Show dual language”设为开启。

其他常用操作：

- **打开设置**：点击插件弹窗底部的 **选项设置 / Options**；也可以在浏览器扩展管理页打开该插件的扩展选项。
- **选择翻译服务**：设置页 → **翻译 / Translations** → **页面翻译服务 / Page translation service**。
- **自动翻译**：在常用配置中添加需要自动翻译的语言或网站；首次配置时先手动翻译确认效果。
- **单段翻译**：鼠标停在段落文字上，单按并松开 `Ctrl`，译文显示在下方；再按关闭本段，其他段落不变。Ctrl+C、Ctrl+点击和输入框内按键不会触发。插件面板可关闭此功能，设置首页可改为 Shift / Alt。
- **呈现方式**：双语模式保留原节点、原文字和链接事件；译文继承字体、颜色、行距，并保留加粗、链接、行内代码等。列表和表格在原项内部增加译文，不增加编号；译文变长会正常撑开页面。
- **整页快捷键**：默认 `Alt+Shift+T`。局部已有译文时会继续翻译页面，再按恢复整页。`Alt+Shift+D` 切换双语 / 仅译文。
- **修改快捷键**：设置 → 快捷键中的“网页内快捷键”可直接录入；“Chrome 实际绑定”显示浏览器真正分配的组合键，点击原生管理按钮打开 `chrome://extensions/shortcuts` 修改。浏览器级旧绑定仍可用；不同软件和扩展的冲突需要在 Chrome 中排查。

设置页部分文字继承自上游，不同浏览器语言下名称可能略有不同，以上同时列出了英文名称便于查找。

## 选择翻译服务

| 你希望怎样使用 | 网页翻译引擎应选择 | 是否需要 API Key | 是否要另外启动模型软件 |
| --- | --- | --- | --- |
| 直接用 Google 翻译 | `Google` | 不需要 | 不需要 |
| 使用 Yandex 翻译 | `Yandex` | 不需要 | 不需要 |
| 使用自己的 DeepSeek 额度 | `DeepSeek API` | 需要 DeepSeek Key | 不需要 |
| 使用其他兼容的云端模型 | `自定义兼容接口` | 通常需要，以服务商要求为准 | 不需要 |
| 使用 Ollama / LM Studio | `本地模型（Ollama / LM Studio）` | 无鉴权时可留空 | 需要 |

**配置大模型有两个不同的下拉框，必须对应：**

1. 下方 **AI 翻译配置 → 配置服务**：决定正在编辑哪一组地址、模型和 Key；点击“保存配置”或“保存并测试连接”才能保存这些字段。
2. 上方 **页面翻译服务 / Page translation service**：决定实际翻译网页和字幕时使用哪个引擎，选择后自动保存。

例如，下方配置服务选了 DeepSeek、测试也成功了，但上方仍选 `Google`，网页实际使用的仍是 Google。完成配置和引擎切换后，请刷新要翻译的网页。

## 接入 Google 或 Yandex 翻译

### Google：内置接入，不用申请 Key

1. 打开插件设置 → **翻译 / Translations**。
2. 将 **页面翻译服务** 设为 `Google`。
3. 回到待翻译网页，刷新后点击插件的 **翻译** 按钮。

当前实现使用继承自老项目的 Google 翻译接口，访问 `translate.googleapis.com`。不需要填写 API 地址、注册本项目账号或购买本项目订阅。

需要注意：

- 浏览器所在网络必须能访问这个接口；如果无法访问，更换或填写 API Key 不能解决网络问题。
- 当前 Google 选项**没有 Google Cloud Translation 付费 API Key 的配置入口**，也不是 Gemini 大模型接入入口。
- 旧接口可能遇到限流、服务变更或失效，本项目不能保证它始终可用。
- Google 不使用下方 AI 配置里的“保存并测试连接”；请通过实际网页翻译判断是否可用。

### Yandex

同样在 **页面翻译服务** 中选择 `Yandex`，刷新网页后翻译即可，不需要填写 Key。它也依赖对应网络与旧接口的可用性。

## 接入 DeepSeek API

### 1. 准备自己的 API 访问权限

在 [DeepSeek 开放平台](https://platform.deepseek.com/) 登录，按平台要求创建 API Key，并确认账户有可用的 API 额度和模型。API 计费及模型可用性以平台为准。

准备的是 **API Key**，不是 DeepSeek 网页聊天的登录密码，也不是模型显示名称。

### 2. 在插件里填写配置

打开设置 → **翻译 / Translations** → **AI 翻译配置**：

| 字段 | 填写内容 |
| --- | --- |
| 配置服务 | `DeepSeek` |
| API 地址 | `https://api.deepseek.com` |
| 模型名称 | 账户实际支持的模型 ID；当前插件预填 `deepseek-flash`，可修改 |
| API Key | 你创建的 DeepSeek API Key |

Key 只填写密钥本身，不要在前面加 `Bearer `，也不要给它加引号。模型名必须以平台实际提供的 ID 为准，插件的预填值不代表你的账户一定有该模型权限。

### 3. 测试并切换引擎

1. 点击 **保存并测试连接**。插件会发送一句英文示例，成功时显示“连接成功：……”和示例译文。
2. 将页面上方的 **页面翻译服务** 设为 `DeepSeek API`。
3. 刷新待翻译网页，再点击 **翻译**。

连接测试也会调用 API，可能产生少量费用；测试成功只说明示例请求成功，不代表长文章和视频字幕已经完成验收。

如果是第三方平台提供的 DeepSeek 模型，使用下面的“自定义兼容接口”，填写该平台自己的地址和 Key。接口说明见 [DeepSeek 官方中文文档](https://api-docs.deepseek.com/zh-cn/)。

## 接入其他大模型 API

### 支持什么样的接口

当前支持 **Chat Completions 兼容接口**，即服务能接收 `POST …/chat/completions`，使用 `model`、`messages` 等字段，并在 `choices[0].message.content` 中返回文本。

不是任意大模型网址都能直接使用。模型的聊天网页、只提供 Responses 的接口、其他原生协议和传统翻译 API，不能仅靠替换 API 地址接入当前版本。请先查看服务商文档是否提供 Chat Completions 兼容入口。

### 配置步骤

1. 在你选择的服务商处获取 **兼容接口地址、模型 ID、API Key**。
2. 插件设置 → **翻译 / Translations** → 下方 **配置服务** 选择 `自定义兼容接口`。
3. 分别填写上述三个字段，点击 **保存并测试连接**。
4. 将上方 **页面翻译服务** 也设为 `自定义兼容接口`。
5. 刷新网页并翻译。

API 地址可以是服务商给出的基础地址，也可以是完整接口地址：

| 服务商文档给出的形式 | 插件中可填写 | 实际请求地址 |
| --- | --- | --- |
| 基础路径包含 `/v1` | `https://api.example.com/v1` | `https://api.example.com/v1/chat/completions` |
| 基础路径不含版本号 | `https://api.example.com` | `https://api.example.com/chat/completions` |
| 完整接口地址 | `https://api.example.com/v1/chat/completions` | 保持该接口路径 |

这里的 `api.example.com` 是占位符，**必须替换为你的真实服务地址**。服务商若要求 `/v1` 或其他前缀，必须按其文档保留；插件不会替你猜测版本路径。

其他要求：

- 远程地址使用 `https://`；地址中不要夹带账号密码、Key 查询参数或 `#` 片段。
- 当前 Key 以 `Authorization: Bearer …` 发送；需要其他鉴权方式或额外必填参数的服务，可能需要进一步适配。
- 模型需要遵循翻译指令，返回与输入同序、同数量的 JSON 字符串数组。若模型返回解释、推理内容或错误格式，插件会拒绝结果，避免译文错位。
- 当前不提供自定义请求头、任意请求体或自定义提示词的设置入口。

## 接入本地模型

本地模式的流程是：先让电脑上的模型软件提供服务，再让浏览器插件连接该服务。**只安装插件，不会自动下载或启动模型。**

### Ollama

1. 从 [Ollama 官网](https://ollama.com/) 安装 Ollama。
2. 下载一个适合自己电脑的模型。例如使用与插件预填名称一致的模型：

   ```powershell
   ollama pull qwen3:8b
   ollama list
   ```

3. 确认 Ollama 服务正在运行。如果没有运行，可执行 `ollama serve`；若提示端口已占用，先检查是否已有 Ollama 服务，无需重复启动。
4. 插件设置中填写：

   | 字段 | 填写内容 |
   | --- | --- |
   | 配置服务 | `本地模型` |
   | API 地址 | `http://127.0.0.1:11434/v1` |
   | 模型名称 | `ollama list` 中的实际模型名，例如 `qwen3:8b` |
   | API Key | 无鉴权的本地 Ollama 服务可留空 |

5. 点击 **保存并测试连接**，成功后将上方 **页面翻译服务** 设为 `本地模型（Ollama / LM Studio）`。
6. 刷新网页，再开始翻译。

示例模型不是硬件配置建议；模型大小、推理速度和是否适合翻译取决于你的电脑及模型表现。较慢或长时间思考的模型可能无法在当前请求的 25 秒超时内返回。

如果服务正在运行却被拒绝访问，检查其 Origin 访问限制。Ollama 提供 `OLLAMA_ORIGINS` 配置，可按需允许自己的扩展来源；修改后需重启服务。在 Chrome/Edge 扩展详情中可以查看扩展 ID，对应来源形式为 `chrome-extension://你的扩展ID`。参见 [Ollama Origin 与环境变量说明](https://docs.ollama.com/faq)；兼容接口见 [Ollama 官方文档](https://docs.ollama.com/api/openai-compatibility)。

### LM Studio

1. 从 [LM Studio 官网](https://lmstudio.ai/) 安装软件，下载并加载一个聊天模型。
2. 打开 **Developer（开发者）** 页面，启动本地 API Server，记下界面显示的地址、端口和模型 ID。
3. 在插件的 **配置服务** 中选择 `本地模型`，填写：

   | 字段 | 填写内容 |
   | --- | --- |
   | API 地址 | 例如 `http://127.0.0.1:1234/v1`；端口以服务实际设置为准 |
   | 模型名称 | 服务实际暴露的模型 ID |
   | API Key | 未启用鉴权时留空；已启用时填写服务要求的访问令牌 |

4. 点击 **保存并测试连接**，将上方 **页面翻译服务** 设为 `本地模型（Ollama / LM Studio）`，刷新网页后翻译。

参见 [LM Studio 本地服务启动说明](https://lmstudio.ai/docs/developer/core/server) 和 [兼容接口说明](https://lmstudio.ai/docs/developer/openai-compat)。Ollama 与 LM Studio 共用插件的一组“本地模型”配置，切换服务时要修改地址、模型和必要的 Key。

### 可以连接另一台电脑的模型吗

当前 HTTP 地址只允许回环主机 `localhost`、`127.0.0.1` 和 `[::1]`，它们都指运行浏览器的这台电脑。`http://192.168.…` 这样的局域网明文地址会被拒绝；远程部署需要配置浏览器可访问的 HTTPS 服务地址。

## 使用视频双语字幕

1. 先在设置中选好网页翻译引擎、目标语言，以及需要的模型配置。字幕始终使用这套设置。
2. 打开含视频的网页，在播放器中找到 **双语字幕** 按钮；YouTube 按钮位于控制栏，其他播放器通常在视频右上角。
3. 点击按钮，打开 **翻译当前视频**。也可在插件弹窗中打开“当前页面双语字幕”。普通浏览器更新后需要重新加载扩展并刷新网页。
4. 选择已有的源字幕轨。YouTube 可先用原生 CC 菜单打开字幕；HTML5 播放器也需要可读取的字幕轨。
5. 菜单可切换双语 / 仅译文、上下顺序、字号、颜色、背景透明度及距底部位置。**本站自动开启**只在你选择后保存；旧设置页的字幕开关作为全局默认保留。

菜单状态会区分：

- **时间轴模式**：已取得字幕时间，优先翻译当前句，播放时预取未来约 30 秒、最多 12 条；暂停和后台标签页停止扩大预取。
- **即时字幕模式**：只能取得正在显示的文本，不能提前翻译。较慢模型可能赶不上短字幕，过期响应不会覆盖当前句。
- **读取或翻译失败**：保留 / 恢复原生字幕，在菜单中显示原因；可点击“重新读取 / 重试”。不会自动改用其他服务。

DeepLearning.AI 会尝试读取 Vidstack 或课时 VTT。在展开的文字稿旁提供“翻译本句”和“翻译可见文字稿”，保留时间戳及原点击跳转。具体登录课时的 DOM 仍需要现场验证，登录要求由网站决定。

**使用边界：**

- 只翻译已有文本字幕，包括网站提供的自动生成文本；不进行录音、语音识别或画面字幕 OCR。
- YouTube 的字幕接口有时会返回 **HTTP 200 但正文为空**。本项目在独立浏览器实测遇到了这种情况：CC 开启、视频能播放，但没有可翻译的字幕。按钮可用不等于该视频字幕已通过验收。
- DeepLearning.AI 已确认存在 VTT 和播放器入口；独立浏览器播放遇到登录提示，登录后播放、换课及完整文字稿仍待实测。
- 字幕层随视频区域和播放器容器全屏定位；直接将原生 `<video>` 元素全屏时可能无法叠加，标准画中画不在本轮支持范围。
- 关闭字幕会移除插件字幕并恢复其隐藏的原生字幕；不承诺适配任意视频网站。

## 费用、联网和隐私

| 使用方式 | 费用与联网 | 翻译文本发送到哪里 |
| --- | --- | --- |
| Google / Yandex | 插件不要求配置付费 Key；需要能访问接口，不保证可用性 | 对应的翻译服务 |
| DeepSeek / 其他云端模型 | 需要网络；服务商可能按 API 用量收费，本项目不代收费用 | 你填写并选定的模型接口 |
| 同机本地模型 | 下载模型时通常需要联网；纯本地推理可不依赖云 API，但网页本身仍可能需要网络，推理占用本机资源 | 本机的模型服务，前提是该服务使用本地推理 |

云 API 的成本取决于服务商、模型、文章长度和调用次数。整页翻译、自动翻译、动态内容和开启字幕都可能增加请求；测试连接也会产生请求。

插件需要网页访问权限来读取正文、插入译文；在启用翻译、自动翻译或字幕功能时，会将相应文本发送给所选服务。本项目不提供自己的翻译中转服务器；选择第三方网关时，文本和 Key 会发送给该网关。

API Key 保存在当前浏览器配置文件的扩展本地存储中，不写进仓库，也不包含在普通设置导出里。该存储不是系统级加密保险箱；不要将含 Key 的设置截图或服务日志公开上传。恢复默认设置会清除 AI 配置。完整说明见 [PRIVACY](PRIVACY)。

## 常见问题

| 现象 | 处理方法 |
| --- | --- |
| 提示缺少 `manifest.json`，或者安装失败 | 从 Release 的 Assets 下载浏览器扩展包，解压后选择直接包含 `manifest.json` 的目录；不要直接加载源码 ZIP |
| 插件装好了，原来的页面没有反应 | 刷新网页；确认插件已启用、获准访问该站点，再用普通外文文章测试 |
| Google 无法翻译 | 检查是否能访问 `translate.googleapis.com`，也可能是旧接口限流或失效；切换到已经配置成功的其他引擎，不需要给 Google 选项填写 Key |
| 模型测试成功，但网页似乎仍使用 Google | 检查上方“页面翻译服务”是否同步改为对应 AI 引擎，随后刷新页面；下方“配置服务”只决定编辑哪组参数 |
| 点击弹窗里的翻译引擎图标后模型设置似乎失效 | 当前该图标的快捷切换逻辑只在 Google/Yandex 间切换；AI 引擎请到设置页选择，必要时重新选回 |
| HTTP 401 / 403 | 检查 Key、接口权限、账户和服务的访问限制；Key 不要加引号或 `Bearer ` 前缀 |
| HTTP 404 或模型不存在 | 检查服务地址前缀、是否支持 `/chat/completions`，以及模型 ID 是否完全正确 |
| HTTP 429 或额度不足 | 到服务商查看限流、余额和调用额度，降低自动翻译范围或稍后重试；当前错误提示未必能细分每种额度原因 |
| 本地服务连接失败 | 确认模型已下载/加载、服务已启动、端口正确，并检查浏览器访问权限和服务 Origin 限制 |
| 提示 25 秒超时 | 检查网络或本地推理速度；在服务端选择响应更快的模型后重试 |
| 提示 JSON 译文数组或数量不匹配 | 模型输出不符合要求；尝试更能遵循指令的模型或检查兼容服务，不要把报错当成成功译文 |
| 只显示译文、不显示原文 | 在常用配置中开启双语显示，也可检查是否对该网站配置了特殊显示规则 |
| 视频只有原字幕，没有插件译文 | 确认实验字幕开关已开启、视频页已刷新、原字幕已打开，且所选引擎能翻译；字幕可能不在当前可读取范围内 |
| 浏览器设置页、商店页或特殊页面无法翻译 | 浏览器限制扩展访问部分页面；请先用普通网页测试，本项目不保证内部页面、PDF 阅读器或其他特殊页面可用 |

仍无法解决时，请到 [Issues](https://github.com/Yvonson/immersive-translate/issues) 提供浏览器版本、插件版本、所选引擎、网页/视频地址、复现步骤和完整报错。提交截图或日志前去掉 API Key 和私人内容。

## 更新、备份和卸载

### 更新手动安装的插件

1. 下载新版 Release 中对应的 ZIP，解压后用新文件替换原安装目录中的文件。
2. 保持原目录路径，到扩展管理页点击插件的 **重新加载 / Reload**。
3. 刷新已经打开的网页。

手动安装版不会通过本项目的商店自动更新。替换文件前可以先备份普通设置；不要通过“删除扩展再安装”的方式假设所有配置都会保留。

### 备份配置

进入设置页的 **存储 / Storage** 区域导出配置，之后可通过导入恢复普通设置。**导出的备份不含 AI API 地址、模型和 Key，AI 配置需要自行重新填写。**

### 关闭或卸载

- 暂时停用：在浏览器扩展管理页关闭插件开关。
- 卸载：在扩展管理页移除插件，再刷新网页。已加载的页面可能要刷新后才清除插入内容。
- 恢复默认设置：会清除保存的 AI 配置，操作后需要重新填写。Firefox 临时开发安装移除后可能仍保留部分本地数据，数据清理以浏览器的配置文件管理为准。

## 开发者：从源码构建

仅在需要修改代码或使用尚未发布的源码时使用此流程。普通用户安装上面的 Release 包即可。

需要 Git 和 Node.js 22 或更新版本。在终端执行：

```powershell
git clone https://github.com/Yvonson/immersive-translate.git
cd immersive-translate
npm ci --ignore-scripts
npm test
npm run build
npm run check
npx playwright install chromium
npm run test:browser
```

构建完成后：

| 用途 | 路径 |
| --- | --- |
| Chrome / Edge 加载目录 | `dist/chrome` |
| Firefox 临时加载入口 | `dist/firefox/manifest.json` |
| Chrome / Edge 分发包 | `dist/chrome.zip` |
| Firefox 开发包 | `dist/firefox.zip` |

修改 `src/` 后重新构建、重新加载插件并刷新网页。不要直接修改 `dist/`，也不要将 API Key 写进代码。

开发与验收流程见 [DEVELOPMENT.md](docs/DEVELOPMENT.md)；项目背景、决策和待办见 [项目记忆](docs/memory/README.md)；协作入口为 [AGENTS.md](AGENTS.md)。GitHub Actions 会测试、构建并上传 ZIP artifacts，`v*` 标签触发 Release 发布。

## 项目来源与许可证

由 Yvonson 独立维护，以归档的 [old-immersive-translate](https://github.com/immersive-translate/old-immersive-translate) 源码为基础重新初始化 Git 仓库。导入提交为 `6df13da22664bea2f51efe5db64c63aca59c4e79`；其上游为 [TWP](https://github.com/FilipePS/Traduzir-paginas-web)。本项目有自己的历史与扩展身份，不是官方沉浸式翻译产品。

保留 [MPL-2.0 许可证](LICENSE)、原有版权声明及 [上游原版 README](docs/upstream-readme.md)。来源详情见 [UPSTREAM.md](UPSTREAM.md)。
