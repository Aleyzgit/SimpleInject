using System.Text.Json;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SimpleInject;

public class MainForm : Form
{
    private WebView2 _webView = null!;

    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);

    public MainForm()
    {
        Text = "SimpleInject";
        Size = new Size(900, 620);
        MinimumSize = new Size(750, 500);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        BackColor = Color.FromArgb(13, 13, 17);

        // Try load icon
        try { Icon = new Icon("app.ico"); } catch { }

        InitializeWebView();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Enable rounded corners on Windows 11
        int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
        int DWMWCP_ROUND = 2;
        DwmSetWindowAttribute(Handle, DWMWA_WINDOW_CORNER_PREFERENCE, ref DWMWCP_ROUND, sizeof(int));
    }

    private async void InitializeWebView()
    {
        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(13, 13, 17)
        };
        Controls.Add(_webView);

        var env = await CoreWebView2Environment.CreateAsync(
            userDataFolder: Path.Combine(Path.GetTempPath(), "SimpleInject_WebView2"));
        await _webView.EnsureCoreWebView2Async(env);

        // Map the wwwroot folder to a virtual host
        string wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
        _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "simpleinject.local", wwwroot, CoreWebView2HostResourceAccessKind.Allow);

        // Disable context menu and dev tools in release
        _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        _webView.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = false;
        _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

        // Handle messages from JS
        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

        // Navigate to the UI
        _webView.CoreWebView2.Navigate("https://simpleinject.local/index.html");
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            string json = e.WebMessageAsJson;
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            string action = root.GetProperty("action").GetString() ?? "";

            switch (action)
            {
                case "getProcesses":
                    HandleGetProcesses();
                    break;

                case "browseDll":
                    HandleBrowseDll();
                    break;

                case "inject":
                    int pid = root.GetProperty("pid").GetInt32();
                    string dllPath = root.GetProperty("dllPath").GetString() ?? "";
                    HandleInject(pid, dllPath);
                    break;

                case "minimize":
                    BeginInvoke(() => WindowState = FormWindowState.Minimized);
                    break;

                case "close":
                    BeginInvoke(() => Close());
                    break;

                case "dragStart":
                    BeginInvoke(() =>
                    {
                        ReleaseCapture();
                        SendMessage(Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
                    });
                    break;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"WebMessage error: {ex.Message} | Raw: {e.WebMessageAsJson}");
            SendToJs("error", new { message = ex.Message });
        }
    }

    private void HandleGetProcesses()
    {
        var processes = Injector.GetProcessList();
        SendToJs("processList", new { processes });
    }

    private void HandleBrowseDll()
    {
        BeginInvoke(() =>
        {
            using var ofd = new OpenFileDialog
            {
                Title = "Select DLL to inject",
                Filter = "DLL Files (*.dll)|*.dll|All Files (*.*)|*.*",
                CheckFileExists = true
            };

            if (ofd.ShowDialog(this) == DialogResult.OK)
            {
                SendToJs("dllSelected", new { path = ofd.FileName });
            }
        });
    }

    private void HandleInject(int pid, string dllPath)
    {
        var (success, message) = Injector.Inject(pid, dllPath);
        SendToJs("injectResult", new { success, message });
    }

    private void SendToJs(string action, object data)
    {
        var payload = JsonSerializer.Serialize(new { action, data });
        BeginInvoke(() =>
        {
            _webView.CoreWebView2?.PostWebMessageAsJson(payload);
        });
    }

    // --- Native methods for borderless window dragging ---
    const int WM_NCLBUTTONDOWN = 0xA1;
    const int HT_CAPTION = 0x2;

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool ReleaseCapture();

    // Allow resizing via hit-test on edges
    protected override void WndProc(ref Message m)
    {
        const int WM_NCHITTEST = 0x84;
        const int HTLEFT = 10, HTRIGHT = 11, HTTOP = 12, HTTOPLEFT = 13, HTTOPRIGHT = 14;
        const int HTBOTTOM = 15, HTBOTTOMLEFT = 16, HTBOTTOMRIGHT = 17;
        const int GRIP = 8;

        if (m.Msg == WM_NCHITTEST)
        {
            base.WndProc(ref m);
            var pos = PointToClient(new Point(m.LParam.ToInt32() & 0xFFFF, m.LParam.ToInt32() >> 16));

            if (pos.Y <= GRIP)
            {
                if (pos.X <= GRIP) m.Result = (IntPtr)HTTOPLEFT;
                else if (pos.X >= ClientSize.Width - GRIP) m.Result = (IntPtr)HTTOPRIGHT;
                else m.Result = (IntPtr)HTTOP;
            }
            else if (pos.Y >= ClientSize.Height - GRIP)
            {
                if (pos.X <= GRIP) m.Result = (IntPtr)HTBOTTOMLEFT;
                else if (pos.X >= ClientSize.Width - GRIP) m.Result = (IntPtr)HTBOTTOMRIGHT;
                else m.Result = (IntPtr)HTBOTTOM;
            }
            else if (pos.X <= GRIP) m.Result = (IntPtr)HTLEFT;
            else if (pos.X >= ClientSize.Width - GRIP) m.Result = (IntPtr)HTRIGHT;

            return;
        }

        base.WndProc(ref m);
    }
}
