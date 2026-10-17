"""WNPulse blog_seed v2 : couvertures locales et collecte multisport ciblée.

Remplace le fichier blog_seed.py existant avec le server.py associé.
BLOG_POSTS reste disponible pour les anciens imports. Les articles historiques
sont conservés sans republication automatique ni modification de leur contenu.
"""
import math
import re
import unicodedata
import uuid
import asyncio
import hashlib
import html
import ipaddress
import json
import logging
import os
import httpx
from datetime import datetime, timezone, timedelta
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

BLOG_POSTS = [
    {
        "slug": "comment-parier-can-2026-guide-complet",
        "title": "Comment parier sur la CAN 2026 : le guide complet pour le Bénin",
        "excerpt": "La Coupe d'Afrique des Nations 2026 approche. Voici comment construire des paris malins, où mettre tes francs et les pièges à éviter.",
        "cover": "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1200&q=80&auto=format&fit=crop",
        "tags": ["CAN 2026", "Football", "Stratégie"],
        "author": "Équipe WinPulse",
        "read_min": 6,
        "published_at": "2026-02-12T09:00:00+00:00",
        "meta_description": "Guide complet pour parier sur la CAN 2026 depuis le Bénin : marchés rentables, équipes favorites, stratégies bankroll et erreurs à éviter.",
        "content_md": """## La CAN, le tournoi le plus imprévisible du foot mondial

Si tu suis le football africain depuis une décennie, tu sais déjà que la CAN ne ressemble à aucun autre tournoi. Des outsiders comme le Sénégal, le Maroc ou les Comores ont déjà retourné des matchs que les bookmakers donnaient pliés d'avance. C'est précisément pour ça que **parier sur la CAN, c'est rentable — à condition d'avoir une méthode**.

Dans ce guide, on te livre la stratégie complète que WinPulse applique pendant le tournoi.

## 1. Les marchés à privilégier (et ceux à fuir)

### ✅ À privilégier
- **Buts +/- 2.5** : la CAN est un tournoi à faible scoring. Beaucoup de matchs se jouent à 1-0 ou 2-1. Le marché **moins de 2.5 buts** est souvent sous-coté.
- **Première mi-temps 0-0** : 40% des matchs CAN voient une première mi-temps sans but. Cote moyenne : **2.10-2.40**, alors que la fréquence statistique est plus proche de 2.00.
- **Double chance sur les outsiders** : ne joue jamais la victoire d'un outsider en mode sec. Joue plutôt **X2** (nul ou victoire) — meilleur ratio risque/gain.

### ❌ À fuir
- **Vainqueur final avant les quarts** : trop de scénarios possibles, la value est nulle.
- **Combinés de plus de 4 sélections** : la variance explose après 4 légs. WinPulse limite à 3 sélections sauf jackpot intentionnel.

## 2. Comment identifier les équipes "à monter"

Les bookmakers européens **sous-estiment souvent** les équipes africaines qui jouent en Europe. Quand une sélection a 7+ joueurs en Premier League ou Liga, sa cote initiale est presque toujours trop élevée.

**Critères WinPulse pour spotter une équipe value :**
- 6+ joueurs en championnats top-5 européens
- Bilan domicile/extérieur récent solide
- Sélectionneur en place depuis 2+ ans
- Pas de blessés clés dans les 8 jours avant le tournoi

## 3. La stratégie bankroll spécifique CAN

Pendant les 28 jours du tournoi, WinPulse recommande :
- **Bankroll dédié** : sépare ce que tu joues sur la CAN du reste
- **Mise unitaire : 2% du bankroll** (max 5% pour les paris à très haute confiance)
- **Pas plus de 3 paris par jour de matchs**
- **Stop-loss à -25%** : si tu perds un quart de ta bankroll CAN, tu t'arrêtes 48h

## 4. Le piège que 80% des parieurs béninois font

Parier sur **toutes** les sélections du pays par patriotisme. Le patriotisme n'a rien à voir avec les statistiques. Si les Écureuils ont une cote de 4.50 contre l'Algérie, c'est probablement que le risque réel est entre 4.20 et 4.80 — pas un cadeau du bookmaker.

**Règle d'or** : sois supporter avec ton cœur, parieur avec ta tête.

## 5. Comment WinPulse t'aide pendant la CAN

Dès le coup d'envoi du tournoi, WinPulse publie chaque jour :
- 1 pick "Sécurité" (confiance > 75%, cote 1.40-1.70)
- 1 pick "Équilibre" (confiance 60-75%, cote 1.70-2.30)
- 1 pick "Jackpot" (combiné 3 légs à valeur)

Et la nouveauté 2026 : un **value bet detector** spécial CAN qui scanne en temps réel les divergences entre les bookmakers.

---

👉 **[Crée ton compte gratuit](/register)** et reçois la veille du coup d'envoi notre combiné spécial CAN, gratuit pour les 200 premiers inscrits.
""",
    },

    {
        "slug": "3-meilleures-strategies-bankroll-pari-sportif",
        "title": "Les 3 meilleures stratégies de bankroll pour le pari sportif",
        "excerpt": "Tu peux avoir les meilleurs pronostics du monde, si ta gestion de mise est mauvaise, tu perds. Voici les 3 méthodes qui marchent vraiment.",
        "cover": "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1200&q=80&auto=format&fit=crop",
        "tags": ["Stratégie", "Bankroll", "Money management"],
        "author": "Équipe WinPulse",
        "read_min": 7,
        "published_at": "2026-02-08T09:00:00+00:00",
        "meta_description": "Découvre les 3 stratégies de bankroll les plus efficaces (Plat, Pourcentage, Kelly) avec des exemples concrets en FCFA pour le marché béninois.",
        "content_md": """## Pourquoi 95% des parieurs perdent (ce n'est pas ce que tu crois)

La plupart des parieurs perdent leur argent non pas parce qu'ils sont mauvais en pronostics, mais parce qu'ils **mettent n'importe quoi sur n'importe quel pari**. Tu peux avoir un taux de réussite de 60% et finir négatif si tu mises 10 000 FCFA sur tes paris perdants et 2 000 FCFA sur tes gagnants.

La **gestion de bankroll** (money management), c'est le grand secret. Voici les 3 méthodes qui ont fait leurs preuves.

## Méthode 1 — La mise plate (Flat betting)

**Le principe :** tu mises toujours **la même somme**, quelle que soit la cote ou ta confiance.

**Exemple concret** : bankroll de 50 000 FCFA, mise unitaire de 1 000 FCFA (2% du bankroll).
- Tu paries Real Madrid à 1.50 : tu mises 1 000 FCFA.
- Tu paries Burkina Faso à 4.20 : tu mises 1 000 FCFA.

**Avantages :**
- Ultra simple
- Émotion neutralisée (tu ne sur-mises jamais par "feeling")
- Variance contrôlée

**Inconvénients :**
- Pas optimal : tu mises pareil sur un pari à 80% de confiance et un pari à 55%
- Croissance plus lente sur les coups sûrs

**Pour qui ?** Débutants. C'est la meilleure stratégie pour les 3 premiers mois.

## Méthode 2 — Le pourcentage de bankroll

**Le principe :** tu mises un **% de ta bankroll actuelle** à chaque pari, recalculé après chaque opération.

**Exemple** : bankroll 50 000 FCFA, mise de 2% = 1 000 FCFA. Tu gagnes, bankroll passe à 52 500 FCFA → nouvelle mise = 1 050 FCFA.

**Avantages :**
- Tu protèges ton capital quand tu perds (les mises baissent automatiquement)
- Tu maximises les gains en série de victoires
- Mathématiquement supérieur au flat betting sur le long terme

**Inconvénients :**
- Récupération plus lente après une grosse perte
- Demande de la discipline (recalcul à chaque fois)

**Pour qui ?** Parieurs intermédiaires avec 3-6 mois d'expérience.

## Méthode 3 — Le critère de Kelly (la stratégie des pros)

**Le principe :** la mise est calculée selon ta **probabilité réelle** d'avoir raison et la **cote** proposée. C'est mathématiquement la mise qui maximise la croissance sur le long terme.

**Formule simplifiée :**
```
Fraction de bankroll = (cote × probabilité − 1) / (cote − 1)
```

**Exemple** : tu estimes que PSG a 65% de chances de gagner, le bookmaker propose 1.80.
- Fraction Kelly = (1.80 × 0.65 − 1) / (1.80 − 1) = 0.215 → mise 21.5% du bankroll !
- En pratique, on utilise le **Kelly fractionné** (1/4 ou 1/2 de Kelly) pour réduire la variance.

**Avantages :**
- Optimal mathématiquement
- Tu mises gros quand tu as un edge réel
- Tu mises peu quand le pari est moins favorable

**Inconvénients :**
- Demande une **estimation honnête** de ta probabilité (et la plupart des gens surestiment)
- Très volatile : une mauvaise série fait mal
- Réservé aux experts

**Pour qui ?** Parieurs Elite avec stats personnelles fiables sur 500+ paris.

## Quelle stratégie WinPulse utilise ?

Pour nos abonnés Elite, WinPulse calcule automatiquement la mise optimale en **Kelly fractionné (1/4 Kelly)** sur chaque pick publié. Tu as juste à suivre la recommandation.

Pour les abonnés Pro, on recommande la méthode du **pourcentage de bankroll à 2%**.

Pour les Free, on conseille la **mise plate**.

## Les règles d'or qui s'appliquent dans tous les cas

1. **Ne jamais mettre plus de 5% de ta bankroll sur un seul pari**, même si tu es "sûr".
2. **Tenir un tableau** (Excel, Google Sheets, peu importe) avec chaque pari, sa mise, la cote, le résultat. C'est non-négociable.
3. **Stop-loss mensuel à -20%** : si tu perds 20% de ta bankroll dans le mois, tu t'arrêtes jusqu'au mois suivant.
4. **Ne jamais "chase the losses"** (essayer de récupérer une perte par un pari risqué). C'est la voie royale vers la ruine.

---

👉 **[Passe Pro à 4 900 FCFA/mois](/app/abonnement)** et débloque le tracker bankroll automatique de WinPulse + les recommandations de mise Kelly fractionné sur chaque pick.
""",
    },

    {
        "slug": "pari-sportif-mtn-mobile-money-benin-guide-2026",
        "title": "Pari sportif MTN Mobile Money au Bénin : le guide complet 2026",
        "excerpt": "MTN MoMo c'est rapide, sécurisé et 100% béninois. Voici comment l'utiliser pour parier intelligemment sans jamais sortir ta carte bancaire.",
        "cover": "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1200&q=80&auto=format&fit=crop",
        "tags": ["MTN Mobile Money", "Bénin", "Paiement"],
        "author": "Équipe WinPulse",
        "read_min": 5,
        "published_at": "2026-02-05T09:00:00+00:00",
        "meta_description": "Tout savoir sur les paris sportifs avec MTN Mobile Money au Bénin : sécurité, plafonds, frais, opérateurs partenaires, conseils pratiques.",
        "content_md": """## MTN MoMo, le portefeuille mobile préféré des Béninois

Avec plus de **4 millions d'utilisateurs actifs** au Bénin, MTN Mobile Money est devenu LE moyen de paiement local. Sa simplicité (un téléphone, un code PIN) le rend particulièrement adapté aux services en ligne comme WinPulse, qui veulent toucher un large public sans imposer la carte bancaire.

Voici tout ce que tu dois savoir.

## 1. Pourquoi MoMo pour les paris ?

- **Pas de carte bancaire** requise : 80% des Béninois n'ont pas de Visa/Mastercard. MoMo, lui, est dans toutes les poches.
- **Validation en 30 secondes** chez la plupart des opérateurs.
- **Sécurité** : code PIN + SMS de confirmation, double validation.
- **Plafonds adaptés** : tu peux envoyer jusqu'à 2 000 000 FCFA/mois sur ton compte MoMo de base, plus en compte premium.

## 2. Combien ça coûte vraiment ?

Pour un transfert de **5 000 FCFA**, MTN prélève environ **25 FCFA** de frais (0.5%). Pour 50 000 FCFA, environ 250 FCFA. C'est **largement moins cher** qu'un transfert bancaire classique (souvent 1 500 à 3 000 FCFA).

**Astuce WinPulse** : on prend en charge les frais MTN sur les abonnements Elite à 14 900 FCFA. Tu ne paies que le montant exact.

## 3. Comment activer ton compte MoMo si tu ne l'as pas encore

1. Rends-toi dans une **agence MTN** (Cotonou, Porto-Novo, Parakou, etc.) avec ta CNI ou ton passeport.
2. Demande l'**activation Mobile Money**. C'est **gratuit** et ça prend 15 minutes.
3. Choisis un **code PIN** à 4 chiffres (jamais le partager !).
4. Tu reçois un SMS de confirmation et ton compte est actif immédiatement.

## 4. Comment recharger ton MoMo

3 méthodes principales :
- **Cash chez un agent** : tu donnes du liquide, il crédite ton MoMo. Le plus simple.
- **Virement bancaire** depuis Ecobank, BOA, UBA, etc. (24h-48h).
- **Recharger via une carte cadeau MTN** disponible dans les supermarchés.

## 5. Comment payer ton abonnement WinPulse en 30 secondes

C'est ultra rapide :
1. Compose **\\*880#** sur ton téléphone MTN
2. Choisis "Transfert d'argent"
3. Tape le numéro marchand WinPulse : **+229 01 66 28 06 03** (KOUKPAKI VIANEY)
4. Montant : **4 900 FCFA** (Pro) ou **14 900 FCFA** (Elite)
5. Référence : la **référence PE-XXXXXXXX** générée pendant ton inscription
6. Confirme avec ton **code PIN MTN**
7. Tu reçois le SMS de confirmation. Envoie-le-nous sur WhatsApp pour activation immédiate.

**Délai d'activation moyen WinPulse : 14 minutes** (entre minuit et 23h, support WhatsApp 24/7).

## 6. Sécurité : les arnaques à connaître absolument

⚠️ **N'envoie JAMAIS** ton code PIN MoMo à qui que ce soit, même si on te le demande au nom de "MTN" ou "WinPulse". Aucun service légitime ne te demandera ton PIN.

⚠️ **N'envoie pas d'argent à un numéro inconnu** qui te promet "100% gagnant" ou "pronostics secrets". WinPulse ne te demandera **jamais** d'envoyer de l'argent en dehors du système d'abonnement officiel.

⚠️ Si tu reçois un SMS suspect prétendant venir de MTN ou WinPulse, vérifie d'abord avec notre support WhatsApp officiel : **+33 7 67 97 17 52**.

## 7. MoMo vs autres méthodes (Moov, Coris, etc.)

WinPulse accepte officiellement **MTN MoMo en premier**, mais d'autres options arrivent en 2026 :
- **Moov Money** : disponible Q2 2026
- **Coris Money** : étude en cours
- **Carte bancaire (Visa/Mastercard)** : ne sera pas implémenté avant 2027 (trop peu de demande locale)

---

👉 **[Découvre nos abonnements à partir de 4 900 FCFA/mois](/app/abonnement)** — paiement MTN MoMo, activation en moins de 15 minutes.
""",
    },

    {
        "slug": "value-betting-comment-trouver-cotes-sous-evaluees",
        "title": "Value Betting : comment trouver des cotes sous-évaluées (et battre les bookmakers)",
        "excerpt": "Le seul moyen mathématiquement prouvé d'être rentable sur le long terme. Voici la méthode pas-à-pas, exemples chiffrés à l'appui.",
        "cover": "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=1200&q=80&auto=format&fit=crop",
        "tags": ["Value betting", "Cotes", "Mathématiques"],
        "author": "Équipe WinPulse",
        "read_min": 8,
        "published_at": "2026-01-29T09:00:00+00:00",
        "meta_description": "Apprends à identifier les value bets : cotes sous-évaluées par les bookmakers. Méthode, formules, exemples et outils utilisés par les parieurs pros.",
        "content_md": """## Le seul secret des parieurs qui gagnent

Tous les parieurs professionnels te le diront : **on ne gagne pas en pariant sur les favoris**. On gagne en pariant sur des cotes **sous-évaluées** par les bookmakers. Ça s'appelle le **value betting**, et c'est le seul concept qui sépare les gagnants des perdants sur le long terme.

## 1. Définition simple

Une **value bet** (ou pari à valeur), c'est un pari où la **cote proposée** est plus élevée que la **cote "juste"** correspondant à la vraie probabilité.

**Formule magique** :
```
Value = (Cote × Probabilité_réelle) − 1
```

Si **Value > 0**, c'est une value bet. Si **Value < 0**, c'est un mauvais pari (même si tu gagnes ce coup-ci, sur 1 000 paris tu perds).

## 2. Exemple concret

Match : **Sénégal vs Égypte** en demi-finale CAN.
- Bookmaker propose : **Sénégal à 2.40**
- Tu estimes (via stats, historique, blessures) : Sénégal a **48% de chances** de gagner.

**Cote "juste"** = 1 / 0.48 = **2.08**

Le bookmaker propose **2.40** > cote juste **2.08** → **VALUE !**

**Calcul de la value** : (2.40 × 0.48) − 1 = **+0.152**, soit **+15.2%** d'espérance par mise.

Sur 1 000 paris comme celui-ci, tu finis statistiquement avec **+15% de profit moyen**. C'est ça, le value betting.

## 3. Comment estimer la "probabilité réelle"

C'est la partie difficile. 3 méthodes principales :

### Méthode A — Le consensus des bookmakers
Compare la cote proposée par ton bookmaker avec **la moyenne des 5-10 bookmakers majeurs**. Si ton bookmaker est nettement plus haut, c'est suspect. C'est rare mais possible (surtout sur les marchés locaux comme la LONAB).

### Méthode B — Les modèles statistiques
On code un modèle qui prend en compte :
- Performances historiques des 2 équipes (sur 38 matchs minimum)
- Forme récente (10 derniers matchs)
- Blessures et suspensions
- Avantage domicile (généralement +0.5 goal)
- Importance du match (enjeu de classement, finale, etc.)

C'est ce que **WinPulse fait automatiquement** dans son moteur de prédiction.

### Méthode C — La connaissance terrain
Tu suis la Premier League depuis 15 ans, tu as vu chaque match d'Arsenal. Ton "feeling" est en réalité un modèle statistique inconscient. C'est valide… **uniquement si tu testes ton track record sur 200+ paris** avant de t'y fier.

## 4. Les 3 marchés où le value betting est le plus efficace

### 🥇 Les buts/totaux (Over/Under)
Les bookmakers fixent leurs lignes selon les moyennes des 20 derniers matchs. Si une équipe vient de changer de coach ou de système (4-4-2 → 3-5-2), les anciennes stats ne valent plus rien — mais les cotes n'ont pas bougé. **Value énorme**.

### 🥈 Les championnats secondaires
Ligue 1 française : 100 traders chez chaque bookmaker analysent chaque match en temps réel. Cotes ultra-justes.
Championnat tunisien D2 : 1 trader pour 10 championnats. **Erreurs fréquentes**.

### 🥉 Les paris en live (live betting)
En live, les bookmakers doivent ajuster en quelques secondes. Sur un match qui se déroule "anormalement" (équipe qui domine mais ne marque pas), les cotes prennent du retard sur la réalité. Si tu es rapide, tu peux capter une value de +20-30%.

## 5. L'outil indispensable : un comparateur de cotes

**Toujours comparer** les cotes proposées sur le même marché entre plusieurs bookmakers. La différence peut atteindre 0.20-0.30 sur un même pari.

Sur WinPulse, notre détecteur de value bets compare automatiquement chaque match avec les cotes consensus du marché et te signale les écarts.

## 6. Les pièges du value betting

### Piège #1 : Le "court terme déçoit"
Sur 100 value bets à +5% d'espérance, **statistiquement** tu finis à +5%. Mais sur 10 value bets, tu peux finir à -30% ou +50% à cause de la variance. **Patience obligatoire**.

### Piège #2 : Mauvaise estimation de la probabilité
La plupart des parieurs surestiment leur capacité à prédire. Test simple : note tes 50 prochaines prédictions avec ta probabilité estimée. Si tu dis "70% de chances" 10 fois, ces 10 paris doivent gagner **7 fois**. Pas 8, pas 5. Si tu es loin de la moyenne, ton modèle est mauvais.

### Piège #3 : Les marges des bookmakers
Sur un match équilibré, les bookmakers ajoutent **5-8% de marge** (overround). C'est leur commission. Pour qu'un pari soit vraiment value, il doit dépasser cette marge — donc Value > +0.06 minimum pour être intéressant.

## 7. Comment WinPulse trouve les value bets

Notre moteur fait 3 choses :
1. Récupère les cotes de **40+ bookmakers** mondiaux en temps réel
2. Calcule la **cote consensus** (médiane pondérée)
3. Compare avec le bookmaker que tu joues → flag les paris avec value > +6%

Tu reçois la liste **chaque matin à 8h** dans ton dashboard Pro.

---

👉 **[Accède au détecteur Value Bets WinPulse](/app/value-bets)** dès maintenant — gratuit en essai, débloqué dès 4 900 FCFA/mois.
""",
    },

    {
        "slug": "combines-vs-paris-simples-quelle-strategie",
        "title": "Combinés vs paris simples : quelle stratégie est vraiment rentable ?",
        "excerpt": "Les combinés font rêver avec leurs cotes de 50.00. Mais sont-ils réellement profitables ? La réponse mathématique, sans bullshit.",
        "cover": "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1200&q=80&auto=format&fit=crop",
        "tags": ["Combinés", "Stratégie", "Risque"],
        "author": "Équipe WinPulse",
        "read_min": 6,
        "published_at": "2026-01-22T09:00:00+00:00",
        "meta_description": "Combinés ou paris simples : la vérité mathématique, avec exemples chiffrés. Découvre quand un combiné est rentable et quand c'est un piège.",
        "content_md": """## Le débat éternel

"Pourquoi miser 10 000 FCFA sur un pari à 1.80 quand je peux miser 1 000 FCFA sur un combiné à 18.00 ?" — voilà la phrase que chaque parieur s'est posée. La réponse mathématique est nuancée. Décortiquons.

## 1. Comment marche un combiné

Un combiné (parlay) combine plusieurs paris en un seul. **Si une seule sélection perd, tu perds tout**.

**Exemple** : Combiné de 3 matchs à 1.80 chacun.
- Cote totale = 1.80 × 1.80 × 1.80 = **5.83**
- Mise 2 000 FCFA → gain potentiel **11 660 FCFA**

Ça paraît génial. Mais regardons la **probabilité combinée**.

## 2. Le calcul que les bookmakers ne te montrent jamais

Si chaque pari à 1.80 a une probabilité implicite de **55%** :
- Probabilité que les 3 passent = 0.55 × 0.55 × 0.55 = **16.6%**

Donc tu paries 2 000 FCFA, tu as **16.6% de chances** de gagner 11 660 FCFA.

**Espérance mathématique** :
- Gain attendu : 0.166 × 11 660 = **1 936 FCFA**
- Perte attendue : 0.834 × 2 000 = **1 668 FCFA**
- **Espérance nette : +268 FCFA**

Mais attention : ce calcul **présume** que tes paris à 1.80 ont vraiment 55% de chances. Si c'est seulement 53% (très réaliste), l'espérance devient **négative**.

## 3. La marge cachée des combinés

Sur un pari simple, le bookmaker prend environ **5% de marge**.
Sur un combiné de 3, ces marges se **multiplient** : 1.05 × 1.05 × 1.05 = 1.16, soit **16% de marge** prélevée.

Sur un combiné de 6, ça monte à **34%**. Autrement dit, sur chaque 1 000 FCFA misés en combiné 6 légs, **340 FCFA partent dans la poche du bookmaker** avant même que tu joues.

**Plus tu ajoutes de sélections, plus tu paies cher en marge cachée.**

## 4. Quand un combiné EST rentable

Un combiné devient rentable **uniquement** si chaque sélection individuelle est une **value bet** (cote sous-évaluée). Dans ce cas :
- Chaque pari unique a une espérance positive
- Le combiné a une espérance encore plus positive (les values se multiplient)

**Règle d'or WinPulse** : ne combine **jamais** plus de 3 sélections, et **uniquement** des picks où la value est > +6%.

## 5. La règle des 3 combinés WinPulse

Chaque jour, WinPulse publie 3 types de combinés :

### 🟢 Sécurité (cote totale 1.80-2.50)
- 2-3 sélections avec confiance > 75% chacune
- Probabilité combinée : ~55-65%
- Pour : préserver le capital, build un edge régulier

### 🟡 Équilibre (cote totale 2.50-5.00)
- 3 sélections avec confiance 60-75% chacune
- Probabilité combinée : ~35-45%
- Pour : croissance soutenue avec risque modéré

### 🔴 Jackpot (cote totale 5.00+)
- 3-4 sélections à confiance moyenne, MAIS chacune avec value > +10%
- Probabilité combinée : ~15-25%
- Pour : tentatives ponctuelles, mise faible (1-2% bankroll max)

## 6. Le tableau de décision rapide

| Situation | Recommandation |
|-----------|---------------|
| Tu connais bien 1 match | **Pari simple** (mise + élevée) |
| Tu as 2-3 picks à value forte | **Combiné Équilibre** (mise normale) |
| Tu veux du fun + petit gain potentiel | **Combiné Jackpot** (mise faible) |
| Tu veux "blinder" un weekend | **Combiné Sécurité** (mise normale) |
| 4+ matchs où tu as un avis | **Pas de combiné**, fais 4 paris simples |

## 7. Le piège des "système" et "patents"

Les bookmakers proposent des systèmes complexes (Yankee, Trixie, Lucky 15) qui combinent automatiquement plusieurs paris en mini-combinés. **C'est presque toujours un mauvais deal mathématiquement**. La marge prélevée est encore plus élevée.

**Conseil WinPulse** : reste sur des combinés simples (Sécurité, Équilibre, Jackpot) et fuis les "systèmes".

## 8. Résumé en 4 règles

1. ✅ **Combinés simples uniquement** : max 3 sélections
2. ✅ **Que des value bets** : chaque légère doit avoir +6% de value
3. ✅ **Mise inversement proportionnelle au risque** : Sécurité 3%, Équilibre 2%, Jackpot 1%
4. ❌ **Pas de systèmes complexes** (Yankee, Lucky 15, etc.)

---

👉 **[Reçois nos 3 combinés chaque matin à 7h](/app/combos)** — disponibles dès le plan Pro à 4 900 FCFA/mois.
""",
    },

    {
        "slug": "erreurs-debutants-pari-sportif-comment-eviter",
        "title": "Les 7 erreurs des débutants en paris sportifs (et comment les éviter)",
        "excerpt": "Tu débutes ? Évite ces 7 pièges qui ruinent 90% des nouveaux parieurs dans les 6 premiers mois.",
        "cover": "https://images.unsplash.com/photo-1505843490578-27c9b6781018?w=1200&q=80&auto=format&fit=crop",
        "tags": ["Débutants", "Erreurs", "Conseils"],
        "author": "Équipe WinPulse",
        "read_min": 5,
        "published_at": "2026-01-15T09:00:00+00:00",
        "meta_description": "Les 7 erreurs les plus courantes des débutants en paris sportifs et comment les éviter pour rester rentable et jouer responsable.",
        "content_md": """## La règle qui change tout

90% des nouveaux parieurs perdent de l'argent dans les 6 premiers mois. Et 95% perdent dans la première année. Ce n'est pas par hasard : ils commettent **les mêmes erreurs**. Voici les 7 plus mortelles, et exactement comment les éviter.

## Erreur #1 — Parier sans budget défini

**Symptôme** : "Je vais miser 5 000 FCFA cette semaine… mais finalement 10 000 parce que ce match était trop tentant… et 15 000 le weekend parce que je voulais me refaire."

**Solution** : Définis ta **bankroll mensuelle** au début du mois (jamais plus que ce que tu peux te permettre de perdre). Mets-la sur un compte séparé. **N'y touche pas avant la fin du mois**, quelles que soient tes envies.

## Erreur #2 — Suivre son équipe favorite par cœur

**Symptôme** : Tu paries chaque semaine sur les Écureuils ou sur le PSG parce que "ce sont les meilleurs / je les aime / ils ne peuvent pas perdre contre cette équipe".

**Solution** : Sépare **strictement** le supporter et le parieur. Si tu paries sur ton équipe, fais-le **uniquement** quand les stats te donnent raison. Sinon, abstiens-toi.

**Astuce avancée** : c'est souvent **plus rentable de parier contre ton équipe** quand elle est surcotée par les bookmakers (les autres supporters font monter la cote des adversaires).

## Erreur #3 — Le "chasing losses" (poursuite des pertes)

**Symptôme** : Tu perds 5 000 FCFA dans l'après-midi → tu doubles ta mise sur le match du soir pour te refaire → tu perds encore → tu mises tout sur un combiné à 10 légs en désespoir.

**Solution** : **Stop-loss obligatoire**. Si tu perds 15% de ta bankroll dans la journée, tu fermes l'app et tu reviens demain. Pas de discussion.

## Erreur #4 — Ne pas comparer les cotes

**Symptôme** : Tu paries toujours chez le même bookmaker par habitude.

**Solution** : Avant chaque pari, vérifie la cote sur **au moins 3 bookmakers différents**. La différence peut atteindre **0.20 à 0.30** sur le même pari. Sur 100 paris à 100 unités, ça représente **+1 500 unités** de gains supplémentaires.

## Erreur #5 — Croire aux "tipsters" gratuits sur les réseaux sociaux

**Symptôme** : Tu suis un compte WhatsApp / Telegram / Instagram qui promet "100% gagnant" et tu paies 20 000 FCFA pour un "groupe VIP secret".

**Solution** : 99% de ces tipsters sont des **arnaques**. Ils utilisent des techniques de "tipping inversé" : ils envoient le pari A à la moitié des followers et le pari B à l'autre moitié. Une moitié gagne toujours et devient cliente.

**Comment vérifier un vrai tipster ?**
- Track record **public et automatique** (pas une capture d'écran modifiable)
- Mise unitaire constante
- Au moins **300 picks publiés** avec dates et résultats
- ROI affiché et stable sur 12 mois minimum

C'est exactement ce que WinPulse publie : **track record automatique**, vérifiable à tout moment.

## Erreur #6 — Combiner trop de sélections

**Symptôme** : Tu mises 500 FCFA sur un combiné de 8 matchs à cote totale de 280.00 parce que "ça peut faire 140 000 !"

**Solution** : Les probabilités d'un combiné de 8 paris à 1.60 chacun (donc à 62% de chances chacun) :
- Probabilité combinée = 0.62^8 = **2.3%**
- Tu as **97.7% de chances de perdre** ta mise.

**Règle WinPulse** : max **3 sélections** par combiné. Au-delà, le ratio risque/gain est désastreux.

## Erreur #7 — Ne pas tenir de journal de paris

**Symptôme** : Tu paries 50 fois par mois mais tu ne sais pas vraiment ton win rate, ton ROI ou ton meilleur marché.

**Solution** : Tiens un **tableur** (Excel, Google Sheets) avec ces colonnes :
- Date
- Match / Marché
- Cote
- Mise
- Résultat (Gain / Perte)
- Notes (raisons du pari)

Après 100 paris, tu **vois** où tu perds le plus et où tu gagnes. C'est la base.

**Astuce** : sur WinPulse Pro, ton tableau de paris est rempli **automatiquement** et tu vois tes stats personnelles en temps réel.

## Bonus — La règle des 3 questions à se poser AVANT chaque pari

Avant chaque clic "Valider", pose-toi ces 3 questions :
1. **Est-ce que je connais les 2 équipes ?** (sinon, abstention)
2. **Est-ce que cette cote a une value > +6% ?** (sinon, abstention)
3. **Est-ce que je peux me permettre de perdre cette mise sans broncher ?** (sinon, baisse la mise)

Si tu réponds "oui" aux 3, tu peux y aller. Sinon, **patience**.

---

👉 **[Crée ton compte gratuit](/register)** et reçois nos 3 combinés du jour + 1 pick gratuit chaque matin — sans débourser un franc CFA.
""",
    },

    # ---- NEW: Mercato / actu ----
    {
        "slug": "mercato-ete-2026-top-transferts-a-suivre",
        "title": "Mercato été 2026 : le top 10 des transferts à suivre pour tes paris",
        "excerpt": "Kylian Mbappé, Erling Haaland, Bellingham… Voici les mouvements du mercato qui vont bouger les cotes cette saison.",
        "cover": "https://images.unsplash.com/photo-1522778119026-d647f0596c20?w=1200&q=80&auto=format&fit=crop",
        "tags": ["Mercato", "Football", "Analyse"],
        "author": "Équipe WinPulse",
        "read_min": 5,
        "published_at": "2026-06-28T09:00:00+00:00",
        "meta_description": "Top 10 des transferts du mercato été 2026 à surveiller pour anticiper les cotes des bookmakers en Ligue 1, Premier League, La Liga et Serie A.",
        "content_md": """## Pourquoi le mercato est LE facteur oublié dans le pari sportif

La majorité des parieurs regardent la forme, le classement, les blessures. Mais **90% des cotes de début de saison sont calées sur les rosters de la saison précédente**. C'est là qu'on peut prendre les bookmakers de vitesse.

Voici les 10 mouvements qui vont **changer les cotes** dès la reprise 2026-2027.

## 1. Le PSG et le poste de N°9

Le Paris Saint-Germain cherche un attaquant depuis le départ de Mbappé. Les cibles chaudes : **Victor Osimhen (Napoli)**, **Rasmus Højlund (Manchester United)**, **Serhou Guirassy (Dortmund)**. Chacun a un profil radicalement différent — Osimhen dominant dans les airs, Højlund pivot moderne, Guirassy finisseur pur.

**Impact bookmakers** : si le PSG signe Osimhen, ses cotes sur "buteur premier match" et "victoire Ligue 1" chutent de ~15%. Anticipe.

## 2. Bellingham, la rumeur qui ne meurt pas

Jude Bellingham serait courtisé par le City et Liverpool. Un départ du Real ferait plonger les cotes "vainqueur Liga" du club madrilène de 1.35 à ~1.65 dans les premières semaines.

## 3. Les frères Diamant africains

Trois talents africains à surveiller :
- **Rayan Cherki (OL → Bayer Leverkusen ?)** : profil unique, va faire exploser les cotes "buteur/passeur" de son nouveau club
- **Karim Adeyemi (Dortmund → ?)** : vitesse pure, va faire monter les cotes "over 2.5 buts" partout où il joue
- **Ademola Lookman (Atalanta → ?)** : Ballon d'or Africain 2025, sa nouvelle destination change les équilibres Serie A

## 4. La Ligue 1 se prépare à recevoir des stars

Le nouveau propriétaire de l'OM investit massivement. Rumeurs : **Adrien Rabiot en libre**, **Nabil Bentaleb**, et surtout un attaquant top-6 européen. Bookmakers vont réviser les cotes marseillaises à la baisse.

## 5. Manchester United vend, ne recrute plus

INEOS a décidé de faire le ménage : Antony, Casemiro, Sancho sur le départ. **Attention aux paris sur ManU en début de saison** — les cotes ne reflètent pas encore l'instabilité vestiaire. Miser sur le nul ou l'adversaire jusqu'en novembre.

## Notre stratégie mercato

Chez WinPulse, on met à jour notre modèle IA **hebdomadairement** avec les mouvements confirmés. Les cotes bookmakers mettent 3 à 5 semaines à s'adapter — c'est là qu'on chasse la **value**.

---

👉 **[Rejoins-nous](/register)** pour recevoir chaque semaine nos alertes value bet directement dans ta boîte mail (offert avec le plan Pro).
""",
    },
    {
        "slug": "actu-can-cameroun-2026-groupes-favoris-outsiders",
        "title": "CAN Cameroun 2026 : les groupes, favoris et outsiders à surveiller",
        "excerpt": "Le tirage au sort de la CAN 2026 a livré son verdict. Voici nos analyses groupe par groupe, avec les paris à privilégier.",
        "cover": "https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?w=1200&q=80&auto=format&fit=crop",
        "tags": ["CAN 2026", "Football", "Analyse"],
        "author": "Équipe WinPulse",
        "read_min": 7,
        "published_at": "2026-06-25T09:00:00+00:00",
        "meta_description": "Analyse complète des groupes de la CAN Cameroun 2026 : favoris, outsiders, meilleures cotes et pronostics WinPulse pour chaque groupe.",
        "content_md": """## Un tirage explosif pour la CAN 2026

Le tirage au sort de la CAN Cameroun 2026 est tombé et il promet du spectacle. Le **Cameroun (pays hôte)** hérite d'un groupe abordable, tandis que **le groupe C fait figure de "groupe de la mort"**. Analyse détaillée.

## Groupe A — Cameroun, Cap-Vert, Guinée équatoriale, Comores

Le Cameroun a la mission historique de gagner à domicile. Avec Onana dans les buts et Mbeumo devant, les Lions Indomptables partent favoris (**cote WinPulse : 1.65**).

**Notre pari du groupe** : Cap-Vert qualifié en 2e position. La sélection cap-verdienne monte en puissance depuis 3 tournois. Cote actuelle chez les bookmakers : **2.80** — nous estimons la vraie cote à **2.10**.

## Groupe B — Sénégal, Algérie, Zambie, Malawi

Le choc **Sénégal vs Algérie** dès le 2e journée sera l'un des matchs les plus regardés. Sadio Mané et Ismaïla Sarr en face de Riyad Mahrez, Baghdad Bounedjah et la nouvelle génération algérienne.

**Notre analyse IA** : Match nul très probable (cote 3.10). Les 2 sélections vont privilégier de ne pas perdre. **Value bet : Under 2.5 buts** — cote 1.90.

## Groupe C — Le groupe de la mort

Maroc, Côte d'Ivoire, Ghana, Tunisie. **4 équipes qui peuvent toutes gagner la CAN**. Impossible de prédire qui passera. Notre stratégie : parier sur les buts (**Over 1.5 dans les 6 matchs du groupe**).

## Groupe D — Nigeria, Égypte, Burkina, Ouganda

Nigeria et Égypte sont favorites, mais attention au Burkina Faso qui a un noyau très solide. **Pari WinPulse** : Burkina qualifié en 2e (cote 3.40, valeur réelle 2.60).

## Groupe E — Bénin ?!

Grande nouvelle : notre équipe nationale, **les Écureuils du Bénin**, est qualifiée pour la CAN 2026. On les retrouve dans un groupe abordable avec la RDC, l'Angola et le Kenya.

**Notre coup de coeur** : Bénin sort de son groupe en 3e des meilleurs troisièmes. Cote actuelle **6.00**, valeur réelle selon notre modèle : **3.80**. C'est LA value du tournoi.

## Notre pronostic final

Vainqueur CAN 2026 selon notre IA :
1. **Maroc** — cote 4.50 (valeur réelle 3.20) ✅
2. **Nigeria** — cote 5.00 (valeur réelle 4.80)
3. **Sénégal** — cote 6.00 (valeur réelle 6.50)

---

👉 **[Passe Pro](/register)** pour recevoir chaque matin des CAN 2026 nos combinés dédiés avec les meilleures cotes bookmakers du jour.
""",
    },
    {
        "slug": "wimbledon-2026-comment-parier-tennis-grand-chelem",
        "title": "Wimbledon 2026 : notre méthode pour parier sur le Grand Chelem",
        "excerpt": "Alcaraz, Sinner, Djokovic… Voici les marchés tennis rentables pendant Wimbledon et notre stratégie WinPulse.",
        "cover": "https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=1200&q=80&auto=format&fit=crop",
        "tags": ["Tennis", "Wimbledon", "Grand Chelem"],
        "author": "Équipe WinPulse",
        "read_min": 5,
        "published_at": "2026-06-30T09:00:00+00:00",
        "meta_description": "Guide complet pour parier sur Wimbledon 2026 : favoris, outsiders, marchés rentables (sets, jeux, break) et stratégie de mise WinPulse.",
        "content_md": """## Wimbledon, le tournoi le plus prévisible… et le plus piégeux

Le gazon anglais est un terrain particulier. **Les serveurs surpuissants dominent**, mais les surprises sont rares — plus rares que sur terre battue.

C'est cette combinaison qui rend Wimbledon **rentable à parier** — si tu sais quels marchés jouer.

## Les 3 marchés WinPulse pour Wimbledon

### 1. Vainqueur du match (mais pas n'importe quel joueur)

**Statistique clé** : les tops 10 mondiaux gagnent 92% de leurs matchs contre les 100+ du classement à Wimbledon (contre 84% en général).

**Notre pari** : combiner 3-4 favoris top-10 en début de tournoi. Cote combinée moyenne : **2.30 à 3.10**. Taux de réussite historique WinPulse : **78%**.

### 2. Nombre de sets

Les matchs Wimbledon vont souvent en 3-4 sets à cause du service. **Le marché "Match en moins de 4 sets"** est régulièrement sous-coté chez les bookmakers.

**Exemple concret** : Alcaraz vs un joueur classé 50+ → cote "Sans 5e set" à 1.45 alors que la stat historique est 1.30.

### 3. Nombre de jeux

Wimbledon = beaucoup de tie-breaks. Le marché **"+22.5 jeux dans le match"** est notre préféré. Cote moyenne 1.85, taux de succès WinPulse : **72%**.

## Nos coups de coeur 2026

- **Carlos Alcaraz** : le favori absolu (cote 2.20). Son jeu convient parfaitement au gazon.
- **Jannik Sinner** : cote 3.40, mais attention à sa condition physique.
- **Novak Djokovic** : cote 5.00. À 39 ans, il reste dangereux — surtout sur cette surface.

**Outsider WinPulse** : **Ben Shelton** — sa puissance de service peut le porter loin. Cote 15.00, valeur réelle estimée 12.00.

## Stratégie de mise

- **Bankroll dédiée Wimbledon** : 5-10% de ta bankroll totale
- **Mise unitaire** : 1-2% par pari
- **Nombre de paris/jour** : max 4-5

---

👉 **[Ouvre ton compte gratuit](/register)** — chaque matin de Wimbledon, on t'envoie nos 3 picks du jour avec analyse détaillée.
""",
    },
    {
        "slug": "mtn-mobile-money-parier-benin-guide-2026",
        "title": "MTN Mobile Money & pari sportif au Bénin : le guide 2026",
        "excerpt": "Comment déposer, retirer et parier en toute sécurité avec MoMo au Bénin. Les frais, les astuces, les pièges.",
        "cover": "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1200&q=80&auto=format&fit=crop",
        "tags": ["MoMo", "Bénin", "Paiement"],
        "author": "Équipe WinPulse",
        "read_min": 4,
        "published_at": "2026-06-20T09:00:00+00:00",
        "meta_description": "Guide complet MTN Mobile Money 2026 pour les parieurs béninois : dépôts, retraits, frais, sécurité et bonnes pratiques.",
        "content_md": """## MTN MoMo, l'infrastructure de paiement du Bénin

**Au Bénin, 8 parieurs sur 10 utilisent MTN Mobile Money**. C'est rapide, ça marche 24/7, et c'est disponible dans presque tous les quartiers de Cotonou, Porto-Novo, Parakou et Abomey-Calavi.

Mais il y a des règles à connaître pour ne pas se faire avoir.

## Étape 1 : Créer un compte MTN MoMo

Si tu n'as pas encore de compte MoMo :
1. Va dans une agence MTN avec ta CNI
2. Demande "Activation Mobile Money"
3. Choisis un code PIN à 4 chiffres — **jamais** ton année de naissance
4. Reçois ton compte activé sous 15 min

## Étape 2 : Déposer sur WinPulse

Sur WinPulse, notre process est ultra simple :
1. Choisis ton abonnement (**Pro 4 900 FCFA** ou **Elite 14 900 FCFA**)
2. Envoie le montant au numéro marchand : **+229 01 66 28 06 03** (KOUKPAKI VIANEY)
3. Note la référence du transfert
4. Colle-la dans notre formulaire
5. Ton compte est activé sous 30 min

## Frais MTN MoMo à connaître

| Opération | Frais |
|---|---|
| Dépôt agent → compte | 0.5% |
| Transfert compte → compte MTN | 1.0% |
| Retrait agent | 1.5% |
| Transfert vers Moov/autre opérateur | 2.0% |

**Notre astuce** : privilégie les transferts MTN → MTN pour économiser 50% de frais.

## Sécurité : les pièges à éviter

⚠️ **Attention aux arnaques classiques** :
1. Faux SMS "MTN Bonus" : ne clique JAMAIS sur un lien reçu par SMS
2. Faux agents WhatsApp : notre seul numéro support est **+33 7 67 97 17 52**
3. Codes promo "gratuits" en échange de ton PIN : **jamais donner ton PIN à qui que ce soit**

## Pourquoi WinPulse et pas un bookmaker classique ?

Chez les bookmakers 1xBet, Betwinner, Melbet, tu vas payer :
- Frais de dépôt : 1-2%
- Frais de retrait : 3-5%
- Attente retrait : jusqu'à 72h

Avec WinPulse, tu paies **une seule fois par mois** ton abonnement (4 900 ou 14 900 FCFA), et tu utilises nos pronostics chez le bookmaker de ton choix.

**Calcul rapide** : si tu paries 100 000 FCFA/mois, tu économises **3 000 à 7 000 FCFA de frais** en passant par WinPulse.

---

👉 **[Crée ton compte gratuit maintenant](/register)** et paie ton abonnement en 2 minutes via MoMo.
""",
    },
]

