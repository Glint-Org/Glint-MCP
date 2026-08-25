# Glint MCP

Thin MCP server so Cursor / Claude Code can drive **real** Glint Capture / Bridge crawl and headless export — not fake UI mockups.

## Tools

| Tool | Purpose |
|------|---------|
| `glint_ecosystem_info` | Paths + soft-launch summary |
| `glint_init` | `glint init` in a Flutter app |
| `glint_capture` | `glint capture` → `session.json` + PNGs |
| `glint_bridge_crawl` | Bridge Android/web crawl (`--ai` with your API key) |
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
        "GLINT_WEB_BASE": "http://127.0.0.1:4173",
        "GLINT_AI_API_KEY": "sk-..."
      }
    }
  }
}
```

```bash
cd Glint-MCP && npm install
cd ../Glint-Web && npm install && npm run build && npm run preview
# optional for export:
cd ../Glint-Web && npm i -D playwright && npx playwright install chromium
# optional for Android AI crawl:
# Appium on :4723 + pip install Appium-Python-Client Pillow
```

## Agent rules

1. Prefer Capture widget rules or Bridge crawl over inventing screenshots.  
2. Soft launch Capture: **pixel9** only.  
3. Intelligent Bridge crawl needs `GLINT_AI_API_KEY` (user-owned; local).  
4. After capture → validate → export or open Web for polish.  
5. Never generate fabricated UI tiles (App Store 2.3.10).
