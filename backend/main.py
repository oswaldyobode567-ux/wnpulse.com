from server import app
from community_catalogue import router as community_router

app.include_router(community_router)