CATEGORIES = {"Guides", "Méthode", "Probabilités", "Résultats", "Actualités", "Mercato", "Déclarations"}

NEWS_CATEGORIES = {"Actualités", "Mercato", "Déclarations"}

SPORTS = {"", "Football", "Basketball", "Tennis", "Rugby", "Hockey", "Athlétisme", "Sports mécaniques", "Autres sports"}

class BlogConflictError(Exception):
    pass

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def slugify(value):
    value = value.replace("’", "-").replace("'", "-")
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")[:120].rstrip("-")

def safe_cover(value):
    if not isinstance(value, str):
        raise ValueError("L’image doit être une URL ou un chemin relatif.")
    value = value.strip()
    if not value:
        return ""
    if len(value) > 1000 or re.search(r"[\s\\\x00-\x1f]", value):
        raise ValueError("URL d’image invalide.")
    if value.startswith("/") and not value.startswith("//"):
        return value
    parsed = urlsplit(value)
    if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password:
        return value
    raise ValueError("Utilise une image HTTPS ou un chemin commençant par /.")

def validate_post(data):
    cleaned = {}
    for key, minimum, maximum in (("title", 8, 160), ("excerpt", 20, 360), ("content", 80, 40000)):
        value = data.get(key)
        if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
            raise ValueError(f"{key} doit contenir entre {minimum} et {maximum} caractères.")
        cleaned[key] = value.strip()
    slug = data.get("slug") or slugify(cleaned["title"])
    if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug) or len(slug) > 120:
        raise ValueError("Le lien doit contenir uniquement des lettres minuscules, chiffres et tirets.")
    cleaned["slug"] = slug
    cleaned["cover"] = safe_cover(data.get("cover", ""))
    category = data.get("category", "Guides")
    if category not in CATEGORIES:
        raise ValueError("Catégorie inconnue.")
    cleaned["category"] = category
    tags = data.get("tags", [])
    if not isinstance(tags, list) or len(tags) > 6 or any(not isinstance(t, str) or not 1 <= len(t.strip()) <= 40 for t in tags):
        raise ValueError("Ajoute au maximum six tags de 1 à 40 caractères.")
    cleaned["tags"] = list(dict.fromkeys(t.strip() for t in tags))
    status = data.get("status", "draft")
    if status not in {"draft", "published"}:
        raise ValueError("Le statut doit être draft ou published.")
    cleaned["status"] = status
    sport = data.get("sport", "")
    if sport not in SPORTS:
        raise ValueError("Sport inconnu.")
    cleaned["sport"] = sport
    source = data.get("source_url", "")
    if not isinstance(source, str):
        raise ValueError("Le lien de la source doit être une URL HTTPS.")
    source = safe_cover(source)
    if source and not source.startswith("https://"):
        raise ValueError("Le lien de la source doit être une URL HTTPS.")
    cleaned["source_url"] = source
    name = data.get("source_name", "")
    if not isinstance(name, str) or len(name.strip()) > 120:
        raise ValueError("Le nom de la source doit contenir au maximum 120 caractères.")
    cleaned["source_name"] = name.strip()
    information_date = data.get("information_date", "")
    if not isinstance(information_date, str):
        raise ValueError("La date de l’information est invalide.")
    if information_date:
        try:
            parsed_date = datetime.strptime(information_date, "%Y-%m-%d")
            if parsed_date.strftime("%Y-%m-%d") != information_date:
                raise ValueError()
        except ValueError:
            raise ValueError("La date de l’information doit être au format AAAA-MM-JJ.")
    cleaned["information_date"] = information_date
    if category in NEWS_CATEGORIES and status == "published" and not (source and cleaned["source_name"] and information_date):
        raise ValueError("Pour publier une actualité, un mercato ou une déclaration, indique la source, son lien et la date de l’information.")
    cleaned["read_min"] = max(1, math.ceil(len(re.findall(r"\S+", cleaned["content"])) / 200))
    return cleaned

