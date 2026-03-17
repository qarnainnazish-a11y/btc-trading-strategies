import json
from pathlib import Path
from typing import List

import ccxt
import pandas as pd

from strategies.scalping import RsiScalpingStrategy


def fetch_ohlcv_to_df(symbol: str, timeframe: str, limit: int = 500) -> pd.DataFrame:
    exchange = ccxt.binance()
    ohlcv: List[List[float]] = exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
    df = pd.DataFrame(
        ohlcv,
        columns=["timestamp", "open", "high", "low", "close", "volume"],
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    return df


def main():
    config_path = Path("config/settings_example.json")
    config = json.loads(config_path.read_text())

    df = fetch_ohlcv_to_df(
        symbol=config["symbol"],
        timeframe=config["timeframe"],
        limit=config.get("candles_limit", 200),
    )

    strat = RsiScalpingStrategy(config)

    balance_usdt = 1000.0
    position = 0.0
    entry_price = 0.0

    for i in range(50, len(df)):
        window = df.iloc[: i + 1].copy()
        signal = strat.generate_signal(window)

        if signal is None:
            continue

        price = window.iloc[-1]["close"]

        if signal["side"] == "buy" and balance_usdt > 0:
            amount = signal["amount"]
            cost = amount * price
            if cost <= balance_usdt:
                balance_usdt -= cost
                position += amount
                entry_price = price
                print(f"[BACKTEST] BUY {amount:.6f} at {price:.2f}, balance={balance_usdt:.2f}")
        elif signal["side"] == "sell" and position > 0:
            amount = min(signal["amount"], position)
            proceeds = amount * price
            balance_usdt += proceeds
            position -= amount
            print(f"[BACKTEST] SELL {amount:.6f} at {price:.2f}, balance={balance_usdt:.2f}")

    final_price = df.iloc[-1]["close"]
    total_value = balance_usdt + position * final_price
    print(f"Final balance (USDT value): {total_value:.2f}")


if __name__ == "__main__":
    main()
