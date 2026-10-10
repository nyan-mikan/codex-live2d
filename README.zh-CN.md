# Codex Live2D

[English](README.md) | **中文**

在 Codex 桌面工作区右下角显示可互动的 Live2D 角色，并可通过 Fish Audio 逐句朗读流式正文。

这是独立的 macOS 扩展，通过本机调试连接挂载到桌面界面，不修改应用安装包。当前渲染器支持用户自行提供的 Cubism 2.1 模型，不内置角色或角色资源。

## 功能

- 眼睛与头部跟随鼠标，点击动作、可选的自定义表情、大小和上下位置调整。
- 圆形齿轮设置按钮和扬声器开关；收起后保留重新打开入口。
- 增量获取新的助手正文，排除思考、工具输出和过程说明，不补读已完成的历史回答。
- Fish Audio 一句一句合成；播放时提前生成并解码后续最多三句，减少等待。
- 朗读时使用自然表情，嘴部随声音变化。
- 朗读前清理 Markdown、emoji、引用标记和 `www` 等笑声；保留网址中的 `www`。
- 关闭扬声器立即停止播放、取消请求和清空缓存，再开启只读之后的新文字。
- 可安装登录服务，检测更新后启动参数丢失并尝试恢复模型。

## 环境要求

- macOS，Node.js **22 或更新版本**；Node.js 自带 npm。
- Codex 桌面应用，自动检测 `/Applications/ChatGPT.app` 和 `/Applications/Codex.app`。
- 你自行提供的 **Cubism 2.1** 模型：`.model.json`、`.moc`、贴图和相关资源。
- 自行提供兼容的 Cubism 2.1 `live2d.min.js` runtime。
- 如需语音，准备 Fish Audio API Key 和声音 `reference_id`。

GitHub 仓库与源码 ZIP 包含程序及允许分发的浏览器库，**不包含角色资源和专有 Live2D runtime**。浏览器库已固定版本并随源码提供，无需安装 npm 依赖。详见[第三方说明](THIRD_PARTY_NOTICES.md)。

## 安装

### 1. 下载项目

```sh
git clone https://github.com/nyan-mikan/codex-live2d.git
cd codex-live2d
node --version
```

若启用自动恢复，请把此目录放在固定位置。

### 2. 导入模型和 runtime

模型入口为 `model.model.json` 时：

```sh
npm run setup -- --model-dir "/模型目录" --runtime "/runtime/live2d.min.js"
```

其他 Cubism 2.1 模型可指定入口文件名：

```sh
npm run setup -- --model-dir "/模型目录" --model-entry "custom.model.json" --runtime "/runtime/live2d.min.js"
```

导入程序检查所有被引用资源，复制到 `model/`，并把入口统一保存为 `model.model.json`，不会复制无关文件。当前构建不支持 `.model3.json` / `.moc3`；runtime 要使用 Cubism **2.1** 的 `live2d.min.js`，不是 `live2dcubismcore.min.js`。