def public_filter():
    return {"status": "published", "published_at": {"$ne": None, "$lte": now_iso()}}

def serialize_post(doc, full=False, admin=False):
    keys = ("slug", "title", "excerpt", "cover", "category", "sport", "tags", "published_at", "updated_at", "read_min", "author", "source_url", "source_name", "information_date", "kind", "auto_generated", "source_date_kind", "source_seen_at", "collector")
    result = {key: doc.get(key) for key in keys}
    result["id"] = str(doc["_id"])
    provided = doc.get("cover")
    try:
        cover = safe_cover(provided) if isinstance(provided, str) else ""
    except ValueError:
        cover = ""
    result["cover"] = cover or default_blog_cover(doc.get("sport") or "")
    result["cover_kind"] = "provided" if cover and not cover.startswith("/api/blog/covers/") else "illustration"
    result["cover_alt"] = ("Illustration WNPulse · " + (doc.get("sport") or "Guides et analyses")) if result["cover_kind"] == "illustration" else doc.get("title", "")
    result["fallback_cover"] = default_blog_cover(doc.get("sport") or "")
    for alias in ("image", "image_url", "thumbnail", "cover_image", "cover_url", "imageUrl"):
        result[alias] = result["cover"]
    if full:
        result["content"] = doc.get("content", "")
        result["body"] = result["content"]  # Compatibility with simple existing readers.
    if admin:
        result.update(status=doc.get("status"), revision=doc.get("revision", 1))
    return result

