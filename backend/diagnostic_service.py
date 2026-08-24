"""
Diagnostic service — identifies EXACTLY where data refresh is failing.
Traces through every step of the pipeline and reports back with precise root cause.
"""
import os
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import httpx
import logging

logger = logging.getLogger("winpulse.diagnostic")

ODDS_API_KEY = os.environ.get("ODDS_API_KEY", "").strip()
ODDS_API_BASE = "https://api.the-odds-api.com/v4"


async def diagnose_full_pipeline(db) -> Dict:
    """
    Comprehensive diagnosis: tests every stage of the data reload pipeline.
    Returns detailed status for each stage with actionable error messages.
    """
    
    timestamp = datetime.now(timezone.utc).isoformat()
    results = {
        "timestamp": timestamp,
        "stages": {},
        "summary": "",
        "recommendations": [],
    }
    
    # ═══════════════════════════════════════════════════════════════════════
    # STAGE 1: Configuration Check
    # ═══════════════════════════════════════════════════════════════════════
    results["stages"]["1_configuration"] = _check_configuration()
    
    if not results["stages"]["1_configuration"]["api_key_present"]:
        results["summary"] = "🔴 CRITIQUE: ODDS_API_KEY manquante ou vide"
        results["recommendations"].append(
            "Vérifiez que ODDS_API_KEY est définie sur Railway: "
            "https://railway.app → Variables → ODDS_API_KEY"
        )
        return results
    
    # ═══════════════════════════════════════════════════════════════════════
    # STAGE 2: API Connectivity Test
    # ═══════════════════════════════════════════════════════════════════════
    results["stages"]["2_api_connectivity"] = await _test_api_connectivity()
    
    if results["stages"]["2_api_connectivity"]["status"] != "ok":
        results["summary"] = "🔴 CRITIQUE: The Odds API inaccessible ou rejet des requêtes"
        results["recommendations"].extend([
            f"Code HTTP: {results['stages']['2_api_connectivity'].get('http_status')}",
            f"Erreur: {results['stages']['2_api_connectivity'].get('error_message')}",
            "Action: Vérifiez que la clé API n'a pas atteint son quota horaire",
            "Action: Testez la clé directement: curl 'https://api.the-odds-api.com/v4/sports?apiKey=YOUR_KEY'",
        ])
        return results
    
    # ═══════════════════════════════════════════════════════════════════════
    # STAGE 3: Fetch Raw Data (Sample Sport)
    # ═══════════════════════════════════════════════════════════════════════
    results["stages"]["3_fetch_sample_sport"] = await _test_fetch_raw_sport()
    
    if results["stages"]["3_fetch_sample_sport"]["status"] != "ok":
        results["summary"] = "🔴 CRITIQUE: Fetch de matchs bruts échoue"
        results["recommendations"].extend([
            f"Sport testé: {results['stages']['3_fetch_sample_sport'].get('sport_tested')}",
            f"Erreur: {results['stages']['3_fetch_sample_sport'].get('error_message')}",
            "Action: Vérifiez que le sport_key est valide et actif en ce moment",
        ])
        return results
    
    # ═══════════════════════════════════════════════════════════════════════
    # STAGE 4: MongoDB Connection
    # ═══════════════════════════════════════════════════════════════════════
    results["stages"]["4_mongodb_connection"] = await _test_mongodb(db)
    
    if results["stages"]["4_mongodb_connection"]["status"] != "ok":
        results["summary"] = "🔴 CRITIQUE: MongoDB inaccessible"
        results["recommendations"].extend([
            f"Erreur: {results['stages']['4_mongodb_connection'].get('error_message')}",
            "Action: Vérifiez MONGO_URL sur Railway",
            "Action: Vérifiez que MongoDB Atlas est accessible et quota non atteint",
        ])
        return results
    
    # ═══════════════════════════════════════════════════════════════════════
    # STAGE 5: Cache Status
    # ═══════════════════════════════════════════════════════════════════════
    results["stages"]["5_cache_status"] = await _check_cache_status(db)
    
    # ═══════════════════════════════════════════════════════════════════════
    # STAGE 6: Mock Data Fallback
    # ═══════════════════════════════════════════════════════════════════════
    results["stages"]["6_mock_data_fallback"] = await _test_mock_data()
    
    # ═══════════════════════════════════════════════════════════════════════
    # STAGE 7: Prediction Engine
    # ═══════════════════════════════════════════════════════════════════════
    try:
        from prediction_engine import analyze_all, MODEL_VERSION
        results["stages"]["7_prediction_engine"] = {
            "status": "ok",
            "model_version": MODEL_VERSION,
            "can_import": True,
        }
    except Exception as e:
        results["stages"]["7_prediction_engine"] = {
            "status": "error",
            "error": str(e),
            "can_import": False,
        }
    
    # ═══════════════════════════════════════════════════════════════════════
    # FINAL DIAGNOSIS
    # ═══════════════════════════════════════════════════════════════════════
    all_ok = all(
        stage.get("status") == "ok"
        for stage in results["stages"].values()
        if isinstance(stage, dict) and "status" in stage
    )
    
    if all_ok:
        results["summary"] = "✅ TOUS LES DIAGNOSTICS PASSENT — La cause vient ailleurs"
        results["recommendations"].append(
            "Les données brutes sont bien récupérées. "
            "Testez /api/matches pour vérifier si les picks apparaissent. "
            "Si toujours 0 picks : le problème vient du moteur de prédiction ou du filtrage."
        )
    else:
        failed_stages = [
            k for k, v in results["stages"].items()
            if isinstance(v, dict) and v.get("status") != "ok"
        ]
        results["summary"] = f"🔴 STAGES EN ERREUR: {', '.join(failed_stages)}"
    
    return results


