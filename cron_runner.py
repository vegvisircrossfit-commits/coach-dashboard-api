"""
cron_runner.py — Simple cron scheduler for Render

Runs roster.py 15 minutes before each class.
Start this as a background worker on Render alongside server.js.

Class times (CST): 5AM, 6AM, 7:30AM, 9AM, 3PM, 4PM, 5PM, 6PM
Run times (CST):   4:44, 5:44, 7:14, 8:44, 14:44, 15:44, 16:44, 17:44
"""

import time
import datetime
import subprocess

# (hour, minute) in CST when roster should be built
RUN_TIMES = [
    (4, 44),   # before 5AM
    (5, 44),   # before 6AM
    (7, 14),   # before 7:30AM
    (8, 44),   # before 9AM
    (14, 44),  # before 3PM
    (15, 44),  # before 4PM
    (16, 44),  # before 5PM
    (17, 44),  # before 6PM
]

def get_cst_now():
    return datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-5)))

def should_run(now):
    return (now.hour, now.minute) in RUN_TIMES

last_run_minute = None

print("Cron runner started — waiting for scheduled run times (CST)...")
while True:
    now = get_cst_now()
    current_minute = (now.hour, now.minute)

    if should_run(now) and current_minute != last_run_minute:
        print(f"\n[{now.strftime('%Y-%m-%d %H:%M CST')}] Running roster builder...")
        try:
            subprocess.run(["python", "roster.py"], check=True)
            last_run_minute = current_minute
        except subprocess.CalledProcessError as e:
            print(f"Roster build failed: {e}")

    time.sleep(30)  # check every 30 seconds