async def list_posts(db, limit=50, admin=False, category=None, sport=None):
    query = {"status": {"$ne": "deleted"}} if admin else public_filter()
    if category:
        if category not in CATEGORIES:
            raise ValueError("Catégorie inconnue.")
        query["category"] = category
    if sport:
        if sport not in SPORTS:
            raise ValueError("Sport inconnu.")
        query["sport"] = sport
    projection = None if admin else {"content": 0}
    cursor = db.blog_posts.find(query, projection).sort([("published_at", -1), ("created_at", -1), ("_id", 1)])
    docs = await cursor.limit(limit).to_list(length=limit)
    count = await db.blog_posts.count_documents(query)
    return {"posts": [serialize_post(doc, full=admin, admin=admin) for doc in docs], "count": count}

async def get_post(db, slug):
    doc = await db.blog_posts.find_one({**public_filter(), "slug": slug})
    if not doc:
        raise LookupError("Cet article n’est pas disponible.")
    return {"post": serialize_post(doc, full=True)}

async def save_post(db, data, author_id, post_id=None):
    cleaned = validate_post(data)
    now = now_iso()
    if post_id is None:
        doc = {"_id": str(uuid.uuid4()), **cleaned, "author": "WinPulse", "created_by": author_id,
               "created_at": now, "updated_at": now, "published_at": now if cleaned["status"] == "published" else None,
               "revision": 1}
        await db.blog_posts.insert_one(doc)
    else:
        revision = data.get("revision")
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 1:
            raise ValueError("Une version valide est nécessaire pour modifier l’article.")
        previous = await db.blog_posts.find_one({"_id": post_id, "status": {"$ne": "deleted"}})
        if not previous:
            raise LookupError("Article introuvable.")
        # A published date is assigned only when publishing (or re-publishing).
        published = previous.get("published_at")
        if cleaned["status"] == "published" and previous.get("status") != "published":
            published = now
        update = {**cleaned, "updated_at": now, "updated_by": author_id, "published_at": published}
        result = await db.blog_posts.update_one(
            {"_id": post_id, "revision": revision, "status": {"$ne": "deleted"}},
            {"$set": update, "$inc": {"revision": 1}})
        if not result.matched_count:
            raise BlogConflictError("L’article a changé. Recharge la liste avant de le modifier.")
        doc = {**previous, **update, "revision": revision + 1}
    return {"post": serialize_post(doc, full=True, admin=True)}

