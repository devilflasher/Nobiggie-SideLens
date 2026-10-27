# SideLens release channels

Current source version: **0.1.6**. As of 2026-10-27, the maintainer reports that the Chrome Web Store submission is under review. Source publication, a GitHub release and store approval are separate steps.

## Distribution

| Channel | Installation | Status |
| --- | --- | --- |
| GitHub source | Download the repository and load its `extension/` directory unpacked | Public only after maintainer approval of the prepared repository |
| GitHub Releases | Extract an attached `SideLens.zip` and load it unpacked | No SideLens GitHub release has been published by this preparation |
| Chrome Web Store | Store-managed installation and updates | Review pending; do not substitute the upstream SuperX store listing |

Project home: https://github.com/devilflasher/Nobiggie-SideLens

Website: https://nobiggie.xyz/sidelens

Privacy: https://nobiggie.xyz/sidelens/privacy

## Packages and versions

`node tools/package-release.mjs` validates the package/source version and writes installation/source ZIPs, inventories and SHA-256 checksums to `artifacts/`. The installation ZIP has `manifest.json` at its root. `SideLens.zip` is an identical-byte alias of its versioned installation ZIP.

GitHub's automatic source ZIP is different: choose the extracted `extension/` directory when loading that source.

Keep `package.json` and `extension/manifest.json` aligned. A tag such as `v0.1.6` triggers the release workflow, which prepares a **draft preview**; it does not approve a release or submit anything to Chrome. Push only the new SideLens tag intended for release, not all inherited SuperX tags. Never rewrite an already published tag or replace a distributed package under the same version.

## Upstream history

SideLens derives from [SuperX](https://github.com/bwjoke/SuperX). Its original release/acceptance history remains available in Git history at the upstream baseline commit. Upstream store versions, release assets and live tests do not describe this derivative.
