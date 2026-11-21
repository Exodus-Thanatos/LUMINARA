import subprocess, time, json, urllib.request, os, statistics, random, tempfile
SRV="http://127.0.0.1:3001"; KEY="test-key"
def get(p): return json.load(urllib.request.urlopen(SRV+p,timeout=3))
def post_control(on):
    r=urllib.request.Request(SRV+"/api/control",data=json.dumps({"on":on}).encode(),headers={"Content-Type":"application/json"},method="POST"); return json.load(urllib.request.urlopen(r,timeout=3))
D=tempfile.mkdtemp()
# a valid datasheet-style reply so the PZEM tasks are really busy
import crcmod.predefined; f=crcmod.predefined.mkCrcFun('modbus')
regs=[2298,1234,0,2805,0,12345,0,600,99,0]; b=bytes([1,4,20])+b"".join(r.to_bytes(2,"big") for r in regs); c=f(b); open(D+"/reply.hex","w").write((b+bytes([c&255,c>>8])).hex())
def run(binary,n=12,seed=7):
    srv=subprocess.Popen(["node","/home/claude/work/luminara/server/server.js"],env={**os.environ,"DEVICE_KEY":KEY},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.2)
    rel=subprocess.Popen([binary],env={**os.environ,"PZEM_SIM_DIR":D},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    t=time.time()
    while time.time()-t<8:
        try:
            if get("/api/control")["controllerOnline"]: break
        except Exception: pass
        time.sleep(0.1)
    time.sleep(6)  # let the PZEM tasks settle
    random.seed(seed); out=[]; want=False
    for _ in range(n):
        time.sleep(random.uniform(0.4,2.2)); want=not want; t0=time.time(); post_control(want)
        while time.time()-t0<8:
            v=get("/api/control")
            if v["applied"]==want and not v["pending"]: break
            time.sleep(0.01)
        out.append(round((time.time()-t0)*1000))
    rel.kill(); srv.kill(); time.sleep(0.6); return out
for name in ("relay_phase2","relay_pzem_off","relay_pzem"):
    r=run("./"+name); print(f"{name}: median {statistics.median(r):.0f} ms | mean {statistics.mean(r):.0f} | max {max(r)} | {r}",flush=True)
