import os
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("BACKEND_PORT", 8000))
    host = os.environ.get("BACKEND_HOST", "0.0.0.0")
    print(f"Starting AmiBroker Indian EOD Backend on http://127.0.0.1:{port} (host={host}) ...")
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