表情由用户的本机模型配置提供，不内置专属角色预设或固定动作序号。请按资源本身的条款获取模型和 runtime；可参考[上游 runtime 说明](https://github.com/guansss/pixi-live2d-display#cubism-core)。

### 3. 检查并启动

```sh
npm run doctor
npm start
```

启动时可能正常退出并重新打开 Codex，以开启 `127.0.0.1:19335` 或本机 IPv6 上的调试入口，请先结束当前工作。若 macOS 询问控制应用的权限，请允许；若 Codex 询问是否退出，请确认。启动程序等待正常退出，不会强制终止应用。

也可双击 `Start.command`。右下角齿轮打开设置，扬声器按钮控制朗读。

应用不在默认位置时，在启动和安装恢复服务前指定：

```sh
export CODEX_APP_PATH="/实际路径/Codex.app"
npm start
```

### 4. 可选：安装更新恢复服务

```sh
npm run install:recovery
```

这会注册当前用户的 `~/Library/LaunchAgents/com.codex-live2d.recovery.plist`，每 10 秒检查一次。当版本变化、应用正在运行且调试入口丢失时，等待至少 45 秒，再尝试正常重启并挂载模型。服务保存安装时使用的应用、Node 和项目路径。

若有退出确认，仍需你确认。同一次应用运行期间失败后不反复尝试；手动退出并重新打开后可以再次尝试。主动退出应用时不拉起应用；同一版本的普通启动未启用调试时也不强制重启。

导入资源后，双击 `Install.command` 可合并首次启动和恢复服务安装。

## 可选：模型参数配置

运行 `npm run setup -- --profile "/配置/profile.json"` 可配置自己的模型参数。文件保存为本机 `model/profile.json`，不会加入 Git 或源码 ZIP。没有配置时，模型支持鼠标跟随、动作、语音与自然表情入口，不带预设角色表情；点击时从可用动作中选择，不使用固定序号。

参见[通用示例](docs/model-profile.example.json)。`neutral`、`speechNeutral` 是参数名到数字的映射，`expressions` 包含自定义的 `{label, parameters}` 项；`mouthParameter`、`idleMotionGroup`、`clickMotionGroup` 分别指定嘴部参数、待机和点击动作组。默认标识遵循 Cubism 2 常见命名，可按自己的模型覆盖。

## Fish Audio 设置

点击齿轮 → **语音设置 · Fish Audio**，填写：

| 设置 | 含义 |
| --- | --- |
| `FISH_API_KEY` | Fish Audio API Key，在密码框输入 |
| `reference_id` | 要使用的声音 ID |
| 语音模型 | 手动输入 Fish 语音生成模型名称 |
| 自动朗读新正文 | 是否朗读新的助手正文 |
| 记住 API Key | 可选，在本机明文保存 Key |

默认模型名是 `s2.1-pro-free`，可用名称取决于账号，请查阅 [Fish Audio 官方文档](https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech)。保存后可点击“试听”。

Key 默认只留在当前守护进程内存；勾选记住后，以仅当前用户可读写的权限保存在 `state/fish-config.json`。整个 `state/` 不会加入 Git 或源码打包；未勾选记住时，重启守护进程后要重新输入。

开启语音后，清理过的正文按句发送到 Fish Audio。正文监听不落盘，音频缓存仅在内存中。关闭扬声器会取消播放、合成和预取。模型上方不显示正文弹窗。

## 停止、卸载和移动目录

```sh
npm run stop                  # 移除角色并禁用自动恢复
npm run uninstall:recovery    # 卸载用户登录服务
```

`Stop.command` 同样可以关闭模型。之后正常退出并重新打开 Codex，可关闭临时调试入口。若登录服务仍已安装，`npm start` 会重新启用模型和恢复功能。

移动项目目录前，从旧目录停止模型并卸载恢复服务；再从新目录启动并重新安装。不要同时运行多个指向同一调试入口的守护进程。

## 开发与验证

```sh
npm test             # 文本、语音队列、恢复策略与资源导入测试
npm run preview      # 本地预览 http://127.0.0.1:19436，需要模型资源
npm run verify       # 检查当前桌面挂载状态
npm run reload       # 重新挂载修改后的代码并重启守护进程
npm run pack:source  # 把已提交源码打包到 dist/，需要 Git 提交
```

测试模拟 Fish Audio，不发送付费合成请求。源码打包程序发现 Git 提交包含本机状态、角色资源或专有 runtime 时会拒绝打包。

| 文件 | 作用 |
| --- | --- |
| `renderer.js` | 模型、表情、位置和控制按钮 |
| `answer-bridge.js` | 正文增量获取 |
| `speech-text.js` | 清理文字和分句 |
| `fish-client.js` / `fish-host.mjs` | 语音队列、预取、播放和 API 请求 |
| `inject.mjs` / `cdp.mjs` | 本机挂载与守护进程 |
| `control.mjs` / `recovery*.mjs` | 启动、关闭和更新恢复 |
| `setup.mjs` | 导入并验证本机模型与 runtime |

## 排查与兼容范围

- **更新后模型消失：**查看 `state/recovery-status.json` 和 `state/recovery.log`。结束工作并确认退出；自动恢复没有完成时，运行 `npm start`。
- **缺少资源：**使用完整模型目录和兼容 runtime 重新导入，运行 `npm run doctor` 查看结果。
- **没有朗读：**检查扬声器开关、Key、声音 ID 和模型名。音频上下文有时需要点击一次按钮才允许播放。
- **模型关闭：**从齿轮入口重新展开；完整移除后用 `npm start` 恢复。
- **Work / Chat 视图：**监听器包含 Codex、ChatGPT Work、ChatGPT Chat 的数据适配，但依赖内部页面元数据，需在你的版本上分别验证，不能保证所有未来更新自动兼容。

原安装在桌面版本 26.1002.52244 和 26.1007.21159 上运行并验证过。这不是官方扩展接口，应用更新可能需要调整适配器。目前未实现 Windows / Linux 桌面挂载；设置界面使用中文。

## 许可

项目代码采用 [MIT](LICENSE)。浏览器库见[第三方说明](THIRD_PARTY_NOTICES.md)。模型、Live2D runtime 和商标遵循各自的条款。
