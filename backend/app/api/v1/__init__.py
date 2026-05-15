from fastapi import APIRouter

from app.api.v1.achievements.router import router as achievements_router
from app.api.v1.auth.router import router as auth_router
from app.api.v1.equipment.router import router as equipment_router
from app.api.v1.items.router import router as items_router
from app.api.v1.leaderboard.router import router as leaderboard_router
from app.api.v1.matches.router import router as matches_router
from app.api.v1.notes.router import router as notes_router
from app.api.v1.playback.router import router as playback_router
from app.api.v1.presence.router import router as presence_router
from app.api.v1.rooms.router import me_room_router, rooms_router
from app.api.v1.sessions.router import router as sessions_router
from app.api.v1.shop.router import router as shop_router
from app.api.v1.tracks.router import router as tracks_router
from app.api.v1.users.router import router as users_router
from app.api.v1.wallet.router import router as wallet_router
from app.api.v1.ws.router import router as ws_router

router = APIRouter()
router.include_router(auth_router, prefix="/auth", tags=["auth"])
router.include_router(users_router, prefix="/users", tags=["users"])
router.include_router(sessions_router, prefix="/sessions", tags=["sessions"])
router.include_router(notes_router, prefix="/notes", tags=["notes"])
router.include_router(matches_router, prefix="/matches", tags=["matches"])
router.include_router(leaderboard_router, prefix="/leaderboard", tags=["leaderboard"])
router.include_router(achievements_router, prefix="/achievements", tags=["achievements"])
router.include_router(shop_router, prefix="/shop", tags=["shop"])
router.include_router(presence_router, prefix="/presence", tags=["presence"])
router.include_router(wallet_router, prefix="/me/wallet", tags=["wallet"])
router.include_router(items_router, prefix="/me/items", tags=["items"])
router.include_router(equipment_router, prefix="/me/equipment", tags=["equipment"])
router.include_router(me_room_router, prefix="/me/room", tags=["rooms"])
router.include_router(rooms_router, prefix="/rooms", tags=["rooms"])
router.include_router(tracks_router, prefix="/tracks", tags=["tracks"])
router.include_router(playback_router, prefix="/playback", tags=["playback"])
router.include_router(ws_router, prefix="/ws", tags=["ws"])
