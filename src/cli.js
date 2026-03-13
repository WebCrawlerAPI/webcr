import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_BASE_URL = "https://api.webcrawlerapi.com";
const SERVICE_NAME = "webcrawlerapi.com";
const ACCOUNT_NAME = "webcr";
const ENV_API_KEY = "WEBCRAWLER_API_KEY";

export async function runCli(argv) {
  try {
    const args = parseArgs(argv);

    if (args.help || argv.length === 0) {
      printHelp();
      return;
    }

    if (args.command === "auth") {
      await runAuthCommand(args.positionals, args.options);
      return;
    }

    const url = args.positionals[0];
    if (!url) {
      throw new CliError("A URL is required.");
    }

    const apiKey = await getApiKey();
    const baseUrl = args.options["base-url"] || DEFAULT_BASE_URL;

    if (args.options.limit != null) {
      const markdown = await crawlToMarkdown({
        apiKey,
        baseUrl,
        url,
        limit: args.options.limit,
        maxDepth: args.options["max-depth"],
        whitelistRegexp: args.options.whitelist_regexp,
        blacklistRegexp: args.options.blacklist_regexp,
        mainContentOnly: args.options["main-content-only"] === true
      });
      process.stdout.write(markdown);
      if (!markdown.endsWith("\n")) {
        process.stdout.write("\n");
      }
      return;
    }

    const markdown = await scrapeToMarkdown({
      apiKey,
      baseUrl,
      url,
      mainContentOnly: args.options["main-content-only"] === true
    });
    process.stdout.write(markdown);
    if (!markdown.endsWith("\n")) {
      process.stdout.write("\n");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

async function runAuthCommand(positionals, options) {
  const subcommand = positionals[0];

  if (!subcommand || subcommand === "help") {
    printAuthHelp();
    return;
  }

  if (subcommand === "set") {
    const apiKey = positionals[1];
    if (!apiKey) {
      printAuthHelp();
      return;
    }
    storeApiKey(apiKey);
    process.stderr.write(`Stored API key in ${describeCredentialBackend()}.\n`);
    return;
  }

  if (subcommand === "status") {
    const envKey = process.env[ENV_API_KEY];
    if (envKey) {
      process.stdout.write(`${ENV_API_KEY} is set in the environment.\n`);
      return;
    }

    const storedKey = getStoredApiKey();
    if (storedKey) {
      process.stdout.write(`Stored API key found in ${describeCredentialBackend()}.\n`);
      return;
    }

    process.stdout.write("No stored API key found.\n");
    process.exitCode = 1;
    return;
  }

  if (subcommand === "clear") {
    clearStoredApiKey();
    process.stderr.write(`Removed stored API key from ${describeCredentialBackend()}.\n`);
    return;
  }

  throw new CliError(`Unknown auth command: ${subcommand}`);
}

async function scrapeToMarkdown({ apiKey, baseUrl, url, mainContentOnly }) {
  const response = await fetchJson(`${baseUrl}/v2/scrape`, {
    method: "POST",
    headers: makeHeaders(apiKey),
    body: JSON.stringify({
      url,
      output_format: "markdown",
      main_content_only: mainContentOnly
    })
  });

  if (response.success === false) {
    throw new CliError(formatApiError(response));
  }

  if (typeof response.markdown !== "string" || response.markdown.length === 0) {
    throw new CliError("Scrape succeeded but no markdown was returned.");
  }

  return response.markdown;
}

async function crawlToMarkdown({
  apiKey,
  baseUrl,
  url,
  limit,
  maxDepth,
  whitelistRegexp,
  blacklistRegexp,
  mainContentOnly
}) {
  const created = await fetchJson(`${baseUrl}/v1/crawl`, {
    method: "POST",
    headers: makeHeaders(apiKey),
    body: JSON.stringify({
      url,
      items_limit: limit,
      scrape_type: "markdown",
      max_depth: maxDepth,
      whitelist_regexp: whitelistRegexp,
      blacklist_regexp: blacklistRegexp,
      main_content_only: mainContentOnly
    })
  });

  if (!created || typeof created.id !== "string" || created.id.length === 0) {
    throw new CliError("Crawl request did not return a job id.");
  }

  const job = await waitForJob(baseUrl, apiKey, created.id);
  if (job.status !== "done") {
    throw new CliError(`Crawl finished with status ${job.status}.`);
  }

  const response = await fetch(`${baseUrl}/v1/job/${created.id}/markdown/content`, {
    method: "GET",
    headers: makeHeaders(apiKey)
  });

  if (!response.ok) {
    throw await createHttpError(response);
  }

  return response.text();
}

async function waitForJob(baseUrl, apiKey, jobId) {
  let delayMs = 1500;

  for (let attempt = 0; attempt < 120; attempt += 1) {
    await sleep(delayMs);
    const job = await fetchJson(`${baseUrl}/v1/job/${jobId}`, {
      method: "GET",
      headers: makeHeaders(apiKey)
    });

    if (job.status !== "new" && job.status !== "in_progress") {
      return job;
    }

    if (typeof job.recommended_pull_delay_ms === "number" && job.recommended_pull_delay_ms > 0) {
      delayMs = job.recommended_pull_delay_ms;
    }
  }

  throw new CliError(`Timed out waiting for crawl job ${jobId}.`);
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw await createHttpError(response);
  }

  return response.json();
}

async function createHttpError(response) {
  const text = await response.text();

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.error_message === "string") {
        return new CliError(`${response.status} ${response.statusText}: ${parsed.error_message}`);
      }
      if (typeof parsed.message === "string") {
        return new CliError(`${response.status} ${response.statusText}: ${parsed.message}`);
      }
      if (typeof parsed.error === "string") {
        return new CliError(`${response.status} ${response.statusText}: ${parsed.error}`);
      }
    }
  } catch {
    // Fall through to plain text error.
  }

  const suffix = text ? `: ${text}` : "";
  return new CliError(`${response.status} ${response.statusText}${suffix}`);
}

function makeHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "webcr-cli/0.1.0"
  };
}

async function getApiKey() {
  const envKey = process.env[ENV_API_KEY];
  if (envKey) {
    return envKey;
  }

  const storedKey = getStoredApiKey();
  if (storedKey) {
    return storedKey;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new CliError(
      `Missing API key. Set ${ENV_API_KEY} or run: webcr auth set <api_key>`
    );
  }

  const apiKey = await promptForApiKey();
  storeApiKey(apiKey);
  process.stderr.write(`Stored API key in ${describeCredentialBackend()}.\n`);
  return apiKey;
}

function getStoredApiKey() {
  const system = platform();

  if (system === "darwin") {
    const result = spawnSync("security", [
      "find-generic-password",
      "-s",
      SERVICE_NAME,
      "-a",
      ACCOUNT_NAME,
      "-w"
    ], { encoding: "utf8" });

    if (result.status === 0) {
      return result.stdout.trim();
    }
  }

  if (system === "linux") {
    const secretTool = spawnSync("secret-tool", [
      "lookup",
      "service",
      SERVICE_NAME,
      "account",
      ACCOUNT_NAME
    ], { encoding: "utf8" });

    if (secretTool.status === 0) {
      return secretTool.stdout.trim();
    }
  }

  const file = getFallbackConfigFile();
  if (!existsSync(file)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return typeof parsed.apiKey === "string" && parsed.apiKey.length > 0 ? parsed.apiKey : null;
  } catch {
    return null;
  }
}

function storeApiKey(apiKey) {
  const system = platform();

  if (system === "darwin") {
    const result = spawnSync("security", [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE_NAME,
      "-a",
      ACCOUNT_NAME,
      "-w",
      apiKey
    ], { encoding: "utf8" });

    if (result.status === 0) {
      return;
    }
  }

  if (system === "linux") {
    const result = spawnSync(
      "sh",
      [
        "-lc",
        `printf '%s' "$WEBCR_INPUT_KEY" | secret-tool store --label="WebCrawlerAPI CLI" service "${SERVICE_NAME}" account "${ACCOUNT_NAME}"`
      ],
      {
        encoding: "utf8",
        env: { ...process.env, WEBCR_INPUT_KEY: apiKey }
      }
    );

    if (result.status === 0) {
      return;
    }
  }

  const file = getFallbackConfigFile();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ apiKey }, null, 2));
  chmodSync(file, 0o600);
}