async def delete_post(db, post_id, revision, author_id):
    result = await db.blog_posts.update_one(
        {"_id": post_id, "revision": revision, "status": {"$ne": "deleted"}},
        {"$set": {"status": "deleted", "updated_at": now_iso(), "updated_by": author_id}, "$inc": {"revision": 1}})
    if not result.matched_count:
        raise BlogConflictError("L’article a changé ou a été supprimé. Recharge la liste.")
    return {"ok": True}

SEED_POSTS = [
    {
        "slug": "comprendre-un-pronostic-winpulse", "category": "Méthode",
        "title": "Ton premier pronostic WinPulse : les informations à regarder",
        "excerpt": "Match, marché, cote, confiance et explication : découvre comment lire une sélection et comprendre ce qu’elle signifie avant de la suivre.",
        "tags": ["WinPulse", "Pronostics", "Débuter"],
        "content": """## Une sélection, plusieurs informations utiles

Un pronostic ne se résume pas au nom d’une équipe. Pour comprendre une sélection WinPulse, regarde la rencontre, la compétition, son horaire, le marché choisi et la cote associée. Ces éléments décrivent une proposition précise, à un moment précis.

La barre de recherche du tableau de bord permet de retrouver une équipe, un pays ou un championnat sans parcourir toute la liste. Ouvre ensuite la fiche de la rencontre pour consulter le détail disponible.

## Commence par le marché

Le marché indique la condition à remplir. Un choix « Vainqueur » et un choix « Plus de 2,5 buts » sur la même rencontre ne décrivent pas le même scénario.

- Vainqueur : l’issue proposée dépend du marché et de ses règles de règlement.
- Total de buts ou de points : le pronostic porte sur le total, au-dessus ou au-dessous d’une ligne.
- Handicap : une correction est appliquée au score pour déterminer l’issue du pari.

Pour le football, le marché 1X2 concerne généralement le temps réglementaire, avec le nul comme troisième issue. Vérifie toujours les règles du bookmaker : une qualification, une victoire après prolongation et une victoire en 90 minutes peuvent être trois marchés distincts.

## La cote situe le choix dans le marché

La cote affichée est une référence observée chez un bookmaker. Elle peut changer entre la publication du pronostic et la consultation de la fiche. Un raisonnement intéressant à une certaine cote peut l’être moins à une cote plus basse.

L’horaire compte aussi : un pronostic à venir et un résultat déjà terminé ne doivent pas être lus de la même façon. Consulte les résultats dans le Track record, pas dans une ancienne capture de la fiche.

## À quoi sert l’explication ?

L’explication aide à comprendre le choix officiel. Le service explicatif de WinPulse utilise les données disponibles pour commenter une sélection existante ; il ne remplace pas le moteur de pronostics et ne modifie pas sa cote ou sa confiance.

Lorsque les données ne permettent pas de parler de blessures, de forme récente ou de classement, une explication sérieuse doit le reconnaître. Une histoire détaillée sans données vérifiables n’apporte pas une meilleure analyse.

## Le bon réflexe avant de suivre une sélection

Vérifie le match, la date, le marché et la cote actuelle, puis lis l’explication. Les badges et les pourcentages sont des indicateurs à interpréter, jamais la certitude d’un résultat.

[Découvrir les résultats publiés](/resultats)
""",
    },
    {
        "slug": "petite-cote-ne-signifie-pas-victoire", "category": "Probabilités",
        "title": "Petite cote ou grande cote : pourquoi aucune ne suffit à choisir",
        "excerpt": "Une cote basse ne rend pas un résultat certain. Apprends à distinguer le prix du marché, la probabilité estimée et la qualité des données.",
        "tags": ["Cotes", "Probabilités", "Méthode"],
        "content": """## La cote est un prix, pas une promesse

Une petite cote correspond à une issue que le marché considère comme relativement probable. Elle ne dit pas que le match est joué d’avance. Un favori peut perdre et une issue moins attendue peut se produire.

Une grande cote exprime généralement une issue jugée moins probable. Chercher uniquement les grandes cotes augmente l’incertitude ; retenir uniquement les petites cotes ne supprime pas cette incertitude.

## Lire la probabilité implicite

Avec une cote décimale, la probabilité implicite brute se calcule par 100 divisé par la cote. Ainsi, 1,50 correspond à environ 66,7 %, 2,00 à 50 % et 2,50 à 40 %.

Ce sont des exemples mathématiques. Ils ne prouvent pas qu’une sélection du site gagnera avec cette fréquence. La probabilité implicite brute inclut l’effet de la marge du bookmaker ; ce n’est pas une mesure indépendante de la vraie probabilité.

## Pourquoi le contexte compte davantage qu’un seuil de cote

Le marché choisi, le nombre de sources de cotes et leur fraîcheur influencent la lecture d’une sélection. Deux propositions à 1,80 peuvent avoir des qualités très différentes si l’une s’appuie sur plusieurs sources récentes et l’autre sur une donnée ancienne.

Dans la Montante WinPulse, la sélection examine plusieurs marchés et des critères de qualité des données. L’objectif est de ne pas choisir un match uniquement parce que sa cote est basse. Si les critères ne permettent pas de retenir deux rencontres, il est préférable d’attendre plutôt que de compléter automatiquement le ticket.

## Ce qu’il faut comparer

- Le marché exact et les conditions de règlement.
- La cote actuelle, pas seulement celle d’une publication passée.
- La disponibilité des données et les limites de l’explication.
- L’historique complet des résultats sur une période suffisamment longue.

## Une sélection intéressante peut perdre

Le résultat d’un match et la qualité d’une méthode sont deux questions différentes. Un pari gagnant ne valide pas à lui seul une méthode, et un pari perdu ne suffit pas à la rejeter. Pour juger le service, consulte les séries complètes plutôt que les seules meilleures journées.

[Consulter le Track record](/resultats)
""",
    },
    {
        "slug": "cote-confiance-edge-comprendre", "category": "Probabilités",
        "title": "Cote, confiance et edge : trois chiffres, trois significations",
        "excerpt": "Distingue la probabilité implicite d’une cote, l’indicateur de confiance du moteur et l’écart affiché dans les value bets.",
        "tags": ["Confiance", "Value bets", "Débuter"],
        "content": """## La cote décrit le prix proposé

La cote est le prix d’une issue chez un bookmaker. La formule 100 / cote donne sa probabilité implicite brute. Par exemple, une cote de 2,00 correspond à 50 % et une cote de 1,80 à environ 55,6 %.

Sur un marché à plusieurs issues, les probabilités implicites brutes peuvent totaliser plus de 100 %. Cet excédent est lié à la marge. Un consensus issu de plusieurs bookmakers peut chercher à tenir compte de cette marge, mais son résultat reste une estimation de marché.

## La confiance doit être interprétée avec prudence

La confiance affichée par un moteur est un indicateur calculé selon sa méthode. Un affichage « 70 % » ne démontre pas à lui seul que sept pronostics sur dix gagneront réellement.

Pour interpréter un pourcentage comme une fréquence attendue, il faut vérifier la calibration : sur de nombreuses sélections annoncées autour de 70 %, quelle proportion a effectivement gagné ? Cette comparaison doit porter sur des pronostics publiés avant les matchs et sur une période distincte de celle utilisée pour régler la méthode.

## L’edge exprime un écart d’estimation

Un value bet désigne une sélection dont la probabilité estimée est supérieure à la probabilité de référence du marché. Si une estimation est de 60 % et la probabilité implicite brute de 50 %, l’écart est de 10 points de pourcentage.

Attention à l’unité affichée par une plateforme. Dix points de probabilité, un écart relatif de 20 % et un rendement espéré ne sont pas la même mesure. Il faut connaître la formule employée avant de comparer les chiffres.

## Un exemple purement théorique

Pour un pari binaire simple, sans remboursement ni règlement partiel, une probabilité supposée de 60 % à une cote de 2,00 donne un rendement espéré de 0,60 × 2,00 − 1 = 0,20, soit 20 % de la mise. Cet exemple dépend entièrement de la justesse du 60 % supposé.

Il ne décrit ni un rendement mesuré de WinPulse, ni un gain promis. Si la vraie probabilité est plus basse que l’estimation, la conclusion peut changer complètement.

## Ce que les trois chiffres permettent de faire

- La cote permet d’identifier le prix observé.
- La confiance aide à lire le signal du moteur, sous réserve de validation historique.
- L’edge aide à comparer une estimation à une référence définie.

Ces indicateurs deviennent plus utiles lorsqu’on connaît leurs sources, leurs formules et leurs limites. Aucun ne remplace la consultation des résultats réellement enregistrés.
""",
    },
    {
        "slug": "combines-montante-deux-usages", "category": "Guides",
        "title": "Combinés et Montante : comprendre les tickets et leur suivi",
        "excerpt": "Les combinés regroupent des sélections ; la Montante organise leur suivi par étapes. Voici comment lire ces deux onglets sans confondre score et certitude.",
        "tags": ["Combinés", "Montante", "Guides"],
        "content": """## Un combiné rassemble plusieurs conditions

Dans un combiné classique, plusieurs sélections constituent un même ticket. Pour qu’il soit gagnant, les conditions prévues par le bookmaker doivent être remplies. Un seul résultat perdu suffit généralement à faire perdre le ticket ; une sélection annulée peut modifier le règlement selon les règles de l’opérateur.

L’onglet Combinés permet de lire les rencontres, leurs marchés et leurs horaires. Consulte chaque sélection séparément : une cote totale attrayante ne remplace pas l’analyse des conditions qui la composent.

## Deux matchs ne rendent pas le résultat certain

Pour deux événements supposés indépendants, la probabilité que les deux conditions soient remplies est le produit de leurs probabilités. Deux estimations de 70 % donneraient ainsi 49 %, et non 70 %.

Il s’agit d’un calcul théorique fondé sur des probabilités supposées justes. Des événements corrélés, une estimation mal calibrée ou des règles particulières peuvent rendre ce calcul inadapté. Le pourcentage calculé n’est pas un taux de réussite observé.

## La Montante ajoute un suivi par étapes

La Montante WinPulse suit une série et les résultats de ses sélections. Le ticket proposé vise deux rencontres retenues selon les critères du service. Lorsque deux rencontres suffisamment qualifiées ne sont pas disponibles, un état d’attente est préférable à une sélection forcée.

Une étape en cours doit rester lisible jusqu’au règlement de ses matchs. Une nouvelle consultation ne doit pas remplacer discrètement les sélections déjà publiées. Un match annulé, en attente et gagné sont trois états différents.

## Le score de sélection n’est pas une chance de victoire

Un score qui classe des propositions sert à les comparer selon les critères du moteur. Il ne doit pas être lu automatiquement comme une probabilité. Un score de qualité élevé ne permet donc pas d’affirmer qu’un ticket a autant de chances de gagner.

## Comment comparer les deux onglets

- Combinés : lis les sélections du ticket, leurs marchés et leurs horaires.
- Montante : vérifie aussi l’étape active, la série et le statut de règlement.
- Dans les deux cas : consulte les explications et l’historique, pas seulement la cote totale.

L’intérêt d’un suivi clair est de comprendre ce qui a été publié, quand et avec quel résultat. Il ne supprime pas la possibilité d’une perte.
""",
    },
    {
        "slug": "lire-track-record-au-dela-gagnants", "category": "Résultats",
        "title": "Le Track record : regarder au-delà des pronostics gagnants",
        "excerpt": "Une sélection de belles réussites ne raconte pas toute l’histoire. Apprends à lire les gagnés, perdus, annulés et en attente sur une période cohérente.",
        "tags": ["Track record", "Résultats", "Transparence"],
        "content": """## Un aperçu donne envie de découvrir ; un historique permet d’évaluer

Les résultats gagnants mis en avant sur l’accueil sont un aperçu. Ils montrent certaines sélections réussies, mais ne représentent pas à eux seuls l’ensemble des pronostics publiés.

Pour évaluer un service, consulte aussi les pronostics perdus et le nombre de rencontres. Une journée avec trois beaux résultats peut paraître impressionnante ; elle doit être replacée dans le total des sélections de cette journée.

## Les statuts ne sont pas interchangeables

- Gagné : la sélection a été réglée comme gagnante.
- Perdu : la sélection a été réglée comme perdante.
- Annulé : le règlement ne doit pas être compté comme une victoire.
- En attente : le résultat n’est pas encore définitivement enregistré.

Si un score final n’est pas encore synchronisé, il faut attendre sa confirmation. Le statut en attente ne doit jamais être transformé en succès par défaut.

## La période et le nombre de sélections comptent

Comparer une semaine à une journée sans préciser les volumes peut induire en erreur. Observe une période définie, le nombre de paris réglés et la répartition des cotes.

Un taux de réussite calculé comme gagnés / (gagnés + perdus) exclut les annulés et les rencontres en attente. Avec huit gagnés et deux perdus, il serait de 80 %. C’est un exemple fictif : il ne s’agit pas du taux mesuré de WinPulse.

## Un taux élevé ne suffit pas

La fréquence des victoires et les cotes doivent être considérées ensemble. Un service qui gagne souvent à de petites cotes et un service qui gagne moins souvent à de plus grandes cotes n’ont pas le même profil. Une simple liste de réussites ne permet pas de les départager.

Si une plateforme affiche un rendement historique, vérifie sa méthode : montants supposés identiques ou variables, cotes à la publication, frais éventuels et règles de règlement. Sans ces informations, le chiffre manque de contexte.

## Vérifie la chronologie

Un historique utile conserve le pronostic publié avant le début du match, sa cote de référence et le résultat enregistré ensuite. Une modification après la rencontre ne doit pas être présentée comme une prédiction faite à l’avance.

## Fais du Track record ton point de départ

Commence par la période qui t’intéresse, regarde les volumes et tous les statuts, puis ouvre quelques rencontres pour comprendre les marchés sélectionnés. Les résultats passés aident à examiner une méthode ; ils ne garantissent pas les prochains résultats.

[Ouvrir le Track record](/resultats)
""",
    },
]

