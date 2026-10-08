"""
SENTINEL AI - CSV Data Ingestion & Dual-Assessment Verifier
Generates mock sensor time-series CSV and ingests it into the Sentinel AI pipeline.
"""

import csv
import random
from datetime import datetime, timedelta
import sys
import os
import requests
import json
import time

def generate_mock_sensor_csv(filename="sensor_stream.csv", rows=100):
    """
    User-specified mock sensor CSV generator.
    Generates 100 rows across sensor_1, sensor_2, sensor_3 with:
    - Normal readings (~25.0-29.5)
    - Row 45: 999.9 physical spike anomaly
    - Rows > 70: upward calibration drift
    """
    start_time = datetime.now()
    with open(filename, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        # Header definition
        writer.writerow(["timestamp", "sensor_id", "reading_value", "status_flag"])
        
        for i in range(rows):
            ts = (start_time + timedelta(seconds=i)).isoformat()
            sensor_id = f"sensor_{i % 3 + 1}"
            # Inject normal float values with occasional drift/spikes
            base_val = 25.0 + (i % 10) * 0.5
            if i == 45:
                val = 999.9  # Spike / anomaly
            elif i > 70:
                val = base_val + (i * 0.2)  # Simulated drift
            else:
                val = base_val + random.uniform(-0.1, 0.1)
                
            writer.writerow([ts, sensor_id, round(val, 4), "active"])
    
    print(f"[+] Successfully generated mock sensor CSV: {filename} ({rows} rows)")
    return filename


def ingest_via_api(filename="sensor_stream.csv", base_url="http://localhost:8000"):
    """
    Streams CSV file to the Sentinel AI backend endpoint POST /api/v1/telemetry/csv
    """
    url = f"{base_url}/api/v1/telemetry/csv"
    print(f"[*] Ingesting {filename} into Sentinel AI via {url}...")

    with open(filename, "rb") as f:
        files = {"file": (filename, f, "text/csv")}
        try:
            resp = requests.post(url, files=files, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                print("\n" + "=" * 65)
                print("           SENTINEL AI - CSV INGESTION REPORT")
                print("=" * 65)
                print(f" Total Rows Parsed        : {data.get('total_rows_parsed')}")
                print(f" Successfully Processed   : {data.get('processed_count')}")
                print(f" Corrupt Spikes Dropped   : {data['summary'].get('corrupt_spikes_dropped')}")
                print(f" Drift Detections Flagged : {data['summary'].get('drift_detected_count')}")
                print(f" False Alarms Suppressed  : {data['summary'].get('false_alarms_suppressed')}")
                print(f" Genuine Hazards Confirmed: {data['summary'].get('genuine_hazards')}")
                print("=" * 65)

                if data.get("alerts_sample"):
                    print("\n[!] Key Alert Audit Trail:")
                    for a in data["alerts_sample"]:
                        row_num = a.get('row', '?')
                        sid = a.get('sensor_id')
                        val = a.get('value')
                        typ = a.get('type')
                        expl = a.get('explanation')
                        print(f"  • Row {row_num:3d} [{sid} val={val}]: {typ}")
                        print(f"    Reason: {expl}\n")
                return True
            else:
                print(f"[-] API returned status {resp.status_code}: {resp.text}")
                return False
        except requests.exceptions.ConnectionError:
            print(f"[-] Could not connect to {base_url}. Is the backend server running?")
            return False


def main():
    csv_file = "sensor_stream.csv"
    generate_mock_sensor_csv(csv_file, rows=100)
    success = ingest_via_api(csv_file)
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()
