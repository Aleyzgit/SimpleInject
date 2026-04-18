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

    // For window dragging
    [DllImport("user32.dll")]
    static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);
    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();

    const int WM_NCLBUTTONDOWN = 0xA1;
    const int HT_CAPTION = 0x2;

    public MainForm()
    {
        Text = "SimpleInject";
        Size = new Size(920, 640);
        MinimumSize = new Size(760, 500);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.None;
        BackColor = Color.FromArgb(13, 13, 17);
        DoubleBuffered = true;

        // Load icon
        try { Icon = new Icon("app.ico"); } catch { }

        InitializeWebView();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        // Rounded corners (Windows 11)
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

        // Use a cached environment for faster startup
        var env = await CoreWebView2Environment.CreateAsync(
            null, 
            Path.Combine(Path.GetTempPath(), "SimpleInject_WebView2"),
            new CoreWebView2EnvironmentOptions("--disable-features=msWebOOProcess")
        );

        await _webView.EnsureCoreWebView2Async(env);

        // Disable dev tools in production, allow in debug
        #if !DEBUG
        _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
        #endif
        _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
        _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;

        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

        string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot", "index.html");
        _webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
    }

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var json = e.WebMessageAsJson;
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var type = root.GetProperty("type").GetString();

            switch (type)
            {
                case "minimize":
                    BeginInvoke(() => WindowState = FormWindowState.Minimized);
                    break;

                case "close":
                    BeginInvoke(() => Close());
                    break;

                case "dragWindow":
                    BeginInvoke(() =>
                    {
                        ReleaseCapture();
                        SendMessage(Handle, WM_NCLBUTTONDOWN, HT_CAPTION, 0);
                    });
                    break;

                case "getProcesses":
                    var procs = await Injector.GetProcessListAsync();
                    var procsJson = JsonSerializer.Serialize(new { type = "processes", data = procs });
                    BeginInvoke(() => _webView.CoreWebView2.PostWebMessageAsJson(procsJson));
                    break;

                case "browseDll":
                    BeginInvoke(() =>
                    {
                        using var ofd = new OpenFileDialog
                        {
                            Filter = "DLL Files|*.dll|All Files|*.*",
                            Title = "Select DLL to Inject"
                        };
                        if (ofd.ShowDialog() == DialogResult.OK)
                        {
                            var result = JsonSerializer.Serialize(new { type = "dllSelected", path = ofd.FileName });
                            _webView.CoreWebView2.PostWebMessageAsJson(result);
                        }
                    });
                    break;

                case "inject":
                    var processId = root.GetProperty("processId").GetInt32();
                    var dllPath = root.GetProperty("dllPath").GetString()!;

                    var (success, message) = await Task.Run(() => Injector.Inject(processId, dllPath));
                    var injectResult = JsonSerializer.Serialize(new { type = "injectResult", success, message });
                    BeginInvoke(() => _webView.CoreWebView2.PostWebMessageAsJson(injectResult));
                    break;

                case "executeScript":
                    var script = root.GetProperty("script").GetString();
                    // Script execution is a placeholder - would need a proper scripting engine
                    var scriptResult = JsonSerializer.Serialize(new
                    {
                        type = "scriptResult",
                        success = true,
                        message = $"Script received ({script?.Split('\n').Length ?? 0} lines). Execution engine not yet connected."
                    });
                    BeginInvoke(() => _webView.CoreWebView2.PostWebMessageAsJson(scriptResult));
                    break;
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Message handling error: {ex.Message}");
            try
            {
                var errorMsg = JsonSerializer.Serialize(new { type = "error", message = ex.Message });
                BeginInvoke(() => _webView.CoreWebView2.PostWebMessageAsJson(errorMsg));
            }
            catch { }
        }
    }

    // Edge resize support
    protected override void WndProc(ref Message m)
    {
        const int WM_NCHITTEST = 0x84;
        const int HTLEFT = 10, HTRIGHT = 11, HTTOP = 12, HTTOPLEFT = 13;
        const int HTTOPRIGHT = 14, HTBOTTOM = 15, HTBOTTOMLEFT = 16, HTBOTTOMRIGHT = 17;
        const int GRIP = 6;

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