async def bootstrap_blog(db):
    await db.blog_posts.create_index("slug", unique=True)
    await db.blog_posts.create_index([("status", 1), ("published_at", -1)])
    now = now_iso()
    for seed in SEED_POSTS:
        cleaned = validate_post({**seed, "status": "published"})
        await db.blog_posts.update_one(
            {"_id": "seed:" + seed["slug"]},
            {"$setOnInsert": {**cleaned, "author": "WinPulse", "created_at": now, "updated_at": now,
                              "published_at": now, "revision": 1}}, upsert=True)


# Self-hosted, original vector illustrations: no hotlinking, licence ambiguity,
# external image fetch, optional package, or publisher photograph.
BLOG_COVER_VERSION = "2026-10-17-v1"
BLOG_COVERS = {
    "football": ("Football", "football"), "basketball": ("Basketball", "basketball"),
    "tennis": ("Tennis", "tennis"), "rugby": ("Rugby", "rugby"),
    "hockey": ("Hockey", "hockey"), "athletisme": ("Athlétisme", "athletics"),
    "sports-mecaniques": ("Sports mécaniques", "racing"),
    "autres-sports": ("Multisports", "multisport"), "guides": ("Guides & analyses", "guides"),
}

def default_blog_cover(sport=""):
    key = slugify(sport) if sport else "guides"
    if key not in BLOG_COVERS:
        key = "autres-sports" if sport else "guides"
    return f"/api/blog/covers/{key}.svg?v={BLOG_COVER_VERSION}"


