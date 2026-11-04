# Configuration

## Requirements

- Codex desktop on Windows
- Node.js 20 or newer
- Microsoft Edge
- `@playwright/mcp` 0.0.83 or a compatible local installation

The current implementation targets Edge. The MCP arguments can be changed to
`chrome` later without changing the cursor overlay.

## Install

From the repository root:

```powershell
npm install
npm run install-skill
```

The installer:

1. Copies this repository to `%CODEX_HOME%\skills\browser-modes`.
2. Backs up `%CODEX_HOME%\config.toml`.
3. Replaces its managed configuration block with:
   - `browser_background`
   - `browser_visible`
4. Creates persistent browser profile and output directories.

Restart the Codex desktop app or open a new conversation after installation.

## Verify

```powershell
codex mcp get browser_background
codex mcp get browser_visible
```

Both servers should report `enabled: true`.

## Installer Options

```text
--config <path>          Codex config file to update
--skill-dir <path>       Installation directory for the skill
--playwright-cli <path>  Explicit path to @playwright/mcp/cli.js
--dry-run                Print the generated managed block only
```

The default Playwright CLI search order is:

1. `node_modules/@playwright/mcp/cli.js` in this repository
2. `%CODEX_HOME%\mcp\playwright-mcp\node_modules\@playwright\mcp\cli.js`
3. The resolved package path for `@playwright/mcp/cli.js`

## Managed Config

The installer only replaces the block between:

```text
# >>> codex-browser-modes managed config
# <<< codex-browser-modes managed config
```

Other MCP servers and user configuration are left untouched.

## Uninstall

1. Remove the managed block from `%CODEX_HOME%\config.toml`.
2. Remove `%CODEX_HOME%\skills\browser-modes`.
3. Optionally remove:
   - `%CODEX_HOME%\browser-profiles\msedge-background`
   - `%CODEX_HOME%\browser-profiles\msedge-visible`
   - `%CODEX_HOME%\browser-output`

## Troubleshooting

- If a server is missing, start a new Codex conversation. MCP servers load when
  the conversation starts.
- If Edge reports that the profile is already in use, close the `msedge-visible`
  or `msedge-background` browser process before relaunching that mode.
- If the overlay does not appear, confirm that
  `%CODEX_HOME%\skills\browser-modes\scripts\cursor-overlay.js` exists and that
  `browser_visible` includes it through `--init-script`.
- If the real cursor still appears in a recording, disable the recorder's
  pointer capture or restrict the capture to the browser content area.
