# SideLens 隐私说明 / Privacy

版本 0.1.6 · 2026-10-27

公开政策：https://nobiggie.xyz/sidelens/privacy

完整随包说明：[extension/privacy.html](extension/privacy.html)。

- 主动点击帖子或草稿核查后，才发送相关上下文。不自动批量分析或记录整个浏览信息流。
- API/OAuth 直连 xAI；本机 Build 只连接固定回环地址。没有额外 SideLens 中转或遥测。
- 成功结果存入受限本机存储，有效 24 小时、160 条 / 约 4 MB。缓存和历史不加密，不使用同步。
- 可选历史只包含主动打开分析的帖子及已有结果，24 小时内最多 1,000 条 / 约 6 MB。缓存与历史分别清除。
- 草稿、草稿图片和结果仅保留于运行内存，不进入缓存或历史。
- 回复草稿由你点击生成，发送原帖、分析、最近三轮追问及所选语气、方向、目标字数。使用当前模型并产生用量，不额外搜索、不自动发布；草稿只在本页内存中保留，不进入缓存、历史或持久诊断。复制只在点击复制按钮时写入剪贴板。
- 初次分析和每次追问回答后，会额外调用当前提供方生成 3 个问题建议。初次建议进入同一有界缓存；追问发送原帖、初次分析、最近三轮问答及当前问题，聊天及后续建议只留在页面内存，不写入缓存、历史或持久诊断。关闭或刷新页面后聊天不会恢复。
- 本机记录最近一次 X 外观（亮色、暗蓝或纯黑）供扩展页面使用。社区按钮仅在你点击时打开 nobiggie.xyz/chat，Logo 随包存放。
- 持久凭据沿用 AES-GCM 和独立不可导出 IndexedDB 密钥；无法抵御整个浏览器配置被复制或设备被控制。更换或清除 API Key 时清理缓存。
- 计费、搜索、日志、保留与账号权限由提供方决定。store:false 不等于零保留；原重试策略可能产生额外请求和费用。

SideLens analyzes explicitly selected posts or drafts only. Context goes directly to the configured xAI or loopback connection. Completed results stay in trusted local extension storage for up to 24 hours (160 entries / approximately 4 MB). Optional selected-post history has a separate 24-hour, 1,000-entry / approximately 6 MB limit. These stores are unencrypted, not synced, and cleared independently. Drafts and follow-up conversations remain in runtime memory. Follow-ups include the post, initial analysis and up to three recent question/answer pairs; generated suggestions consume additional usage, and only initial suggestions are cached. Reply drafts use the post, analysis, three recent exchanges and selected writing preferences after an explicit click; they consume provider usage, stay in page memory and are not published automatically. The last X appearance is stored locally. The community link opens only on a user click. Credentials use local AES-GCM protection; copied profiles and compromised devices are outside this protection. Provider billing and retention still apply.
