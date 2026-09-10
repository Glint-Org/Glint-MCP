# Glint MCP

Thin MCP server so Cursor / Copilot / Claude Code can drive **real** Glint Capture / Bridge and headless export — not fake UI mockups.

The **agent is the intelligence**. Developers should not paste LLM API keys into Capture.

## Tools

| Tool | Purpose |
|------|---------|
| `glint_ecosystem_info` | Paths + soft-launch summary |
| `glint_init` | `glint init` in a Flutter app |
| `glint_discover` | Scan `lib/` for screens + write rules (no keys) |
| `glint_capture` | `glint capture` (+ optional `auto`) → session + PNGs |
| `glint_bridge_crawl` | Bridge Android/web crawl (optional `--ai` vision) |
| `glint_validate_session` | Validate session folder |
| `glint_export` | Headless ZIP via Glint Web `/export` |

## Setup (Claude Code / Cursor)

```json
{
  "mcpServers": {
    "glint": {
      "command": "node",
      "args": ["/ABS/PATH/Glint-Org/Glint-MCP/src/index.js"],
      "env": {
        "GLINT_WEB_BASE": "http://127.0.0.1:4173"
      }
    }
  }
}
```

```bash
cd Glint-MCP && npm install
cd ../Glint-Web && npm install && npm run build && npm run preview
```

## Agent rules

1. Prefer Capture discover/rules or Bridge crawl over inventing screenshots.  
2. Soft launch Capture: **pixel9** only.  
3. Do **not** ask users for Capture API keys — use discover/auto + your own reasoning.  
4. After capture → validate → Web polish / `glint_export`.
5. Never generate fabricated UI tiles (App Store 2.3.10).
6. **Edit via `glint_render`:** headlines, colors, device `frame` (omit `scale` when swapping frames to keep display size). Live Fabric drag/resize is still the human editor until a canvas agent API exists.

---

<div align="center">

<a href="https://github.com/darkmintis">
  <img src="https://img.shields.io/badge/follow-%40Darkmintis-1DA1F2?style=social&logo=github" alt="Follow @Darkmintis"/>
</a>

</div>
