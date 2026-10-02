import time
import threading
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict, Any
from backend.core.database import db
from backend.data.yfinance_feed import yf_feed, get_latest_expected_trading_day

class DataSyncScheduler:
    """
    Automated background scheduler for End-of-Day Indian stock market data ingestion.
    Supports:
    - Daily scheduled morning ingestion (e.g. 08:30 AM before market open).
    - Startup freshness verification.
    - Safe concurrency locking.
    """
    def __init__(self):
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._sync_lock = threading.Lock()
        self.is_syncing = False
        self.last_run_date: Optional[date] = None
        self.last_run_time: Optional[str] = None
        self.last_status: str = "idle"
        self.last_message: str = "Scheduler initialized."

    def start(self):
        """Starts the scheduler background daemon thread"""
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="DataSyncSchedulerThread")
        self._thread.start()
        print("[Scheduler] Data sync scheduler started.")

        # Trigger non-blocking startup freshness check
        threading.Thread(target=self._check_startup_sync, daemon=True, name="StartupSyncCheck").start()

    def stop(self):
        """Stops the scheduler loop"""
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        print("[Scheduler] Data sync scheduler stopped.")

    def _check_startup_sync(self):
        """Verify data freshness on backend launch and sync if behind"""
        time.sleep(3)  # Let database and server initialize
        try:
            auto_on_startup = db.get_setting("auto_sync_on_startup", "true").lower() == "true"
            if not auto_on_startup:
                return

            freshness = yf_feed.check_freshness()
            if not freshness.get("is_up_to_date", True):
                print(f"[Scheduler] Market data is behind ({freshness.get('current_db_date')} vs {freshness.get('latest_expected_trading_day')}). Running initial sync...")
                self.trigger_sync(force=False, reason="backend_startup")
        except Exception as e:
            print(f"[Scheduler] Error during startup sync check: {e}")

    def _parse_schedule_time(self) -> tuple[int, int]:
        time_str = db.get_setting("morning_schedule_time", "08:30")
        try:
            parts = time_str.strip().split(":")
            return int(parts[0]), int(parts[1])
        except Exception:
            return 8, 30

    def _run_loop(self):
        """Main background scheduling loop (runs every 30 seconds)"""
        while not self._stop_event.is_set():
            try:
                enabled = db.get_setting("morning_schedule_enabled", "true").lower() == "true"
                if enabled:
                    target_hour, target_minute = self._parse_schedule_time()
                    now = datetime.now()
                    today = now.date()

                    # Trigger if current time matches scheduled morning hour & minute
                    if now.hour == target_hour and now.minute == target_minute:
                        if self.last_run_date != today:
                            self.last_run_date = today
                            print(f"[Scheduler] Triggering scheduled morning sync for {today} at {target_hour:02d}:{target_minute:02d}...")
                            self.trigger_sync(force=False, reason="morning_schedule")
            except Exception as e:
                print(f"[Scheduler] Error in scheduler loop: {e}")

            self._stop_event.wait(30)

    def trigger_sync(self, symbols: Optional[List[str]] = None, force: bool = False, reason: str = "manual") -> Dict[str, Any]:
        """
        Safely trigger an incremental data sync with mutex locking.
        """
        if self.is_syncing:
            return {
                "status": "in_progress",
                "message": "A data synchronization is already in progress.",
                "is_syncing": True
            }

        with self._sync_lock:
            self.is_syncing = True
            self.last_status = "running"
            self.last_message = f"Sync in progress ({reason})..."
            try:
                result = yf_feed.incremental_sync(symbols=symbols, force=force)
                self.last_status = result.get("status", "success")
                self.last_message = result.get("message", "Sync completed.")
                self.last_run_time = datetime.now().isoformat()
                self.last_run_date = datetime.now().date()
                return result
            except Exception as e:
                err_msg = f"Sync failed: {str(e)}"
                print(f"[Scheduler] {err_msg}")
                self.last_status = "error"
                self.last_message = err_msg
                db.set_setting("last_sync_status", "error")
                db.set_setting("last_sync_summary", err_msg)
                return {
                    "status": "error",
                    "message": err_msg
                }
            finally:
                self.is_syncing = False

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive status of scheduler and data horizon"""
        freshness = yf_feed.check_freshness()
        summary = db.get_market_summary()
        target_hour, target_minute = self._parse_schedule_time()
        morning_enabled = db.get_setting("morning_schedule_enabled", "true").lower() == "true"
        auto_open_enabled = db.get_setting("auto_sync_on_open", "true").lower() == "true"
        schedule_time_str = f"{target_hour:02d}:{target_minute:02d}"

        # Estimate next run
        now = datetime.now()
        target_today = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)
        if target_today > now:
            next_run = f"Today at {schedule_time_str}"
        else:
            next_run = f"Tomorrow at {schedule_time_str}"

        last_sync_ts = db.get_setting("last_sync_timestamp", self.last_run_time)
        last_summary = db.get_setting("last_sync_summary", self.last_message)
        last_status = db.get_setting("last_sync_status", self.last_status)

        return {
            "is_syncing": self.is_syncing,
            "is_up_to_date": freshness.get("is_up_to_date", True),
            "days_behind": freshness.get("days_behind", 0),
            "latest_expected_trading_day": freshness.get("latest_expected_trading_day"),
            "current_db_date": summary.get("max_date"),
            "morning_schedule_enabled": morning_enabled,
            "morning_schedule_time": schedule_time_str,
            "auto_sync_on_open": auto_open_enabled,
            "last_sync_timestamp": last_sync_ts,
            "last_sync_status": last_status,
            "last_sync_summary": last_summary,
            "next_run_estimate": next_run if morning_enabled else "Schedule paused",
            "market_summary": summary,
            "symbols_behind_count": freshness.get("behind_count", 0),
            "symbols_behind": freshness.get("symbols_behind", [])
        }

    def update_config(
        self,
        morning_schedule_enabled: Optional[bool] = None,
        morning_schedule_time: Optional[str] = None,
        auto_sync_on_open: Optional[bool] = None
    ) -> Dict[str, Any]:
        """Update scheduler configuration parameters"""
        if morning_schedule_enabled is not None:
            db.set_setting("morning_schedule_enabled", "true" if morning_schedule_enabled else "false")
        if morning_schedule_time is not None:
            # Validate HH:MM format
            try:
                parts = morning_schedule_time.strip().split(":")
                h, m = int(parts[0]), int(parts[1])
                if 0 <= h <= 23 and 0 <= m <= 59:
                    db.set_setting("morning_schedule_time", f"{h:02d}:{m:02d}")
            except Exception:
                pass
        if auto_sync_on_open is not None:
            db.set_setting("auto_sync_on_open", "true" if auto_sync_on_open else "false")

        return self.get_status()

data_scheduler = DataSyncScheduler()
