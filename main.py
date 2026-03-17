import json
import time
from pathlib import Path

import pandas as pd

from exchange.ccxt_client import ExchangeClient
from strategies.scalping import RsiScalpingStrategy


def ohlcv_to_df(ohlcv):
    df = pd.DataFrame(
        ohlcv,
        columns=["timestamp", "open", "high", "low", "close", "volume"],
    )
    df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
    return df


def main():
    config_path = Path("config/settings_example.json")
    config = json.loads(config_path.read_text())

    client = ExchangeClient(
        exchange_id=config.get("exchange", "binance"),
        api_key="",
        secret="",
        paper=config.get("paper", True),
    )

    strategy = RsiScalpingStrategy(config)

    symbol = config["symbol"]
    timeframe = config["timeframe"]
    limit = config.get("candles_limit", 200)

    print("Starting paper trading loop...")
    while True:
        try:
            ohlcv = client.fetch_ohlcv(symbol, timeframe, limit)
            df = ohlcv_to_df(ohlcv)

            signal = strategy.generate_signal(df)
            if signal:
                side = signal["side"]
                amount = signal["amount"]
                order = client.create_market_order(symbol, side, amount)
                print(f"Executed: {order}")

            time.sleep(30)  # 30 sec delay

        except KeyboardInterrupt:
            print("Stopped by user.")
            break
        except Exception as e:
            print("Error in loop:", e)
            time.sleep(10)


if __name__ == "__main__":
    main()
