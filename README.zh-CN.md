# Nobiggie SideLens

**点一下核查 → 带着上下文追问 → 整理成回复草稿。**

[English](README.md) · [官网](https://nobiggie.xyz/sidelens) · [隐私说明](https://nobiggie.xyz/sidelens/privacy) · [加入社区](https://nobiggie.xyz/chat)

SideLens 基于开源项目 [SuperX](https://github.com/bwjoke/SuperX)（MIT）二次开发。**感谢原作者 [@coolish](https://x.com/coolish) 的贡献。**

![SideLens 在 X 页面上的按钮与分析抽屉](docs/assets/sidelens-readme.png)

点击帖子旁的 SideLens 按钮，在右侧阅读核查结果并继续追问。

## 功能与改动

- **按需核查**：点击推文右上角、Grok 左侧的小按钮，才开始分析；滚动不自动分析。结果在右侧抽屉显示，点空白处或按 Escape 收起。
- **结果复用**：完成结果在本机缓存 24 小时，刷新页面或重启浏览器后可以复用；「重新分析」跳过缓存。缓存按账号及模型等配置隔离，最多 160 条、约 4 MB。
- **连续追问**：带着原帖、分析和最近三轮完整问答继续讨论，每次回答后提供 3 条生成的追问建议。
- **回复草稿**：选择语气、方向及约 50 / 100 / 300 / 500 / 1000 字，结合原文、分析和讨论生成草稿。可编辑、查看字数并复制，不自动发布。
- **阅读界面**：中文正文采用 Noto Sans SC 优先字体栈、14px 和 1.85 行距，支持标题、加粗、引用、列表和表格；自动跟随 X 的亮色、暗蓝与纯黑主题。未安装字体时使用系统回退，不远程加载字体。

本项目在原版基础上重点改造了按需触发、持久缓存、上下文追问、回复参数与阅读界面。Grok 连接等底层能力继承并适配自 SuperX，原项目署名和许可保留。

## 安装

当前版本：**0.1.6**。截至 2026-10-27，Chrome 商店正在审核中，本页暂不提供公开商店安装链接。

1. 点击仓库的 **Code → Download ZIP**，解压至一个固定文件夹。
2. 在 `chrome://extensions` 或 `edge://extensions` 开启「开发者模式」。
3. 点击「加载已解压的扩展程序」，选择包含 `manifest.json` 的 **extension/** 文件夹。
4. 打开 SideLens 设置，配置一种 Grok 连接；官方登录授权由你本人确认。
5. 刷新 X，点击帖子旁的 SideLens 按钮。

测试时请停用原 SuperX，避免两个扩展同时处理页面。未打包安装需手动更新：替换原文件夹内容，重新加载扩展，再刷新 X。

## 自备 Grok 连接

支持符合资格的 Grok 订阅登录、xAI API Key，以及可选的本机 Grok Build 服务。扩展不附赠共享账号、API Key 或免费模型额度。账号资格、可用模型、额度、费用和数据保留以提供方规则为准；分析、追问、自动问题建议及回复草稿都可能产生用量。

详见 [连接指南](docs/CONNECTIONS.md)。该文档保留了已明确标注的上游历史验收记录，不能视为 SideLens 的真实账号实测。

## 本地开发与验证

需要 **Node.js 22+**。使用 OAuth / API Key 和运行普通测试无需 `npm install`。

```sh
node tools/validate.mjs
node tools/package-release.mjs
node tools/preview-server.mjs
```

安装包、源码包、文件清单和 SHA-256 校验值输出到 `artifacts/`。预览服务器使用模拟数据，不调用真实 Grok，请勿在演示页填写真实凭据。

隔离浏览器检查另需 Playwright 与桌面 Edge：

```sh
node tools/check-sidelens-browser.mjs http://127.0.0.1:PORT

```

PORT 使用服务器输出的端口。自动化和模拟测试不能证明实际 X 页面兼容性、账号资格或模型答案准确性。

## 隐私与安全

请求直接发送至所选 xAI 或本机回环连接，不额外经过 SideLens 分析服务器。持久凭据在本机加密；分析缓存和可选的已选帖子历史不加密、不同步，可分别清除。追问与回复草稿仅保留在当前页面内存。提供方的数据保留规则仍适用。

[隐私说明](PRIVACY.md) · [安全政策](SECURITY.md) · [源码审查记录](docs/SECURITY_REVIEW.md) · [贡献指南](CONTRIBUTING.md) · [更新记录](CHANGELOG.md)

## 致谢与许可

基于 **[SuperX](https://github.com/bwjoke/SuperX)**，上游基线提交为 `5cfa125f9000866c1719afc452d1867ef37280bf`。

**感谢原作者 [@coolish](https://x.com/coolish) 的贡献。**

保留原始 [MIT 许可](LICENSE) 与 [Marked 第三方许可](extension/marked-LICENSE.txt)。部分内部名称保留上游标识以维持兼容。SideLens 与 X、Grok、xAI、Google 和原 SuperX 发布者没有隶属关系。
