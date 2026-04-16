# Release Notes

## Version 1.0.0

**Initial Release Candidate**

### Features Added
- **Complete Application Structure**: Built using a modern C# Webview2 bridge architecture, allowing for lightweight core logic with advanced web rendering.
- **Inject Engine**: Added `Injector.cs`, providing stable Win32 injection using `OpenProcess`, `VirtualAllocEx`, `WriteProcessMemory`, and `CreateRemoteThread`.
- **Process Browser**: UI now automatically polls and caches all running processes alongside window titles and fetches embedded application icons for immediate user recognition.
- **Custom UI System**: 
  - Implementation of a borderless draggable window with custom control buttons (minimize/close).
  - Designed an eye-catching amber/gold accent theme with a dark/glassmorphic backdrop.
  - Injector logging system successfully integrated into the UI.
  - Active search indexing function attached to the process browser.
- **Rounded Edges & Icons**: Added seamless rounded window edges on Windows 11 and embedded a custom gradient app icon across the GUI and taskbar.

### Fixes
- Addressed issue where C# returned unparsed JSON strings to the WebView2 UI module, preventing logic parsing. App communication is now stable and dual-channeled. 
- Automatically fallback to a default SVG icon when process icons cannot be dynamically requested (e.g., system-protected instances).
