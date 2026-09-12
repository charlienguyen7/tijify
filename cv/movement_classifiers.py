"""Import bridge for the user-facing `movement classifiers` directory.

Python imports use movement_classifiers.<module>; files retain the requested
folder name with a space. Paths resolve relative to this file, not the terminal.
"""
from pathlib import Path

__path__ = [str(Path(__file__).resolve().parent / "movement classifiers")]
