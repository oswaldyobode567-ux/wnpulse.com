import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="WinPulse API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/")
async def root():
    return {"app": "WinPulse", "status": "ok", "version": "7.1"}

@app.get("/api/health")
async def health():
    return {"status": "healthy"}
