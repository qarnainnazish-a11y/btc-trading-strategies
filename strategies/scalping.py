from typing import Optional, Dict, Any
import pandas as pd
import pandas_ta as ta

from .base import Strategy


class RsiScalpingStrategy(Strategy):
    def __init__(self, config):
        super().__init__(config)
        self.rsi_period = config.get("rsi_period", 14)
        self.overbought = config.get("rsi_overbought", 70)
        self.oversold = config.get("rsi_oversold", 30)
        self.position_size_usdt = config.get("position_size_usdt", 50)
        self.current_position = 0.0  # simple tracking

    def _add_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df["rsi"] = ta.rsi(df["close"], length=self.rsi_period)
        return df

    def generate_signal(self, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
        df = self._add_indicators(df)
        last = df.iloc[-1]

        rsi_value = last["rsi"]
        close_price = last["close"]

        if pd.isna(rsi_value):
            return None

        # If no position & RSI oversold -> buy
        if self.current_position <= 0 and rsi_value < self.oversold:
            amount = self.position_size_usdt / close_price
            self.current_position += amount
            return {"side": "buy", "amount": round(amount, 6)}

        # If have position & RSI overbought -> sell
        if self.current_position > 0 and rsi_value > self.overbought:
            amount = self.current_position
            self.current_position = 0.0
            return {"side": "sell", "amount": round(amount, 6)}

        return None
