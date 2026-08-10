"""WinPulse Prediction Engine v7.4

Seuils assouplis pour garantir des picks visibles au quotidien

Filtre "edge minimum" retiré du gate de qualité (bookmakers pro = edge quasi nul,bloquait presque tous les picks). Le vrai filtre de qualité reste MIN_CONFIDENCE.

Picks combinés (2 marchés compatibles fusionnés, cote multipliée)ex: "Victoire Juventus & Plus de 2.5 buts" @ cote combinée

Anti-contradiction système complet

Organisation par championnat

Super combos généraux (tous sports mélangés)

Labels français pour tous les marchés

Bookmaker prioritaire : 1xBet, fallback sur tous bookmakers disponibles"""from typing import Dict, List, Optional, Tupleimport statisticsfrom datetim