def _check_configuration() -> Dict:
    """Vérifie que toutes les variables d'environnement sont présentes."""
    config_vars = {
        "ODDS_API_KEY": ODDS_API_KEY,
        "MONGO_URL": os.environ.get("MONGO_URL", "").strip(),
        "DB_NAME": os.environ.get("DB_NAME", "").strip(),
    }
    
    return {
        "status": "ok" if all(config_vars.values()) else "error",
        "api_key_present": bool(ODDS_API_KEY),
        "api_key_preview": f"{ODDS_API_KEY[:10]}...{ODDS_API_KEY[-4:]}" if ODDS_API_KEY else "ABSENT",
        "mongo_url_present": bool(config_vars["MONGO_URL"]),
        "db_name_present": bool(config_vars["DB_NAME"]),
        "missing_vars": [k for k, v in config_vars.items() if not v],
    }


async def _test_api_connectivity() -> Dict:
    """
    Test basique de connexion à The Odds API.
    Appelle /sports pour vérifier que la clé est valide et que l'API répond.
    """
    url = f"{ODDS_API_BASE}/sports"
    params = {"apiKey": ODDS_API_KEY}
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.get(url, params=params)
            
            if r.status_code == 200:
                data = r.json()
                sports_count = len(data) if isinstance(data, list) else 0
                return {
                    "status": "ok",
                    "http_status": 200,
                    "sports_available": sports_count,
                    "message": f"{sports_count} sports actifs trouvés",
                }
            
            elif r.status_code == 401:
                return {
                    "status": "error",
                    "http_status": 401,
                    "error_message": "Authentification échouée — clé API invalide ou expirée",
                    "response_body": r.text[:200],
                }
            
            elif r.status_code == 429:
                return {
                    "status": "error",
                    "http_status": 429,
                    "error_message": "Quota d'API atteint — trop de requêtes cette heure",
                    "response_body": r.text[:200],
                }
            
            else:
                return {
                    "status": "error",
                    "http_status": r.status_code,
                    "error_message": f"The Odds API a rejeté la requête",
                    "response_body": r.text[:200],
                }
    
    except asyncio.TimeoutError:
        return {
            "status": "error",
            "error_message": "Timeout: The Odds API ne répond pas après 15 secondes",
            "possible_cause": "Connexion réseau bloquée ou serveur API down",
        }
    
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
            "error_type": type(e).__name__,
        }


