import subprocess, time, json, urllib.request, os, statistics, random, tempfile, sys
import crcmod.predefined
crc16 = crcmod.predefined.mkCrcFun('modbus')   # independent implementation: the sketch's own CRC is NOT used to build replies
SRV="http://127.0.0.1:3001"; KEY="test-key"
res=[]
def chk(n,ok,info=""):
    res.append((n,bool(ok),info)); print(("PASS " if ok else "FAIL ")+n+(("  -> "+str(info)) if info!="" else ""),flush=True)
def get(p): return json.load(urllib.request.urlopen(SRV+p,timeout=3))
def post_control(on):
    r=urllib.request.Request(SRV+"/api/control",data=json.dumps({"on":on}).encode(),headers={"Content-Type":"application/json"},method="POST"); return json.load(urllib.request.urlopen(r,timeout=3))
def frame(body): c=crc16(body); return body+bytes([c&0xFF,c>>8])
def reply(v=2200,a=1000,w=2200,wh=0,hz=500,pf=100,alarm=False,addr=1,func=4,count=20):
    regs=[v,a&0xFFFF,a>>16,w&0xFFFF,w>>16,wh&0xFFFF,wh>>16,hz,pf,0xFFFF if alarm else 0]
    return frame(bytes([addr,func,count])+b"".join(r.to_bytes(2,"big") for r in regs))
D=tempfile.mkdtemp(); REPLY=D+"/reply.hex"; REQ=D+"/request.log"
def set_reply(b): open(REPLY,"w").write(b.hex() if b else "")
def wait_status(status,ms,**kw):
    t=time.time()
    while time.time()-t<ms/1000:
        try:
            v=get("/api/pzem")
            if v.get("status")==status and all(v.get("reading",{}).get(k)==x if k in("voltage","current","power","energy","frequency","pf","alarm") else v.get(k)==x for k,x in kw.items()): return v
        except Exception: pass
        time.sleep(0.3)
    return None
def confirm_latency(n,seed):
    random.seed(seed); out=[]; want=get("/api/control")["applied"] is True
    for _ in range(n):
        time.sleep(random.uniform(0.4,2.2)); want=not want; t0=time.time(); post_control(want)
        while time.time()-t0<8:
            v=get("/api/control")
            if v["applied"]==want and not v["pending"]: break
            time.sleep(0.01)
        out.append(round((time.time()-t0)*1000))
    return out
def start_server(env=None): 
    p=subprocess.Popen(["node","/home/claude/work/luminara/server/server.js"],env={**os.environ,"DEVICE_KEY":KEY,**(env or {})},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.2); return p
