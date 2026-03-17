# Homebrew Release Automation

This directory is prepared for automated Homebrew formula updates from GitHub Actions in the same `webCrawlerAPI/webcr` repository.

## Included files

- `package.json`: package metadata used for description, homepage, repository, version, and license
- `LICENSE`: required for the formula license field and distribution
- `Formula/webcr.rb`: formula template with version and SHA placeholders
- `scripts/update-homebrew-formula.sh`: fills in the release tag and SHA256
- `.github/workflows/homebrew-tap-update.yml`: computes the source tarball SHA256 and commits the updated formula back to `master`

## Recommended distribution model

Use the same repository for source and formula:

- `webCrawlerAPI/webcr`

## Release flow

1. Create a dedicated GitHub repo for the CLI if you have not already.
   Recommended: `webCrawlerAPI/webcr`
2. Copy the contents of `tools/webcr/` into that repo.
3. Push a tag like `v0.1.0`.
4. The workflow will:
   - download the GitHub source tarball for that tag
   - compute the correct SHA256
   - update `Formula/webcr.rb` on `master`
   - commit the formula back to the same repository

You do not need to manually edit the formula SHA256.

## Install command for users

```bash
brew tap webCrawlerAPI/webcr
brew install webcr
```

## Notes

- The formula depends on `node` because `webcr` is a Node.js CLI.
- The CLI itself is cross-platform. No separate Homebrew formula is needed for macOS and Linux.
- The workflow uses the GitHub source tarball for the pushed tag, so Homebrew stays aligned with the tagged source automatically.
- The workflow uses the default GitHub Actions `GITHUB_TOKEN` because it writes back to the same repository.
- On macOS it stores credentials in Keychain.
- On Linux it uses Secret Service via `secret-tool` when available, otherwise falls back to `~/.config/webcr/config.json`.
