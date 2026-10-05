# 拾句 · B 站英语截图

轻量的 Chrome 英语学习扩展：在 B 站用快捷键截图收藏画面与字幕，遮挡字幕练习听力和跟读，并通过本机 Codex 提炼截图中的英语表达、生成命名建议，确认后批量改名。

## 本地工具与支持范围

扩展无需构建，也无需安装项目 npm 或 pip 依赖。按需要选择功能：

| 功能 | 本地依赖 | 安装地址和方法 |
| --- | --- | --- |
| 截图、遮挡字幕、保存到下载目录 | Chrome 122 或更新版本 | [Chrome 官方下载](https://www.google.com/chrome/)，下载并安装；macOS 将应用拖入「应用程序」 |
| 保存到任意独立文件夹、在访达打开目录 | macOS、Python 3.9+、本项目辅助程序 | 按下文安装 Apple Command Line Tools，再运行 `/usr/bin/python3 native-host/install.py` |
| 生成截图命名建议 | 上一行全部依赖、已安装并登录的 Codex CLI、网络及可用模型额度 | 按下文安装 Codex CLI 并执行 `codex login` |
| 运行 JavaScript 测试（仅开发） | Node.js，建议使用当前 LTS（本次验证版本为 22） | [Node.js 官方下载](https://nodejs.org/en/download)，选择 LTS 的 macOS 安装包，按提示安装 |
| 运行 Python 测试（仅开发） | Python 3.9+ | 可使用 Apple Command Line Tools 提供的 Python；也可从 [Python 官方下载](https://www.python.org/downloads/macos/) 安装 macOS `.pkg` |

本地辅助程序目前仅为 macOS 实现，自动注册 Google Chrome 和 Dia。[Dia 官方下载](https://www.diabrowser.com/download)可作为可选浏览器：下载后将应用放入「应用程序」，在其扩展管理页加载 `english-clips`。其他 Chromium 浏览器的 Native Messaging 注册路径尚未适配。Windows、Linux 可尝试扩展的浏览器下载保存方式，但本仓库没有在这些系统上验证；独立文件夹辅助程序和 Codex 整理暂不支持它们。

### 安装 macOS 的 Python 运行环境

辅助程序入口固定使用 `/usr/bin/python3`，不能只检查终端中的 `python3`。先运行：

```bash
/usr/bin/python3 --version
```

需要 Python 3.9 或更新版本。如果提示缺少开发者工具，执行以下命令并在系统弹窗完成安装：

```bash
xcode-select --install
/usr/bin/python3 --version
```

安装地址与说明：[Apple Command Line Tools 官方文档](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools/)。无需安装完整 Xcode。辅助程序只使用 Python 标准库；选择文件夹、打开访达和生成预览分别使用 macOS 提供的 `/usr/bin/osascript`、`/usr/bin/open`、`/usr/bin/sips`。

从 python.org 安装的新 Python 不会替换 `/usr/bin/python3`，详见 [Python 官方 macOS 说明](https://docs.python.org/3/using/mac.html)。如果系统入口仍不可用，仅安装 python.org 版本不能解决当前辅助程序的启动问题；请先完成 Apple 开发者工具安装。

### 安装并登录 Codex CLI（仅截图整理需要）

安装地址：[Codex CLI 官方安装文档](https://developers.openai.com/codex/cli/)。可按官方 macOS 独立安装方式操作，此方式无需 Node.js：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
codex --version
codex login
codex login status
```

按照安装器提示将安装目录加入 `PATH`，必要时重新打开终端。在登录流程中选择 ChatGPT 账户，详见 [Codex 官方登录说明](https://developers.openai.com/codex/auth/)。截图整理会把所选图片交给 Codex 模型分析，需要联网，并消耗所用账户的额度；截图与本地保存本身无需 Codex。

**当前兼容限制：**

- 辅助程序优先尝试 `/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex`，再查找浏览器进程 `PATH` 中的 `codex`。独立安装 CLI 即可，无需为此安装 ChatGPT 应用；已有应用里的内部路径可能随版本变化。
- 终端能运行 `codex` 不代表从访达启动的浏览器也能找到它。若整理提示「找不到可用的 Codex 命令」，先用 `command -v codex` 确认安装目录已加入 `PATH`，完全退出 Chrome，再从同一终端启动浏览器，例如 `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`。浏览器必须继承包含 Codex 的环境。
- 当前代码固定使用 `native-host/host.py` 中的 `ORGANIZE_MODEL = 'gpt-6-luna'`，并要求 CLI 支持 `exec`、图片输入、`--output-schema` 和 `--ephemeral`。本仓库不保证所有 CLI 版本或账户都支持该模型。若账户不支持，请将该常量改为账户实际可用、支持图片与结构化输出的模型，再重新安装辅助程序；扩展设置页目前不能切换模型。
- 如果优先使用了 ChatGPT 应用内的 CLI，排查时应对该可执行文件检查版本和登录状态，不能只检查另一个独立安装的 `codex`。

## 安装

先从 [GitHub 仓库](https://github.com/herschel001/shiju)的 **Code → Download ZIP** 下载并解压完整项目。只使用浏览器截图时，也可以解压根目录的 `english-clips.zip`；如果需要辅助程序，请保留完整项目中的 `native-host` 目录。辅助程序会复制到用户应用支持目录，但移动加载的扩展文件夹后仍须重新运行安装脚本。

1. 打开 Chrome 地址栏，输入 `chrome://extensions`。
2. 打开右上角「开发者模式」。
3. 点击「加载已解压的扩展程序」（**Load unpacked**），选择项目中的 **`english-clips` 文件夹**，其中直接包含 `manifest.json`。不要选择项目根目录「拾句」。
4. 打开一个 B 站视频页面，按 **⌘ Shift Y** 试截一张。也可以点击扩展图标，再点「收藏当前画面」。

## 跟读时遮挡字幕

在 B 站视频页面点击扩展图标，打开「遮挡字幕」开关，即可用 80% 不透明的白色色块和背景模糊盖住画面下方居中的双语字幕；关闭开关则显示字幕。用鼠标拖动色块可移动位置，鼠标移到上、下、左、右边缘会变成缩放指针，拖动可单独调整该边；边缘没有可见的缩放标记。在色块上右键，选择「关闭遮挡」也能直接关闭。位置和尺寸在当前标签页内切换遮挡、调整播放器大小时保留。也可以按 **⌘ Shift U** 来回切换；设置页还列出可单独分配的「只遮挡字幕」和「只取消遮挡」快捷键。按「去 Chrome 修改快捷键」进入 `chrome://extensions/shortcuts` 分配或修改。遮挡层随播放器移动，在网页全屏时也会跟随。刷新视频页面后遮挡会重置。

截图时会暂时移开遮挡层，保存原本的画面和字幕，截图完成后恢复遮挡。此功能适合画面底部的字幕；画面顶部或播放器外的字幕不会被覆盖。

外置键盘可以正常使用。要更换组合键，打开 `chrome://extensions/shortcuts`，在「拾句 · B站英语截图」的「收藏当前 B 站视频画面」一栏按下新组合键。若快捷键无响应，检查 Chrome 是否处于前台，以及该组合键是否被系统、B 站或其他扩展占用。

如果要生成 CRX 安装包，再使用「打包扩展程序」（**Pack extension**）：扩展程序根目录选 `english-clips` 文件夹。首次打包由浏览器生成你自己的私钥；后续重新打包时选择同一私钥以沿用扩展 ID。私钥不能放进 `english-clips`，也不要分享给别人。本仓库通过 `.gitignore` 排除 `*.pem`、`*.key` 和 `*.crx`，不提供作者私钥或旧 CRX。直接在本机使用时无需打包。

## 保存文件夹

默认存到 Chrome 当前下载目录下的 `英语截图` 子文件夹。你可在扩展设置页改子目录名，允许使用 `英语截图/生活口语` 这样的多级目录。这种方式无需额外文件夹授权。

如果要用快捷键持续保存到独立的任意文件夹，在 macOS 上安装本地辅助程序：

在终端进入解压后的完整项目根目录（其中有 `README.md` 和 `native-host`），执行：

```bash
/usr/bin/python3 native-host/install.py
```

然后在浏览器的扩展管理页刷新拾句，打开插件设置，将保存方式改为「本地辅助程序 · 独立文件夹」，点「选择保存文件夹…」在系统窗口中指定一次目标目录。也可安装时传入 `--directory '/完整/文件夹路径'`，直接配置现有文件夹。保存截图时，辅助程序只在本机写入 JPG，不需要网络，也不会在闲置后重新请求浏览器的文件夹权限。安装脚本把程序和配置放在 `~/Library/Application Support/拾句/`，并向 Google Chrome 和 Dia 注册只允许本项目扩展 ID 连接的 Native Messaging 宿主。移动已解压插件文件夹后，重新运行安装脚本以更新扩展 ID。
使用本地辅助程序保存时，点击扩展弹窗底部的文件夹路径即可在访达中打开该文件夹。更新辅助程序代码后，重新运行 `python3 native-host/install.py`，再刷新扩展；已有的保存文件夹配置会保留。

如果浏览器仍提示无法连接辅助程序，在扩展管理页复制当前扩展 ID，替换下面的占位文本再运行；安装器会额外允许该 ID：

```bash
/usr/bin/python3 native-host/install.py --extension-id '替换为扩展管理页显示的32位ID'
```

## 看完后整理截图

使用「本地辅助程序 · 独立文件夹」保存时，扩展弹窗会显示「整理已收藏截图」。整理页默认显示当前截图保存文件夹的完整路径；点击路径可通过系统窗口另选整理文件夹，不会改变截图的保存位置。看完视频后点击「生成命名建议」，本机已登录的 Codex CLI 会读取所选文件夹内的拾句截图，从完整英文字幕中提炼重点单词或短表达。文件名必须是字幕中连续出现的 1 至 6 个英文词；值得记住的短句可完整保留（如 `a while ago`），超过 6 词的长句须提炼，且不能包含中文。不符合规则的建议默认不参与改名。你可以点击缩略图查看大图，对照英文字幕和当前建议，再逐张修改或取消勾选，最后点击「确认并改名」。当前整理任务可在页面中撤销；原始图片内容不会重新编码。

整理任务需要本机可用的 Codex CLI。插件通过已安装的本地辅助程序启动它，不在插件里保存 API 密钥。Codex 在只读模式下生成结构化建议，实际改名由本地辅助程序完成；模型识图会使用你的 Codex 账户用量。整理使用更轻的模型设置，每批 8 张完成后更新进度。更新本功能后，请重新运行 `python3 native-host/install.py` 并在浏览器扩展管理页刷新拾句。

旧的「浏览器授权文件夹」方式仍可使用：在设置页选择文件夹并允许写入，选好后立即生效，不用再点击保存按钮。但 Chrome 可能在闲置后收回此方式的权限；此时需点「重新授权」。保存方式、子目录、画质等设置在修改后自动保存。权限失效时插件不会擅自换到其他目录。

## 画质与内容

- 「画面 + 字幕」截取播放器区域，保留看到的字幕和画面。
- 「底部字幕区域」只保存播放器底部 35%，适合字幕一直在底部时使用。
- JPG 有省空间（最宽 960 px）、均衡（1280 px）、清晰（1920 px）三档。只缩小，不放大；不额外保存 PNG 原图。
- 可以在截取瞬间隐藏弹幕。播放器会短暂停顿，截完后恢复先前播放状态。
- 文件名包含视频标题、播放位置和截图时间，便于回看。

截图只包含实际显示在播放器上的字幕；不会识别、翻译或生成字幕。请保持播放器完整位于屏幕内。画中画窗口不支持。若受保护的视频帧无法被 Chrome 截取，插件也不能保证获得画面。

## 验证

在完整项目根目录运行（Python 测试包含调用 `/usr/bin/python3` 的检查，需在 macOS 上执行）：

```bash
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
```

测试覆盖目录名、文件名、裁剪尺寸、B 站地址边界、遮挡层在截图时的显隐，以及辅助程序的保存、命名建议校验和改名流程。开发时曾用隔离 Chrome 实测真实 B 站网页快捷键截图及自选文件夹写入；自动化测试不等同于在所有浏览器、操作系统和 Codex 账户上验证。

代码入口：`english-clips/background.js` 负责快捷键、截图和写盘；`english-clips/content.js` 定位播放器与暂时隐藏控件；`english-clips/options.html` 管理设置。扩展只在用户按快捷键或点击按钮时读取当前 B 站标签页，没有远端服务或遥测。

## 仓库内容与本机数据

- `english-clips/`：可直接加载的扩展，当前版本 `1.5.3`。
- `english-clips.zip`：扩展安装文件的压缩包，不包含辅助程序。
- `native-host/`：macOS 辅助程序、安装脚本和整理输出格式。
- `tests/`：JavaScript 和 Python 自动化测试。

截图、所选目录配置和整理任务保存在你的电脑，不随仓库上传。签名私钥、本机凭据、Python 缓存、旧 CRX 和 `backups/` 备份也不纳入版本控制。不要将 Codex 登录文件或 API 密钥复制到项目里。
