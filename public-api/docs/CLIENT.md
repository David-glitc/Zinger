# Building an execution client

Stream public predictions and run **your** order path.

## Connect

```js
const API = 'https://zinger.kierkegaard.space/api/v1';
const es = new EventSource(API + '/predictions/stream');
es.onmessage = (ev) => {
  const { signals, window, markets, targetPrice } = JSON.parse(ev.data);
  for (const s of [signals.btc, signals.eth]) {
    if (!s || s.action === 'hold' || s.skipTrade) continue;
    placeOrder({
      market: s.asset + ' updown 5m',
      side: s.direction,
      tp: s.takeProfit.price,
      sl: s.stopLoss.price,
      windowRemaining: window?.remaining,
    });
  }
};
```

## Snapshots

```bash
curl -s https://zinger.kierkegaard.space/api/v1/health
curl -s https://zinger.kierkegaard.space/api/v1/predictions | jq .signals.btc
curl -s https://zinger.kierkegaard.space/api/v1/markets | jq .
curl -s https://zinger.kierkegaard.space/api/v1/market/SLUG | jq .
```

Never send private keys to this API.
