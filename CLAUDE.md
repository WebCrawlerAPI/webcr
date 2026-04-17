# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`webcr` is a CLI tool that converts websites into LLM-ready markdown. It's a client for the WebCrawlerAPI service (Zeus backend). Two modes:
- **Single-page scrape**: `webcr <url>` → POST `/v2/scrape` → print markdown
- **Multi-page crawl**: `webcr <url> --limit N` → POST `/v1/crawl` → poll job → fetch combined markdown

## Commands

```bash
node --check webcr.js && node --check src/cli.js  # syntax check (npm run check)
npm pack                                            # pack for distribution
node webcr.js <url>                                 # run locally
```

No build step — pure ES modules, Node.js 20+ required.

## Architecture

All logic is in `src/cli.js` (~562 lines). `webcr.js` is a 5-line shebang wrapper.

**Code flow:**
1. `runCli(argv)` → `parseArgs()` → either `runAuthCommand()` or scrape/crawl path
2. `getApiKey()` with platform-aware fallback: env var → macOS Keychain / Linux secret-tool → `~/.config/webcr/config.json`
3. Single-page: direct API response printed to stdout
4. Multi-page: poll with adaptive delay (`recommended_pull_delay_ms` from response), 120 attempt max

**Crawl polling:** starts at 1.5s intervals, adapts based on API-returned `recommended_pull_delay_ms`. Times out after ~3 minutes.

**Error handling:** API responses may use `error_message`, `message`, or `error` fields — all handled.

**Arg parser:** custom (no deps), supports `-l/--limit`, `-d/--depth`, `-m/--main-content-only`, `-w/--whitelist_regexp`, `-b/--blacklist_regexp`, `-u/--base-url`.

## Release Process

Pushing a `v*` tag triggers `.github/workflows/homebrew-tap-update.yml`, which:
1. Computes SHA256 of source tarball
2. Runs `scripts/update-homebrew-formula.sh` to fill `__VERSION__` and `__SHA256__` placeholders in `Formula/webcr.rb`
3. Pushes updated formula to the `webcrawlerapi/homebrew-webcrawlerapi` tap repo via `TAP_TOKEN` secret
