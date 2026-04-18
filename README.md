# SimpleInject

A modern, feature-rich DLL injector and script executor built with C# (.NET 8 WinForms) and a WebView2 UI layer.

## Features

### 🎨 Theme System
Six curated color palettes that persist across sessions:
- **Amber** — Warm gold accent (default)
- **Catppuccin Mocha** — Purple pastel on dark
- **Catppuccin Latte** — Purple on light background
- **Nord** — Arctic, blue-toned palette
- **Dracula** — Purple and pink on charcoal
- **Rosé Pine** — Soft pink and gold

### 💉 DLL Injection
- Live process list with search, icons, and favorites
- Classic `LoadLibraryA` + `CreateRemoteThread` injection
- Recent DLLs list (last 5 remembered)
- Real-time injection logging

### 📜 Script Executor
- Lua script editor with line numbers and tab support
- Built-in script library with test scripts
- Auto-detection of game instances
- Execution output log

### ⚙️ Settings
- Theme picker with live preview
- Auto-refresh process list toggle
- Show/hide window titles
- Remember last DLL option
- Keyboard shortcuts: `Ctrl+R` (refresh), `Ctrl+,` (settings), `Esc` (close modals)

### ⚡ Performance
- Async process loading on background thread
- Icon caching by executable path (instant refresh after first load)
- Cached WebView2 environment for faster startup

## Setup
1. .NET 8 SDK required
2. Build: `dotnet build`
3. **Run as Administrator** (required for process memory access)

## Technologies
- C# / .NET 8 (WinForms)
- Microsoft.Web.WebView2
- HTML / CSS / Vanilla JS

## Disclaimer
This project is intended for educational purposes and debugging your own applications. Use responsibly.
