import os, sys, time, base64, asyncio, logging, threading, queue, subprocess
from dataclasses import dataclass, field
from typing import Dict, Tuple, Set, Optional, List
from collections import defaultdict

import tkinter as tk
import ttkbootstrap as ttk
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
from tkinter import scrolledtext, filedialog as tkfiledialog

import tempfile, atexit, shutil

try:
    sys.dont_write_bytecode = True
    os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")
except Exception:
    pass

def _use_private_workdir():
    tmp = tempfile.mkdtemp(prefix="ghostui_runtime_")
    try:
        os.environ.setdefault("PYTHONPYCACHEPREFIX", os.path.join(tmp, "__pycache__"))
    except Exception:
        pass
    atexit.register(lambda: shutil.rmtree(tmp, ignore_errors=True))
    try:
        os.chdir(tmp)
    except Exception:
        pass
    return tmp

def resource_path(name: str) -> str:
    try:
        base = getattr(sys, "_MEIPASS")
        return os.path.join(base, name)
    except Exception:
        base = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.path.dirname(os.path.abspath(sys.argv[0]))
        return os.path.join(base, name)
if getattr(sys, "frozen", False):
    _use_private_workdir()

from seleniumbase import SB
from lens_images_core import translate_lens

LOG = logging.getLogger("ghostui")
if not LOG.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
LOG.propagate = False

DATA_URL_PREFIX = "data:image/"
CONCURRENCY, TIMEOUT, POLL_MS, IDLE = 3, 20.0, 150, 0.12

JS_GUARD = r"""
(function(){
  const isT = img => img.getAttribute('data-ghost-translated')==='1';
  document.querySelectorAll('img').forEach(img=>{ if(isT(img)) return;
    try{ img.setAttribute('loading','eager'); img.classList.remove('lazyload','lazy','lazyloaded'); }catch(e){} });
  const attrs=['data-src','data-original','data-lazy','data-lazy-src','data-url','data-srcset'];
  document.querySelectorAll('img').forEach(img=>{ if(isT(img)) return;
    try{
      let v=null;
      for(const a of attrs){ const t=img.getAttribute(a); if(t&&t.trim()){ v=t.trim(); break; } }
      if(!v && img.srcset){ const p=img.srcset.split(',').map(s=>s.trim()); if(p.length){ v=p[p.length-1].split(' ')[0]; } }
      if(v) img.src=v;
    }catch(e){}
  });
  try{ window.scrollBy(0,1); window.scrollBy(0,-1);}catch(e){}
  if(!window.__ghost_guard){ window.__ghost_guard=true;
    const OBS=new MutationObserver(L=>{ for(const m of L){ if(m.type==='attributes' && m.attributeName==='src'){
      const im=m.target; try{ if(im instanceof HTMLImageElement && isT(im)){
        const lock=im.getAttribute('data-ghost-translated-src')||''; if(lock && im.src && !im.src.startsWith('data:')) im.src=lock;
      }}catch(e){} } } });
    document.querySelectorAll('img').forEach(im=>{ try{ OBS.observe(im,{attributes:true,attributeFilter:['src']}); }catch(e){} });
    const DOCO=new MutationObserver(L=>{ for(const r of L){ r.addedNodes && r.addedNodes.forEach(n=>{
      if(n && n.querySelectorAll){ n.querySelectorAll('img').forEach(im=>{ try{ OBS.observe(im,{attributes:true,attributeFilter:['src']}); }catch(e){} }); }
    }); } });
    try{ DOCO.observe(document.documentElement||document.body,{childList:true,subtree:true}); }catch(e){}
  }
  return true;
})();
"""

JS_TAG = r"""
const imgs=[...document.querySelectorAll('img')]; let seq=1, out=[];
for(const img of imgs){
  if(img.getAttribute('data-ghost-translated')==='1') continue;
  const s=img.currentSrc||img.src||''; if(!s||s.startsWith('data:')) continue;
  const L=s.toLowerCase(); if(L.endsWith('.svg')||L.endsWith('.gif')||L.endsWith('.avif')||L.endsWith('.ico')) continue;
  if(!img.getAttribute('data-ghost-id')) img.setAttribute('data-ghost-id',''+(seq++));
  out.push({id:img.getAttribute('data-ghost-id'),src:s});
}
return out;
"""

JS_APPLY = r"""
const id=arguments[0], payload=arguments[1];
const img=document.querySelector('img[data-ghost-id="'+id+'"]'); if(!img) return false;
if(img.getAttribute("data-ghost-translated")==="1" && img.getAttribute("data-ghost-translated-src")===payload) return true;
if(!img.getAttribute("data-ghost-original-src")) img.setAttribute("data-ghost-original-src", img.src||"");
img.src=payload; img.setAttribute("data-ghost-translated","1"); img.setAttribute("data-ghost-translated-src",payload); return true;
"""

