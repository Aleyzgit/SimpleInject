# Release Notes

## Version 2.0.0

**Major Feature Release**

### New Features
- **Theme System**: 6 curated color palettes — Amber, Catppuccin Mocha, Catppuccin Latte, Nord, Dracula, and Rosé Pine. Themes persist across sessions via localStorage.
- **Settings Panel**: New modal (gear icon or `Ctrl+,`) with theme picker, behavior toggles (auto-refresh, show titles, remember DLL), and about section.
- **Tab System**: Two-tab layout — DLL Injector and Script Executor.
- **Script Executor**: Full Lua script editor with line numbers, tab key support, built-in script library (5 test scripts), auto game-instance detection, and execution output log.
- **Favorites**: Star processes to pin them to the top of the list. Persisted across sessions.
- **Recent DLLs**: Last 5 used DLLs shown as quick-select chips below the browse button.
- **Keyboard Shortcuts**: `Ctrl+R` refresh, `Ctrl+,` settings, `Esc` close modals.

### Performance
- Process list now loads asynchronously on a background thread.
- Icon extraction uses a `ConcurrentDictionary` cache — first load extracts icons, subsequent refreshes are near-instant.
- WebView2 environment cached to a temp folder for faster cold starts.
- Build time reduced to under 1 second.

### UI Improvements
- All colors use CSS custom properties with `--accent-rgb` for universal theming.
- Scrollbar colors now match the active theme accent.
- Cards, buttons, and inputs all transition smoothly on theme change.
- Version badge styled with accent color.
- Cleaner, more compact layout with smaller paddings.

### Fixes
- Removed broken liquid glass CSS that caused visual issues.
- Simplified message passing (removed redundant ExecuteScriptAsync calls).
- Proper window drag via Win32 `SendMessage` + `ReleaseCapture`.

---

## Version 1.0.0

**Initial Release**

- DLL injection via LoadLibraryA + CreateRemoteThread
- Process browser with icons and search
- Custom borderless window with rounded corners
- Amber/gold dark theme
- Real-time injection logging