def blog_cover_svg(key):
    if key not in BLOG_COVERS:
        raise LookupError("Illustration introuvable.")
    title, kind = BLOG_COVERS[key]
    drawings = {
        "football": '<rect x="710" y="115" width="360" height="400" rx="20"/><path d="M710 315h360M890 115v400"/><circle cx="890" cy="315" r="77"/><circle cx="890" cy="315" r="12" fill="#fb923c"/>',
        "basketball": '<circle cx="890" cy="315" r="170"/><path d="M720 315h340M890 145v340M770 195c200 70 200 170 0 240M1010 195c-200 70-200 170 0 240"/>',
        "tennis": '<circle cx="890" cy="315" r="160"/><path d="M773 204c160 10 160 212 0 222M1007 204c-160 10-160 212 0 222"/>',
        "rugby": '<ellipse cx="890" cy="315" rx="185" ry="110" transform="rotate(-30 890 315)"/><path d="m810 360 160-90m-126 94-21-36m54 17-21-36m54 17-21-36m54 17-21-36"/>',
        "hockey": '<path d="m780 170 125 225h140l-20 48H879L740 195"/><ellipse cx="1000" cy="485" rx="65" ry="18" fill="#fb923c"/>',
        "athletics": '<path d="M690 500c0-310 420-310 420 0M745 500c0-240 310-240 310 0M800 500c0-175 200-175 200 0M855 500c0-100 90-100 90 0"/>',
        "racing": '<path d="M760 485V145h300v190H760"/><path d="M760 145h60v60h60v-60h60v60h60v-60h60v60h-60v65h60v65h-60v-65h-60v65h-60v-65h-60v65h-60v-65h60v-65h-60z" fill="#fb923c" stroke="none"/>',
        "multisport": '<circle cx="890" cy="315" r="160"/><path d="m890 165 35 105 110 5-85 68 28 105-88-60-88 60 28-105-85-68 110-5z"/>',
        "guides": '<rect x="735" y="160" width="310" height="320" rx="24"/><path d="M780 230h220M780 290h160M780 350h200M780 410h120"/>',
    }
    label = html.escape(title)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="Illustration WNPulse : {label}">'
            '<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#020617"/><stop offset="1" stop-color="#172033"/></linearGradient></defs>'
            '<rect width="1200" height="675" fill="url(#bg)"/><circle cx="1140" cy="100" r="370" fill="#f97316" opacity=".08"/>'
            '<path d="M70 80h33l18-24 22 48 18-24h37" fill="none" stroke="#f97316" stroke-width="9" stroke-linecap="round"/>'
            '<text x="218" y="94" font-family="Arial,sans-serif" font-size="38" font-weight="800" fill="#fff">WNPULSE</text>'
            '<rect x="70" y="225" width="70" height="8" rx="4" fill="#f97316"/>'
            f'<text x="70" y="322" font-family="Arial,sans-serif" font-size="52" font-weight="800" fill="#fff">{label}</text>'
            '<text x="70" y="378" font-family="Arial,sans-serif" font-size="26" fill="#cbd5e1">Le sport, sous tous ses angles.</text>'
            f'<g fill="none" stroke="#fb923c" stroke-width="9" stroke-linejoin="round" opacity=".9">{drawings[kind]}</g>'
            '<path d="M70 565h1060" stroke="#334155"/><text x="70" y="612" font-family="Arial,sans-serif" font-size="24" fill="#94a3b8">wnpulse.com</text>'
            '<text x="1130" y="612" text-anchor="end" font-family="Arial,sans-serif" font-size="20" fill="#94a3b8">Illustration éditoriale</text></svg>')


GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

COLLECTOR_ID = "gdelt_sports"

SOURCE_NAMES = {
    "lequipe.fr": "L’Équipe", "eurosport.fr": "Eurosport", "footmercato.net": "Foot Mercato",
    "maxifoot.fr": "Maxifoot", "rmcsport.bfmtv.com": "RMC Sport", "sports.fr": "Sports.fr",
    "afrik-foot.com": "Afrik-Foot", "sofoot.com": "SO FOOT", "france24.com": "France 24",
    "rfi.fr": "RFI", "francetvinfo.fr": "Franceinfo", "olympics.com": "Olympics",
    "basketusa.com": "Basket USA", "basketsession.com": "BasketSession", "bebasket.fr": "BeBasket",
    "tennisactu.net": "Tennis Actu", "welovetennis.fr": "We Love Tennis", "rugbyrama.fr": "Rugbyrama",
    "motorsport.com": "Motorsport", "autohebdo.fr": "Auto Hebdo", "rds.ca": "RDS",
    "radio-canada.ca": "Radio-Canada", "nhl.com": "NHL", "athle.fr": "Fédération française d’athlétisme",
}

FOOTBALL_SOURCES = {"footmercato.net", "maxifoot.fr", "afrik-foot.com", "sofoot.com"}
SPORT_SOURCE_HINTS = {"basketusa.com": "Basketball", "basketsession.com": "Basketball", "bebasket.fr": "Basketball", "tennisactu.net": "Tennis", "welovetennis.fr": "Tennis", "rugbyrama.fr": "Rugby", "motorsport.com": "Sports mécaniques", "autohebdo.fr": "Sports mécaniques", "nhl.com": "Hockey", "athle.fr": "Athlétisme"}

SPORT_WORDS = [
    ("Basketball", r"\b(basket(?:ball)?|nba|wnba|euroleague|euroligue)\b"),
    ("Tennis", r"\b(tennis|atp|wta|wimbledon|roland.garros|djokovic|alcaraz|sinner|swiatek)\b"),
    ("Rugby", r"\b(rugby|top.14|six.nations|all.blacks)\b"),
    ("Hockey", r"\b(hockey|nhl)\b"),
    ("Sports mécaniques", r"\b(formule.1|formula.1|f1|motogp|grand.prix|verstappen|leclerc)\b"),
    ("Athlétisme", r"\b(athletisme|marathon|sprint|athletics)\b"),
    ("Football", r"\b(football|foot|soccer|mercato|ligue.[12]|champions.league|premier.league|liga|bundesliga|serie.a|psg|mbappe|messi|ronaldo|haaland|ballon.d.or)\b"),
    ("Autres sports", r"\b(handball|cyclisme|tour.de.france|volley|natation|boxe|judo|taekwondo|jeux.olympiques|olympiques)\b"),
]

def bounded_env(name, default, minimum, maximum):
    try:
        return max(minimum, min(int(os.environ.get(name, str(default))), maximum))
    except (ValueError, TypeError):
        return default

def config():
    return {
        "enabled": os.environ.get("BLOG_AUTO_NEWS_ENABLED", "true").strip().lower() not in {"0", "false", "no"},
        "interval_minutes": bounded_env("BLOG_AUTO_NEWS_INTERVAL_MINUTES", 30, 30, 360),
        "daily_limit": bounded_env("BLOG_AUTO_NEWS_DAILY_LIMIT", 16, 1, 40),
        "batch_limit": bounded_env("BLOG_AUTO_NEWS_BATCH_LIMIT", 4, 1, 8),
        "per_sport_daily_limit": bounded_env("BLOG_AUTO_NEWS_PER_SPORT_DAILY_LIMIT", 3, 1, 10),
        "max_age_hours": 48,
        "provider": "GDELT",
        "requires_key": False,
    }

def utc_now():
    return datetime.now(timezone.utc)

def parse_date(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        if re.fullmatch(r"\d{8}T\d{6}Z", value):
            return datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        if "T" not in value:
            return None
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except ValueError:
        return None

def normalized_text(value):
    return "".join(character for character in unicodedata.normalize("NFKD", str(value))
                   if not unicodedata.combining(character)).lower()

def canonical_source_url(value):
    if not isinstance(value, str) or len(value) > 1800 or re.search(r"[\s\\\x00-\x1f]", value):
        return None
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.port not in {None, 443}:
            return None
        host = parsed.hostname.lower().rstrip(".")
        try:
            ipaddress.ip_address(host)
            return None  # Links are restricted to named media; never IP literals.
        except ValueError:
            pass
        base = next((domain for domain in SOURCE_NAMES if host == domain or host.endswith("." + domain)), None)
        if not base or not parsed.path or parsed.path == "/":
            return None
        # Remove only common tracking parameters. Preserve identifiers and signatures.
        query = [(key, val) for key, val in parse_qsl(parsed.query, keep_blank_values=True)
                 if not key.lower().startswith("utm_") and key.lower() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}]
        return urlunsplit(("https", host, parsed.path, urlencode(query), "")), base
    except (ValueError, TypeError):
        return None

def sport_and_category(title, domain):
    text = normalized_text(title)
    if re.search(r"\b(casino|code.promo|pronostic.gagnant|gain.garanti)\b", text):
        return None
    sport = next((name for name, pattern in SPORT_WORDS if re.search(pattern, text)), None)
    if not sport:
        sport = "Football" if domain in FOOTBALL_SOURCES else SPORT_SOURCE_HINTS.get(domain)
    if not sport:
        return None
    if re.search(r"\b(mercato|transfert|transfers|recrutement|recrute|signature|pret|rumeur)\b", text):
        category = "Mercato"
    elif re.search(r"[«»]|\b(declare|declaration|conference.de.presse|confie|reagit)\b", text):
        category = "Déclarations"
    else:
        category = "Actualités"
    return sport, category

def candidate(row, now=None):
    now = now or utc_now()
    if not isinstance(row, dict) or str(row.get("language", "")).lower() not in {"french", "fr", "fra"}:
        return None
    raw_title = row.get("title")
    if not isinstance(raw_title, str):
        return None
    title = re.sub(r"\s+", " ", html.unescape(raw_title)).strip()
    if not 15 <= len(title) <= 160 or any(ord(char) < 32 for char in title):
        return None
    result = canonical_source_url(row.get("url"))
    seen = parse_date(row.get("seendate"))
    if not result or not seen or seen > now + timedelta(minutes=5) or seen < now - timedelta(hours=48):
        return None
    url, domain = result
    identified = sport_and_category(title, domain)
    if not identified:
        identified = sport_and_category(title + " " + urlsplit(url).path.replace("/", " ").replace("-", " "), domain)
    if not identified:
        return None
    # Do not turn an explicitly old title into today's story after re-indexing.
    years = re.findall(r"\b(20\d{2})\b", title)
    if years and all(int(year) < now.year - 1 for year in years):
        return None
    sport, category = identified
    return {"title": title, "url": url, "domain": domain, "source": SOURCE_NAMES[domain],
            "sport": sport, "category": category, "seen_at": seen.isoformat(),
            "url_hash": hashlib.sha256(url.encode()).hexdigest(),
            "title_hash": hashlib.sha256(re.sub(r"\W+", " ", normalized_text(title)).strip().encode()).hexdigest()}

SPORT_QUERIES = {
    "Football": '(football OR soccer OR "premier league" OR mercato)',
    "Basketball": '(basketball OR NBA OR WNBA OR euroleague)',
    "Tennis": '(tennis OR ATP OR WTA OR "grand slam")',
    "Rugby": '(rugby OR "six nations" OR "top 14")',
    "Hockey": '(hockey OR NHL)',
    "Athlétisme": '(athletics OR marathon OR sprint)',
    "Sports mécaniques": '("formula 1" OR "formule 1" OR MotoGP OR motorsport)',
    "Autres sports": '(cycling OR handball OR volleyball OR boxing OR swimming)',
}

def query(sport=None):
    # GDELT searches translated text. Publisher filtering happens locally,
    # so the provider query does not depend on a long, fragile domain OR list.
    terms = SPORT_QUERIES.get(sport) or '(football OR basketball OR tennis OR rugby OR hockey OR athletics OR "formula 1")'
    return terms + " sourcelang:french"


def rotate_sport(state):
    sports = list(SPORT_QUERIES)
    try:
        cursor = int(state.get("sport_cursor", 0))
    except (TypeError, ValueError):
        cursor = 0
    return sports[cursor % len(sports)], (cursor + 1) % len(sports)


async def daily_sport_counts(db, day):
    docs = await db.blog_posts.find({"auto_day": day}, {"sport": 1}).limit(1000).to_list(length=1000)
    counts = {}
    for doc in docs:
        key = doc.get("sport") or "Autres sports"
        counts[key] = counts.get(key, 0) + 1
    return counts


def balanced_candidates(rows, counts):
    # Remove local duplicates before picking a first item from each sport.
    unique, urls, titles = [], set(), set()
    for item in sorted(rows, key=lambda row: row["seen_at"], reverse=True):
        if item["url_hash"] in urls or item["title_hash"] in titles:
            continue
        urls.add(item["url_hash"]); titles.add(item["title_hash"]); unique.append(item)
    ordered = []
    totals = dict(counts)
    while unique:
        index = min(range(len(unique)), key=lambda i: totals.get(unique[i]["sport"], 0))
        item = unique.pop(index)
        ordered.append(item)
        totals[item["sport"]] = totals.get(item["sport"], 0) + 1
    return ordered


class ProviderFailure(Exception):
    def __init__(self, code, delay_seconds=900):
        self.code = code
        self.delay_seconds = delay_seconds

