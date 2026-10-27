# SideLens release checklist

Version: **0.1.6**. Local automated evidence and manual provider/store acceptance are distinct.

## Reproducible checks

- Run `node tools/validate.mjs`: syntax, packaged assets, locale lengths and automated tests.
- Run the isolated browser check against the printed local preview URL. Use simulated credentials/responses, never real keys or paid inference.
- Build with `node tools/package-release.mjs`; verify installation/source inventories and SHA-256 checksums.
- Preserve the MIT and Marked notices, original-project link and author thanks.
- Check that only public source is included: no credential stores, browser profiles, store-backend records or local production outputs.

## Manual acceptance

- Load the actual packaged extension in a fresh Chrome or Edge profile.
- Check click-only analysis, reload cache reuse, forced reanalysis, outside click/Escape and all three X appearances.
- Check contextual follow-ups, three suggestions, reply tone/direction/length, editing and copying; no automatic publishing.
- Test the provider/account modes actually claimed by the release. Provider eligibility and generated-answer quality cannot be proven by mocks.
- Check credential removal, cache/history controls, interrupted requests and diagnostics redaction.

## Publication

- Obtain maintainer approval before the first public source upload, as requested.
- Push the reviewed source to `devilflasher/Nobiggie-SideLens` and verify its public default branch and MIT detection.
- A tag creates a draft preview only. Publish a GitHub release separately when authorized; keep its notes, source, installation ZIP and checksums consistent.
- Record Chrome status separately as submitted, approved or publicly published. Do not call pending review “available in the store”.
- Verify the actual public store URL before adding an install link or releasing the launch announcement/video.

Historical SuperX checklists are preserved in the inherited Git history. Their passing checks are not SideLens acceptance evidence.
