using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Independent per-pixel-alpha window. Only its opaque character pixels accept input.
// DSH owns the animation timeline; this small process owns screen coordinates and drawing.
static class Native {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; public Point(int x,int y){X=x;Y=y;} }
    [StructLayout(LayoutKind.Sequential)] public struct Size { public int X,Y; public Size(int x,int y){X=x;Y=y;} }
    [StructLayout(LayoutKind.Sequential,Pack=1)] public struct Blend { public byte Op,Flags,Alpha,Format; }
    [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr hwnd);
    [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr hwnd,IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr CreateCompatibleDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern bool DeleteDC(IntPtr dc);
    [DllImport("gdi32.dll")] public static extern IntPtr SelectObject(IntPtr dc,IntPtr bitmap);
    [DllImport("gdi32.dll")] public static extern bool DeleteObject(IntPtr bitmap);
    [DllImport("user32.dll",SetLastError=true)] public static extern bool UpdateLayeredWindow(IntPtr hwnd,IntPtr dc,ref Point dst,ref Size size,IntPtr source,ref Point origin,int key,ref Blend blend,int flags);
    [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
static class Json {
    public static readonly JavaScriptSerializer Codec=new JavaScriptSerializer();
    public static Dictionary<string,object> Map(object value){return (Dictionary<string,object>)value;}
    public static object Get(Dictionary<string,object> value,string key,object fallback){object found;return value.TryGetValue(key,out found)?found:fallback;}
    public static int Int(Dictionary<string,object> value,string key,int fallback){return Convert.ToInt32(Get(value,key,fallback));}
    public static bool Bool(Dictionary<string,object> value,string key,bool fallback){return Convert.ToBoolean(Get(value,key,fallback));}
    public static void Write(object value){Console.WriteLine(Codec.Serialize(value));Console.Out.Flush();}
}
sealed class Cell { public Rectangle Source; public double Anchor; public int Bottom,Top; }
sealed class Skin : IDisposable {
    public readonly Bitmap Image;
    public readonly Cell[] Cells;
    public readonly int Logical,Height,Baseline;
    public readonly double Scale;
    public Skin(Dictionary<string,object> data) {
        Image=new Bitmap(Convert.ToString(data["imagePath"]));
        var grid=Json.Map(data["grid"]);var rendering=Json.Map(data["rendering"]);
        int columns=Json.Int(grid,"columns",4),rows=Json.Int(grid,"rows",4),threshold=Json.Int(rendering,"alphaThreshold",192);
        Logical=Json.Int(rendering,"logicalSize",64);Height=Json.Int(rendering,"height",54);Baseline=Json.Int(rendering,"baseline",60);
        Cells=new Cell[columns*rows];bool center=Convert.ToString(rendering["anchor"])=="center";
        using(var rgba=new Bitmap(Image.Width,Image.Height,PixelFormat.Format32bppArgb)) {
            using(var g=Graphics.FromImage(rgba)){g.CompositingMode=CompositingMode.SourceCopy;g.DrawImageUnscaled(Image,0,0);}
            var locked=rgba.LockBits(new Rectangle(0,0,rgba.Width,rgba.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
            var pixels=new byte[locked.Stride*rgba.Height];Marshal.Copy(locked.Scan0,pixels,0,pixels.Length);
            try {
                for(int frame=0;frame<Cells.Length;frame++) {
                    int col=frame%columns,row=frame/columns;
                    int sx=Edge(grid,"columnEdges",col,col*rgba.Width/columns),sy=Edge(grid,"rowEdges",row,row*rgba.Height/rows);
                    int cw=Edge(grid,"columnEdges",col+1,(col+1)*rgba.Width/columns)-sx,ch=Edge(grid,"rowEdges",row+1,(row+1)*rgba.Height/rows)-sy;
                    int minX=cw,maxX=-1,minY=ch,maxY=-1;long headX=0,headCount=0;
                    for(int y=0;y<ch;y++)for(int x=0;x<cw;x++) {
                        if(pixels[(sy+y)*locked.Stride+(sx+x)*4+3]<threshold)continue;
                        minX=Math.Min(minX,x);maxX=Math.Max(maxX,x);minY=Math.Min(minY,y);maxY=Math.Max(maxY,y);
                        if(y<ch*.58){headX+=x;headCount++;}
                    }
                    double anchor=center?(maxX>=0?(minX+maxX)/2.0:cw/2.0):(headCount>0?(double)headX/headCount:maxX>=0?(minX+maxX)/2.0:cw/2.0);
                    Cells[frame]=new Cell{Source=new Rectangle(sx,sy,cw,ch),Anchor=anchor,Bottom=maxY>=0?maxY:ch-1,Top=maxY>=0?minY:0};
                }
            } finally {rgba.UnlockBits(locked);}
        }
        Scale=(double)Height/Math.Max(1,Cells.Max(cell=>cell.Bottom-cell.Top));
    }
    static int Edge(Dictionary<string,object> grid,string key,int index,int fallback){object value;return grid.TryGetValue(key,out value)?Convert.ToInt32(((object[])value)[index]):fallback;}
    public Bitmap Render(int frame,int size,bool pixelated) {
        frame=Math.Max(0,Math.Min(Cells.Length-1,frame));var cell=Cells[frame];
        int logical=pixelated?Logical:size;double ratio=(double)logical/Logical,scale=Scale*ratio;
        using(var source=new Bitmap(logical,logical,PixelFormat.Format32bppPArgb)) {
            using(var g=Graphics.FromImage(source)) {
                g.Clear(Color.Transparent);g.CompositingMode=CompositingMode.SourceCopy;
                g.InterpolationMode=pixelated?InterpolationMode.NearestNeighbor:InterpolationMode.HighQualityBicubic;
                g.PixelOffsetMode=pixelated?PixelOffsetMode.Half:PixelOffsetMode.HighQuality;
                double x=logical/2.0-cell.Anchor*scale,y=Baseline*ratio-cell.Bottom*scale,w=cell.Source.Width*scale,h=cell.Source.Height*scale;
                if(pixelated){x=Math.Round(x);y=Math.Round(y);w=Math.Round(w);h=Math.Round(h);}
                // Clamp sampling to this frame, including bicubic interpolation at source edges.
                using(var frameBitmap=Image.Clone(cell.Source,PixelFormat.Format32bppArgb)) {
                    g.DrawImage(frameBitmap,new RectangleF((float)x,(float)y,(float)w,(float)h),new RectangleF(0,0,frameBitmap.Width,frameBitmap.Height),GraphicsUnit.Pixel);
                }
            }
            var result=new Bitmap(size,size,PixelFormat.Format32bppPArgb);
            using(var g=Graphics.FromImage(result)){g.CompositingMode=CompositingMode.SourceCopy;g.InterpolationMode=pixelated?InterpolationMode.NearestNeighbor:InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=pixelated?PixelOffsetMode.Half:PixelOffsetMode.HighQuality;g.DrawImage(source,new Rectangle(0,0,size,size),0,0,logical,logical,GraphicsUnit.Pixel);}
            return result;
        }
    }
    public void Dispose(){Image.Dispose();}
}
sealed class PetWindow : Form {
    readonly ConcurrentQueue<Dictionary<string,object>> commands=new ConcurrentQueue<Dictionary<string,object>>();
    readonly Dictionary<string,Skin> skins=new Dictionary<string,Skin>();
    readonly Timer timer=new Timer{Interval=20};
    Bitmap bitmap;volatile bool eof;bool positioned,dragging,configured;readonly bool qa;DateTime lastPosition=DateTime.MinValue;bool positionDirty;
    public PetWindow(bool qaWindow) {
        qa=qaWindow;Text="DSH桌宠";FormBorderStyle=FormBorderStyle.None;ShowInTaskbar=qa;TopMost=true;AutoScaleMode=AutoScaleMode.None;StartPosition=FormStartPosition.Manual;Size=new Size(128,128);
        timer.Tick+=(sender,eventArgs)=>Tick();timer.Start();
        Task.Run(()=>{try {string line;while((line=Console.ReadLine())!=null){if(line.Length>131072)continue;commands.Enqueue(Json.Map(Json.Codec.DeserializeObject(line)));}}catch(Exception error){Console.Error.WriteLine(error.Message);}finally{eof=true;}});
        Shown+=(sender,eventArgs)=>Hide();
        LocationChanged+=(sender,eventArgs)=>{if(configured&&positioned){positionDirty=true;lastPosition=DateTime.UtcNow;}};
    }
    protected override bool ShowWithoutActivation{get{return !qa;}}
    protected override CreateParams CreateParams {get{var value=base.CreateParams;value.ExStyle|=0x80000|(qa?0:0x80|0x08000000);return value;}}
    protected override void WndProc(ref Message message) {
        if(message.Msg==0x84&&bitmap!=null) {
            long point=message.LParam.ToInt64();int x=(short)(point&0xffff),y=(short)((point>>16)&0xffff);
            var local=PointToClient(new Point(x,y));
            message.Result=(local.X>=0&&local.Y>=0&&local.X<bitmap.Width&&local.Y<bitmap.Height&&bitmap.GetPixel(local.X,local.Y).A>8)?new IntPtr(2):new IntPtr(-1);return;
        }
        if(message.Msg==0x231)dragging=true;
        if(message.Msg==0x232){dragging=false;positionDirty=true;lastPosition=DateTime.UtcNow.AddSeconds(-1);}
        base.WndProc(ref message);
    }
    void Tick() {
        if(eof){Close();return;}Dictionary<string,object> command;
        try {
            while(commands.TryDequeue(out command)) {
                var type=Convert.ToString(command["type"]);
                if(type=="quit"){Close();return;}
                if(type=="configure") {
                    foreach(var value in (object[])command["skins"]){var data=Json.Map(value);skins.Add(Convert.ToString(data["id"]),new Skin(data));}
                    var position=Json.Get(command,"position",null);if(position!=null){var p=Json.Map(position);Location=Reachable(new Point(Json.Int(p,"x",0),Json.Int(p,"y",0)),Width);}
                    else {var area=Screen.PrimaryScreen.WorkingArea;Location=new Point(area.Right-Width-24,area.Top+76);}
                    positioned=true;configured=true;
                    Json.Write(new{type="ready",layered=true,frameless=true,taskbar=false,draggable=true});
                }
                if(type=="render"&&configured) {
                    bool visible=Json.Bool(command,"visible",true);if(!visible){Hide();continue;}
                    int size=Math.Max(64,Math.Min(320,Json.Int(command,"size",128)));string id=Convert.ToString(command["skin"]);
                    Skin skin;if(!skins.TryGetValue(id,out skin))skin=skins.Values.First();
                    if(size!=Width){Size=new Size(size,size);if(!dragging)Location=Reachable(Location,size);}
                    var next=skin.Render(Json.Int(command,"frame",0),size,Json.Bool(command,"pixelated",false));
                    if(bitmap!=null)bitmap.Dispose();bitmap=next;PaintLayer();if(!Visible)Show();
                }
            }
            if(positionDirty&&!dragging&&(DateTime.UtcNow-lastPosition).TotalMilliseconds>200){positionDirty=false;Json.Write(new{type="position",x=Left,y=Top});}
        } catch(Exception error){Json.Write(new{type="error",message=error.Message});Close();}
    }
    static Point Reachable(Point point,int size) {
        if(Screen.AllScreens.Any(screen=>Rectangle.Intersect(screen.WorkingArea,new Rectangle(point.X,point.Y,size,size)).Width>=32&&Rectangle.Intersect(screen.WorkingArea,new Rectangle(point.X,point.Y,size,size)).Height>=32))return point;
        var area=Screen.FromPoint(point).WorkingArea;return new Point(Math.Max(area.Left,Math.Min(area.Right-size,point.X)),Math.Max(area.Top,Math.Min(area.Bottom-size,point.Y)));
    }
    void PaintLayer() {
        var screen=Native.GetDC(IntPtr.Zero);var memory=Native.CreateCompatibleDC(screen);IntPtr handle=IntPtr.Zero,previous=IntPtr.Zero;
        try {
            handle=bitmap.GetHbitmap(Color.FromArgb(0));previous=Native.SelectObject(memory,handle);
            var dst=new Native.Point(Left,Top);var size=new Native.Size(bitmap.Width,bitmap.Height);var origin=new Native.Point(0,0);var blend=new Native.Blend{Alpha=255,Format=1};
            if(!Native.UpdateLayeredWindow(Handle,screen,ref dst,ref size,memory,ref origin,0,ref blend,2))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        } finally {if(previous!=IntPtr.Zero)Native.SelectObject(memory,previous);if(handle!=IntPtr.Zero)Native.DeleteObject(handle);Native.DeleteDC(memory);Native.ReleaseDC(IntPtr.Zero,screen);}
    }
    protected override void Dispose(bool disposing){if(disposing){timer.Dispose();if(bitmap!=null)bitmap.Dispose();foreach(var skin in skins.Values)skin.Dispose();}base.Dispose(disposing);}
}
static class Program {
    [STAThread] static int Main(string[] args) {
        Console.SetIn(new StreamReader(Console.OpenStandardInput(),new UTF8Encoding(false)));
        Console.SetOut(new StreamWriter(Console.OpenStandardOutput(),new UTF8Encoding(false)){AutoFlush=true});
        Console.SetError(new StreamWriter(Console.OpenStandardError(),new UTF8Encoding(false)){AutoFlush=true});
        try {Native.SetProcessDpiAwarenessContext(new IntPtr(-4));}catch(EntryPointNotFoundException){Native.SetProcessDPIAware();}
        try {
            if(args.Length==2&&args[0]=="--render-check") {
                var data=Json.Map(Json.Codec.DeserializeObject(File.ReadAllText(args[1])));var definitions=(object[])data["skins"];var folder=Convert.ToString(data["output"]);Directory.CreateDirectory(folder);
                using(var skin=new Skin(Json.Map(definitions[0]))) {
                    for(int frame=0;frame<skin.Cells.Length;frame++)foreach(bool pixelated in new[]{false,true})using(var bitmap=skin.Render(frame,173,pixelated)){bitmap.Save(Path.Combine(folder,(pixelated?"pixel-":"smooth-")+frame+".png"),ImageFormat.Png);}
                    Json.Write(new{type="render-check",frames=skin.Cells.Length,alpha=true});
                }
                return 0;
            }
            Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new PetWindow(args.Contains("--qa-window")));return 0;
        } catch(Exception error){Console.Error.WriteLine(error.ToString());return 1;}
    }
}
