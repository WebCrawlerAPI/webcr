# webcr

![webcr demo](./webcr-demo.gif)

CLI tool for AI agents to get website content in Markdown. 

The default `webcr <url>` flow makes a single scrape request and prints markdown to stdout. For multi-page crawling, pass `--limit` and the CLI will wait for the crawl job to complete, then download the combined markdown output.

## Behavior

- `webcr <url>` calls `POST /v2/scrape` with `output_format: "markdown"` and prints markdown to stdout.
- `webcr <url> --limit 10` calls `POST /v1/crawl`, waits for the job to finish, then downloads combined markdown from `GET /v1/job/:id/markdown/content`.

## Install

### Homebrew

```bash
brew tap webCrawlerAPI/webcr
brew install webcr
```

### Direct install

```bash
curl -fsSL https://raw.githubusercontent.com/webCrawlerAPI/webcr/master/install.sh | sh
```

Homebrew packaging files are included in [Formula/webcr.rb](/Users/andrey/Projects/own/supcop/tools/webcr/Formula/webcr.rb). Release notes are in [HOMEBREW.md](/Users/andrey/Projects/own/supcop/tools/webcr/HOMEBREW.md).

The direct installer:

- downloads the CLI from the GitHub repo
- installs it into `~/.local/share/webcr/current`
- creates `~/.local/bin/webcr`
- updates the detected shell profile so `webcr` is available in new terminals

After installation, set your API key:

```bash
webcr auth set YOUR_API_KEY
```

Get your key from:

```text
https://dash.webcrawlerapi.com/access
```

## Auth

```bash
webcr auth set YOUR_API_KEY
webcr auth status
webcr auth clear
```

Credential lookup order:

1. `WEBCRAWLER_API_KEY`
2. Stored secret
3. Plain config fallback at `~/.config/webcr/config.json`

If no key is configured and you run `webcr <url>` interactively, the CLI will prompt you and tell you to get the key from `https://dash.webcrawlerapi.com/access`.

Storage backends:

- macOS: Keychain via `security`
- Linux: Secret Service via `secret-tool` when available
- Fallback: `0600` config file in XDG config dir

## Examples

```bash
webcr https://example.com
webcr https://example.com -m
webcr https://docs.example.com -l 25 -d 2
webcr https://docs.example.com -l 25 -w '/docs' -b '/blog'
```
