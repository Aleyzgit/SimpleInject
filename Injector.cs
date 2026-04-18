using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Concurrent;

namespace SimpleInject;

public static class Injector
{
    // --- Win32 Constants ---
    const uint PROCESS_ALL_ACCESS = 0x001FFFFF;
    const uint MEM_COMMIT = 0x1000;
    const uint MEM_RESERVE = 0x2000;
    const uint MEM_RELEASE = 0x8000;
    const uint PAGE_READWRITE = 0x04;

    // --- Win32 Imports ---
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint dwFreeType);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out int lpNumberOfBytesWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateRemoteThread(IntPtr hProcess, IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, out uint lpThreadId);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
    static extern IntPtr GetModuleHandleA(string lpModuleName);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Ansi)]
    static extern IntPtr GetProcAddress(IntPtr hModule, string lpProcName);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    // --- Icon Cache ---
    private static readonly ConcurrentDictionary<string, string> _iconCache = new();

    /// <summary>
    /// Inject a DLL into a target process using the classic LoadLibrary technique.
    /// </summary>
    public static (bool Success, string Message) Inject(int processId, string dllPath)
    {
        if (!File.Exists(dllPath))
            return (false, $"DLL not found: {dllPath}");

        dllPath = Path.GetFullPath(dllPath);

        Process? targetProcess;
        try
        {
            targetProcess = Process.GetProcessById(processId);
        }
        catch
        {
            return (false, $"Process with ID {processId} not found.");
        }

        IntPtr hProcess = IntPtr.Zero;
        IntPtr allocAddr = IntPtr.Zero;

        try
        {
            hProcess = OpenProcess(PROCESS_ALL_ACCESS, false, processId);
            if (hProcess == IntPtr.Zero)
                return (false, $"Failed to open process. Error: {Marshal.GetLastWin32Error()}. Run as administrator.");

            IntPtr kernel32 = GetModuleHandleA("kernel32.dll");
            if (kernel32 == IntPtr.Zero)
                return (false, "Failed to get kernel32.dll handle.");

            IntPtr loadLibraryAddr = GetProcAddress(kernel32, "LoadLibraryA");
            if (loadLibraryAddr == IntPtr.Zero)
                return (false, "Failed to get LoadLibraryA address.");

            byte[] dllBytes = Encoding.ASCII.GetBytes(dllPath + '\0');
            uint size = (uint)dllBytes.Length;

            allocAddr = VirtualAllocEx(hProcess, IntPtr.Zero, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
            if (allocAddr == IntPtr.Zero)
                return (false, $"Failed to allocate memory. Error: {Marshal.GetLastWin32Error()}");

            if (!WriteProcessMemory(hProcess, allocAddr, dllBytes, size, out _))
                return (false, $"Failed to write memory. Error: {Marshal.GetLastWin32Error()}");

            IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, loadLibraryAddr, allocAddr, 0, out _);
            if (hThread == IntPtr.Zero)
                return (false, $"Failed to create remote thread. Error: {Marshal.GetLastWin32Error()}");

            WaitForSingleObject(hThread, 5000);
            CloseHandle(hThread);

            return (true, $"Successfully injected into {targetProcess.ProcessName} (PID: {processId})");
        }
        catch (Exception ex)
        {
            return (false, $"Injection failed: {ex.Message}");
        }
        finally
        {
            if (allocAddr != IntPtr.Zero && hProcess != IntPtr.Zero)
                VirtualFreeEx(hProcess, allocAddr, 0, MEM_RELEASE);
            if (hProcess != IntPtr.Zero)
                CloseHandle(hProcess);
        }
    }

    /// <summary>
    /// Get process list asynchronously with cached icons.
    /// </summary>
    public static Task<List<ProcessInfo>> GetProcessListAsync()
    {
        return Task.Run(() =>
        {
            var list = new List<ProcessInfo>();
            foreach (var proc in Process.GetProcesses())
            {
                try
                {
                    string iconBase64 = GetProcessIconCached(proc);
                    list.Add(new ProcessInfo(proc.Id, proc.ProcessName, proc.MainWindowTitle ?? "", iconBase64));
                }
                catch
                {
                    // Skip inaccessible processes
                }
            }
            return list.OrderBy(p => p.Name.ToLowerInvariant()).ToList();
        });
    }

    /// <summary>
    /// Extract icon with caching by exe path.
    /// </summary>
    private static string GetProcessIconCached(Process proc)
    {
        try
        {
            string? filePath = proc.MainModule?.FileName;
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
                return "";

            // Check cache first
            if (_iconCache.TryGetValue(filePath, out var cached))
                return cached;

            using var icon = System.Drawing.Icon.ExtractAssociatedIcon(filePath);
            if (icon == null)
            {
                _iconCache[filePath] = "";
                return "";
            }

            using var smallIcon = new System.Drawing.Icon(icon, 16, 16);
            using var bmp = smallIcon.ToBitmap();
            using var ms = new MemoryStream();
            bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            var result = "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());

            _iconCache[filePath] = result;
            return result;
        }
        catch
        {
            return "";
        }
    }
}
