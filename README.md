# SimpleInject

A modern, highly-polished DLL injector built with C# (.NET 8 WinForms) and a WebView2 UI layer.

## Features
- **Premium Dark UI**: Glassmorphism cards, glowing amber accents, smooth animations, and custom scrollbars.
- **Process List**: Live-filtering with search and actual process executable icons.
- **Classic Injection**: Tested LoadLibraryA + CreateRemoteThread Win32 methodology.
- **Responsive & Borderless**: Edge-resizable and draggable borderless window with rounded corners.

## Setup
1. Standard `.NET 8` SDK is required.
2. Build the project using your preferred IDE or run:
   ```bash
   dotnet build
   ```
3. **Run as Administrator**: Since this tool interacts with memory of other processes, it must be launched with elevated privileges.
   Run the output via: `\bin\Debug\net8.0-windows\SimpleInject.exe`

## Technologies Used
- C# / .NET 8 (WinForms)
- Microsoft.Web.WebView2
- HTML / CSS / Vanilla JS

## Disclaimer
This project is intended for educational purposes and debugging. Use responsibly.
