"""
Service Runner for Stock-AI Terminal
Supervises both FastAPI backend and Next.js frontend as a unified Windows Service under NSSM.
"""

import os
import sys
import time
import signal
import socket
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
LOGS_DIR = ROOT_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# Locate Python and Node/NPM
PYTHON_EXE = sys.executable
NPM_CMD = "npm.cmd" if os.name == "nt" else "npm"

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) == 0

def free_port(port: int):
    """Find and kill any orphaned process occupying the target port"""
    try:
        res = subprocess.run(
            ["powershell", "-NoProfile", "-Command", f"(Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue).OwningProcess"],
            capture_output=True, text=True
        )
        pids = set(p.strip() for p in res.stdout.split() if p.strip().isdigit())
        for pid in pids:
            pid_int = int(pid)
            if pid_int > 4 and pid_int != os.getpid():
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Freeing port {port} held by orphaned PID {pid}...")
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid_int)], capture_output=True)
                time.sleep(1)
    except Exception as e:
        print(f"Warning checking port {port}: {e}")

def main():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Starting Stock-AI Service Runner...")
    
    # 0. Ensure ports 8000 and 3000 are not occupied by old orphaned processes
    if is_port_in_use(8000):
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Port 8000 is currently occupied. Attempting cleanup...")
        free_port(8000)

    if is_port_in_use(3000):
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Port 3000 is currently occupied. Attempting cleanup...")
        free_port(3000)

    backend_log_out = open(LOGS_DIR / "backend.log", "a", encoding="utf-8")
    backend_log_err = open(LOGS_DIR / "backend_err.log", "a", encoding="utf-8")
    frontend_log_out = open(LOGS_DIR / "frontend.log", "a", encoding="utf-8")
    frontend_log_err = open(LOGS_DIR / "frontend_err.log", "a", encoding="utf-8")

    # 1. Start FastAPI Backend
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Launching Backend on http://127.0.0.1:8000...")
    backend_proc = subprocess.Popen(
        [PYTHON_EXE, str(ROOT_DIR / "start_backend.py")],
        cwd=str(ROOT_DIR),
        stdout=backend_log_out,
        stderr=backend_log_err,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    )

    # 2. Start Next.js Frontend
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Launching Frontend on http://localhost:3000...")
    frontend_proc = subprocess.Popen(
        [NPM_CMD, "run", "dev"],
        cwd=str(FRONTEND_DIR),
        stdout=frontend_log_out,
        stderr=frontend_log_err,
        shell=True,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    )

    def shutdown(signum=None, frame=None):
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Stopping Stock-AI services...")
        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(backend_proc.pid)], capture_output=True)
        except Exception as e:
            print(f"Error terminating backend: {e}")

        try:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(frontend_proc.pid)], capture_output=True)
        except Exception as e:
            print(f"Error terminating frontend: {e}")

        try:
            backend_log_out.close()
            backend_log_err.close()
            frontend_log_out.close()
            frontend_log_err.close()
        except Exception:
            pass

        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Services stopped cleanly.")
        sys.exit(0)

    # Register termination signals
    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Monitor processes
    try:
        while True:
            b_status = backend_proc.poll()
            f_status = frontend_proc.poll()

            if b_status is not None:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Backend exited with code {b_status}. Shutting down runner...")
                break
            if f_status is not None:
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Frontend exited with code {f_status}. Shutting down runner...")
                break

            time.sleep(2)
    except Exception as e:
        print(f"Exception in service loop: {e}")
    finally:
        shutdown()

if __name__ == "__main__":
    main()
