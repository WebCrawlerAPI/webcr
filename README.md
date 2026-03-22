# webcr

![webcr demo](./webcr-demo.gif)

CLI tool for AI agents to get website content in Markdown. 

The default `webcr <url>` flow makes a single scrape request and prints markdown to stdout. For multi-page crawling, pass `--limit` and the CLI will wait for the crawl job to complete, then download the combined markdown output.

```
Options:
  -l, --limit <n>                Crawl with items_limit=<n>
  -d, --depth <n>                Alias for --max-depth
  --max-depth <n>                Crawl max_depth
  -w, --whitelist_regexp <pat>   Crawl whitelist_regexp
  -b, --blacklist_regexp <pat>   Crawl blacklist_regexp
  -m, --main-content-only        Set main_content_only=true
  -o, --output <path>            Save each crawled page as <url>.md in this directory (requires --limit)
  -os, --output-single <file>    Save combined crawl markdown to a single file (requires --limit)
  -u, --base-url <url>           Override API base URL
  -h, --help                     Show help
```

- `webcr <url>` calls `POST /v2/scrape` with `output_format: "markdown"` and prints markdown to stdout.
- `webcr <url> --limit 10` calls `POST /v1/crawl`, waits for the job to finish, then downloads combined markdown from `GET /v1/job/:id/markdown/content`.
- `webcr <url> --limit 10 --output <path>` saves each crawled page as a separate `.md` file in the given directory, named after its URL.

## Install

### Homebrew

```bash
brew tap webcrawlerapi/webcrawlerapi
brew install webcr
```

### Direct install

```bash
curl -fsSL https://raw.githubusercontent.com/webCrawlerAPI/webcr/master/install.sh | sh
```

The Homebrew formula lives at [WebCrawlerAPI/homebrew-webcrawlerapi](https://github.com/WebCrawlerAPI/homebrew-webcrawlerapi).

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

## Examples

```bash
webcr https://example.com
webcr https://example.com -m
webcr https://docs.example.com -l 25 -d 2
webcr https://docs.example.com -l 25 -w '/docs' -b '/blog'
webcr https://docs.example.com -l 25 -o ./pages
webcr https://docs.example.com -l 25 -os ./docs.md
```

## Output to files (`--output`)

`-o/--output <path>` requires `--limit` and saves each successfully crawled page as an individual markdown file instead of printing combined output to stdout.

Files are named after the page URL: protocol and `www.` are stripped, path separators and special characters are replaced with `_`. For example, `https://docs.example.com/api/intro` becomes `docs.example.com_api_intro.md`.

A progress bar is shown on stderr during crawling and file saving.
