using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Payload {
    internal const string Url = "@@URL@@";
    internal const string Sha256 = "@@SHA256@@";
    internal static bool Verify(string file) {
        using (var hash=SHA256.Create()) using (var stream=File.OpenRead(file))
            return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").Equals(Sha256,StringComparison.OrdinalIgnoreCase);
    }
    [STAThread] internal static int Main(string[] args) {
        ServicePointManager.SecurityProtocol=SecurityProtocolType.Tls12;
        if(args.Length==2 && args[0]=="--verify-payload") return Verify(args[1])?0:2;
        if(args.Length==1 && args[0]=="--download-check") {
            var folder=Path.Combine(Path.GetTempPath(),"DSH-download-check-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
            try { var file=Path.Combine(folder,"payload.exe");using(var client=new WebClient())client.DownloadFile(Url,file);return Verify(file)?0:2; }
            finally { Directory.Delete(folder,true); }
        }
        Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
        if(args.Length==1 && args[0]=="--smoke") { using(var form=new SetupWindow()){form.CreateControl();}return 0; }
        if(args.Length==2 && args[0]=="--render-preview") { using(var form=new SetupWindow()){form.ShowInTaskbar=false;form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-30000,-30000);form.Opacity=0;form.Show();Application.DoEvents();using(var image=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(image,new Rectangle(Point.Empty,form.Size));image.Save(args[1],System.Drawing.Imaging.ImageFormat.Png);}form.Close();}return 0; }
        Application.Run(new SetupWindow());return 0;
    }
}

internal sealed class SetupWindow:Form {
    readonly Label status=new Label();readonly ProgressBar progress=new ProgressBar();readonly Button action=new Button();
    WebClient client;bool busy,launching,closing;
    internal SetupWindow() {
        Text="DeepSeek Harness 在线安装";ClientSize=new Size(520,215);FormBorderStyle=FormBorderStyle.FixedDialog;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;
        Font=new Font("Microsoft YaHei UI",10);
        var heading=new Label{Text="DeepSeek Harness 社区整合包",Location=new Point(24,20),Size=new Size(470,30),Font=new Font(Font.FontFamily,14,FontStyle.Bold)};
        status.Text="联网下载安装文件，随后可选择安装位置。\n包含行研插件 v0.13.2；下载内容约 @@MEGABYTES@@ MB。";status.SetBounds(24,65,470,52);
        progress.SetBounds(24,125,470,20);action.Text="下载并安装";action.SetBounds(350,165,144,30);action.Click+=async delegate { if(busy){closing=true;client.CancelAsync();}else await Install(); };
        Controls.AddRange(new Control[]{heading,status,progress,action});
        FormClosing+=delegate(object sender,FormClosingEventArgs e){if(busy){e.Cancel=true;closing=true;try{if(client!=null)client.CancelAsync();}catch(ObjectDisposedException){}}else if(launching)e.Cancel=true;};
    }
    async Task Install() {
        var folder=Path.Combine(Path.GetTempPath(),"DeepSeekHarnessSetup-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
        var partial=Path.Combine(folder,"setup.partial");var installer=Path.Combine(folder,"DeepSeek-Harness-Setup.exe");
        busy=true;action.Text="取消";progress.Value=0;
        try {
            using(client=new WebClient()) {
                client.DownloadProgressChanged+=delegate(object sender,DownloadProgressChangedEventArgs e){progress.Value=Math.Max(0,Math.Min(100,e.ProgressPercentage));status.Text=String.Format("正在下载安装文件：{0:N1} / {1:N1} MB",e.BytesReceived/1000000.0,e.TotalBytesToReceive/1000000.0);};
                await client.DownloadFileTaskAsync(new Uri(Payload.Url),partial);
            }
            action.Enabled=false;status.Text="正在校验安装文件，请稍候……";
            if(!await Task.Run(()=>Payload.Verify(partial)))throw new InvalidDataException("安装文件校验失败，请重试下载。");
            if(closing)return;
            File.Move(partial,installer);busy=false;launching=true;
            status.Text="安装界面已打开，请在新窗口选择安装位置并完成安装。";
            using(var process=Process.Start(new ProcessStartInfo{FileName=installer,UseShellExecute=true}))await Task.Run(()=>process.WaitForExit());
            launching=false;closing=true;Close();
        } catch(OperationCanceledException) { status.Text="下载已取消。"; }
        catch(WebException error) { if(!closing)MessageBox.Show(this,"下载失败，请检查网络后重试。\n"+error.Message,"在线安装",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
        catch(Exception error) { MessageBox.Show(this,error.Message,"在线安装",MessageBoxButtons.OK,MessageBoxIcon.Warning); }
        finally {
            busy=false;launching=false;action.Enabled=true;action.Text="重试下载";
            try { Directory.Delete(folder,true); }catch(IOException){}catch(UnauthorizedAccessException){}
            if(closing&&!IsDisposed)Close();
        }
    }
}
