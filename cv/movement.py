"""Shared event result; phase matches shared/protocol.md."""
from dataclasses import dataclass


@dataclass
class MovementResult:
    gesture: str
    phase: str | None
    active: bool
    confidence: float
