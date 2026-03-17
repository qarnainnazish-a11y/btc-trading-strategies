from abc import ABC, abstractmethod
import pandas as pd
from typing import Optional, Dict, Any


class Strategy(ABC):
    def __init__(self, config: Dict[str, Any]):
        self.config = config

    @abstractmethod
    def generate_signal(self, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
        """
        Return example:
        {
          "side": "buy" or "sell",
          "amount": 0.001
        }
        """
        pass
