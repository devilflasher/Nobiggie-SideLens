# Security policy

SideLens is an independently maintained MIT derivative of SuperX. There is no guaranteed security-response time or long-term support schedule. Use the latest available release and review its change notes before installing.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/devilflasher/Nobiggie-SideLens/security/advisories/new) for sensitive reports when the repository's **Security → Advisories → Report a vulnerability** option is available. The repository owner must enable this option; its existence is not assumed before publication.

If private reporting is unavailable, open a [public issue](https://github.com/devilflasher/Nobiggie-SideLens/issues/new/choose) that only asks for a private reporting channel. Do not include an exploit, API Key, private post, full request payload or other sensitive details in that issue. Wait for the maintainer to provide a private channel before sending those details. This project does not publish a separate security email address.

A useful private report includes the affected release, browser version, relevant page type, expected versus actual behavior, and a minimal reproduction using fabricated credentials and content. State whether the issue could expose credentials, execute model-provided code, bypass origin checks or trigger unauthorized requests. Redact screenshots and logs.

## If a Key was exposed

Revoke or rotate it in the xAI console, check account usage, and replace or clear it in SideLens. Clearing the local Key does not revoke the provider credential. Do not commit a replacement Key to the repository.

## Implementation boundaries

- Keys and provider calls remain in the extension background worker and trusted extension UI.
- Remembered API Keys are automatically encrypted with AES-GCM. Ciphertext is stored in `chrome.storage.local` as `apiKeyEncrypted`; a separate, randomly generated, non-extractable CryptoKey is stored in extension IndexedDB. The worker automatically restores the decrypted API Key into restricted session storage after browser restart. There is no password or manual lock/unlock workflow. Session-only API Keys remain in session storage and necessary runtime memory.
- Encryption protects exposure of ciphertext or local-settings storage alone. It does not protect access to the ciphertext and IndexedDB together, a full browser profile or backup, or a compromised runtime/device. The CryptoKey’s non-extractable flag prevents raw export through Web Crypto; it does not provide operating-system or hardware binding. Settings, custom prompts and recent browsing history are not encrypted.
- Existing plaintext credentials and usable old session Keys migrate automatically when Remember Key is selected; plaintext is removed only after successful encryption. Older password-encrypted records are not decrypted. Missing or damaged ciphertext or encryption keys require one-time API Key re-entry; obsolete records remain only until successful migration, replacement or clearing.
- Disabling Remember Key removes the saved ciphertext, separate encryption key and obsolete persistent records. Clearing credentials also removes the session Key and cache. Logical deletion does not guarantee forensic erasure or removal from older backups.
- API analysis requires an available API Key and enabled features. The optional local mode requires a confirmed official Grok login and restricted ACP session; it does not use the extension API Key. There is no automatic provider fallback. Provider retries can consume extra usage; inspect the configured provider behavior before drawing conclusions from request counts. Key clearing and replacement cancel old task generations and clear the session cache. There is no separate consent-state gate.
- Feed pages receive configuration and Key readiness, never the credential itself.
- Official local Grok access is optional and fixed to loopback. The generated launch command binds to `127.0.0.1`; remote hosts, arbitrary WebSocket paths and user-provided URL query strings are not accepted. The local connection code is separate from the API Key, encrypted on device and omitted from feed configuration and diagnostics. Its protection has the same full-profile/device limits as remembered Keys. It is a local-service access credential: copied commands, shell history and screenshots must be treated as sensitive. The official service does not enforce a SideLens-only browser origin.
- SideLens supplies an inline restricted profile, confirms the actual local-function count is zero, verifies model/effort selections and rejects all reverse file/terminal/permission RPCs. Startup commands isolate configuration and disable imported integrations. These checks are not an OS sandbox, a guarantee against a compromised official runtime, or permission to bypass managed-device policy.
- WebSocket disconnection does not imply the official task stopped. Cancellation explicitly requests cancel and session closure; reconnection is limited to cleanup, never a repeated prompt. Unconfirmed cleanup is surfaced to the user, who can stop the service in its terminal. Already submitted work can consume quota.
- Completed analysis results use a restricted local 24-hour cache, bounded to 160 entries / approximately 4 MB. They can survive browser restarts and are separated by account and relevant request configuration. Explicit Analyze again bypasses the cache. Credentials changing or clearing invalidate related cached state.
- Optional recent history records only posts explicitly opened for analysis, not all visible feed posts. History is restricted local storage with a 24-hour, 1,000-post / approximately 6 MB bound, and is cleared independently from the analysis cache. Cache and history are unencrypted and can contain non-public content. The feed cannot request the full saved-history collection.
- Follow-up conversations and reply drafts remain in page memory. Requests can include the selected post, initial analysis, up to three recent complete question/answer pairs and reply preferences. Only initial question suggestions share the bounded analysis cache. Draft replies are editable/copyable and never automatically published.

- Model and retrieved content are untrusted data. Markdown rendering must continue to use a restricted DOM builder, without model HTML execution or remote model images.
- New host permissions, telemetry, automatic paid retries or persistence changes require explicit review.

This document supplies a reporting process; it does not claim an external security audit has been completed.