function clearStoredApiKey() {
  const system = platform();

  if (system === "darwin") {
    spawnSync("security", [
      "delete-generic-password",
      "-s",
      SERVICE_NAME,
      "-a",
      ACCOUNT_NAME
    ], { encoding: "utf8" });
  }

  if (system === "linux") {
    spawnSync("secret-tool", [
      "clear",
      "service",
      SERVICE_NAME,
      "account",
      ACCOUNT_NAME
    ], { encoding: "utf8" });
  }

  const file = getFallbackConfigFile();
  if (existsSync(file)) {
    rmSync(file);
  }
}

function describeCredentialBackend() {
  const system = platform();

  if (system === "darwin") {
    return "macOS Keychain";
  }

  if (system === "linux") {
    const lookup = spawnSync("secret-tool", ["--help"], { encoding: "utf8" });
    if (lookup.status === 0) {
      return "Linux Secret Service";
    }
    return `plain file fallback (${getFallbackConfigFile()})`;
  }

  return `plain file fallback (${getFallbackConfigFile()})`;
}

function getFallbackConfigFile() {
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "webcr", "config.json");
}

function parseArgs(argv) {
  const positionals = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (!arg.startsWith("-")) {
      positionals.push(arg);
      continue;
    }

    if (arg === "-l" || arg === "--limit") {
      options.limit = parseInteger(argv[++index], arg);
      continue;
    }

    if (arg === "-d" || arg === "--depth" || arg === "--max-depth") {
      options["max-depth"] = parseInteger(argv[++index], arg);
      continue;
    }

    if (arg === "-w" || arg === "--whitelist_regexp") {
      options.whitelist_regexp = requireValue(argv[++index], arg);
      continue;
    }

    if (arg === "-b" || arg === "--blacklist_regexp") {
      options.blacklist_regexp = requireValue(argv[++index], arg);
      continue;
    }

    if (arg === "-m" || arg === "--main-content-only") {
      options["main-content-only"] = true;
      continue;
    }

    if (arg === "-u" || arg === "--base-url") {
      options["base-url"] = requireValue(argv[++index], arg);
      continue;
    }

    throw new CliError(`Unknown flag: ${arg}`);
  }

  return {
    command: positionals[0] === "auth" ? "auth" : "run",
    help: options.help === true,
    positionals: positionals[0] === "auth" ? positionals.slice(1) : positionals,
    options
  };
}

function parseInteger(value, flagName) {
  const raw = requireValue(value, flagName);
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError(`${flagName} expects a non-negative integer.`);
  }

  return parsed;
}

function requireValue(value, flagName) {
  if (value == null || value.startsWith("-")) {
    throw new CliError(`${flagName} requires a value.`);
  }
  return value;
}

function formatApiError(payload) {
  if (typeof payload.error_message === "string" && typeof payload.error_code === "string") {
    return `${payload.error_code}: ${payload.error_message}`;
  }

  return "API request failed.";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function printHelp() {
  process.stdout.write(`webcr <url> [options]

Default mode calls POST /v2/scrape and prints markdown.
If --limit/-l is present, webcr calls POST /v1/crawl, waits for completion,
then downloads combined markdown from GET /v1/job/:id/markdown/content.
If no API key is configured, webcr will prompt you once and store it securely.

Options:
  -l, --limit <n>                Crawl with items_limit=<n>
  -d, --depth <n>                Alias for --max-depth
  --max-depth <n>                Crawl max_depth
  -w, --whitelist_regexp <pat>   Crawl whitelist_regexp
  -b, --blacklist_regexp <pat>   Crawl blacklist_regexp
  -m, --main-content-only        Set main_content_only=true
  -u, --base-url <url>           Override API base URL
  -h, --help                     Show help

Auth:
  webcr auth set <api_key>
  webcr auth status
  webcr auth clear

Examples:
  webcr https://example.com
  webcr https://example.com -m
  webcr https://docs.example.com -l 20 -d 2 -w '/docs'
`);
}

function printAuthHelp() {
  process.stdout.write(`webcr auth <command>

Commands:
  set <api_key>   Store API key
  status          Show whether an API key is configured
  clear           Remove stored API key
`);
}

class CliError extends Error {}

async function promptForApiKey() {
  const rl = createInterface({ input, output });

  try {
    process.stderr.write(
      "WebCrawlerAPI API key required.\n" +
      "Get your key from https://dash.webcrawlerapi.com/access\n"
    );
    const apiKey = (await rl.question("Paste your API key: ")).trim();

    if (!apiKey) {
      throw new CliError("No API key provided.");
    }

    return apiKey;
  } finally {
    rl.close();
  }
}