JS_GET_VISIBLE_TRANSLATED = r"""
const out=[];
document.querySelectorAll('img[data-ghost-translated="1"]').forEach(img=>{
  const r=img.getBoundingClientRect(), cs=getComputedStyle(img);
  if(r.width>0 && r.height>0 && cs.visibility!=='hidden' && cs.display!=='none'){
    out.push({id: img.getAttribute('data-ghost-id')||'', data: img.getAttribute('data-ghost-translated-src')||img.src||''});
  }
});
return out;
"""

def save_data_url_to(data_url: str, folder: str, key_hint: str):
    try:
        if not data_url.startswith(DATA_URL_PREFIX): return None
        head, b64 = data_url.split(',',1); ext='jpg' if ('jpeg' in head or 'jpg' in head) else 'png'
        safe=''.join(c for c in key_hint if c.isalnum() or c in '-_')[:40]; ts=int(time.time()*1000)
        fp=os.path.join(folder,f"{safe or 'image'}_{ts}.{ext}")
        with open(fp,'wb') as f: f.write(base64.b64decode(b64))
        return fp
    except Exception as e: 
        LOG.error("save err: %s",e); 
        return None

def hide_path(path: str):
    try:
        if not os.path.exists(path): return
        if os.name == "nt":
            import ctypes
            FILE_ATTRIBUTE_HIDDEN = 0x02
            ctypes.windll.kernel32.SetFileAttributesW(str(path), FILE_ATTRIBUTE_HIDDEN)
        elif sys.platform == "darwin":
            subprocess.run(["chflags", "hidden", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            base = os.path.dirname(path) or "."
            name = os.path.basename(path)
            hidden_file = os.path.join(base, ".hidden")
            try:
                lines: List[str] = []
                if os.path.exists(hidden_file):
                    with open(hidden_file, "r", encoding="utf-8", errors="ignore") as f:
                        lines = [ln.strip() for ln in f.readlines() if ln.strip()]
                if name not in lines:
                    lines.append(name)
                    with open(hidden_file, "w", encoding="utf-8") as f:
                        f.write("\n".join(lines) + "\n")
            except Exception:
                pass
    except Exception:
        pass

def hide_common_dirs(base_dir: str):
    for dn in ("__pycache__", "downloaded_files"):
        hide_path(os.path.join(base_dir, dn))

class Proc:
    def __init__(self, lang:str): 
        self.lang=lang; self.cache:Dict[Tuple[str,str],str]={}; self.qres=queue.Queue()
        self.stop=threading.Event(); self.th=None; self.ready=threading.Event()
    def start(self): self.th=threading.Thread(target=self._run,daemon=True); self.th.start(); self.ready.wait(3.0)
    def _run(self): asyncio.run(self._amain())
    def submit(self, url:str):
        key=(url,self.lang); 
        if key in self.cache: return self.cache[key]
        try: self._qin.put_nowait(key)
        except Exception: pass
        return None
    def poll(self, n=64):
        out=[]; 
        for _ in range(n):
            try: out.append(self.qres.get_nowait())
            except Exception: break
        return out
    def stop_now(self): self.stop.set()
    async def _amain(self):
        import asyncio as aio
        self._qin=aio.Queue(); self.ready.set(); sem=aio.Semaphore(CONCURRENCY)
        async def one(key):
            url,lang=key
            try:
                res=await aio.wait_for(translate_lens(url,lang=lang),timeout=TIMEOUT)
                data=(res or {}).get('image') or ''
                self.cache[key]=data if data.startswith(DATA_URL_PREFIX) else ""
                self.qres.put((key,self.cache[key]))
            except Exception:
                self.cache[key]=""; self.qres.put((key,""))
        async def worker():
            while not self.stop.is_set():
                try: key=await aio.wait_for(self._qin.get(),timeout=0.2)
                except aio.TimeoutError: await aio.sleep(0.05); continue
                try:
                    async with sem: await one(key)
                finally: self._qin.task_done()
        ws=[aio.create_task(worker()) for _ in range(CONCURRENCY)]
        while not self.stop.is_set(): await aio.sleep(0.1)
        for w in ws: w.cancel(); await aio.gather(*ws, return_exceptions=True)

@dataclass
class PageState:
    url:str=""; total:int=0; done:Set[str]=field(default_factory=set); sub_src:Set[str]=field(default_factory=set); map:Dict[str,Set[str]]=field(default_factory=lambda:defaultdict(set))

class UiLogHandler(logging.Handler):
    def __init__(self, app): super().__init__(); self.app = app
    def emit(self, record):
        try:
            msg = self.format(record)
            self.app.root.after(0, self.app._log_plain, msg)
        except Exception:
            pass

class App:
    def __init__(self, root):
        self.root=root; self.root.title("Ghost Manga UI v4.0")
        base=os.path.dirname(sys.argv[0] or __file__)
        
# icons
        # Ensure taskbar grouping and icon on Windows
        if sys.platform.startswith("win"):
            try:
                import ctypes
                ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("GhostUI")
            except Exception:
                pass
        try:
            ico = resource_path("icon.ico")
            if os.path.exists(ico):
                self.root.iconbitmap(ico)
        except Exception:
            pass
        try:
            png = resource_path("logo.png")
            if os.path.exists(png):
                self.root.iconphoto(True, tk.PhotoImage(file=png))
        except Exception:
            pass


        self.running=False; self.lang="en"; self.proc=None; self.cache={}
        self._pending_save_dir: Optional[str] = None

        self._build()

        handler = UiLogHandler(self)
        handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)s | %(message)s"))
        handler.setLevel(logging.INFO)
        LOG.handlers.clear(); LOG.addHandler(handler); LOG.setLevel(logging.INFO); LOG.propagate=False

        for name in ("httpx", "httpcore"):
            try:
                lg = logging.getLogger(name)
                lg.handlers.clear()
                lg.addHandler(handler)
                lg.setLevel(logging.INFO)
                lg.propagate = False
            except Exception:
                pass

        self.root.bind_all("<<Paste>>", self._on_global_paste, add="+")
        self.root.bind_all("<KeyPress>", self._on_any_key_for_paste, add="+")

        self._base_dir = base
        self._schedule_hide_dirs()

    def _build(self):
        m=ttk.Frame(self.root,padding=12); m.grid(row=0,column=0,sticky="nsew")
        self.root.grid_rowconfigure(0,weight=1); self.root.grid_columnconfigure(0,weight=1)
        r=ttk.Frame(m); r.grid(row=0,column=0,sticky="ew",pady=(0,8)); r.grid_columnconfigure(1,weight=1)
        ttk.Label(r,text="Page URL").grid(row=0,column=0,padx=(0,8)); self.uvar=ttk.StringVar(value="")
        self.uentry=ttk.Entry(r,textvariable=self.uvar); self.uentry.grid(row=0,column=1,sticky="ew")

        o=ttk.Labelframe(m,text="Options"); o.grid(row=1,column=0,sticky="ew")
        ttk.Label(o,text="Target language").grid(row=0,column=0,padx=(4,8),sticky=W)
        self.lvar=ttk.StringVar(value="en"); ttk.Entry(o,width=10,textvariable=self.lvar).grid(row=0,column=1,sticky=W)

        p=ttk.Labelframe(m,text="Progress"); p.grid(row=2,column=0,sticky="ew",pady=(8,8))
        self.pb=ttk.Progressbar(p,orient="horizontal",mode="determinate"); self.pb.grid(row=0,column=0,sticky="ew",padx=8,pady=6); p.grid_columnconfigure(0,weight=1)
        self.pl=ttk.StringVar(value="0 / 0"); ttk.Label(p,textvariable=self.pl).grid(row=0,column=1,padx=8)

        b=ttk.Frame(m); b.grid(row=3,column=0,sticky="ew",pady=(0,8))
        ttk.Button(b,text="Start",bootstyle=SUCCESS,command=self.start).grid(row=0,column=0,padx=(0,8))
        ttk.Button(b,text="Stop",bootstyle=DANGER,command=self.stop).grid(row=0,column=1,padx=(0,8))
        ttk.Button(b,text="Save images as...",bootstyle=SECONDARY,command=self.save_images_as).grid(row=0,column=2)

        self.log=scrolledtext.ScrolledText(m,height=18); self.log.grid(row=4,column=0,sticky="nsew"); m.grid_rowconfigure(4,weight=1)

        try: self.uentry.focus_set()
        except Exception: pass

    def _log_plain(self,msg):
        try: self.log.insert("end",msg+"\n"); self.log.see("end")
        except Exception: pass

    def _prog(self,done,total):
        self.pb["maximum"]=max(total,1); self.pb["value"]=min(done,total); self.pl.set(f"{done} / {total}")

    def _on_global_paste(self, event):
        self._paste_clip(); return "break"

    def _on_any_key_for_paste(self, event):
        try:
            if getattr(event, "char", "") == "\x16":
                self._paste_clip()
                return "break"
        except Exception:
            pass

    def _paste_clip(self):
        try:
            txt=self.root.clipboard_get()
            self.uvar.set(txt)
        except Exception as e:
            LOG.error(f"Paste failed: {e}")

    def start(self):
        if self.running: Messagebox.show_info("Already working"); return
        url=(self.uvar.get() or "").strip(); 
        if not url: Messagebox.show_error("Please enter the URL first."); return
        try: self.lang=(self.lvar.get() or "en").strip()
        except Exception: self.lang="en"
        self.running=True; self.cache={}
        self.proc=Proc(self.lang); self.proc.start()
        LOG.info(f"Start: {url} lang={self.lang}")
        threading.Thread(target=self._loop,args=(url,),daemon=True).start()
        self.root.after(POLL_MS,self._poll)

    def stop(self):
        if not self.running: return
        self.running=False
        try: self.proc and self.proc.stop_now()
        except Exception: pass
        LOG.info("Stop requested.")

    def save_images_as(self):
        folder = tkfiledialog.askdirectory(title="Choose folder to save translated images")
        if not folder: return
        self._pending_save_dir = folder
        LOG.info(f"Saving visible translated images to: {folder}")

    def _poll(self):
        if not self.running or not self.proc: return
        for (key,data) in self.proc.poll():
            self.cache[key]=data 
        self.root.after(POLL_MS,self._poll)

    def _loop(self, start_url:str):
        try:
            with SB(uc=True,test=False,rtf=True,headless=False) as sb:
                sb.open(start_url); time.sleep(1.0)
                st=PageState(url=sb.driver.current_url); LOG.info(f"Opened: {st.url}")
                JS_G=JS_GUARD; JS_T=JS_TAG; JS_A=JS_APPLY; JS_S=JS_GET_VISIBLE_TRANSLATED
                while self.running:
                    cur=sb.driver.current_url
                    if cur!=st.url:
                        st=PageState(url=cur); self._prog(0,0); time.sleep(0.5); LOG.info(f"Navigation → {cur}")
                    sb.execute_script(JS_G); items=sb.execute_script(JS_T) or []
                    now=defaultdict(set); [now[it["src"]].add(it["id"]) for it in items]
                    for s,ids in now.items(): st.map.setdefault(s,set()).update(ids)
                    now_ids=set().union(*now.values()) if now else set(); known=set().union(*st.map.values()) if st.map else set()
                    gone=(known-now_ids)-st.done
                    if gone: st.done.update(gone); LOG.info(f"{len(gone)} image(s) removed; marking as done.")
                    pending=(set().union(*st.map.values()) if st.map else set())-st.done
                    st.total=max(st.total,len(pending)+len(st.done)); self._prog(len(st.done),st.total)
                    if st.total==0: 
                        if self._pending_save_dir:
                            self._export_visible(sb, self._pending_save_dir, JS_S)
                            self._pending_save_dir=None
                        time.sleep(IDLE); continue
                    for s,ids in list(st.map.items()):
                        cached=self.cache.get((s,self.lang),None); 
                        if cached is None: continue
                        if cached=="":
                            for gid in list(ids):
                                if gid in st.done: continue
                                st.done.add(gid)
                            continue
                        if not cached.startswith(DATA_URL_PREFIX): continue
                        for gid in list(ids):
                            if gid in st.done: continue
                            if sb.execute_script(JS_A,gid,cached):
                                st.done.add(gid)
                    self._prog(len(st.done),st.total)
                    for s in st.map.keys():
                        if s in st.sub_src: continue
                        if self.cache.get((s,self.lang),None) is None and self.proc: self.proc.submit(s)
                        st.sub_src.add(s)
                    if self._pending_save_dir:
                        self._export_visible(sb, self._pending_save_dir, JS_S)
                        self._pending_save_dir=None
                    time.sleep(IDLE)
                LOG.info("Finished.")
        except Exception as e:
            LOG.error(f"Browser error: {e}")

    def _export_visible(self, sb, folder: str, js_get):
        try:
            items = sb.execute_script(js_get) or []
            if not items:
                LOG.info("No visible translated images to save right now.")
                return
            n=0
            for it in items:
                fp = save_data_url_to(it.get("data",""), folder, f"id-{it.get('id','')}")
                if fp: n+=1
            LOG.info(f"Saved {n} image(s) to: {folder}")
        except Exception as e:
            LOG.error(f"Save failed: {e}")

    def _schedule_hide_dirs(self):
        try:
            hide_common_dirs(self._base_dir)
        finally:
            self.root.after(2000, self._schedule_hide_dirs)

def main():
    root=ttk.Window(themename="superhero")
    app=App(root)
    root.mainloop()

if __name__=="__main__": main()
