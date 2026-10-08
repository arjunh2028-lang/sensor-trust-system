"""
Entry point script to run the Sentinel AI Sensor Trust & False-Alarm Detection Server.
"""

import uvicorn
import os
import sys

# Ensure backend package can be imported
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if __name__ == "__main__":
    print("=" * 70)
    print(" SENTINEL AI: Sensor Trust, Drift & False-Alarm Detection System")
    print("=" * 70)
    print(" -> Server starting on: http://localhost:8000")
    print(" -> WebSocket stream on: ws://localhost:8000/ws")
    print(" -> Interactive UI Dashboard: http://localhost:8000/")
    print("=" * 70)
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False, log_level="info")