async def _test_fetch_raw_sport() -> Dict:
    """
    Teste le fetch d'un sport spécifique pour voir si on récupère des matchs bruts.
    """
    test_sport = "soccer_epl"
    url = f"{ODDS_API_BASE}/sports/{test_sport}/odds"
    params = {
        "apiKey": ODDS_API_KEY,
        "regions": "eu",
        "markets": "h2h",
        "oddsFormat": "decimal",
        "dateFormat": "iso",
        "commenceTimeFrom": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "commenceTimeTo": (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    
    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            r = await http.get(url, params=params)
            
            if r.status_code == 200:
                data = r.json()
                matches_count = len(data) if isinstance(data, list) else 0
                
                if matches_count == 0:
                    return {
                        "status": "warning",
                        "sport_tested": test_sport,
                        "matches_count": 0,
                        "http_status": 200,
                        "message": "API accessible mais 0 matchs trouvés pour ce sport en ce moment",
                        "possible_cause": "Pas de matchs en cours pour ce sport, ou pas de cotes disponibles",
                    }
                
                return {
                    "status": "ok",
                    "sport_tested": test_sport,
                    "matches_count": matches_count,
                    "http_status": 200,
                    "sample_match": data[0] if data else None,
                }
            
            else:
                return {
                    "status": "error",
                    "sport_tested": test_sport,
                    "http_status": r.status_code,
                    "error_message": f"Fetch du sport échoue: {r.status_code}",
                    "response_body": r.text[:200],
                }
    
    except Exception as e:
        return {
            "status": "error",
            "sport_tested": test_sport,
            "error_message": str(e),
        }


async def _test_mongodb(db) -> Dict:
    """Teste la connexion et les opérations basiques sur MongoDB."""
    try:
        # Test 1: Ping la base de données
        await db.client.admin.command("ping")
        
        # Test 2: Essai de lire une collection
        test_collection = db.test_ping
        await test_collection.insert_one({"ping": "test", "timestamp": datetime.now(timezone.utc).isoformat()})
        await test_collection.delete_one({"ping": "test"})
        
        # Test 3: Vérifie que la collection de cache existe
        cache_count = await db.odds_cache.count_documents({})
        
        return {
            "status": "ok",
            "mongodb_ping": "success",
            "odds_cache_documents": cache_count,
        }
    
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
            "error_type": type(e).__name__,
        }


async def _check_cache_status(db) -> Dict:
    """Inspecte l'état du cache MongoDB."""
    try:
        cache = await db.odds_cache.find_one({"_id": "all_matches"})
        
        if not cache:
            return {
                "status": "warning",
                "cache_exists": False,
                "message": "Cache MongoDB vide — c'est normal au 1er démarrage, "
                           "mais il aurait dû être rempli au startup",
            }
        
        data = cache.get("data", [])
        updated_at = cache.get("updated_at")
        count = len(data) if isinstance(data, list) else 0
        
        try:
            updated_dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            age_seconds = (datetime.now(timezone.utc) - updated_dt).total_seconds()
            age_hours = age_seconds / 3600
        except Exception:
            age_seconds = None
            age_hours = None
        
        return {
            "status": "ok",
            "cache_exists": True,
            "cache_count": count,
            "updated_at": updated_at,
            "age_seconds": int(age_seconds) if age_seconds else None,
            "age_hours": round(age_hours, 1) if age_hours else None,
            "cache_fresh": age_seconds < 3600 if age_seconds else False,
        }
    
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
        }


async def _test_mock_data() -> Dict:
    """Teste si le fallback de mock data fonctionne."""
    try:
        from odds_service import get_all_mock_matches
        
        mock = get_all_mock_matches()
        return {
            "status": "ok",
            "mock_matches_count": len(mock),
            "can_generate_fallback": len(mock) > 0,
        }
    
    except Exception as e:
        return {
            "status": "error",
            "error_message": str(e),
        }
