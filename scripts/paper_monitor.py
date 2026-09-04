import sqlite3, json, time, math, pathlib, sys
TARGET=400
POLL=30
DB='data/zinger.db'
while True:
    conn=sqlite3.connect(DB)
    cur=conn.cursor()
    try:
        cur.execute("SELECT value FROM docs WHERE key='poly_trades.json'")
        row=cur.fetchone()
        trades=json.loads(row[0]) if row else []
    except: trades=[]
    paper=[t for t in trades if (t.get('mode')=='paper' and t.get('exitReason'))]
    n=len(paper)
    pnls=[float(t.get('pnl') or 0) for t in paper]
    wins=[x for x in pnls if x>0]
    losses=[x for x in pnls if x<=0]
    wr= len(wins)/n if n else 0
    avgWin=sum(wins)/len(wins) if wins else 0
    avgLoss=abs(sum(losses)/len(losses)) if losses else 0
    ev=wr*avgWin - (1-wr)*avgLoss if n else 0
    mean=sum(pnls)/n if n else 0
    var=sum((x-mean)**2 for x in pnls)/(n-1) if n>1 else 0
    std=math.sqrt(var) if var else 0
    sharpe= (mean/std)*math.sqrt(252*288) if std else 0
    pf= (avgWin*len(wins))/(avgLoss*len(losses)) if avgLoss and losses else 0
    kelly= (wr*(avgWin/avgLoss) - (1-wr))/(avgWin/avgLoss) if avgLoss else 0
    total=sum(pnls)
    print(f"[{time.strftime('%H:%M:%S')}] {n}/{TARGET} WR {wr*100:.1f}% EV ${ev:.3f} PF {pf:.2f} Sharpe {sharpe:.2f} PnL ${total:.2f} avgWin ${avgWin:.2f} avgLoss ${avgLoss:.2f} Kelly {kelly*100:.1f}%", flush=True)
    if n>=TARGET:
        print("TARGET REACHED")
        break
    time.sleep(POLL)