def retry_delay(value, now=None):
    now = now or utc_now()
    try:
        delay = int(value)
    except (TypeError, ValueError):
        try:
            date = parsedate_to_datetime(value)
            if not date.tzinfo:
                date = date.replace(tzinfo=timezone.utc)
            delay = int((date - now).total_seconds())
        except (TypeError, ValueError, OverflowError):
            delay = 3600
    return max(900, min(delay, 86400))

async def fetch_candidates(sport=None):
    params = {"query": query(sport), "mode": "artlist", "format": "json", "maxrecords": 100,
              "timespan": "48h", "sort": "datedesc"}
    try:
        async with httpx.AsyncClient(timeout=18, follow_redirects=False) as client:
            # Stream with a hard size limit; a provider failure cannot load an unbounded payload.
            async with client.stream("GET", GDELT_URL, params=params, headers={"User-Agent": "WinPulse-PressReview/1.0"}) as response:
                if response.status_code == 429:
                    raise ProviderFailure("rate_limited", retry_delay(response.headers.get("Retry-After")))
                if response.status_code != 200:
                    raise ProviderFailure("provider_unavailable", 1800)
                chunks, total = [], 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
                    if total > 1500000:
                        raise ProviderFailure("invalid_response", 3600)
                    chunks.append(chunk)
        data = json.loads(b"".join(chunks))
        if not isinstance(data, dict) or not isinstance(data.get("articles"), list):
            raise ProviderFailure("invalid_response", 3600)
        now = utc_now()
        rows = [item for row in data["articles"][:100] if (item := candidate(row, now)) is not None]
        return sorted(rows, key=lambda row: row["seen_at"], reverse=True)
    except ProviderFailure:
        raise
    except (httpx.HTTPError, ValueError, TypeError):
        raise ProviderFailure("provider_unavailable", 1800)

def build_post(item, now=None):
    now = now or utc_now()
    local = now.astimezone(ZoneInfo("Africa/Porto-Novo"))
    seen = parse_date(item["seen_at"])
    seen_local = seen.astimezone(ZoneInfo("Africa/Porto-Novo"))
    headline = re.sub(r"([\\`*_{}\[\]<>#])", r"\\\1", item["title"])
    content = (
        f"## Le titre à la une\n\n{headline}\n\n"
        f"**Sport :** {item['sport']} · **Rubrique :** {item['category']}\n\n"
        f"**Source :** {item['source']}\n\n"
        f"## Lire les faits et le contexte\n\n"
        f"[Ouvrir l’article de {item['source']}]({item['url']})\n\n"
        "Cette fiche de revue de presse signale un titre d’actualité. "
        "Le reportage, les précisions et les éventuelles déclarations sont à consulter chez le média cité. "
        "WNPulse ne reproduit pas le texte intégral et n’invente ni résultat ni citation.\n\n"
        f"Titre repéré le {seen_local.strftime('%d/%m/%Y à %H:%M')} (heure de Porto-Novo). "
        "Ce repérage n’est pas une confirmation de la date de publication originale.\n\n"
        "L’image de couverture est une illustration WNPulse du sport concerné, pas une photographie de l’événement."
    )
    return {"_id": "news:" + item["url_hash"], "slug": "actu-" + (slugify(item["title"])[:92].rstrip("-") or "sport") + "-" + item["url_hash"][:12],
            "title": item["title"], "excerpt": f"{item['sport']} · {item['category']} — {item['title']} Source : {item['source']}.",
            "content": content, "category": item["category"], "sport": item["sport"], "cover": default_blog_cover(item["sport"]),
            "tags": [item["sport"], item["category"], "Revue de presse"], "status": "published", "author": "WinPulse",
            "created_at": now.isoformat(), "updated_at": now.isoformat(), "published_at": now.isoformat(),
            "read_min": 1, "revision": 1, "kind": "news_link", "auto_generated": True,
            "auto_day": local.date().isoformat(), "auto_url_hash": item["url_hash"], "auto_title_hash": item["title_hash"],
            "source_name": item["source"], "source_url": item["url"], "information_date": seen_local.date().isoformat(),
            "source_date_kind": "observed", "source_seen_at": seen.isoformat(), "collector": "GDELT"}

async def bootstrap_news(db):
    await db.blog_posts.create_index("auto_url_hash", unique=True, sparse=True)
    await db.blog_posts.create_index("auto_title_hash", unique=True, sparse=True)
    await db.blog_posts.create_index("auto_day")
    await db.blog_news_state.update_one({"_id": COLLECTOR_ID}, {"$setOnInsert": {"paused": False, "status": "waiting", "last_added": 0}}, upsert=True)
    await db.blog_news_state.update_one(
        {"_id": COLLECTOR_ID, "collector_version": {"$ne": "multisport-v2"}, "paused": {"$ne": True},
         "status": {"$in": ["waiting", "ok", "no_new_items", "daily_limit"]}},
        {"$set": {"collector_version": "multisport-v2", "next_poll_at": utc_now().isoformat()}})


async def news_status(db, scheduler_active=True):
    state = await db.blog_news_state.find_one({"_id": COLLECTOR_ID}) or {}
    settings = config()
    now = utc_now()
    today = now.astimezone(ZoneInfo("Africa/Porto-Novo")).date().isoformat()
    count = await db.blog_posts.count_documents({"auto_day": today})
    per_sport = await daily_sport_counts(db, today)
    until = parse_date(state.get("lease_until"))
    busy = bool(until and until > now and state.get("status") == "running")
    return {**settings, "paused": bool(state.get("paused")), "scheduler_active": bool(scheduler_active),
            "status": "running" if busy else ("interrupted" if state.get("status") == "running" else state.get("status", "waiting")),
            "last_attempt_at": state.get("last_attempt_at"), "last_success_at": state.get("last_success_at"),
            "last_added": state.get("last_added", 0), "today_added": count,
            "sport_counts": per_sport, "target_sport": state.get("target_sport"),
            "last_candidates": state.get("last_candidates", 0), "collector_version": "multisport-v2",
            "cover_provider": "WNPulse self-hosted illustrations",
            "next_poll_at": state.get("next_poll_at"), "last_error": state.get("last_error"), "date": today}

async def set_paused(db, paused):
    if not isinstance(paused, bool):
        raise ValueError("Le réglage paused doit être un booléen.")
    update = {"paused": paused}
    if not paused:
        # Resuming cannot cancel a provider Retry-After or an active lease.
        update["resumed_at"] = utc_now().isoformat()
    await db.blog_news_state.update_one({"_id": COLLECTOR_ID}, {"$set": update}, upsert=True)
    return {"ok": True, "paused": paused}

async def synchronize_news(db, fetcher=None):
    settings = config()
    if not settings["enabled"]:
        return {"status": "disabled", "added": 0}
    now = utc_now()
    state = await db.blog_news_state.find_one({"_id": COLLECTOR_ID}) or {}
    if state.get("paused"):
        return {"status": "paused", "added": 0}
    due = parse_date(state.get("next_poll_at"))
    if due and due > now:
        return {"status": "not_due", "added": 0}
    owner = str(uuid.uuid4())
    try:
        lock = await db.blog_news_state.find_one_and_update(
            {"_id": COLLECTOR_ID, "paused": {"$ne": True}, "$and": [
                {"$or": [{"lease_until": {"$lte": now.isoformat()}}, {"lease_until": {"$exists": False}}]},
                {"$or": [{"next_poll_at": {"$lte": now.isoformat()}}, {"next_poll_at": {"$exists": False}}]},
            ]}, {"$set": {"owner": owner, "lease_until": (now + timedelta(seconds=90)).isoformat(),
                          "status": "running", "last_attempt_at": now.isoformat()}},
            upsert=True, return_document=ReturnDocument.AFTER)
    except DuplicateKeyError:
        return {"status": "busy", "added": 0}
    if not lock or lock.get("owner") != owner:
        return {"status": "busy", "added": 0}
    added, state_update = 0, {}
    try:
        today = now.astimezone(ZoneInfo("Africa/Porto-Novo")).date().isoformat()
        count = await db.blog_posts.count_documents({"auto_day": today})
        if count >= settings["daily_limit"]:
            state_update = {"status": "daily_limit", "last_error": None, "last_added": 0,
                            "next_poll_at": (now + timedelta(minutes=settings["interval_minutes"])).isoformat()}
            return {"status": "daily_limit", "added": 0}
        target_sport, next_cursor = rotate_sport(state)
        await db.blog_news_state.update_one({"_id": COLLECTOR_ID, "owner": owner}, {"$set": {"target_sport": target_sport, "sport_cursor": next_cursor}})
        rows = await asyncio.wait_for(fetcher() if fetcher else fetch_candidates(target_sport), timeout=22)
        per_sport = await daily_sport_counts(db, today)
        existing = await db.blog_posts.find({"auto_generated": True}, {"auto_title_hash": 1, "auto_url_hash": 1}).sort("created_at", -1).limit(1000).to_list(length=1000)
        known_titles = {doc.get("auto_title_hash") for doc in existing}
        known_urls = {doc.get("auto_url_hash") for doc in existing}
        # Exclude previously imported/edited/deleted items before balancing sports.
        rows = [item for item in rows if item["url_hash"] not in known_urls and item["title_hash"] not in known_titles]
        for item in balanced_candidates(rows, per_sport):
            if count + added >= settings["daily_limit"] or added >= settings["batch_limit"]:
                break
            if per_sport.get(item["sport"], 0) >= settings["per_sport_daily_limit"]:
                continue
            if item["url_hash"] in known_urls or item["title_hash"] in known_titles:
                continue
            latest = await db.blog_news_state.find_one({"_id": COLLECTOR_ID}) or {}
            if latest.get("owner") != owner or latest.get("paused"):
                break
            lease = parse_date(latest.get("lease_until"))
            if not lease or lease <= utc_now():
                break
            # Recheck after network delay: midnight must not spend yesterday's budget.
            insert_time = utc_now()
            insert_day = insert_time.astimezone(ZoneInfo("Africa/Porto-Novo")).date().isoformat()
            if insert_day != today:
                break
            try:
                await db.blog_posts.insert_one(build_post(item, insert_time))
            except DuplicateKeyError:
                continue  # Includes tombstones and previously edited/unpublished imports.
            added += 1; known_urls.add(item["url_hash"]); known_titles.add(item["title_hash"])
            per_sport[item["sport"]] = per_sport.get(item["sport"], 0) + 1
        state_update = {"status": "ok" if added else "no_new_items", "last_error": None, "last_added": added,
                        "last_success_at": utc_now().isoformat(), "last_candidates": len(rows), "collector_version": "multisport-v2",
                        "next_poll_at": (utc_now() + timedelta(minutes=settings["interval_minutes"])).isoformat()}
        return {"status": state_update["status"], "added": added}
    except (ProviderFailure, asyncio.TimeoutError) as exc:
        code = getattr(exc, "code", "provider_timeout")
        delay = getattr(exc, "delay_seconds", 1800)
        state_update = {"status": "error", "last_error": code, "last_added": added,
                        "next_poll_at": (utc_now() + timedelta(seconds=delay)).isoformat()}
        return {"status": "error", "error": code, "added": added}
    except asyncio.CancelledError:
        state_update = {"status": "interrupted", "last_error": "interrupted", "last_added": added,
                        "next_poll_at": (utc_now() + timedelta(minutes=15)).isoformat()}
        raise
    except Exception as exc:
        logging.getLogger(__name__).warning("Automatic news failed: %s", type(exc).__name__)
        state_update = {"status": "error", "last_error": "storage_or_service_error", "last_added": added,
                        "next_poll_at": (utc_now() + timedelta(minutes=30)).isoformat()}
        return {"status": "error", "error": "storage_or_service_error", "added": added}
    finally:
        if state_update:
            await asyncio.shield(db.blog_news_state.update_one(
                {"_id": COLLECTOR_ID, "owner": owner},
                {"$set": {**state_update, "lease_until": utc_now().isoformat()}}))
