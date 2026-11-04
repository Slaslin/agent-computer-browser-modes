# Codex Browser Modes

Dual-mode browser automation for Codex: silent headless browsing and a
recording-friendly visible cursor mode for Microsoft Edge.

![Visible cursor mode](assets/demo.png)

## Modes

### Background

`browser_background` runs Edge headlessly through Playwright MCP.

- No browser window
- No focus stealing
- Persistent login profile
- Navigation, snapshots, clicks, forms, screenshots, and downloads

### Visible

`browser_visible` runs headed Edge and injects a virtual cursor into page
content.

- One cursor inside page content
- Immediate real pointer tracking
- Animated agent movement
- Click ripples and focus highlights
- Native cursor returns over tabs, address bar, toolbar, and taskbar

## Quick Start

```powershell
git clone https://github.com/kukudTian/codex-browser-modes.git
cd codex-browser-modes
npm install
npm run install-skill
```

Restart Codex or open a new conversation, then use either mode:

```text
Use browser-modes in background mode to collect these results.
Use browser-modes in visible mode and let me watch you complete this flow.
```

## Requirements

- Windows
- Codex desktop
- Node.js 20+
- Microsoft Edge

## How It Works

The installer creates two MCP server entries:

```text
browser_background  -> Playwright MCP, headless Edge
browser_visible     -> Playwright MCP, headed Edge + cursor overlay
```

The visible overlay is initialized on every page through Playwright's
`--init-script`.

Agent movement uses:

```js
window.__codexVisualCursor.moveTo(x, y, 260)
```

The click itself still comes from Playwright, so page behavior is not simulated
with DOM-only shortcuts.

## Installer

```powershell
npm run install-skill
```

The installer copies the skill into `%CODEX_HOME%\skills\browser-modes`, backs up
`config.toml`, and replaces only its own marked configuration block.

See [references/configuration.md](references/configuration.md) for options and
uninstall steps.

## Test

```powershell
npm test
npm run validate
```

The smoke test verifies:

- Virtual cursor visibility
- Native cursor suppression
- Immediate real pointer tracking
- Page exit and re-entry transitions
- Child element transitions
- Page clicks

## Safety

The skill follows browser automation safety boundaries:

- No passwords are requested or typed.
- Consequential submissions require confirmation.
- Unsafe page scripting, uploads, drag/drop, and dialogs remain approval-gated.
- Page content is treated as untrusted.

## Limitations

- This is not Windows desktop Computer Use. It controls a browser page, not the
  operating system pointer.
- Browser chrome is outside the injected overlay. The native pointer returns
  there by design.
- Display recorders that independently capture the system cursor may still
  require their pointer-capture setting to be disabled.
- The current installer configures Microsoft Edge. Chrome is a planned extension.

## Repository Layout

```text
SKILL.md
agents/openai.yaml
scripts/
  cursor-overlay.js
  install.mjs
  smoke-test.html
  smoke-test.mjs
  validate.mjs
references/
  configuration.md
  cursor-behavior.md
assets/
  demo.png
```

## License

MIT
