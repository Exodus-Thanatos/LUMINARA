import subprocess, time, json, urllib.request, random, statistics, os, signal, sys
SRV="http://127.0.0.1:3001"
def get(p): return json.load(urllib.request.urlopen(SRV+p,timeout=3))
def post(on):
    r=urllib.request.Request(SRV+"/api/control",data=json.dumps({"on":on}).encode(),headers={"Content-Type":"application/json"},method="POST"); return json.load(urllib.request.urlopen(r,timeout=3))
def run(binary,n,seed):
    random.seed(seed)
    srv=subprocess.Popen(["node","/home/claude/work/luminara/server/server.js"],env={**os.environ,"DEVICE_KEY":"test-key"},stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    rel=subprocess.Popen([binary],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    t=time.time()
    while time.time()-t<8:
        try:
            if get("/api/control")["controllerOnline"]: break
        except Exception: pass
        time.sleep(0.1)
    res=[]; want=False
    for i in range(n):
        time.sleep(random.uniform(0.5,2.5))          # random phase relative to the relay's own 2 s timer
        want=not want
        t0=time.time(); post(want)
        while True:
            v=get("/api/control")
            if v["applied"]==want and not v["pending"]: break
            if time.time()-t0>10: break
            time.sleep(0.01)
        res.append(round((time.time()-t0)*1000))
    rel.kill(); srv.kill(); time.sleep(0.5)
    return res
out={}
for name in ("relay_original","relay_phase2"):
    r=run("./"+name,10,7); out[name]=r
    s=sorted(r); print(f"{name}: median {statistics.median(r):.0f} ms | mean {statistics.mean(r):.0f} | min {s[0]} | max {s[-1]} | all {r}",flush=True)
json.dump(out,open("relay_measure.json","w"))
