using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

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

    /// <summary>
    /// Inject a DLL into a target process using the classic LoadLibrary technique.
    /// </summary>
    public static (bool Success, string Message) Inject(int processId, string dllPath)
    {
        // Validate DLL path
        if (!File.Exists(dllPath))
            return (false, $"DLL not found: {dllPath}");

        // Get full path
        dllPath = Path.GetFullPath(dllPath);

        // Check that target process exists
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
            // Open the target process
            hProcess = OpenProcess(PROCESS_ALL_ACCESS, false, processId);
            if (hProcess == IntPtr.Zero)
                return (false, $"Failed to open process. Error: {Marshal.GetLastWin32Error()}. Run as administrator.");

            // Get the address of LoadLibraryA in kernel32.dll
            IntPtr kernel32 = GetModuleHandleA("kernel32.dll");
            if (kernel32 == IntPtr.Zero)
                return (false, "Failed to get kernel32.dll handle.");

            IntPtr loadLibraryAddr = GetProcAddress(kernel32, "LoadLibraryA");
            if (loadLibraryAddr == IntPtr.Zero)
                return (false, "Failed to get LoadLibraryA address.");

            // Allocate memory in the target process for the DLL path
            byte[] dllBytes = Encoding.ASCII.GetBytes(dllPath + '\0');
            uint size = (uint)dllBytes.Length;

            allocAddr = VirtualAllocEx(hProcess, IntPtr.Zero, size, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
            if (allocAddr == IntPtr.Zero)
                return (false, $"Failed to allocate memory in target process. Error: {Marshal.GetLastWin32Error()}");

            // Write the DLL path into the allocated memory
            if (!WriteProcessMemory(hProcess, allocAddr, dllBytes, size, out _))
                return (false, $"Failed to write to process memory. Error: {Marshal.GetLastWin32Error()}");

            // Create a remote thread that calls LoadLibraryA with our DLL path
            IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, loadLibraryAddr, allocAddr, 0, out _);
            if (hThread == IntPtr.Zero)
                return (false, $"Failed to create remote thread. Error: {Marshal.GetLastWin32Error()}");

            // Wait for the thread to finish (5 second timeout)
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
            // Clean up allocated memory
            if (allocAddr != IntPtr.Zero && hProcess != IntPtr.Zero)
                VirtualFreeEx(hProcess, allocAddr, 0, MEM_RELEASE);

            if (hProcess != IntPtr.Zero)
                CloseHandle(hProcess);
        }
    }

    /// <summary>
    /// Get a list of running processes with optional window title and icon.
    /// </summary>
    public static List<ProcessInfo> GetProcessList()
    {
        var list = new List<ProcessInfo>();
        foreach (var proc in Process.GetProcesses())
        {
            try
            {
                string iconBase64 = GetProcessIconBase64(proc);
                list.Add(new ProcessInfo(proc.Id, proc.ProcessName, proc.MainWindowTitle ?? "", iconBase64));
            }
            catch
            {
                // Skip processes we can't access
            }
        }
        return list.OrderBy(p => p.Name.ToLowerInvariant()).ToList();
    }

    /// <summary>
    /// Extract the small icon from a process's main module and return as a base64 data URI.
    /// Returns empty string if icon cannot be extracted.
    /// </summary>
    private static string GetProcessIconBase64(Process proc)
    {
        try
        {
            string? filePath = proc.MainModule?.FileName;
            if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
                return "";

            using var icon = System.Drawing.Icon.ExtractAssociatedIcon(filePath);
            if (icon == null) return "";

            // Use small 16x16 icon for performance
            using var smallIcon = new System.Drawing.Icon(icon, 16, 16);
            using var bmp = smallIcon.ToBitmap();
            using var ms = new MemoryStream();
            bmp.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(ms.ToArray());
        }
        catch
        {
            return "";
        }
    }
}
