import ccxt
import time
from typing import Optional, Dict, Any


class ExchangeClient:
    def __init__(self, exchange_id: str = "binance", api_key: str = "", secret: str = "", paper: bool = True):
        exchange_class = getattr(ccxt, exchange_id)
        self.paper = paper

        params: Dict[str, Any] = {
            "enableRateLimit": True,
        }
        if api_key and secret:
            params["apiKey"] = api_key
            params["secret"] = secret

        self.exchange = exchange_class(params)

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 200):
        return self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)

    def get_current_price(self, symbol: str) -> Optional[float]:
        ticker = self.exchange.fetch_ticker(symbol)
        return ticker.get("last")

    def create_market_order(self, symbol: str, side: str, amount: float):
        if self.paper:
            print(f"[PAPER] {side.upper()} {amount} {symbol}")
            return {"id": f"paper-{int(time.time())}", "symbol": symbol, "side": side, "amount": amount}
        else:
            return self.exchange.create_order(symbol, "market", side, amount)