srv=start_server()
set_reply(reply())    # the datasheet example: 220.0 V, 1.000 A, 220.0 W, 0 Wh, 50.0 Hz, PF 1.00, no alarm
rel=subprocess.Popen(["./relay_pzem"],env={**os.environ,"PZEM_SIM_DIR":D},stdout=open("relay_pzem.log","w"),stderr=subprocess.STDOUT)
try:
    # ---- 1) request bytes and decoding ----
    v=wait_status("live",14000)
    chk("1 first reading reaches the server (PZEM endpoint) within 14 s", v is not None, v and v["reading"])
    exp=frame(bytes([0xF8,4,0,0,0,10])).hex().upper()
    lines=open(REQ).read().split()
    chk("1 request frame is exactly F8 04 00 00 00 0A + Modbus CRC (CRC from an independent implementation)", lines and all(l==exp for l in lines), (lines[:1],exp))
    chk("1 datasheet example decodes correctly: 220.0 V, 1.000 A, 220.0 W, 0 kWh, 50.0 Hz, PF 1.00", v and v["reading"]=={"voltage":220.0,"current":1.0,"power":220.0,"energy":0.0,"frequency":50.0,"pf":1.0,"alarm":False}, v and v["reading"])
    chk("1 data is labelled as hardware (not test)", v and v["source"]=="hardware")
    set_reply(reply(v=2412,a=100000,w=230000,wh=1234567,hz=600,pf=87,alarm=True))
    v=wait_status("live",14000,voltage=241.2)
    chk("2 32-bit registers (high word set): 100.000 A, 23000.0 W, 1234.567 kWh, 60.0 Hz, PF 0.87, alarm", v and v["reading"]=={"voltage":241.2,"current":100.0,"power":23000.0,"energy":1234.567,"frequency":60.0,"pf":0.87,"alarm":True}, v and v["reading"])
    set_reply(reply(v=2298,a=1234,w=2805,wh=12345,hz=600,pf=99))
    wait_status("live",14000,voltage=229.8)
    # ---- 3) relay unaffected while the PZEM tasks run ----
    base=confirm_latency(8,7); m=statistics.median(base)
    chk("3 relay command confirmation with the PZEM running: median under 1.3 s (Phase 2 sketch alone measured 823 ms)", m<1300, f"median {m:.0f} ms {base}")
    # ---- 4) meter disconnected ----
    set_reply(b"")
    v=wait_status("pzem_offline",16000)
    chk("4 meter silent: server reports pzem_offline / no_response within 16 s", v is not None and v["reason"]=="no_response", v and {k:v[k] for k in("status","reason","errors")})
    chk("4 last real reading is still available to the dashboard (labelled by age)", v and v["reading"]["voltage"]==229.8 and v["readingAgeMs"]>0)
    out=confirm_latency(6,9); mo=statistics.median(out)
    chk("4 relay commands still confirmed in the same time while the meter is missing", mo<1300, f"median {mo:.0f} ms {out}")
    # ---- 5) other failure modes ----
    good=reply(v=2300)
    bad=bytearray(good); bad[-1]^=0xFF; set_reply(bytes(bad))
    chk("5 corrupted CRC rejected (reason bad_crc), never shown as a reading", wait_status("pzem_offline",14000,reason="bad_crc") is not None)
    set_reply(frame(bytes([1,0x84,2])))
    chk("5 meter error frame -> reason meter_error", wait_status("pzem_offline",14000,reason="meter_error") is not None)
    set_reply(good[:10])
    chk("5 truncated reply -> no_response", wait_status("pzem_offline",14000,reason="no_response") is not None)
    set_reply(reply(func=3))
    chk("5 wrong function code with a valid CRC -> bad_frame", wait_status("pzem_offline",14000,reason="bad_frame") is not None)
    # ---- 6) recovery ----
    set_reply(reply(v=2310,a=500,w=1100,wh=20000,hz=600,pf=95))
    v=wait_status("live",14000,voltage=231.0)
    chk("6 meter reconnected: live readings resume by themselves", v is not None, v and v["reading"])
    # ---- 7) server outage: nothing crashes, everything recovers ----
    srv.kill(); srv.wait(); time.sleep(7)
    chk("7 relay firmware keeps running while the server is down", rel.poll() is None)
    srv=start_server()
    t=time.time(); ok_ctl=False
    while time.time()-t<12:
        try:
            if get("/api/control")["controllerOnline"]: ok_ctl=True; break
        except Exception: pass
        time.sleep(0.3)
    chk("7 server back: relay polling resumes", ok_ctl)
    chk("7 server back: PZEM posting resumes", wait_status("live",14000,voltage=231.0) is not None)
    # ---- 8) isolation of endpoints ----
    chk("8 PZEM data never appears in lamp telemetry", get("/api/lamps")["lamps"]==[])
finally:
    rel.kill(); srv.kill()
log=open("relay_pzem.log").read()
chk("9 serial log: reports meter OK once, and the 'not answering' hint with wiring checklist", "[PZEM] reading OK" in log and "not answering" in log and "5 V" in log)
f=[r for r in res if not r[1]]; print(f"\n{len(res)-len(f)}/{len(res)} checks passed")
json.dump(res,open("pzem_host_results.json","w"),indent=1)
