/**
 * WinPulse — pages légales réunies, version du 15 octobre 2026.
 * À placer dans frontend/src/pages/LegalPage.jsx. Aucun fichier CSS à ajouter.
 * Avant publication : compléter l'identité de l'exploitant, l'adresse postale
 * complète, les informations d'hébergement et la politique de données réelle.
 * Traductions FR / EN / ES / PT / DE / AR reliées au LanguageProvider existant.
 * Ce fichier présente des informations ; il ne change ni le paiement,
 * ni la collecte des consentements, ni les outils d'exercice des droits.
 */
import { useParams, Link, Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/components/AppLayout";
import { Zap, FileText, Shield, Lock, AlertTriangle, Phone, Mail, MapPin } from "lucide-react";

// Renseigner uniquement les informations réelles de l'exploitant.
// Ne pas remplacer les champs manquants par une société ou une adresse fictive.
const COMPANY = {
  name: "WinPulse",
  legalName: "",
  legalForm: "",
  registration: "",
  vatNumber: "",
  fullAddress: "",
  publicationDirector: "",
  city: "Dublin",
  country: "Irlande",
  email: "contact@wnpulse.com",
  phone: "+33767971752",
  whatsapp: "+33767971752",
  domain: "wnpulse.com",
};

const LAST_UPDATE = "2026-10-15";
const ICONS = { FileText, Shield, Lock, AlertTriangle };
const PAGES = {
  "mentions-legales": {
    "icon": "FileText",
    "title": "Mentions légales",
    "subtitle": "Éditeur, hébergement et contacts de WinPulse.",
    "sections": [
      {
        "h": "Éditeur et contact",
        "blocks": [
          {
            "type": "paragraph",
            "text": "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous."
          },
          {
            "type": "company"
          }
        ]
      },
      {
        "h": "Hébergement",
        "blocks": [
          {
            "type": "paragraph",
            "text": "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur."
          },
          {
            "type": "list",
            "items": [
              "Hébergement web : Vercel — coordonnées complètes à renseigner.",
              "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé."
            ]
          }
        ]
      },
      {
        "h": "Propriété intellectuelle",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive."
          }
        ]
      },
      {
        "h": "Nature du service",
        "blocks": [
          {
            "type": "paragraph",
            "text": "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain."
          }
        ]
      },
      {
        "h": "Données et signalements",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable)."
          }
        ]
      }
    ]
  },
  "cgv": {
    "icon": "Shield",
    "title": "Conditions Générales de Vente",
    "subtitle": "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.",
    "sections": [
      {
        "h": "1. Exploitant et champ d’application",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :"
          },
          {
            "type": "company"
          },
          {
            "type": "paragraph",
            "text": "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays."
          }
        ]
      },
      {
        "h": "2. Nature du service",
        "blocks": [
          {
            "type": "paragraph",
            "text": "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée."
          },
          {
            "type": "paragraph",
            "text": "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions."
          },
          {
            "type": "paragraph",
            "text": "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles."
          }
        ]
      },
      {
        "h": "3. Offre gratuite et abonnement Pro",
        "blocks": [
          {
            "type": "paragraph",
            "text": "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée."
          },
          {
            "type": "paragraph",
            "text": "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique."
          },
          {
            "type": "paragraph",
            "text": "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1."
          },
          {
            "type": "paragraph",
            "text": "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants."
          },
          {
            "type": "paragraph",
            "text": "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande."
          },
          {
            "type": "paragraph",
            "text": "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier."
          },
          {
            "type": "paragraph",
            "text": "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée."
          }
        ]
      },
      {
        "h": "4. Commande et paiement",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer."
          },
          {
            "type": "paragraph",
            "text": "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires."
          },
          {
            "type": "paragraph",
            "text": "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande."
          },
          {
            "type": "paragraph",
            "text": "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur."
          },
          {
            "type": "paragraph",
            "text": "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte."
          }
        ]
      },
      {
        "h": "5. Durée, renouvellement et fin d’accès",
        "blocks": [
          {
            "type": "paragraph",
            "text": "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil."
          },
          {
            "type": "paragraph",
            "text": "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant."
          },
          {
            "type": "paragraph",
            "text": "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi."
          }
        ]
      },
      {
        "h": "6. Rétractation et remboursements",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier."
          },
          {
            "type": "paragraph",
            "text": "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire."
          },
          {
            "type": "paragraph",
            "text": "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur."
          },
          {
            "type": "paragraph",
            "text": "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions."
          },
          {
            "type": "paragraph",
            "text": "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires."
          },
          {
            "type": "paragraph",
            "text": "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu."
          }
        ]
      },
      {
        "h": "7. Pronostics, statistiques et risques",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision."
          },
          {
            "type": "paragraph",
            "text": "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté."
          },
          {
            "type": "paragraph",
            "text": "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs."
          },
          {
            "type": "paragraph",
            "text": "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles."
          }
        ]
      },
      {
        "h": "8. Scores Live, vidéos et actualités",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé."
          },
          {
            "type": "paragraph",
            "text": "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier."
          },
          {
            "type": "paragraph",
            "text": "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites."
          }
        ]
      },
      {
        "h": "9. Disponibilité et conformité du service",
        "blocks": [
          {
            "type": "paragraph",
            "text": "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise."
          },
          {
            "type": "paragraph",
            "text": "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement."
          },
          {
            "type": "paragraph",
            "text": "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur."
          }
        ]
      },
      {
        "h": "10. Compte et usage des contenus",
        "blocks": [
          {
            "type": "paragraph",
            "text": "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite."
          },
          {
            "type": "paragraph",
            "text": "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni."
          }
        ]
      },
      {
        "h": "11. Données personnelles et WhatsApp",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables."
          },
          {
            "type": "paragraph",
            "text": "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV."
          },
          {
            "type": "paragraph",
            "text": "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**."
          }
        ]
      },
      {
        "h": "12. Réclamations, droit applicable et litiges",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande."
          },
          {
            "type": "paragraph",
            "text": "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent."
          },
          {
            "type": "paragraph",
            "text": "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs."
          }
        ]
      },
      {
        "h": "13. Évolution des CGV",
        "blocks": [
          {
            "type": "paragraph",
            "text": "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent."
          },
          {
            "type": "paragraph",
            "text": "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi."
          }
        ]
      },
      {
        "h": "Annexe — Modèle de notification de rétractation",
        "blocks": [
          {
            "type": "paragraph",
            "text": "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1."
          },
          {
            "type": "paragraph",
            "text": "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :"
          },
          {
            "type": "list",
            "items": [
              "Référence de commande : …",
              "Date de conclusion du contrat : …",
              "Nom du client : …",
              "Email associé au compte : …",
              "Adresse du client : …",
              "Date de notification : …",
              "Signature, uniquement pour une notification sur papier : … »"
            ]
          }
        ]
      }
    ]
  },
  "confidentialite": {
    "icon": "Lock",
    "title": "Politique de confidentialité",
    "subtitle": "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.",
    "sections": [
      {
        "h": "Responsable du traitement",
        "blocks": [
          {
            "type": "paragraph",
            "text": "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com."
          },
          {
            "type": "company"
          }
        ]
      },
      {
        "h": "Données concernées",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :"
          },
          {
            "type": "list",
            "items": [
              "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.",
              "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.",
              "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.",
              "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences."
            ]
          }
        ]
      },
      {
        "h": "Finalités et bases légales",
        "blocks": [
          {
            "type": "paragraph",
            "text": "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant."
          },
          {
            "type": "paragraph",
            "text": "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres."
          }
        ]
      },
      {
        "h": "Numéro WhatsApp, prospection et communautés",
        "blocks": [
          {
            "type": "paragraph",
            "text": "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique."
          },
          {
            "type": "paragraph",
            "text": "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres."
          }
        ]
      },
      {
        "h": "Destinataires et prestataires",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique."
          },
          {
            "type": "list",
            "items": [
              "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.",
              "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.",
              "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.",
              "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques."
            ]
          }
        ]
      },
      {
        "h": "Lecteur vidéo, cookies et stockage local",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences."
          },
          {
            "type": "paragraph",
            "text": "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers."
          },
          {
            "type": "paragraph",
            "text": "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs."
          }
        ]
      },
      {
        "h": "Conservation et transferts",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant."
          },
          {
            "type": "paragraph",
            "text": "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties."
          }
        ]
      },
      {
        "h": "Vos droits et réclamations",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales."
          },
          {
            "type": "paragraph",
            "text": "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire."
          },
          {
            "type": "paragraph",
            "text": "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée."
          }
        ]
      },
      {
        "h": "Sécurité et estimations sportives",
        "blocks": [
          {
            "type": "paragraph",
            "text": "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page."
          },
          {
            "type": "paragraph",
            "text": "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com."
          }
        ]
      }
    ]
  },
  "jeu-responsable": {
    "icon": "AlertTriangle",
    "title": "Jeu responsable",
    "subtitle": "Comprendre les limites des pronostics et garder le contrôle.",
    "sections": [
      {
        "h": "Un service réservé aux personnes majeures",
        "blocks": [
          {
            "type": "paragraph",
            "text": "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur."
          }
        ]
      },
      {
        "h": "Aucun résultat n’est garanti",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres."
          },
          {
            "type": "paragraph",
            "text": "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes."
          }
        ]
      },
      {
        "h": "Garder le contrôle",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress."
          }
        ]
      },
      {
        "h": "Quand demander de l’aide",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié."
          },
          {
            "type": "paragraph",
            "text": "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés."
          }
        ]
      },
      {
        "h": "Compte et communications",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément."
          },
          {
            "type": "paragraph",
            "text": "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique."
          }
        ]
      }
    ]
  }
};

// Traductions intégrées : un seul fichier à déployer, même sans catalogue serveur.
const LEGAL_MESSAGES = {
  "fr": {
    "Mentions légales": "Mentions légales",
    "Éditeur, hébergement et contacts de WinPulse.": "Éditeur, hébergement et contacts de WinPulse.",
    "Éditeur et contact": "Éditeur et contact",
    "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous.": "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous.",
    "Hébergement": "Hébergement",
    "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur.": "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur.",
    "Hébergement web : Vercel — coordonnées complètes à renseigner.": "Hébergement web : Vercel — coordonnées complètes à renseigner.",
    "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé.": "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé.",
    "Propriété intellectuelle": "Propriété intellectuelle",
    "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive.": "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive.",
    "Nature du service": "Nature du service",
    "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain.": "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain.",
    "Données et signalements": "Données et signalements",
    "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable).": "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable).",
    "Conditions Générales de Vente": "Conditions Générales de Vente",
    "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.": "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.",
    "1. Exploitant et champ d’application": "1. Exploitant et champ d’application",
    "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :": "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :",
    "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays.": "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays.",
    "2. Nature du service": "2. Nature du service",
    "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée.": "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée.",
    "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions.": "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions.",
    "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles.": "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles.",
    "3. Offre gratuite et abonnement Pro": "3. Offre gratuite et abonnement Pro",
    "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée.": "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée.",
    "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique.": "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique.",
    "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1.": "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1.",
    "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants.": "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants.",
    "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande.": "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande.",
    "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier.": "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier.",
    "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée.": "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée.",
    "4. Commande et paiement": "4. Commande et paiement",
    "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer.": "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer.",
    "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires.": "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires.",
    "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande.": "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande.",
    "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur.": "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur.",
    "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte.": "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte.",
    "5. Durée, renouvellement et fin d’accès": "5. Durée, renouvellement et fin d’accès",
    "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil.": "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil.",
    "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant.": "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant.",
    "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi.": "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi.",
    "6. Rétractation et remboursements": "6. Rétractation et remboursements",
    "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier.": "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier.",
    "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire.": "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire.",
    "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur.": "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur.",
    "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions.": "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions.",
    "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires.": "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires.",
    "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu.": "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu.",
    "7. Pronostics, statistiques et risques": "7. Pronostics, statistiques et risques",
    "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision.": "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision.",
    "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté.": "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté.",
    "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs.": "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs.",
    "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles.": "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles.",
    "8. Scores Live, vidéos et actualités": "8. Scores Live, vidéos et actualités",
    "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé.": "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé.",
    "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier.": "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier.",
    "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites.": "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites.",
    "9. Disponibilité et conformité du service": "9. Disponibilité et conformité du service",
    "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise.": "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise.",
    "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement.": "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement.",
    "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur.": "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur.",
    "10. Compte et usage des contenus": "10. Compte et usage des contenus",
    "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite.": "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite.",
    "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni.": "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni.",
    "11. Données personnelles et WhatsApp": "11. Données personnelles et WhatsApp",
    "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables.": "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables.",
    "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV.": "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV.",
    "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**.": "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**.",
    "12. Réclamations, droit applicable et litiges": "12. Réclamations, droit applicable et litiges",
    "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande.": "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande.",
    "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent.": "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent.",
    "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs.": "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs.",
    "13. Évolution des CGV": "13. Évolution des CGV",
    "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent.": "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent.",
    "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi.": "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi.",
    "Annexe — Modèle de notification de rétractation": "Annexe — Modèle de notification de rétractation",
    "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1.": "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1.",
    "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :": "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :",
    "Référence de commande : …": "Référence de commande : …",
    "Date de conclusion du contrat : …": "Date de conclusion du contrat : …",
    "Nom du client : …": "Nom du client : …",
    "Email associé au compte : …": "Email associé au compte : …",
    "Adresse du client : …": "Adresse du client : …",
    "Date de notification : …": "Date de notification : …",
    "Signature, uniquement pour une notification sur papier : … »": "Signature, uniquement pour une notification sur papier : … »",
    "Politique de confidentialité": "Politique de confidentialité",
    "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.": "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.",
    "Responsable du traitement": "Responsable du traitement",
    "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com.": "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com.",
    "Données concernées": "Données concernées",
    "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :": "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :",
    "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.": "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.",
    "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.": "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.",
    "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.": "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.",
    "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences.": "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences.",
    "Finalités et bases légales": "Finalités et bases légales",
    "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant.": "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant.",
    "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres.": "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres.",
    "Numéro WhatsApp, prospection et communautés": "Numéro WhatsApp, prospection et communautés",
    "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique.": "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique.",
    "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres.": "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres.",
    "Destinataires et prestataires": "Destinataires et prestataires",
    "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique.": "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique.",
    "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.": "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.",
    "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.": "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.",
    "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.": "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.",
    "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques.": "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques.",
    "Lecteur vidéo, cookies et stockage local": "Lecteur vidéo, cookies et stockage local",
    "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences.": "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences.",
    "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers.": "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers.",
    "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs.": "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs.",
    "Conservation et transferts": "Conservation et transferts",
    "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant.": "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant.",
    "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties.": "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties.",
    "Vos droits et réclamations": "Vos droits et réclamations",
    "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales.": "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales.",
    "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire.": "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire.",
    "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée.": "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée.",
    "Sécurité et estimations sportives": "Sécurité et estimations sportives",
    "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page.": "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page.",
    "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com.": "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com.",
    "Jeu responsable": "Jeu responsable",
    "Comprendre les limites des pronostics et garder le contrôle.": "Comprendre les limites des pronostics et garder le contrôle.",
    "Un service réservé aux personnes majeures": "Un service réservé aux personnes majeures",
    "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur.": "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur.",
    "Aucun résultat n’est garanti": "Aucun résultat n’est garanti",
    "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres.": "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres.",
    "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes.": "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes.",
    "Garder le contrôle": "Garder le contrôle",
    "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress.": "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress.",
    "Quand demander de l’aide": "Quand demander de l’aide",
    "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié.": "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié.",
    "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés.": "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés.",
    "Compte et communications": "Compte et communications",
    "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément.": "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément.",
    "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique.": "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique.",
    "Nom commercial": "Nom commercial",
    "Nom légal de l’exploitant": "Nom légal de l’exploitant",
    "Forme ou qualité juridique": "Forme ou qualité juridique",
    "Adresse postale complète": "Adresse postale complète",
    "Ville et pays": "Ville et pays",
    "Registre et immatriculation, selon le statut": "Registre et immatriculation, selon le statut",
    "TVA, si applicable": "TVA, si applicable",
    "Responsable de publication": "Responsable de publication",
    "À renseigner avant publication": "À renseigner avant publication",
    "Email": "Email",
    "Téléphone / WhatsApp": "Téléphone / WhatsApp",
    "Dublin": "Dublin",
    "Irlande": "Irlande",
    "Informations légales": "Informations légales",
    "Retour au site": "Retour au site",
    "Pages légales": "Pages légales",
    "Document légal": "Document légal",
    "Dernière mise à jour :": "Dernière mise à jour :",
    "Informations légales à compléter.": "Informations légales à compléter.",
    "L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.": "L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.",
    "Sommaire de ce document": "Sommaire de ce document",
    "Une question ? Contactez-nous": "Une question ? Contactez-nous",
    "Contacter le support sur WhatsApp": "Contacter le support sur WhatsApp",
    "← Retour à l’accueil WinPulse": "← Retour à l’accueil WinPulse"
  },
  "en": {
    "Mentions légales": "Legal notice",
    "Éditeur, hébergement et contacts de WinPulse.": "WinPulse publisher, hosting and contact details.",
    "Éditeur et contact": "Publisher and contact",
    "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous.": "WinPulse is the trading name used for wnpulse.com. Its operator's contact details appear below.",
    "Hébergement": "Hosting",
    "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur.": "The website interface is deployed on Vercel. The publisher must provide complete legal details of the hosting provider and backend provider.",
    "Hébergement web : Vercel — coordonnées complètes à renseigner.": "Web hosting: Vercel — full contact details to be completed.",
    "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé.": "Backend hosting and data location: to be completed according to the service actually deployed.",
    "Propriété intellectuelle": "Intellectual property",
    "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive.": "Content created by WinPulse is protected under applicable rights. Commercial redistribution without permission is prohibited. Third-party trademarks, images, data and videos remain subject to their owners' rights; their presence does not mean WinPulse owns them exclusively.",
    "Nature du service": "Nature of the service",
    "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain.": "WinPulse provides sports information and predictions. It does not accept stakes or settle bets. Offers, payments and access are described in the [Terms and Conditions of Sale](/legal/cgv). Betting decisions carry no guarantee of winnings.",
    "Données et signalements": "Data and reports",
    "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable).": "For questions about the website, content or data: contact@wnpulse.com. See the [privacy policy](/legal/confidentialite) and [responsible gambling](/legal/jeu-responsable) information.",
    "Conditions Générales de Vente": "Terms and Conditions of Sale",
    "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.": "Terms applicable to WinPulse Pro: 10 500 FCFA for 30 days, without automatic renewal.",
    "1. Exploitant et champ d’application": "1. Operator and scope",
    "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :": "These Terms and Conditions of Sale govern paid subscriptions on **https://wnpulse.com**, operated under the trading name **WinPulse** by:",
    "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays.": "The service is intended for people aged at least 18 with capacity to enter into contracts. Users must comply with restrictions applicable in their country. Access to WinPulse does not authorise the use of a betting operator prohibited in that country.",
    "2. Nature du service": "2. Nature of the service",
    "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée.": "WinPulse provides sports information, predictions, odds comparisons and explanations. The subscription price pays for access to the features described in the purchased offer.",
    "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions.": "WinPulse does not accept users' stakes or settle their bets. Any bets are placed separately with third-party operators under their own terms.",
    "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles.": "Explanations may be generated from WinPulse engine data, with help from an artificial intelligence service when available. Explanatory AI is not presented as the source of all predictions. It may be replaced by a local explanation based on the available information.",
    "3. Offre gratuite et abonnement Pro": "3. Free access and Pro subscription",
    "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée.": "**Free** access is free of charge. It includes previews and features actually available to free users, and the available public history. The number of accessible selections depends on available fixtures and data; no daily free prediction is guaranteed when no selection is published.",
    "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique.": "The current paid offer is **WinPulse Pro — 10 500 FCFA (XOF) for 30 calendar days**, without automatic renewal.",
    "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1.": "Subject to available data and fixtures, Pro unlocks subscriber predictions, available accumulators, the Combo Builder and saved combinations, value bets, match explanations and progressive betting features when available. Support can be contacted using the address and number in section 1.",
    "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants.": "A selection, accumulator or progressive betting stage may be unavailable if the engine's criteria are not met. The subscription guarantees neither a fixed number of matches each day nor a daily sequence of winning bets.",
    "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande.": "The former Elite offer and previous prices are no longer available for new orders in the current catalogue. Rights under an earlier order remain those agreed when that order was placed.",
    "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier.": "The total price, including applicable taxes, is shown before order confirmation. If another currency or conversion is offered, its amount and terms are shown before payment. Exchange fees or charges imposed by the user's payment institution are governed by that institution's terms.",
    "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée.": "Price changes apply to future orders and do not retrospectively change the price of a period already paid for.",
    "4. Commande et paiement": "4. Ordering and payment",
    "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer.": "Before paying, users check the offer, amount, duration and contact details. They must be able to read these terms and correct entry errors before confirming the purchase through an action clearly indicating an obligation to pay.",
    "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires.": "Available payment methods are those actually shown at checkout: **mobile payment** and compatible bank cards only when enabled there. Visa or Mastercard availability is not guaranteed in every country or with every provider.",
    "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande.": "The support number **+33767971752 is not a merchant payment number**. Transfers must only follow the payment instructions displayed when ordering.",
    "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur.": "Activation follows payment verification by the provider or by WinPulse when manual verification is planned and disclosed. A screenshot or WhatsApp message alone is not definitive confirmation of payment. Users must be informed of activation and expiry dates.",
    "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte.": "Order confirmation containing contractual information must be sent on a durable medium, such as email. If charged without activation, users contact support with the transaction reference, without sending their PIN, password or full card number.",
    "5. Durée, renouvellement et fin d’accès": "5. Duration, renewal and end of access",
    "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil.": "The paid period lasts **30 calendar days from confirmed activation**, subject to the precise dates communicated for the order. It does not necessarily correspond to a calendar month.",
    "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant.": "This offer has no automatic renewal or recurring charge. On expiry, subscriber-only access ends and the account returns to Free access. A new purchase is needed to extend paid access.",
    "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi.": "Users may request account closure at contact@wnpulse.com. Closure does not remove any statutory refund entitlement or require deletion of documents that must be retained by law.",
    "6. Rétractation et remboursements": "6. Withdrawal and refunds",
    "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier.": "Where the right of withdrawal for distance contracts applies, consumers generally have **14 days from the conclusion of the contract** to notify their decision without giving a reason.",
    "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire.": "Notification may be sent to **contact@wnpulse.com**, with the name, account email and order reference, or through any other admissible unequivocal statement. The form in the appendix may be used but is not mandatory.",
    "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur.": "Activating a subscription or viewing predictions does not, by itself, remove consumer rights. For a service begun during this period, any proportionate deduction for service supplied must meet legal conditions, including prior information and the consumer's express request.",
    "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions.": "Exceptions for certain digital content may be relied on only when the applicable conditions are actually met, including prior express consent, acknowledgment of loss of the right where legally provided, and the required contractual confirmation. General acceptance of these terms or a “no refunds” checkbox does not establish these conditions.",
    "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires.": "Refunds due on withdrawal are made within the applicable legal period, generally no later than 14 days after receipt of notification, using the original payment method unless another solution without additional charges is expressly agreed.",
    "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu.": "Regardless of withdrawal, statutory rights concerning services not supplied or not in conformity, undue charges and duplicate payments continue to apply. A losing prediction alone is not a defect in the information service sold.",
    "7. Pronostics, statistiques et risques": "7. Predictions, statistics and risks",
    "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision.": "Odds change and may differ from those displayed at publication. Users always check the market, teams, time and odds with the operator before deciding.",
    "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté.": "Confidence labels, scores, risk levels and value indicators are estimates or methodological indicators. They are neither a guarantee of results nor, without specific measurement and explanation, an observed success rate.",
    "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs.": "Progressive betting and accumulators are not investments, assured income or a guarantee of recovering losses. Combining selections may increase the risk of a losing ticket. Past performance and examples of winning selections do not guarantee future results.",
    "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles.": "WinPulse promises no winnings. Users remain free not to bet. Betting can cause financial losses and addiction and must not be funded with money needed for essential expenses.",
    "8. Scores Live, vidéos et actualités": "8. Live scores, videos and news",
    "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé.": "Scores and schedules come from third-party providers. They may be delayed, incomplete, corrected or temporarily unavailable. Freshness indicators must be considered; bet settlement depends on the rules of the operator with whom it was placed.",
    "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier.": "Videos offered in Live use a third-party player, including YouTube, from available embeddable broadcasts. Access depends on the broadcaster, country, restrictions and technical availability. A WinPulse subscription does not purchase television broadcasting rights or guarantee coverage of any particular match or competition.",
    "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites.": "The blog may present guides and news links with their source. An automated discovery date is not necessarily the original publication date. Links lead to third-party publishers whose terms apply on their websites.",
    "9. Disponibilité et conformité du service": "9. Service availability and conformity",
    "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise.": "WinPulse uses reasonable means to provide access and correct faults. Maintenance, incidents or provider failures may cause interruptions; uninterrupted permanent availability is not promised.",
    "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement.": "For non-supply or non-conformity, users contact support to seek a solution within the conditions and time limits provided by law. Depending on the circumstances, remedies may include bringing the service into conformity, a price reduction, or termination and a refund.",
    "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur.": "These terms do not exclude guarantees or liabilities that cannot legally be excluded. WinPulse's liability is assessed according to the facts and applicable law; users' betting decisions do not justify a blanket exclusion of the provider's liability.",
    "10. Compte et usage des contenus": "10. Account and use of content",
    "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite.": "Users provide accurate information and protect their credentials. Paid access is for personal use; reselling access or commercially redistributing content without permission is prohibited.",
    "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni.": "Suspension for fraud or abuse must be justified and proportionate. Unless security needs or a legal impediment prevent it, reasons are communicated and users may contact support to dispute the decision. Suspension does not automatically forfeit amounts relating to a service not supplied.",
    "11. Données personnelles et WhatsApp": "11. Personal data and WhatsApp",
    "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables.": "Data needed for accounts, payment and support is processed as part of the service. The privacy policy must identify the controller, purposes, legal bases, recipients, retention periods, possible international transfers and procedures for exercising rights, under the GDPR and other applicable rules.",
    "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV.": "Providing a WhatsApp number for an account or support does not automatically authorise marketing. Commercial messages and joining a group or community must comply with applicable rules, with the necessary choices and opportunities to object. Accepting these terms alone does not constitute joining a group.",
    "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**.": "For requests about data or contact preferences: **contact@wnpulse.com**.",
    "12. Réclamations, droit applicable et litiges": "12. Complaints, governing law and disputes",
    "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande.": "Complaints may be sent to **contact@wnpulse.com** or **+33767971752**, with information identifying the order.",
    "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent.": "These terms are governed by **Irish law**, without depriving consumers of mandatory protections under the law applicable to their situation, including that of their habitual residence where those protections apply.",
    "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs.": "The parties may seek an amicable solution. This does not remove consumers' remedies or access to competent courts under applicable rules. Exclusive jurisdiction of Dublin courts is not imposed on all consumers.",
    "13. Évolution des CGV": "13. Changes to these terms",
    "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent.": "The version accepted when ordering governs the purchased period, subject to mandatory law and validly agreed changes. New versions are dated and made available before orders to which they apply.",
    "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi.": "Changes do not retrospectively reduce rights under a subscription already paid for. Changes to an ongoing service comply with statutory information requirements and user rights.",
    "Annexe — Modèle de notification de rétractation": "Appendix — Model withdrawal notice",
    "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1.": "Send to **contact@wnpulse.com**, or to the operator's complete postal address given in section 1.",
    "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :": "“I hereby notify you of my decision to withdraw from the contract for the following WinPulse subscription:",
    "Référence de commande : …": "Order reference: …",
    "Date de conclusion du contrat : …": "Date of conclusion of the contract: …",
    "Nom du client : …": "Customer name: …",
    "Email associé au compte : …": "Account email address: …",
    "Adresse du client : …": "Customer address: …",
    "Date de notification : …": "Notification date: …",
    "Signature, uniquement pour une notification sur papier : … »": "Signature, for paper notifications only: …”",
    "Politique de confidentialité": "Privacy policy",
    "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.": "Account, payments, WhatsApp and third-party services: information about your data.",
    "Responsable du traitement": "Data controller",
    "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com.": "WinPulse's operator determines the purposes and means of account and service processing. Its full identity and address must be provided below. Data contact: contact@wnpulse.com.",
    "Données concernées": "Data concerned",
    "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :": "Depending on your actions and enabled features, the data concerned includes:",
    "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.": "Account: name, email, WhatsApp number and identifiers needed for authentication. Passwords must be stored as hashes, not in plain text.",
    "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.": "Subscription and payment: plan, access dates, amount, status, transaction reference and any supporting document submitted. Never send support your PIN, card security code or full card number.",
    "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.": "Usage and security: pages viewed, timestamps, sessions, technical logs, IP address and browser information when recorded.",
    "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences.": "Account content: saved combinations, contact choices, support messages and preferences.",
    "Finalités et bases légales": "Purposes and legal bases",
    "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant.": "Authentication, subscription management, saved content and support are based on performance of the contract or steps requested before entering it. Accounting duties and legal requests are based on obligations applicable to the operator.",
    "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres.": "Security, fraud prevention and incident diagnosis may rely on legitimate interests after assessing necessity and effects on your rights. Marketing and non-essential trackers are subject to their own consent rules or other legal conditions.",
    "Numéro WhatsApp, prospection et communautés": "WhatsApp number, marketing and communities",
    "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique.": "Collecting a number for an account or support is not general consent to advertising. Acceptance of these terms does not replace the choices required for electronic marketing.",
    "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres.": "Marketing must respect your choice and provide an easy way to object. Consent may be withdrawn without preventing messages needed to operate your account. Registration alone does not imply joining any group or community; some information may be visible to other group members.",
    "Destinataires et prestataires": "Recipients and providers",
    "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique.": "Data is accessible to authorised administration and support staff, and providers as needed for their tasks. The names and roles of providers actually used must be completed before publishing this policy.",
    "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.": "Web hosting: Vercel; backend, database and storage countries: to be specified.",
    "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.": "Transactional emails and payments: active providers to be specified in the processor list.",
    "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.": "Explanations: local service and AI providers if configured. Sending match data to an AI provider does not require sending your password or payment details.",
    "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques.": "Videos: Google / YouTube when you open the embedded player. WhatsApp is involved when you use that contact channel. These third parties may also process data for their own purposes under their policies.",
    "Lecteur vidéo, cookies et stockage local": "Video player, cookies and local storage",
    "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences.": "Your browser may store items needed for authentication, preferences and score caching, including local or session storage. Clearing them may sign you out or reset some preferences.",
    "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers.": "The YouTube player loads after a play action. Opening it may send technical information to Google, including your IP address and browser information. The player's privacy-enhanced mode does not mean that this third party performs no processing.",
    "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs.": "Consent mechanisms required for cookies, trackers and embedded services must be implemented before use where regulations require. Browsing the website alone is not presented as consent to all trackers.",
    "Conservation et transferts": "Retention and transfers",
    "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant.": "Retention depends on purpose: providing the account, handling a request, security, accounting duties or defending a right. Account deletion does not necessarily erase records that must legally be retained. The operator must still specify actual detailed retention and deletion rules.",
    "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties.": "Processing countries depend on active providers. Transfers outside the European Economic Area must rely on an appropriate legal mechanism, such as an applicable adequacy decision or suitable contractual safeguards. Contact contact@wnpulse.com for information about recipients and safeguards.",
    "Vos droits et réclamations": "Your rights and complaints",
    "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales.": "Under GDPR conditions, you may request access, rectification, erasure, restriction, portability and objection, and withdraw consent without affecting earlier lawful processing. Some rights have limits depending on circumstances and legal obligations.",
    "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire.": "Send requests to contact@wnpulse.com. The response period is generally one month; any legally permitted extension must be explained within that period. Proportionate identity verification may be requested where necessary.",
    "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée.": "You may contact the [Irish Data Protection Commission](https://www.dataprotection.ie/) or the competent authority where you live, work or where the alleged infringement occurred.",
    "Sécurité et estimations sportives": "Security and sports estimates",
    "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page.": "The operator must apply technical and organisational measures appropriate to risks, restrict access and protect transmitted data. This page guarantees neither absolute security nor any specific protocol version.",
    "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com.": "Sports indicators concern fixtures and are not presented as automated legal decisions about you. Incidents or privacy requests may be reported to contact@wnpulse.com.",
    "Jeu responsable": "Responsible gambling",
    "Comprendre les limites des pronostics et garder le contrôle.": "Understand the limits of predictions and stay in control.",
    "Un service réservé aux personnes majeures": "A service for adults only",
    "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur.": "Access is restricted to people aged at least 18. Age requirements and access to gambling operators also depend on the country concerned. False declarations may result in suspension without removing mandatory consumer rights.",
    "Aucun résultat n’est garanti": "No result is guaranteed",
    "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres.": "A high confidence score, low odds, a run of positive results or a risk label does not make a bet certain. Past performance does not predict upcoming fixtures with certainty.",
    "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes.": "Accumulators and progressive betting can fail. They are neither investments, assured income nor a guaranteed way to recover losses.",
    "Garder le contrôle": "Stay in control",
    "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress.": "You may use sports information without betting. If you choose to bet, never fund it through borrowing or money needed for essential expenses. Avoid chasing losses and take a break if gambling becomes stressful.",
    "Quand demander de l’aide": "When to seek help",
    "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié.": "If gambling becomes excessive, causes financial difficulties or leads you to hide your habits from people close to you, speak to someone you trust or a qualified professional.",
    "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés.": "In Ireland, official guidance resources are available from the [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). You may also consult [GamblingCare](https://gamblingcare.ie/). In other countries, look for suitable local public services.",
    "Compte et communications": "Account and communications",
    "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément.": "To request closure of your WinPulse account or an end to marketing: contact@wnpulse.com. This does not close accounts with third-party betting operators; their exclusion tools must be used separately.",
    "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique.": "Available history can be viewed in the [Track record](/resultats). Winning results selected for an advertisement do not replace reviewing the full history.",
    "Nom commercial": "Trading name",
    "Nom légal de l’exploitant": "Operator's legal name",
    "Forme ou qualité juridique": "Legal form or status",
    "Adresse postale complète": "Full postal address",
    "Ville et pays": "City and country",
    "Registre et immatriculation, selon le statut": "Register and registration number, as applicable",
    "TVA, si applicable": "VAT, if applicable",
    "Responsable de publication": "Person responsible for publication",
    "À renseigner avant publication": "To be completed before publication",
    "Email": "Email",
    "Téléphone / WhatsApp": "Phone / WhatsApp",
    "Dublin": "Dublin",
    "Irlande": "Ireland",
    "Informations légales": "Legal information",
    "Retour au site": "Back to website",
    "Pages légales": "Legal pages",
    "Document légal": "Legal document",
    "Dernière mise à jour :": "Last updated:",
    "Informations légales à compléter.": "Legal information needs completing.",
    "L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.": "The operator's legal identity and full postal address must be provided. “Dublin, Ireland” indicates only the city and country. Incomplete fields remain marked below.",
    "Sommaire de ce document": "Contents of this document",
    "Une question ? Contactez-nous": "Questions? Contact us",
    "Contacter le support sur WhatsApp": "Contact support on WhatsApp",
    "← Retour à l’accueil WinPulse": "← Back to WinPulse home"
  },
  "es": {
    "Mentions légales": "Aviso legal",
    "Éditeur, hébergement et contacts de WinPulse.": "Editor, alojamiento y datos de contacto de WinPulse.",
    "Éditeur et contact": "Editor y contacto",
    "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous.": "WinPulse es el nombre comercial utilizado para wnpulse.com. Los datos de contacto de su operador figuran a continuación.",
    "Hébergement": "Alojamiento",
    "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur.": "La interfaz se despliega en Vercel. El editor debe indicar los datos legales completos del proveedor de alojamiento y del proveedor del backend.",
    "Hébergement web : Vercel — coordonnées complètes à renseigner.": "Alojamiento web: Vercel — datos completos pendientes de indicar.",
    "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé.": "Alojamiento del backend y ubicación de los datos: indicar según el servicio realmente desplegado.",
    "Propriété intellectuelle": "Propiedad intelectual",
    "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive.": "Los elementos creados por WinPulse están protegidos por los derechos aplicables. Se prohíbe su redistribución comercial sin autorización. Las marcas, imágenes, datos y vídeos de terceros siguen sujetos a los derechos de sus titulares; su presencia no implica que WinPulse tenga su propiedad exclusiva.",
    "Nature du service": "Naturaleza del servicio",
    "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain.": "WinPulse proporciona información y pronósticos deportivos. No recibe apuestas ni las liquida. Las ofertas, pagos y accesos se describen en las [Condiciones Generales de Venta](/legal/cgv). Las decisiones de apuesta no incluyen garantía de ganancias.",
    "Données et signalements": "Datos y comunicaciones",
    "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable).": "Para preguntas sobre el sitio, los contenidos o los datos: contact@wnpulse.com. Consulte la [política de privacidad](/legal/confidentialite) y la información sobre [juego responsable](/legal/jeu-responsable).",
    "Conditions Générales de Vente": "Condiciones Generales de Venta",
    "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.": "Condiciones de WinPulse Pro: 10 500 FCFA por 30 días, sin renovación automática.",
    "1. Exploitant et champ d’application": "1. Operador y ámbito de aplicación",
    "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :": "Estas Condiciones Generales de Venta regulan las suscripciones de pago en **https://wnpulse.com**, explotado bajo el nombre comercial **WinPulse** por:",
    "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays.": "El servicio se dirige a personas de al menos 18 años con capacidad para contratar. El usuario debe respetar las restricciones de su país. Acceder a WinPulse no autoriza a utilizar un operador de apuestas prohibido en dicho país.",
    "2. Nature du service": "2. Naturaleza del servicio",
    "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée.": "WinPulse proporciona información deportiva, pronósticos, comparaciones de cuotas y explicaciones. El precio de la suscripción remunera el acceso a las funciones descritas en la oferta contratada.",
    "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions.": "WinPulse no recibe importes apostados ni liquida las apuestas del usuario. Las apuestas se contratan por separado con operadores terceros, conforme a sus propias condiciones.",
    "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles.": "Las explicaciones pueden generarse a partir de los datos del motor WinPulse, con ayuda de un servicio de inteligencia artificial cuando esté disponible. La IA explicativa no se presenta como origen de todos los pronósticos. Puede sustituirse por una explicación local basada en la información disponible.",
    "3. Offre gratuite et abonnement Pro": "3. Acceso gratuito y suscripción Pro",
    "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée.": "El acceso **Free** es gratuito. Incluye las vistas previas y funciones efectivamente abiertas a usuarios gratuitos y el historial público disponible. El número de selecciones accesibles depende de los encuentros y datos disponibles; no se garantiza un pronóstico gratuito diario si no se publica ninguna selección.",
    "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique.": "La oferta de pago actual es **WinPulse Pro — 10 500 FCFA (XOF) por 30 días naturales**, sin renovación automática.",
    "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1.": "Según los datos y encuentros disponibles, Pro desbloquea pronósticos para suscriptores, combinadas ofrecidas, Combo Builder y guardado de combinadas, apuestas de valor, explicaciones de partidos y funciones de apuestas progresivas cuando estén disponibles. Puede contactar con soporte en la dirección y el número del artículo 1.",
    "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants.": "Puede no ofrecerse una selección, combinada o etapa progresiva si no se cumplen los criterios del motor. La suscripción no garantiza un número fijo de partidos diarios ni una serie diaria de apuestas ganadoras.",
    "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande.": "La antigua oferta Elite y los precios anteriores ya no están abiertos a nuevos pedidos en el catálogo actual. Los derechos de un pedido anterior siguen siendo los acordados al realizarlo.",
    "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier.": "El precio total, incluidos los impuestos aplicables, se muestra antes de confirmar el pedido. Si se ofrece otra divisa o conversión, se muestran su importe y condiciones antes del pago. Las comisiones de cambio o de la entidad de pago del usuario se rigen por las condiciones de esa entidad.",
    "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée.": "Los cambios de precio afectan a pedidos futuros y no modifican retroactivamente el precio de un periodo ya pagado.",
    "4. Commande et paiement": "4. Pedido y pago",
    "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer.": "Antes de pagar, el usuario comprueba la oferta, importe, duración y datos de contacto. Debe poder consultar estas condiciones y corregir errores antes de confirmar la compra mediante una acción que indique claramente la obligación de pago.",
    "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires.": "Los medios utilizables son los realmente mostrados durante la compra: **pago móvil** y tarjetas bancarias compatibles solo cuando estén activadas. No se garantiza la disponibilidad de Visa o Mastercard en todos los países o proveedores.",
    "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande.": "El número de soporte **+33767971752 no es un número comercial para pagos**. Solo deben realizarse transferencias siguiendo las instrucciones mostradas al efectuar el pedido.",
    "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur.": "La activación se produce tras verificar el pago por el proveedor o por WinPulse cuando se haya previsto y anunciado una verificación manual. Una captura de pantalla o un mensaje de WhatsApp no confirma definitivamente el pago. Deben comunicarse las fechas de activación y vencimiento.",
    "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte.": "Debe enviarse una confirmación con la información contractual en un soporte duradero, como el email. Si se cobra sin activar, el usuario contacta con soporte indicando la referencia de transacción, sin enviar su PIN, contraseña ni número completo de tarjeta.",
    "5. Durée, renouvellement et fin d’accès": "5. Duración, renovación y fin del acceso",
    "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil.": "El periodo de pago dura **30 días naturales desde la activación confirmada**, según las fechas exactas comunicadas para el pedido. No equivale necesariamente a un mes natural.",
    "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant.": "Esta oferta no tiene renovación automática ni cargos recurrentes. Al vencer, termina el acceso para suscriptores y la cuenta vuelve a Free. Es necesaria una nueva compra para prolongar el acceso de pago.",
    "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi.": "El usuario puede solicitar cerrar su cuenta a contact@wnpulse.com. El cierre no elimina un posible derecho legal al reembolso ni obliga a borrar documentos que deban conservarse legalmente.",
    "6. Rétractation et remboursements": "6. Desistimiento y reembolsos",
    "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier.": "Cuando se aplica el derecho de desistimiento de contratos a distancia, el consumidor dispone, en principio, de **14 días desde la celebración del contrato** para notificar su decisión sin justificarla.",
    "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire.": "La notificación puede dirigirse a **contact@wnpulse.com**, indicando nombre, email de la cuenta y referencia del pedido, o mediante otra declaración inequívoca admisible. Puede utilizarse el modelo anexo, sin ser obligatorio.",
    "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur.": "Activar la suscripción o consultar pronósticos no elimina por sí solo los derechos del consumidor. Para servicios iniciados durante ese plazo, cualquier retención proporcional al servicio prestado debe cumplir las condiciones legales, incluidas la información previa y la solicitud expresa del consumidor.",
    "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions.": "Las excepciones de ciertos contenidos digitales solo pueden invocarse si se cumplen realmente sus condiciones: consentimiento expreso previo, reconocimiento de la pérdida del derecho cuando esté legalmente prevista y confirmación contractual exigida. Aceptar estas condiciones en general o marcar «sin reembolsos» no establece esos requisitos.",
    "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires.": "Los reembolsos por desistimiento se realizan en el plazo legal aplicable, en principio como máximo 14 días después de recibir la notificación, mediante el medio de pago original salvo acuerdo expreso de otra solución sin costes adicionales.",
    "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu.": "Con independencia del desistimiento, se mantienen los derechos legales por servicios no prestados o no conformes, cobros indebidos y pagos duplicados. Un pronóstico perdedor no constituye por sí solo un defecto del servicio de información vendido.",
    "7. Pronostics, statistiques et risques": "7. Pronósticos, estadísticas y riesgos",
    "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision.": "Las cuotas cambian y pueden diferir de las publicadas inicialmente. Antes de decidir, el usuario comprueba siempre el mercado, equipos, horario y cuota con el operador.",
    "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté.": "Las menciones de confianza, puntuaciones, niveles de riesgo e indicadores de valor son estimaciones o indicadores metodológicos. No garantizan resultados ni representan, sin medición y explicación específicas, una tasa de acierto observada.",
    "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs.": "Las apuestas progresivas y combinadas no son inversiones, ingresos asegurados ni garantía de recuperar pérdidas. Combinar selecciones puede aumentar el riesgo de perder el boleto. El rendimiento pasado y los ejemplos ganadores no garantizan resultados futuros.",
    "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles.": "WinPulse no promete ganancias. El usuario es libre de no apostar. Las apuestas pueden causar pérdidas económicas y adicción; no deben financiarse con dinero necesario para gastos esenciales.",
    "8. Scores Live, vidéos et actualités": "8. Marcadores Live, vídeos y noticias",
    "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé.": "Los marcadores y horarios proceden de terceros. Pueden sufrir retrasos, estar incompletos, corregirse o no estar disponibles temporalmente. Deben tenerse en cuenta los indicadores de actualización; la liquidación depende de las reglas del operador donde se apostó.",
    "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier.": "Los vídeos disponibles en Live usan reproductores terceros, como YouTube, de emisiones insertables disponibles. Su acceso depende del emisor, país, restricciones y disponibilidad técnica. La suscripción WinPulse no compra derechos televisivos ni garantiza retransmitir un partido o campeonato concreto.",
    "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites.": "El blog puede mostrar guías y enlaces de noticias con su fuente. La fecha de detección automática no es necesariamente la fecha de publicación original. Los enlaces llevan a editores terceros cuyas condiciones se aplican en sus sitios.",
    "9. Disponibilité et conformité du service": "9. Disponibilidad y conformidad del servicio",
    "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise.": "WinPulse emplea medios razonables para facilitar el acceso y corregir fallos. El mantenimiento, los incidentes o fallos de proveedores pueden causar interrupciones; no se promete disponibilidad permanente e ininterrumpida.",
    "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement.": "Ante falta de prestación o de conformidad, el usuario contacta con soporte para buscar una solución en las condiciones y plazos legales. Según el caso, los recursos pueden incluir subsanar la falta de conformidad, reducir el precio o resolver el contrato con reembolso.",
    "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur.": "Estas condiciones no excluyen garantías o responsabilidades que legalmente no puedan excluirse. La responsabilidad de WinPulse se valora según los hechos y el derecho aplicable; las decisiones de apuesta no justifican excluir de forma general toda responsabilidad del proveedor.",
    "10. Compte et usage des contenus": "10. Cuenta y uso de contenidos",
    "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite.": "El usuario facilita información exacta y protege sus credenciales. El acceso de pago es personal; se prohíbe revender accesos o redistribuir contenidos comercialmente sin autorización.",
    "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni.": "Una suspensión por fraude o abuso debe estar justificada y ser proporcionada. Salvo necesidades de seguridad o impedimento legal, se comunica el motivo y puede impugnarse ante soporte. No supone automáticamente perder los importes de un servicio no prestado.",
    "11. Données personnelles et WhatsApp": "11. Datos personales y WhatsApp",
    "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables.": "Los datos necesarios para la cuenta, el pago y el soporte se tratan dentro del servicio. La política debe identificar al responsable, finalidades, bases jurídicas, destinatarios, plazos de conservación, posibles transferencias internacionales y vías para ejercer derechos, conforme al RGPD y demás normas aplicables.",
    "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV.": "Facilitar un número WhatsApp para la cuenta o soporte no autoriza automáticamente la prospección comercial. Los mensajes comerciales y el acceso a grupos o comunidades deben respetar las reglas aplicables, con las opciones y posibilidades de oposición necesarias. Aceptar estas condiciones no supone incorporarse a un grupo.",
    "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**.": "Para solicitudes sobre datos o preferencias de contacto: **contact@wnpulse.com**.",
    "12. Réclamations, droit applicable et litiges": "12. Reclamaciones, derecho aplicable y litigios",
    "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande.": "Puede reclamar a **contact@wnpulse.com** o al **+33767971752**, aportando datos que permitan localizar el pedido.",
    "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent.": "Estas condiciones se rigen por el **derecho irlandés**, sin privar al consumidor de protecciones imperativas del derecho aplicable a su situación, especialmente las de su residencia habitual cuando procedan.",
    "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs.": "Las partes pueden buscar una solución amistosa. Esto no priva al consumidor de recursos ni de acudir a los tribunales competentes según las normas aplicables. No se impone a todos los consumidores la competencia exclusiva de los tribunales de Dublín.",
    "13. Évolution des CGV": "13. Cambios de las condiciones",
    "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent.": "La versión aceptada al pedir rige el periodo comprado, salvo normas imperativas y cambios válidamente acordados. Las nuevas versiones se fechan y publican antes de los pedidos a los que se apliquen.",
    "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi.": "Una modificación no reduce retroactivamente los derechos de una suscripción ya pagada. Los cambios de un servicio en curso respetan los deberes legales de información y los derechos del usuario.",
    "Annexe — Modèle de notification de rétractation": "Anexo — Modelo de notificación de desistimiento",
    "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1.": "Enviar a **contact@wnpulse.com** o a la dirección postal completa del operador indicada en el artículo 1.",
    "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :": "«Por la presente notifico mi decisión de desistir del contrato relativo a la siguiente suscripción WinPulse:",
    "Référence de commande : …": "Referencia del pedido: …",
    "Date de conclusion du contrat : …": "Fecha de celebración del contrato: …",
    "Nom du client : …": "Nombre del cliente: …",
    "Email associé au compte : …": "Email asociado a la cuenta: …",
    "Adresse du client : …": "Dirección del cliente: …",
    "Date de notification : …": "Fecha de notificación: …",
    "Signature, uniquement pour une notification sur papier : … »": "Firma, solo para notificaciones en papel: …»",
    "Politique de confidentialité": "Política de privacidad",
    "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.": "Cuenta, pagos, WhatsApp y servicios terceros: información sobre sus datos.",
    "Responsable du traitement": "Responsable del tratamiento",
    "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com.": "El operador de WinPulse determina los fines y medios del tratamiento vinculado a la cuenta y al servicio. Deben indicarse a continuación su identidad y dirección completas. Contacto de datos: contact@wnpulse.com.",
    "Données concernées": "Datos tratados",
    "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :": "Según las acciones realizadas y funciones activadas, los datos tratados incluyen:",
    "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.": "Cuenta: nombre, email, número WhatsApp e identificadores para autenticar. La contraseña debe almacenarse como hash, no en texto claro.",
    "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.": "Suscripción y pago: plan, fechas de acceso, importe, estado, referencia y posible justificante enviado. Nunca comunique a soporte su PIN, código de seguridad ni número completo de tarjeta.",
    "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.": "Uso y seguridad: páginas consultadas, marcas temporales, sesiones, registros técnicos, dirección IP e información del navegador cuando se registren.",
    "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences.": "Contenido de la cuenta: combinadas guardadas, opciones de contacto, mensajes a soporte y preferencias.",
    "Finalités et bases légales": "Finalidades y bases jurídicas",
    "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant.": "La autenticación, gestión de la suscripción, contenidos guardados y soporte se basan en ejecutar el contrato o realizar gestiones solicitadas antes de contratar. Las obligaciones contables y solicitudes legales se basan en los deberes aplicables al operador.",
    "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres.": "La seguridad, prevención del fraude y diagnóstico de incidentes pueden basarse en un interés legítimo tras valorar su necesidad y efectos sobre sus derechos. El marketing y los rastreadores no necesarios están sujetos a sus normas de consentimiento u otras condiciones legales.",
    "Numéro WhatsApp, prospection et communautés": "Número WhatsApp, marketing y comunidades",
    "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique.": "Recoger un número para la cuenta o soporte no constituye consentimiento general para recibir publicidad. Aceptar estas condiciones no sustituye las opciones exigidas para el marketing electrónico.",
    "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres.": "Las comunicaciones comerciales deben respetar su elección y permitir una oposición sencilla. Puede retirarse el consentimiento sin impedir mensajes necesarios para la cuenta. Registrarse no implica entrar en un grupo o comunidad; en los grupos, cierta información puede ser visible para otros miembros.",
    "Destinataires et prestataires": "Destinatarios y proveedores",
    "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique.": "Acceden a los datos las personas autorizadas de administración y soporte y los proveedores que los necesiten para sus funciones. La lista de proveedores realmente utilizados y sus funciones debe completarse antes de publicar esta política.",
    "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.": "Alojamiento web: Vercel; backend, base de datos y países de almacenamiento: por precisar.",
    "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.": "Emails transaccionales y pagos: indicar proveedores activos en la lista de encargados del tratamiento.",
    "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.": "Explicaciones: servicio local y proveedores de IA si están configurados. Los datos de partidos enviados a la IA no requieren enviar su contraseña o datos de pago.",
    "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques.": "Vídeos: Google / YouTube al abrir el reproductor insertado. WhatsApp interviene al utilizar ese canal. Estos terceros también pueden actuar con fines propios según sus políticas.",
    "Lecteur vidéo, cookies et stockage local": "Reproductor de vídeo, cookies y almacenamiento local",
    "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences.": "El navegador puede guardar elementos necesarios para autenticación, preferencias y caché de marcadores, mediante almacenamiento local o de sesión. Borrarlos puede cerrar su sesión o restablecer preferencias.",
    "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers.": "El reproductor YouTube se carga tras una acción de reproducción. Abrirlo puede transmitir a Google información técnica, como la IP y datos del navegador. Su modo de privacidad mejorada no implica ausencia total de tratamiento por ese tercero.",
    "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs.": "Los mecanismos de consentimiento exigidos para cookies, rastreadores y servicios insertados deben implantarse antes de usarlos cuando la normativa lo requiera. Navegar por el sitio no se presenta como consentimiento a todos los rastreadores.",
    "Conservation et transferts": "Conservación y transferencias",
    "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant.": "Los plazos dependen de la finalidad: proporcionar la cuenta, gestionar solicitudes, seguridad, deberes contables o defender derechos. Borrar la cuenta no elimina necesariamente documentos de conservación legal obligatoria. El operador debe precisar los plazos detallados y reglas de borrado realmente aplicados.",
    "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties.": "Los países de tratamiento dependen de los proveedores activos. Las transferencias fuera del Espacio Económico Europeo deben apoyarse en un mecanismo legal adecuado, como una decisión de adecuación aplicable o garantías contractuales apropiadas. Contacte con contact@wnpulse.com para conocer destinatarios y garantías.",
    "Vos droits et réclamations": "Sus derechos y reclamaciones",
    "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales.": "En las condiciones del RGPD, puede solicitar acceso, rectificación, supresión, limitación, portabilidad y oposición, y retirar el consentimiento sin afectar al tratamiento lícito anterior. Algunos derechos tienen límites según la situación y las obligaciones legales.",
    "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire.": "Envíe solicitudes a contact@wnpulse.com. El plazo de respuesta es, en principio, un mes; toda ampliación legalmente permitida debe explicarse dentro de ese plazo. Puede pedirse una verificación de identidad proporcionada si es necesario.",
    "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée.": "Puede acudir a la [Data Protection Commission irlandesa](https://www.dataprotection.ie/) o a la autoridad competente del lugar de residencia, trabajo o supuesta infracción.",
    "Sécurité et estimations sportives": "Seguridad y estimaciones deportivas",
    "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page.": "El operador debe aplicar medidas técnicas y organizativas adaptadas al riesgo, limitar accesos y proteger los datos transmitidos. Esta página no garantiza seguridad absoluta ni una versión concreta de protocolo.",
    "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com.": "Los indicadores deportivos se refieren a encuentros y no se presentan como decisiones jurídicas automatizadas sobre usted. Puede comunicar incidentes o solicitudes de privacidad a contact@wnpulse.com.",
    "Jeu responsable": "Juego responsable",
    "Comprendre les limites des pronostics et garder le contrôle.": "Comprender los límites de los pronósticos y mantener el control.",
    "Un service réservé aux personnes majeures": "Un servicio reservado a adultos",
    "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur.": "El acceso se reserva a personas de al menos 18 años. La edad y el acceso a operadores también dependen del país. Una declaración falsa puede causar suspensión sin eliminar derechos imperativos del consumidor.",
    "Aucun résultat n’est garanti": "Ningún resultado está garantizado",
    "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres.": "Una confianza alta, una cuota baja, una racha positiva o una etiqueta de riesgo no hacen segura una apuesta. El rendimiento pasado no predice con certeza los próximos encuentros.",
    "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes.": "Las combinadas y apuestas progresivas pueden fallar. No son inversiones, ingresos asegurados ni un medio garantizado para recuperar pérdidas.",
    "Garder le contrôle": "Mantener el control",
    "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress.": "Puede utilizar la información deportiva sin apostar. Si apuesta, nunca lo financie con préstamos ni dinero para gastos esenciales. Evite perseguir pérdidas y descanse si el juego causa estrés.",
    "Quand demander de l’aide": "Cuándo pedir ayuda",
    "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié.": "Si el juego ocupa demasiado espacio, causa problemas económicos o le lleva a ocultar sus hábitos a sus allegados, hable con alguien de confianza o un profesional cualificado.",
    "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés.": "En Irlanda, la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help) ofrece orientación oficial. También puede consultar [GamblingCare](https://gamblingcare.ie/). En otro país, busque servicios públicos locales adecuados.",
    "Compte et communications": "Cuenta y comunicaciones",
    "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément.": "Para cerrar su cuenta WinPulse o dejar de recibir comunicaciones comerciales: contact@wnpulse.com. Esta solicitud no cierra cuentas de operadores de apuestas terceros; debe utilizar sus mecanismos de exclusión por separado.",
    "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique.": "El historial disponible puede consultarse en el [Track record](/resultats). Los resultados ganadores seleccionados para publicidad no sustituyen examinar todo el historial.",
    "Nom commercial": "Nombre comercial",
    "Nom légal de l’exploitant": "Nombre legal del operador",
    "Forme ou qualité juridique": "Forma o condición jurídica",
    "Adresse postale complète": "Dirección postal completa",
    "Ville et pays": "Ciudad y país",
    "Registre et immatriculation, selon le statut": "Registro e inscripción, según el estatuto",
    "TVA, si applicable": "IVA, si procede",
    "Responsable de publication": "Responsable de publicación",
    "À renseigner avant publication": "Por completar antes de publicar",
    "Email": "Email",
    "Téléphone / WhatsApp": "Teléfono / WhatsApp",
    "Dublin": "Dublín",
    "Irlande": "Irlanda",
    "Informations légales": "Información legal",
    "Retour au site": "Volver al sitio",
    "Pages légales": "Páginas legales",
    "Document légal": "Documento legal",
    "Dernière mise à jour :": "Última actualización:",
    "Informations légales à compléter.": "Información legal pendiente de completar.",
    "L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.": "Deben indicarse la identidad jurídica y la dirección postal completa del operador. «Dublín, Irlanda» solo indica la ciudad y el país. Los campos incompletos siguen señalados a continuación.",
    "Sommaire de ce document": "Índice de este documento",
    "Une question ? Contactez-nous": "¿Tiene preguntas? Contáctenos",
    "Contacter le support sur WhatsApp": "Contactar con soporte por WhatsApp",
    "← Retour à l’accueil WinPulse": "← Volver al inicio de WinPulse"
  },
  "pt": {
    "Mentions légales": "Aviso legal",
    "Éditeur, hébergement et contacts de WinPulse.": "Editor, alojamento e contactos da WinPulse.",
    "Éditeur et contact": "Editor e contacto",
    "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous.": "WinPulse é o nome comercial utilizado para wnpulse.com. Os contactos do seu operador encontram-se abaixo.",
    "Hébergement": "Alojamento",
    "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur.": "A interface é disponibilizada na Vercel. O editor deve indicar os dados legais completos do fornecedor de alojamento e do prestador do backend.",
    "Hébergement web : Vercel — coordonnées complètes à renseigner.": "Alojamento web: Vercel — contactos completos por preencher.",
    "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé.": "Alojamento do backend e localização dos dados: preencher conforme o serviço efetivamente utilizado.",
    "Propriété intellectuelle": "Propriedade intelectual",
    "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive.": "Os elementos criados pela WinPulse são protegidos pelos direitos aplicáveis. É proibida a redistribuição comercial sem autorização. Marcas, imagens, dados e vídeos de terceiros continuam sujeitos aos direitos dos respetivos titulares; a sua presença não significa que a WinPulse detenha a propriedade exclusiva.",
    "Nature du service": "Natureza do serviço",
    "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain.": "A WinPulse fornece informações e prognósticos desportivos. Não recebe apostas nem as liquida. Ofertas, pagamentos e acessos constam das [Condições Gerais de Venda](/legal/cgv). As decisões de aposta não têm garantia de ganhos.",
    "Données et signalements": "Dados e comunicações",
    "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable).": "Questões sobre o site, conteúdos ou dados: contact@wnpulse.com. Consulte a [política de privacidade](/legal/confidentialite) e as informações sobre [jogo responsável](/legal/jeu-responsable).",
    "Conditions Générales de Vente": "Condições Gerais de Venda",
    "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.": "Condições da WinPulse Pro: 10 500 FCFA por 30 dias, sem renovação automática.",
    "1. Exploitant et champ d’application": "1. Operador e âmbito",
    "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :": "Estas Condições Gerais de Venda regulam as subscrições pagas em **https://wnpulse.com**, explorado sob o nome comercial **WinPulse** por:",
    "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays.": "O serviço destina-se a pessoas com pelo menos 18 anos e capacidade para contratar. O utilizador deve respeitar as restrições do seu país. O acesso à WinPulse não autoriza a utilização de operadores de apostas proibidos nesse país.",
    "2. Nature du service": "2. Natureza do serviço",
    "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée.": "A WinPulse fornece informações desportivas, prognósticos, comparações de odds e explicações. O preço da subscrição remunera o acesso às funcionalidades descritas na oferta adquirida.",
    "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions.": "A WinPulse não recebe os valores apostados nem liquida as apostas do utilizador. Eventuais apostas são contratadas separadamente com operadores terceiros, segundo as suas condições.",
    "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles.": "As explicações podem basear-se nos dados do motor WinPulse, com apoio de um serviço de inteligência artificial quando disponível. A IA explicativa não é apresentada como origem de todos os prognósticos. Pode ser substituída por uma explicação local baseada nas informações disponíveis.",
    "3. Offre gratuite et abonnement Pro": "3. Acesso gratuito e subscrição Pro",
    "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée.": "O acesso **Free** é gratuito. Inclui pré-visualizações e funcionalidades efetivamente abertas aos utilizadores gratuitos, e o histórico público disponível. A quantidade de seleções depende dos encontros e dados disponíveis; não se garante um prognóstico gratuito diário quando nenhuma seleção é publicada.",
    "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique.": "A oferta paga atual é **WinPulse Pro — 10 500 FCFA (XOF) por 30 dias de calendário**, sem renovação automática.",
    "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1.": "Conforme os dados e encontros disponíveis, Pro desbloqueia prognósticos para subscritores, combinadas propostas, Combo Builder e gravação de combinadas, apostas de valor, explicações de jogos e funcionalidades de apostas progressivas quando disponíveis. O apoio pode ser contactado pelo endereço e número do artigo 1.",
    "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants.": "Uma seleção, combinada ou etapa progressiva pode não ser proposta se não cumprir os critérios do motor. A subscrição não garante um número fixo de jogos por dia nem uma sequência diária de apostas ganhas.",
    "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande.": "A antiga oferta Elite e os preços anteriores já não estão abertos a novas encomendas no catálogo atual. Os direitos de uma encomenda anterior mantêm-se conforme acordado nessa encomenda.",
    "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier.": "O preço total, incluindo os impostos aplicáveis, é apresentado antes da confirmação da encomenda. Se for proposta outra moeda ou conversão, o montante e as condições são apresentados antes do pagamento. Eventuais custos de câmbio ou da instituição de pagamento do utilizador seguem as condições dessa instituição.",
    "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée.": "As alterações de preço aplicam-se a encomendas futuras e não alteram retroativamente o preço de um período já pago.",
    "4. Commande et paiement": "4. Encomenda e pagamento",
    "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer.": "Antes de pagar, o utilizador verifica a oferta, montante, duração e contactos. Deve poder consultar estas condições e corrigir erros antes de confirmar a compra através de uma ação que indique claramente a obrigação de pagar.",
    "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires.": "Os meios disponíveis são os efetivamente apresentados no processo de compra: **pagamento móvel** e cartões bancários compatíveis apenas quando ativados. A disponibilidade de Visa ou Mastercard não é garantida em todos os países ou prestadores.",
    "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande.": "O número de apoio **+33767971752 não é um número de comerciante para pagamentos**. As transferências devem seguir exclusivamente as instruções apresentadas no momento da encomenda.",
    "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur.": "A ativação ocorre após verificação do pagamento pelo prestador ou pela WinPulse quando estiver prevista e anunciada uma verificação manual. Uma captura de ecrã ou mensagem WhatsApp não confirma definitivamente o pagamento. As datas de ativação e expiração devem ser comunicadas ao utilizador.",
    "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte.": "Deve ser enviada uma confirmação com a informação contratual num suporte duradouro, por exemplo email. Em caso de débito sem ativação, o utilizador contacta o apoio com a referência da transação, sem enviar PIN, palavra-passe ou número completo do cartão.",
    "5. Durée, renouvellement et fin d’accès": "5. Duração, renovação e fim do acesso",
    "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil.": "O período pago dura **30 dias de calendário desde a ativação confirmada**, sujeito às datas exatas comunicadas para a encomenda. Não corresponde necessariamente a um mês civil.",
    "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant.": "Esta oferta não tem renovação automática nem cobrança recorrente. Na expiração, termina o acesso reservado aos subscritores e a conta regressa a Free. É necessária uma nova compra para prolongar o acesso pago.",
    "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi.": "O utilizador pode pedir o encerramento da conta em contact@wnpulse.com. O encerramento não elimina um eventual direito legal a reembolso nem obriga a apagar documentos cuja conservação seja legalmente exigida.",
    "6. Rétractation et remboursements": "6. Livre resolução e reembolsos",
    "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier.": "Quando se aplica o direito de livre resolução dos contratos à distância, o consumidor dispõe, em princípio, de **14 dias a contar da celebração do contrato** para comunicar a decisão sem a justificar.",
    "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire.": "A comunicação pode ser enviada para **contact@wnpulse.com**, com nome, email da conta e referência da encomenda, ou por outra declaração inequívoca admissível. O modelo em anexo é facultativo.",
    "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur.": "A ativação ou consulta de prognósticos não elimina, por si só, os direitos do consumidor. Para um serviço iniciado nesse prazo, uma eventual dedução proporcional ao serviço prestado deve respeitar as condições legais, incluindo informação prévia e pedido expresso do consumidor.",
    "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions.": "As exceções para certos conteúdos digitais só podem ser invocadas se as condições aplicáveis forem efetivamente cumpridas: consentimento expresso prévio, reconhecimento da perda do direito quando legalmente prevista e confirmação contratual exigida. Aceitar genericamente estas condições ou uma caixa «sem reembolsos» não cria esses requisitos.",
    "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires.": "Os reembolsos por livre resolução são efetuados no prazo legal aplicável, em princípio até 14 dias após receber a comunicação, pelo meio de pagamento original salvo acordo expresso de outra solução sem encargos adicionais.",
    "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu.": "Independentemente da livre resolução, mantêm-se os direitos legais relativos a serviços não prestados ou não conformes, cobranças indevidas e pagamentos duplicados. Um prognóstico perdido não constitui, por si só, defeito do serviço de informação vendido.",
    "7. Pronostics, statistiques et risques": "7. Prognósticos, estatísticas e riscos",
    "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision.": "As odds variam e podem diferir das apresentadas na publicação. Antes de decidir, o utilizador verifica sempre o mercado, equipas, horário e odd junto do operador.",
    "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté.": "As indicações de confiança, pontuações, níveis de risco e indicadores de valor são estimativas ou indicadores metodológicos. Não garantem resultados nem representam, sem medição e explicação específicas, uma taxa de sucesso observada.",
    "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs.": "As apostas progressivas e combinadas não são investimentos, rendimento assegurado ou garantia de recuperar perdas. Combinar seleções pode aumentar o risco de perder o boletim. Desempenhos passados e exemplos de seleções ganhas não garantem resultados futuros.",
    "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles.": "A WinPulse não promete ganhos. O utilizador é livre de não apostar. As apostas podem causar perdas financeiras e dependência; não devem ser financiadas com dinheiro necessário para despesas essenciais.",
    "8. Scores Live, vidéos et actualités": "8. Resultados Live, vídeos e notícias",
    "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé.": "Resultados e horários provêm de terceiros. Podem estar atrasados, incompletos, corrigidos ou temporariamente indisponíveis. Devem ser considerados os indicadores de atualização; a liquidação depende das regras do operador onde a aposta foi colocada.",
    "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier.": "Os vídeos eventualmente apresentados no Live usam leitores terceiros, nomeadamente YouTube, a partir de transmissões incorporáveis disponíveis. O acesso depende do emissor, país, restrições e disponibilidade técnica. A subscrição não compra direitos televisivos nem garante a transmissão de um jogo ou campeonato específico.",
    "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites.": "O blog pode apresentar guias e ligações noticiosas com a respetiva fonte. Uma data de deteção automática não é necessariamente a data de publicação original. As ligações remetem para editores terceiros cujas condições se aplicam nos seus sites.",
    "9. Disponibilité et conformité du service": "9. Disponibilidade e conformidade do serviço",
    "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise.": "A WinPulse utiliza meios razoáveis para disponibilizar o serviço e corrigir anomalias. Manutenção, incidentes ou falhas de prestadores podem causar interrupções; não se promete disponibilidade permanente sem interrupções.",
    "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement.": "Em caso de não fornecimento ou não conformidade, o utilizador contacta o apoio para procurar uma solução nas condições e prazos legais. Consoante o caso, os meios de recurso podem incluir reposição da conformidade, redução do preço ou resolução do contrato e reembolso.",
    "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur.": "Estas condições não excluem garantias ou responsabilidades legalmente irrenunciáveis. A responsabilidade da WinPulse é apreciada segundo os factos e a lei aplicável; as decisões de aposta não justificam uma exclusão geral da responsabilidade do fornecedor.",
    "10. Compte et usage des contenus": "10. Conta e utilização dos conteúdos",
    "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite.": "O utilizador fornece informações exatas e protege as credenciais. O acesso pago é pessoal; é proibida a revenda de acessos ou redistribuição comercial de conteúdos sem autorização.",
    "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni.": "A suspensão por fraude ou abuso deve ser fundamentada e proporcional. Salvo exigências de segurança ou impedimento legal, o motivo é comunicado e pode ser contestado junto do apoio. Não implica automaticamente perder valores correspondentes a um serviço não prestado.",
    "11. Données personnelles et WhatsApp": "11. Dados pessoais e WhatsApp",
    "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables.": "Os dados necessários à conta, pagamento e apoio são tratados no âmbito do serviço. A política deve identificar o responsável, finalidades, fundamentos jurídicos, destinatários, prazos de conservação, eventuais transferências internacionais e formas de exercer direitos, nos termos do RGPD e outras regras aplicáveis.",
    "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV.": "Fornecer um número WhatsApp para a conta ou apoio não autoriza automaticamente contactos comerciais. As comunicações comerciais e a entrada em grupos ou comunidades devem respeitar as regras aplicáveis, com as escolhas e possibilidades de oposição necessárias. A aceitação destas condições não implica adesão a um grupo.",
    "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**.": "Pedidos sobre dados ou preferências de contacto: **contact@wnpulse.com**.",
    "12. Réclamations, droit applicable et litiges": "12. Reclamações, lei aplicável e litígios",
    "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande.": "Pode reclamar para **contact@wnpulse.com** ou **+33767971752**, indicando elementos que permitam identificar a encomenda.",
    "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent.": "Estas condições regem-se pelo **direito irlandês**, sem retirar ao consumidor as proteções imperativas da lei aplicável à sua situação, nomeadamente do país de residência habitual quando aplicáveis.",
    "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs.": "As partes podem procurar uma solução amigável. Isso não retira os meios de recurso nem o acesso aos tribunais competentes segundo as regras aplicáveis. Não é imposta a todos os consumidores competência exclusiva dos tribunais de Dublin.",
    "13. Évolution des CGV": "13. Alteração das condições",
    "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent.": "A versão aceite na encomenda rege o período adquirido, sem prejuízo de normas imperativas e alterações validamente acordadas. As novas versões são datadas e disponibilizadas antes das encomendas a que se aplicam.",
    "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi.": "Uma alteração não reduz retroativamente os direitos de uma subscrição já paga. As alterações de um serviço em curso respeitam os deveres legais de informação e os direitos do utilizador.",
    "Annexe — Modèle de notification de rétractation": "Anexo — Modelo de comunicação de livre resolução",
    "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1.": "Enviar para **contact@wnpulse.com**, ou para o endereço postal completo do operador indicado no artigo 1.",
    "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :": "«Comunico a minha decisão de resolver o contrato relativo à seguinte subscrição WinPulse:",
    "Référence de commande : …": "Referência da encomenda: …",
    "Date de conclusion du contrat : …": "Data de celebração do contrato: …",
    "Nom du client : …": "Nome do cliente: …",
    "Email associé au compte : …": "Email associado à conta: …",
    "Adresse du client : …": "Morada do cliente: …",
    "Date de notification : …": "Data da comunicação: …",
    "Signature, uniquement pour une notification sur papier : … »": "Assinatura, apenas para comunicações em papel: …»",
    "Politique de confidentialité": "Política de privacidade",
    "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.": "Conta, pagamentos, WhatsApp e serviços terceiros: informação sobre os seus dados.",
    "Responsable du traitement": "Responsável pelo tratamento",
    "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com.": "O operador da WinPulse determina as finalidades e meios de tratamento relativos à conta e ao serviço. A identidade e morada completas devem ser indicadas abaixo. Contacto para dados: contact@wnpulse.com.",
    "Données concernées": "Dados abrangidos",
    "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :": "Consoante as ações e funcionalidades ativadas, os dados abrangidos incluem:",
    "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.": "Conta: nome, email, número WhatsApp e identificadores necessários à autenticação. A palavra-passe deve ser guardada sob a forma de hash, não em texto simples.",
    "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.": "Subscrição e pagamento: plano, datas de acesso, montante, estado, referência da transação e eventual comprovativo enviado. Nunca envie ao apoio o PIN, código de segurança ou número completo do cartão.",
    "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.": "Utilização e segurança: páginas consultadas, registos de data e hora, sessões, registos técnicos, endereço IP e dados do navegador quando registados.",
    "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences.": "Conteúdos da conta: combinadas guardadas, escolhas de contacto, mensagens de apoio e preferências.",
    "Finalités et bases légales": "Finalidades e fundamentos jurídicos",
    "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant.": "A autenticação, gestão da subscrição, conteúdos guardados e apoio baseiam-se na execução do contrato ou diligências solicitadas antes da sua celebração. As obrigações contabilísticas e pedidos legais baseiam-se nos deveres aplicáveis ao operador.",
    "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres.": "A segurança, prevenção de fraude e diagnóstico de incidentes podem basear-se em interesse legítimo, após avaliar a necessidade e os efeitos nos seus direitos. Marketing e rastreadores não necessários estão sujeitos às regras de consentimento ou condições legais próprias.",
    "Numéro WhatsApp, prospection et communautés": "Número WhatsApp, marketing e comunidades",
    "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique.": "A recolha de um número para a conta ou apoio não é consentimento geral para publicidade. Aceitar estas condições não substitui as escolhas exigidas para marketing eletrónico.",
    "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres.": "Os contactos comerciais devem respeitar a sua escolha e permitir oposição simples. Pode retirar consentimento sem impedir mensagens necessárias à conta. O registo não implica entrada num grupo ou comunidade; num grupo, algumas informações podem ser visíveis para os outros membros.",
    "Destinataires et prestataires": "Destinatários e prestadores",
    "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique.": "Os dados são acessíveis a pessoas autorizadas de administração e apoio e a prestadores conforme necessário às suas funções. A lista nominal dos prestadores realmente utilizados e das suas funções deve ser completada antes de publicar esta política.",
    "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.": "Alojamento web: Vercel; backend, base de dados e países de armazenamento: por especificar.",
    "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.": "Emails transacionais e pagamentos: indicar os prestadores ativos na lista de subcontratantes.",
    "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.": "Explicações: serviço local e fornecedores de IA, se configurados. Enviar dados de jogos para IA não exige enviar a palavra-passe ou dados de pagamento.",
    "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques.": "Vídeos: Google / YouTube ao abrir o leitor incorporado. O WhatsApp intervém ao utilizar esse canal. Estes terceiros podem também tratar dados para fins próprios segundo as suas políticas.",
    "Lecteur vidéo, cookies et stockage local": "Leitor de vídeo, cookies e armazenamento local",
    "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences.": "O navegador pode guardar elementos necessários à autenticação, preferências e cache de resultados, através de armazenamento local ou de sessão. Apagá-los pode terminar a sessão ou repor preferências.",
    "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers.": "O leitor YouTube carrega após uma ação de reprodução. A abertura pode transmitir à Google informações técnicas, incluindo IP e dados do navegador. O modo de privacidade reforçada não significa ausência total de tratamento por esse terceiro.",
    "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs.": "Os mecanismos de consentimento necessários para cookies, rastreadores e serviços incorporados devem ser implementados antes da utilização quando exigido pela regulamentação. Navegar no site não é apresentado como consentimento para todos os rastreadores.",
    "Conservation et transferts": "Conservação e transferências",
    "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant.": "Os prazos dependem da finalidade: disponibilizar a conta, tratar pedidos, segurança, obrigações contabilísticas ou defesa de direitos. Eliminar a conta não apaga necessariamente documentos de conservação legal obrigatória. O operador deve especificar os prazos detalhados e regras de eliminação realmente aplicados.",
    "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties.": "Os países de tratamento dependem dos prestadores ativos. As transferências fora do Espaço Económico Europeu devem basear-se num mecanismo legal adequado, como decisão de adequação aplicável ou garantias contratuais apropriadas. Contacte contact@wnpulse.com para informações sobre destinatários e garantias.",
    "Vos droits et réclamations": "Os seus direitos e reclamações",
    "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales.": "Nas condições do RGPD, pode pedir acesso, retificação, apagamento, limitação, portabilidade e oposição, e retirar consentimento sem afetar tratamentos lícitos anteriores. Alguns direitos têm limites ligados à situação e às obrigações legais.",
    "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire.": "Envie pedidos para contact@wnpulse.com. O prazo de resposta é, em princípio, um mês; qualquer prorrogação legalmente permitida deve ser explicada nesse prazo. Pode ser pedida verificação de identidade proporcional quando necessária.",
    "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée.": "Pode contactar a [Data Protection Commission irlandesa](https://www.dataprotection.ie/) ou a autoridade competente do local de residência, trabalho ou alegada infração.",
    "Sécurité et estimations sportives": "Segurança e estimativas desportivas",
    "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page.": "O operador deve aplicar medidas técnicas e organizativas adequadas aos riscos, limitar acessos e proteger dados transmitidos. Esta página não garante segurança absoluta nem versão específica de protocolo.",
    "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com.": "Os indicadores desportivos referem-se a encontros e não são apresentados como decisões jurídicas automatizadas sobre si. Pode comunicar incidentes ou pedidos de privacidade para contact@wnpulse.com.",
    "Jeu responsable": "Jogo responsável",
    "Comprendre les limites des pronostics et garder le contrôle.": "Compreender os limites dos prognósticos e manter o controlo.",
    "Un service réservé aux personnes majeures": "Um serviço reservado a adultos",
    "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur.": "O acesso é reservado a pessoas com pelo menos 18 anos. A idade e o acesso a operadores também dependem do país. Declarações falsas podem levar à suspensão sem retirar direitos imperativos do consumidor.",
    "Aucun résultat n’est garanti": "Nenhum resultado é garantido",
    "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres.": "Confiança elevada, odds baixas, uma sequência positiva ou uma indicação de risco não tornam certa uma aposta. O desempenho passado não prevê com certeza os próximos encontros.",
    "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes.": "As combinadas e apostas progressivas podem falhar. Não são investimentos, rendimentos assegurados nem forma garantida de recuperar perdas.",
    "Garder le contrôle": "Manter o controlo",
    "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress.": "Pode usar informações desportivas sem apostar. Se apostar, nunca utilize empréstimos ou dinheiro necessário para despesas essenciais. Evite tentar recuperar perdas e faça uma pausa se o jogo causar stress.",
    "Quand demander de l’aide": "Quando procurar ajuda",
    "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié.": "Se o jogo ocupar espaço excessivo, causar dificuldades financeiras ou o levar a ocultar hábitos de pessoas próximas, fale com alguém de confiança ou com um profissional qualificado.",
    "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés.": "Na Irlanda, a [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help) disponibiliza orientação oficial. Pode consultar também [GamblingCare](https://gamblingcare.ie/). Noutro país, procure serviços públicos locais adequados.",
    "Compte et communications": "Conta e comunicações",
    "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément.": "Para encerrar a conta WinPulse ou deixar de receber contactos comerciais: contact@wnpulse.com. O pedido não fecha contas em operadores de apostas terceiros; os seus mecanismos de exclusão devem ser utilizados separadamente.",
    "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique.": "Consulte o histórico disponível no [Track record](/resultats). Resultados vencedores selecionados para publicidade não substituem a análise de todo o histórico.",
    "Nom commercial": "Nome comercial",
    "Nom légal de l’exploitant": "Nome legal do operador",
    "Forme ou qualité juridique": "Forma ou qualidade jurídica",
    "Adresse postale complète": "Morada postal completa",
    "Ville et pays": "Cidade e país",
    "Registre et immatriculation, selon le statut": "Registo e matrícula, conforme o estatuto",
    "TVA, si applicable": "IVA, se aplicável",
    "Responsable de publication": "Responsável pela publicação",
    "À renseigner avant publication": "A preencher antes da publicação",
    "Email": "Email",
    "Téléphone / WhatsApp": "Telefone / WhatsApp",
    "Dublin": "Dublin",
    "Irlande": "Irlanda",
    "Informations légales": "Informações legais",
    "Retour au site": "Voltar ao site",
    "Pages légales": "Páginas legais",
    "Document légal": "Documento legal",
    "Dernière mise à jour :": "Última atualização:",
    "Informations légales à compléter.": "Informações legais por completar.",
    "L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.": "Devem ser indicadas a identidade jurídica e a morada postal completa do operador. «Dublin, Irlanda» indica apenas a cidade e o país. Os campos incompletos continuam assinalados abaixo.",
    "Sommaire de ce document": "Índice deste documento",
    "Une question ? Contactez-nous": "Tem dúvidas? Contacte-nos",
    "Contacter le support sur WhatsApp": "Contactar o apoio pelo WhatsApp",
    "← Retour à l’accueil WinPulse": "← Voltar ao início da WinPulse"
  },
  "de": {
    "Mentions légales": "Impressum",
    "Éditeur, hébergement et contacts de WinPulse.": "Anbieter, Hosting und Kontaktdaten von WinPulse.",
    "Éditeur et contact": "Anbieter und Kontakt",
    "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous.": "WinPulse ist der für wnpulse.com verwendete Handelsname. Die Kontaktdaten des Betreibers stehen unten.",
    "Hébergement": "Hosting",
    "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur.": "Die Website-Oberfläche wird auf Vercel bereitgestellt. Der Anbieter muss die vollständigen rechtlichen Angaben zum Hosting- und Backend-Dienstleister ergänzen.",
    "Hébergement web : Vercel — coordonnées complètes à renseigner.": "Webhosting: Vercel — vollständige Kontaktdaten sind zu ergänzen.",
    "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé.": "Backend-Hosting und Datenstandort: entsprechend dem tatsächlich eingesetzten Dienst zu ergänzen.",
    "Propriété intellectuelle": "Geistiges Eigentum",
    "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive.": "Von WinPulse erstellte Inhalte sind nach den anwendbaren Rechten geschützt. Ihre gewerbliche Weiterverbreitung ohne Erlaubnis ist untersagt. Marken, Bilder, Daten und Videos Dritter unterliegen weiterhin den Rechten ihrer Inhaber; ihre Anzeige bedeutet kein ausschließliches Eigentum von WinPulse.",
    "Nature du service": "Art des Dienstes",
    "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain.": "WinPulse bietet Sportinformationen und Prognosen. Die Website nimmt keine Einsätze an und rechnet keine Wetten ab. Angebote, Zahlungen und Zugang regeln die [Allgemeinen Verkaufsbedingungen](/legal/cgv). Wettentscheidungen sind mit keiner Gewinngarantie verbunden.",
    "Données et signalements": "Daten und Meldungen",
    "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable).": "Fragen zu Website, Inhalten oder Daten: contact@wnpulse.com. Siehe [Datenschutzerklärung](/legal/confidentialite) und Informationen zum [verantwortungsvollen Spielen](/legal/jeu-responsable).",
    "Conditions Générales de Vente": "Allgemeine Verkaufsbedingungen",
    "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.": "Bedingungen für WinPulse Pro: 10 500 FCFA für 30 Tage, ohne automatische Verlängerung.",
    "1. Exploitant et champ d’application": "1. Betreiber und Geltungsbereich",
    "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :": "Diese Allgemeinen Verkaufsbedingungen regeln kostenpflichtige Abonnements auf **https://wnpulse.com**, betrieben unter dem Handelsnamen **WinPulse** durch:",
    "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays.": "Der Dienst richtet sich an mindestens 18-jährige Personen, die Verträge schließen können. Nutzer müssen die Beschränkungen ihres Landes beachten. WinPulse-Zugang berechtigt nicht zur Nutzung eines dort verbotenen Wettanbieters.",
    "2. Nature du service": "2. Art des Dienstes",
    "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée.": "WinPulse bietet Sportinformationen, Prognosen, Quotenvergleiche und Erläuterungen. Der Abonnementpreis vergütet den Zugang zu den im bestellten Angebot beschriebenen Funktionen.",
    "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions.": "WinPulse nimmt keine Einsätze entgegen und rechnet Nutzerwetten nicht ab. Etwaige Wetten werden gesondert bei Drittanbietern zu deren Bedingungen abgeschlossen.",
    "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles.": "Erläuterungen können anhand der WinPulse-Engine-Daten erstellt werden, bei Verfügbarkeit mit Unterstützung eines KI-Dienstes. Erklärende KI wird nicht als Ursprung sämtlicher Prognosen dargestellt. Sie kann durch eine lokale Erläuterung anhand verfügbarer Informationen ersetzt werden.",
    "3. Offre gratuite et abonnement Pro": "3. Kostenloser Zugang und Pro-Abonnement",
    "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée.": "Der **Free**-Zugang ist kostenlos. Er umfasst tatsächlich für kostenlose Nutzer freigegebene Vorschauen und Funktionen sowie den verfügbaren öffentlichen Verlauf. Die Zahl zugänglicher Tipps hängt von Begegnungen und Daten ab; ohne veröffentlichte Auswahl ist kein täglicher Gratistipp garantiert.",
    "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique.": "Das derzeitige kostenpflichtige Angebot lautet **WinPulse Pro — 10 500 FCFA (XOF) für 30 Kalendertage**, ohne automatische Verlängerung.",
    "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1.": "Abhängig von Daten und Begegnungen schaltet Pro Abonnentenprognosen, angebotene Kombiwetten, den Combo Builder samt Speichern, Value Bets, Spielerläuterungen und Funktionen für progressive Wettserien frei, soweit verfügbar. Support ist unter Adresse und Nummer aus Abschnitt 1 erreichbar.",
    "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants.": "Eine Auswahl, Kombiwette oder Serienetappe kann ausbleiben, wenn die Engine-Kriterien nicht erfüllt sind. Das Abonnement garantiert weder eine feste tägliche Spielzahl noch täglich eine Folge gewonnener Wetten.",
    "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande.": "Das frühere Elite-Angebot und alte Preise stehen im aktuellen Katalog nicht mehr für Neubestellungen offen. Rechte aus früheren Bestellungen richten sich weiterhin nach der damaligen Vereinbarung.",
    "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier.": "Der Gesamtpreis einschließlich anwendbarer Steuern wird vor Bestellbestätigung angezeigt. Werden andere Währungen oder Umrechnungen angeboten, erscheinen Betrag und Bedingungen vor Zahlung. Wechselkurs- und Zahlungsinstitutsgebühren richten sich nach den Bedingungen des jeweiligen Instituts.",
    "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée.": "Preisänderungen gelten für künftige Bestellungen und ändern nicht rückwirkend den Preis eines bereits bezahlten Zeitraums.",
    "4. Commande et paiement": "4. Bestellung und Zahlung",
    "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer.": "Vor Zahlung prüft der Nutzer Angebot, Betrag, Dauer und Kontaktdaten. Er muss diese Bedingungen einsehen und Eingabefehler korrigieren können, bevor eine eindeutig zahlungspflichtige Handlung den Kauf bestätigt.",
    "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires.": "Nutzbar sind die im Bestellprozess tatsächlich angezeigten Zahlungsmittel: **mobile Zahlung** und kompatible Bankkarten nur bei dortiger Freischaltung. Visa- oder Mastercard-Verfügbarkeit ist nicht für jedes Land und jeden Dienstleister garantiert.",
    "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande.": "Die Supportnummer **+33767971752 ist keine Händlernummer für Zahlungen**. Überweisungen dürfen nur nach den bei Bestellung angezeigten Zahlungsanweisungen erfolgen.",
    "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur.": "Die Freischaltung erfolgt nach Zahlungsprüfung durch den Dienstleister oder durch WinPulse, wenn eine manuelle Prüfung vorgesehen und angekündigt ist. Ein Screenshot oder eine WhatsApp-Nachricht bestätigt die Zahlung nicht endgültig. Freischaltungs- und Ablaufdatum müssen dem Nutzer mitgeteilt werden.",
    "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte.": "Eine Bestätigung mit Vertragsinformationen muss auf einem dauerhaften Datenträger, etwa per E-Mail, übermittelt werden. Bei Abbuchung ohne Freischaltung kontaktiert der Nutzer den Support mit der Transaktionsreferenz, ohne PIN, Passwort oder vollständige Kartennummer zu senden.",
    "5. Durée, renouvellement et fin d’accès": "5. Dauer, Verlängerung und Zugangsende",
    "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil.": "Der bezahlte Zeitraum beträgt **30 Kalendertage ab bestätigter Freischaltung**, vorbehaltlich der genau mitgeteilten Bestelldaten. Er entspricht nicht unbedingt einem Kalendermonat.",
    "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant.": "Dieses Angebot hat weder automatische Verlängerung noch wiederkehrende Abbuchung. Bei Ablauf endet der Abonnentenzugang und das Konto erhält wieder Free-Zugang. Eine Verlängerung erfordert einen neuen Kauf.",
    "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi.": "Die Kontoschließung kann unter contact@wnpulse.com beantragt werden. Sie beseitigt keinen etwaigen gesetzlichen Erstattungsanspruch und erfordert nicht die Löschung gesetzlich aufzubewahrender Unterlagen.",
    "6. Rétractation et remboursements": "6. Widerruf und Erstattungen",
    "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier.": "Soweit das Widerrufsrecht für Fernabsatzverträge gilt, können Verbraucher grundsätzlich **binnen 14 Tagen nach Vertragsschluss** ihre Entscheidung ohne Begründung mitteilen.",
    "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire.": "Die Mitteilung kann an **contact@wnpulse.com** mit Name, Konto-E-Mail und Bestellreferenz oder durch eine andere zulässige eindeutige Erklärung erfolgen. Das Muster im Anhang kann freiwillig verwendet werden.",
    "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur.": "Freischaltung oder Abruf von Prognosen allein beseitigen keine Verbraucherrechte. Bei einem während dieser Frist begonnenen Dienst muss ein etwaiger anteiliger Abzug die gesetzlichen Voraussetzungen erfüllen, insbesondere vorherige Information und ausdrückliches Verlangen des Verbrauchers.",
    "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions.": "Ausnahmen für bestimmte digitale Inhalte dürfen nur bei tatsächlich erfüllten Voraussetzungen geltend gemacht werden, insbesondere vorherige ausdrückliche Zustimmung, Bestätigung des gesetzlich vorgesehenen Rechtsverlusts und erforderliche Vertragsbestätigung. Allgemeine AGB-Zustimmung oder ein Feld „keine Erstattung“ schaffen diese Voraussetzungen nicht.",
    "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires.": "Widerrufsbedingte Erstattungen erfolgen innerhalb der gesetzlichen Frist, grundsätzlich spätestens 14 Tage nach Eingang der Mitteilung, über das ursprüngliche Zahlungsmittel, sofern nicht ausdrücklich eine andere kostenfreie Lösung vereinbart wurde.",
    "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu.": "Unabhängig vom Widerruf gelten gesetzliche Rechte bei nicht erbrachten oder nicht vertragsgemäßen Diensten, unberechtigten Abbuchungen und Doppelzahlungen weiter. Eine verlorene Prognose allein ist kein Mangel des verkauften Informationsdienstes.",
    "7. Pronostics, statistiques et risques": "7. Prognosen, Statistiken und Risiken",
    "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision.": "Quoten ändern sich und können von den veröffentlichten abweichen. Vor jeder Entscheidung prüft der Nutzer Markt, Teams, Zeit und Quote beim Wettanbieter.",
    "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté.": "Vertrauenswerte, Scores, Risikostufen und Value-Indikatoren sind Schätzungen oder methodische Kennzahlen. Sie sind weder Ergebnisgarantien noch ohne gesonderte Messung und Erläuterung beobachtete Erfolgsquoten.",
    "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs.": "Progressive Wettserien und Kombiwetten sind weder Geldanlagen noch gesichertes Einkommen oder eine Verlustausgleichsgarantie. Mehrere kombinierte Tipps können das Verlustrisiko des Wettscheins erhöhen. Vergangene Leistungen und Gewinnbeispiele garantieren keine künftigen Ergebnisse.",
    "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles.": "WinPulse verspricht keine Gewinne. Nutzer können auf Wetten verzichten. Wetten können Geldverluste und Abhängigkeit verursachen; lebensnotwendige Ausgaben dürfen nicht dafür verwendet werden.",
    "8. Scores Live, vidéos et actualités": "8. Live-Ergebnisse, Videos und Nachrichten",
    "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé.": "Ergebnisse und Zeiten stammen von Drittanbietern. Sie können verzögert, unvollständig, korrigiert oder vorübergehend nicht verfügbar sein. Aktualitätshinweise sind zu beachten; die Wettabrechnung richtet sich nach dem Anbieter, bei dem gewettet wurde.",
    "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier.": "Etwaige Live-Videos werden über Drittanbieter-Player, etwa YouTube, aus verfügbaren einbettbaren Übertragungen gezeigt. Der Zugang hängt von Sender, Land, Beschränkungen und Technik ab. Das Abonnement erwirbt keine Fernsehübertragungsrechte und garantiert keine Übertragung bestimmter Spiele oder Wettbewerbe.",
    "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites.": "Der Blog kann Ratgeber und Nachrichtenlinks mit Quellenangabe zeigen. Das automatische Entdeckungsdatum ist nicht zwingend das ursprüngliche Veröffentlichungsdatum. Links führen zu Drittanbietern, deren Bedingungen auf deren Websites gelten.",
    "9. Disponibilité et conformité du service": "9. Verfügbarkeit und Vertragsmäßigkeit",
    "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise.": "WinPulse setzt angemessene Mittel für Zugang und Fehlerbehebung ein. Wartung, Störungen oder Dienstleisterausfälle können Unterbrechungen verursachen; ständige unterbrechungsfreie Verfügbarkeit wird nicht versprochen.",
    "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement.": "Bei Nichtbereitstellung oder Vertragswidrigkeit kontaktiert der Nutzer den Support zur Lösung nach gesetzlichen Bedingungen und Fristen. Je nach Fall kommen Herstellung der Vertragsmäßigkeit, Preisminderung oder Vertragsbeendigung und Erstattung in Betracht.",
    "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur.": "Diese Bedingungen schließen gesetzlich unabdingbare Gewährleistung oder Haftung nicht aus. Die Haftung von WinPulse richtet sich nach Sachverhalt und anwendbarem Recht; Wettentscheidungen rechtfertigen keinen pauschalen Ausschluss jeder Anbieterhaftung.",
    "10. Compte et usage des contenus": "10. Konto und Inhaltsnutzung",
    "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite.": "Nutzer machen richtige Angaben und schützen ihre Zugangsdaten. Bezahlter Zugang ist persönlich; Weiterverkauf des Zugangs oder gewerbliche Inhaltsweitergabe ohne Erlaubnis sind verboten.",
    "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni.": "Sperrungen wegen Betrugs oder Missbrauchs müssen begründet und verhältnismäßig sein. Soweit Sicherheitserfordernisse oder rechtliche Hindernisse nicht entgegenstehen, wird der Grund mitgeteilt und kann beim Support beanstandet werden. Beträge für nicht erbrachte Dienste verfallen dadurch nicht automatisch.",
    "11. Données personnelles et WhatsApp": "11. Personenbezogene Daten und WhatsApp",
    "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables.": "Konto-, Zahlungs- und Supportdaten werden im Rahmen des Dienstes verarbeitet. Die Datenschutzerklärung muss Verantwortlichen, Zwecke, Rechtsgrundlagen, Empfänger, Speicherfristen, mögliche internationale Übermittlungen und Verfahren zur Rechtsausübung gemäß DSGVO und weiteren Regeln benennen.",
    "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV.": "Eine WhatsApp-Nummer für Konto oder Support erlaubt nicht automatisch Werbung. Geschäftliche Nachrichten und Gruppen- oder Gemeinschaftsbeitritte müssen geltende Regeln mit erforderlichen Wahl- und Widerspruchsmöglichkeiten beachten. AGB-Zustimmung allein bewirkt keinen Gruppenbeitritt.",
    "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**.": "Anfragen zu Daten oder Kontaktpräferenzen: **contact@wnpulse.com**.",
    "12. Réclamations, droit applicable et litiges": "12. Beschwerden, anwendbares Recht und Streitigkeiten",
    "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande.": "Beschwerden können mit Angaben zur Bestellzuordnung an **contact@wnpulse.com** oder **+33767971752** gerichtet werden.",
    "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent.": "Es gilt **irisches Recht**, ohne Verbrauchern zwingende Schutzrechte des auf ihre Situation anwendbaren Rechts zu entziehen, insbesondere ihres gewöhnlichen Aufenthaltslandes, soweit anwendbar.",
    "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs.": "Die Parteien können eine einvernehmliche Lösung suchen. Dies beschränkt weder Rechtsbehelfe noch den Zugang zu zuständigen Gerichten nach geltenden Regeln. Es wird nicht allen Verbrauchern ein ausschließlicher Gerichtsstand Dublin vorgeschrieben.",
    "13. Évolution des CGV": "13. Änderungen dieser Bedingungen",
    "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent.": "Die bei Bestellung akzeptierte Fassung gilt für den gekauften Zeitraum, vorbehaltlich zwingenden Rechts und wirksam vereinbarter Änderungen. Neue Fassungen werden datiert und vor den betroffenen Bestellungen zugänglich gemacht.",
    "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi.": "Änderungen mindern nicht rückwirkend Rechte aus bereits bezahlten Abonnements. Änderungen laufender Dienste beachten gesetzliche Informationspflichten und Nutzerrechte.",
    "Annexe — Modèle de notification de rétractation": "Anhang — Muster-Widerrufsmitteilung",
    "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1.": "Senden an **contact@wnpulse.com** oder an die vollständige Betreiberanschrift aus Abschnitt 1.",
    "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :": "„Hiermit teile ich meinen Widerruf des Vertrags über folgendes WinPulse-Abonnement mit:",
    "Référence de commande : …": "Bestellreferenz: …",
    "Date de conclusion du contrat : …": "Datum des Vertragsschlusses: …",
    "Nom du client : …": "Kundenname: …",
    "Email associé au compte : …": "Konto-E-Mail: …",
    "Adresse du client : …": "Kundenanschrift: …",
    "Date de notification : …": "Datum der Mitteilung: …",
    "Signature, uniquement pour une notification sur papier : … »": "Unterschrift, nur bei Mitteilung auf Papier: …“",
    "Politique de confidentialité": "Datenschutzerklärung",
    "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.": "Konto, Zahlungen, WhatsApp und Drittdienste: Informationen zu Ihren Daten.",
    "Responsable du traitement": "Verantwortlicher",
    "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com.": "Der WinPulse-Betreiber bestimmt Zwecke und Mittel der konto- und dienstbezogenen Verarbeitung. Vollständige Identität und Anschrift sind unten anzugeben. Datenkontakt: contact@wnpulse.com.",
    "Données concernées": "Betroffene Daten",
    "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :": "Je nach Handlungen und aktivierten Funktionen umfassen die Daten:",
    "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.": "Konto: Name, E-Mail, WhatsApp-Nummer und Authentifizierungskennungen. Passwörter sind als Hash und nicht im Klartext zu speichern.",
    "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.": "Abonnement und Zahlung: Tarif, Beginn und Ende des Zugangs, Betrag, Status, Transaktionsreferenz und etwaige Belege. Senden Sie dem Support niemals PIN, Kartenprüfnummer oder vollständige Kartennummer.",
    "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.": "Nutzung und Sicherheit: besuchte Seiten, Zeitstempel, Sitzungen, technische Protokolle, IP-Adresse und Browserinformationen, soweit erfasst.",
    "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences.": "Kontoinhalte: gespeicherte Kombinationen, Kontaktentscheidungen, Supportnachrichten und Einstellungen.",
    "Finalités et bases légales": "Zwecke und Rechtsgrundlagen",
    "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant.": "Authentifizierung, Abonnementverwaltung, gespeicherte Inhalte und Support beruhen auf Vertragserfüllung oder angefragten vorvertraglichen Maßnahmen. Buchführungs- und gesetzliche Auskunftspflichten beruhen auf den für den Betreiber geltenden Verpflichtungen.",
    "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres.": "Sicherheit, Betrugsverhütung und Störungsdiagnose können nach Prüfung von Erforderlichkeit und Rechtsauswirkungen auf berechtigten Interessen beruhen. Werbung und nicht notwendige Tracker unterliegen eigenen Einwilligungsregeln oder anderen rechtlichen Voraussetzungen.",
    "Numéro WhatsApp, prospection et communautés": "WhatsApp-Nummer, Werbung und Gemeinschaften",
    "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique.": "Eine für Konto oder Support erhobene Nummer bedeutet keine allgemeine Werbeeinwilligung. AGB-Zustimmung ersetzt nicht die für elektronische Werbung erforderlichen Entscheidungen.",
    "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres.": "Werbung muss Ihre Wahl respektieren und einfachen Widerspruch ermöglichen. Einwilligungen können widerrufen werden, ohne notwendige Kontonachrichten zu verhindern. Registrierung allein bedeutet keinen Gruppen- oder Gemeinschaftsbeitritt; in Gruppen können andere Mitglieder bestimmte Informationen sehen.",
    "Destinataires et prestataires": "Empfänger und Dienstleister",
    "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique.": "Daten sind für befugte Verwaltungs- und Supportpersonen sowie erforderliche Dienstleister zugänglich. Die tatsächlichen Dienstleister und ihre Aufgaben müssen vor Veröffentlichung namentlich ergänzt werden.",
    "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.": "Webhosting: Vercel; Backend, Datenbank und Speicherländer: zu ergänzen.",
    "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.": "Transaktions-E-Mails und Zahlungen: aktive Anbieter im Auftragsverarbeiterverzeichnis angeben.",
    "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.": "Erläuterungen: lokaler Dienst und konfigurierte KI-Anbieter. Zur Übermittlung von Spieldaten an KI-Anbieter sind weder Ihr Passwort noch Zahlungsdaten erforderlich.",
    "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques.": "Videos: Google / YouTube beim Öffnen des eingebetteten Players. WhatsApp beim Nutzen dieses Kontaktwegs. Diese Dritten können Daten gemäß ihren Richtlinien auch für eigene Zwecke verarbeiten.",
    "Lecteur vidéo, cookies et stockage local": "Videoplayer, Cookies und lokaler Speicher",
    "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences.": "Der Browser kann für Authentifizierung, Einstellungen und Ergebnis-Cache erforderliche Elemente lokal oder sitzungsbezogen speichern. Löschen kann Sie abmelden oder Einstellungen zurücksetzen.",
    "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers.": "Der YouTube-Player lädt nach einer Wiedergabehandlung. Das Öffnen kann technische Daten, insbesondere IP-Adresse und Browserinformationen, an Google senden. Der erweiterte Datenschutzmodus bedeutet nicht, dass dieser Dritte keine Daten verarbeitet.",
    "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs.": "Erforderliche Einwilligungsmechanismen für Cookies, Tracker und eingebettete Dienste müssen vor Nutzung umgesetzt werden, soweit vorgeschrieben. Bloßes Surfen gilt nicht als Zustimmung zu sämtlichen Trackern.",
    "Conservation et transferts": "Speicherung und Übermittlungen",
    "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant.": "Fristen richten sich nach Zweck: Konto, Anfragenbearbeitung, Sicherheit, Buchführung oder Rechtsverteidigung. Kontolöschung entfernt nicht zwingend gesetzlich aufzubewahrende Belege. Tatsächliche Detailfristen und Löschregeln sind vom Betreiber noch zu ergänzen.",
    "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties.": "Verarbeitungsländer hängen von aktiven Anbietern ab. Übermittlungen außerhalb des Europäischen Wirtschaftsraums benötigen einen geeigneten Rechtsmechanismus, etwa einen geltenden Angemessenheitsbeschluss oder geeignete Vertragsgarantien. Informationen zu Empfängern und Garantien: contact@wnpulse.com.",
    "Vos droits et réclamations": "Ihre Rechte und Beschwerden",
    "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales.": "Unter den DSGVO-Voraussetzungen können Sie Auskunft, Berichtigung, Löschung, Einschränkung, Übertragbarkeit und Widerspruch verlangen sowie Einwilligungen ohne Beeinträchtigung vorheriger rechtmäßiger Verarbeitung widerrufen. Manche Rechte sind situations- und pflichtenbedingt begrenzt.",
    "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire.": "Anfragen an contact@wnpulse.com. Die Antwortfrist beträgt grundsätzlich einen Monat; eine rechtlich zulässige Verlängerung muss innerhalb dieser Frist erklärt werden. Erforderlichenfalls kann eine verhältnismäßige Identitätsprüfung verlangt werden.",
    "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée.": "Sie können sich an die [irische Data Protection Commission](https://www.dataprotection.ie/) oder die zuständige Behörde Ihres Wohn-, Arbeits- oder mutmaßlichen Verstoßortes wenden.",
    "Sécurité et estimations sportives": "Sicherheit und Sportschätzungen",
    "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page.": "Der Betreiber muss risikogerechte technische und organisatorische Maßnahmen anwenden, Zugriffe beschränken und übermittelte Daten schützen. Diese Seite garantiert weder absolute Sicherheit noch eine bestimmte Protokollversion.",
    "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com.": "Sportkennzahlen betreffen Begegnungen und werden nicht als automatisierte rechtliche Entscheidungen über Ihre Person dargestellt. Vorfälle oder Datenschutzanfragen: contact@wnpulse.com.",
    "Jeu responsable": "Verantwortungsvolles Spielen",
    "Comprendre les limites des pronostics et garder le contrôle.": "Grenzen von Prognosen verstehen und die Kontrolle behalten.",
    "Un service réservé aux personnes majeures": "Ein Dienst nur für Erwachsene",
    "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur.": "Zugang besteht erst ab 18 Jahren. Alters- und Zugangsvoraussetzungen bei Glücksspielanbietern hängen auch vom Land ab. Falschangaben können Sperrungen auslösen, ohne zwingende Verbraucherrechte zu beseitigen.",
    "Aucun résultat n’est garanti": "Kein Ergebnis ist garantiert",
    "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres.": "Hoher Vertrauenswert, niedrige Quote, positive Serie oder Risikohinweis machen eine Wette nicht sicher. Vergangene Leistungen sagen kommende Begegnungen nicht mit Sicherheit voraus.",
    "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes.": "Kombiwetten und progressive Wettserien können scheitern. Sie sind weder Anlagen noch gesichertes Einkommen oder ein garantierter Verlustausgleich.",
    "Garder le contrôle": "Kontrolle behalten",
    "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress.": "Sie können Sportinformationen ohne Wetten nutzen. Wenn Sie wetten, verwenden Sie niemals Kredite oder für wesentliche Ausgaben benötigtes Geld. Jagen Sie Verlusten nicht nach und pausieren Sie bei Stress durch Glücksspiel.",
    "Quand demander de l’aide": "Wann Hilfe suchen?",
    "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié.": "Nimmt Glücksspiel überhand, verursacht Geldprobleme oder verheimlichen Sie Gewohnheiten vor nahestehenden Personen, sprechen Sie mit einer Vertrauensperson oder qualifizierten Fachkraft.",
    "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés.": "In Irland bietet die [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help) offizielle Orientierung. Auch [GamblingCare](https://gamblingcare.ie/) ist verfügbar. In anderen Ländern suchen Sie geeignete öffentliche Dienste vor Ort.",
    "Compte et communications": "Konto und Kommunikation",
    "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément.": "Kontoschließung oder Werbestopp bei WinPulse: contact@wnpulse.com. Dies schließt keine Konten bei Wettanbietern; deren Ausschlussmöglichkeiten müssen gesondert genutzt werden.",
    "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique.": "Den verfügbaren Verlauf finden Sie im [Track record](/resultats). Für Werbung ausgewählte Gewinne ersetzen keine Prüfung des gesamten Verlaufs.",
    "Nom commercial": "Handelsname",
    "Nom légal de l’exploitant": "Rechtlicher Name des Betreibers",
    "Forme ou qualité juridique": "Rechtsform oder rechtlicher Status",
    "Adresse postale complète": "Vollständige Postanschrift",
    "Ville et pays": "Stadt und Land",
    "Registre et immatriculation, selon le statut": "Register und Registrierungsnummer, je nach Status",
    "TVA, si applicable": "Umsatzsteuer, falls zutreffend",
    "Responsable de publication": "Verantwortlich für die Veröffentlichung",
    "À renseigner avant publication": "Vor Veröffentlichung zu ergänzen",
    "Email": "E-Mail",
    "Téléphone / WhatsApp": "Telefon / WhatsApp",
    "Dublin": "Dublin",
    "Irlande": "Irland",
    "Informations légales": "Rechtliche Informationen",
    "Retour au site": "Zurück zur Website",
    "Pages légales": "Rechtliche Seiten",
    "Document légal": "Rechtliches Dokument",
    "Dernière mise à jour :": "Zuletzt aktualisiert:",
    "Informations légales à compléter.": "Rechtliche Angaben sind zu ergänzen.",
    "L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.": "Rechtliche Identität und vollständige Postanschrift des Betreibers sind anzugeben. „Dublin, Irland“ bezeichnet nur Stadt und Land. Unvollständige Felder bleiben unten markiert.",
    "Sommaire de ce document": "Inhalt dieses Dokuments",
    "Une question ? Contactez-nous": "Fragen? Kontaktieren Sie uns",
    "Contacter le support sur WhatsApp": "Support über WhatsApp kontaktieren",
    "← Retour à l’accueil WinPulse": "← Zurück zur WinPulse-Startseite"
  },
  "ar": {
    "Mentions légales": "الإشعار القانوني",
    "Éditeur, hébergement et contacts de WinPulse.": "ناشر WinPulse واستضافته وبيانات التواصل.",
    "Éditeur et contact": "الناشر والتواصل",
    "WinPulse est le nom commercial utilisé pour le site wnpulse.com. Les coordonnées de son exploitant figurent ci-dessous.": "WinPulse هو الاسم التجاري المستخدم لموقع wnpulse.com. ترد بيانات مشغّله أدناه.",
    "Hébergement": "الاستضافة",
    "L’interface du site est déployée sur Vercel. Les informations légales complètes de l’hébergeur et du prestataire du backend doivent être précisées par l’éditeur.": "تُنشر واجهة الموقع على Vercel. يجب على الناشر استكمال البيانات القانونية لمزوّد الاستضافة ومزوّد الخادم الخلفي.",
    "Hébergement web : Vercel — coordonnées complètes à renseigner.": "استضافة الموقع: Vercel — يجب استكمال بيانات التواصل.",
    "Hébergement du backend et localisation des données : à renseigner selon le service réellement déployé.": "استضافة الخادم الخلفي وموقع البيانات: تُستكمل وفق الخدمة المستخدمة فعليًا.",
    "Propriété intellectuelle": "الملكية الفكرية",
    "Les éléments créés par WinPulse sont protégés selon les droits applicables. Leur redistribution commerciale sans autorisation est interdite. Les marques, images, données et vidéos de tiers restent soumis aux droits de leurs titulaires ; leur présence ne signifie pas que WinPulse en détient la propriété exclusive.": "تخضع العناصر التي تنشئها WinPulse للحماية وفق الحقوق المعمول بها. يُحظر توزيعها تجاريًا دون إذن. وتظل العلامات والصور والبيانات والفيديوهات الخاصة بالغير خاضعة لحقوق أصحابها؛ ولا يعني عرضها أن WinPulse تملكها حصريًا.",
    "Nature du service": "طبيعة الخدمة",
    "WinPulse fournit des informations et pronostics sportifs. Le site ne reçoit pas de mises et ne règle pas de paris. Les offres, paiements et accès sont décrits dans les [Conditions Générales de Vente](/legal/cgv). Les décisions de pari ne sont assorties d’aucune garantie de gain.": "تقدم WinPulse معلومات وتوقعات رياضية. لا يستقبل الموقع مبالغ الرهان ولا يسوّي الرهانات. ترد العروض والمدفوعات والصلاحيات في [الشروط العامة للبيع](/legal/cgv). لا يصاحب قرارات الرهان أي ضمان للربح.",
    "Données et signalements": "البيانات والبلاغات",
    "Pour toute question sur le site, les contenus ou les données : contact@wnpulse.com. Consultez la [politique de confidentialité](/legal/confidentialite) et les informations sur le [jeu responsable](/legal/jeu-responsable).": "للأسئلة عن الموقع أو المحتوى أو البيانات: contact@wnpulse.com. راجع [سياسة الخصوصية](/legal/confidentialite) ومعلومات [اللعب المسؤول](/legal/jeu-responsable).",
    "Conditions Générales de Vente": "الشروط العامة للبيع",
    "Conditions applicables à WinPulse Pro : 10 500 FCFA pour 30 jours, sans reconduction automatique.": "شروط WinPulse Pro: مبلغ 10 500 FCFA لمدة 30 يومًا، دون تجديد تلقائي.",
    "1. Exploitant et champ d’application": "1. المشغّل ونطاق التطبيق",
    "Les présentes Conditions Générales de Vente (« CGV ») encadrent la souscription d’un abonnement payant sur **https://wnpulse.com**, exploité sous le nom commercial **WinPulse** par :": "تنظم هذه الشروط الاشتراك المدفوع على **https://wnpulse.com** الذي يُشغّل تحت الاسم التجاري **WinPulse** بواسطة:",
    "Le service s’adresse aux personnes âgées d’au moins 18 ans disposant de la capacité de contracter. Il appartient à l’utilisateur de respecter les restrictions applicables dans son pays. L’accès à WinPulse n’autorise pas à utiliser un opérateur de paris interdit dans ce pays.": "الخدمة لمن بلغوا 18 عامًا على الأقل ويتمتعون بأهلية التعاقد. يتحمل المستخدم مسؤولية احترام قيود بلده. ولا يجيز الوصول إلى WinPulse استخدام مشغّل مراهنات محظور في ذلك البلد.",
    "2. Nature du service": "2. طبيعة الخدمة",
    "WinPulse fournit des informations sportives, des pronostics, des comparaisons de cotes et des explications. Le prix de l’abonnement rémunère l’accès aux fonctionnalités décrites dans l’offre commandée.": "تقدم WinPulse معلومات رياضية وتوقعات ومقارنات لمعاملات الرهان وشروحًا. مقابل الاشتراك هو إتاحة الوظائف المبينة في العرض المطلوب.",
    "WinPulse ne reçoit pas les mises et ne règle pas les paris de l’utilisateur. Les éventuels paris sont conclus séparément auprès d’opérateurs tiers, selon leurs propres conditions.": "لا تستقبل WinPulse مبالغ رهانات المستخدم ولا تسوّيها. وأي رهانات تُبرم بصورة مستقلة مع مشغّلين من الغير وفق شروطهم.",
    "Les explications peuvent être produites à partir des données du moteur WinPulse, avec l’aide éventuelle d’un service d’intelligence artificielle lorsqu’il est disponible. L’IA explicative n’est pas présentée comme étant à l’origine de tous les pronostics. Elle peut être remplacée par une explication locale fondée sur les informations disponibles.": "قد تُنتج الشروح من بيانات محرك WinPulse بمساعدة خدمة ذكاء اصطناعي عند توفرها. ولا يُقدّم الذكاء الاصطناعي التفسيري بوصفه مصدر جميع التوقعات. ويمكن استبداله بشرح محلي يستند إلى المعلومات المتاحة.",
    "3. Offre gratuite et abonnement Pro": "3. الوصول المجاني واشتراك Pro",
    "L’accès **Free** est gratuit. Il comprend les aperçus et fonctionnalités effectivement ouverts aux utilisateurs gratuits, ainsi que l’historique public disponible. La quantité de sélections accessibles dépend des rencontres et des données disponibles ; aucun pronostic gratuit quotidien n’est garanti si aucune sélection n’est publiée.": "الوصول **Free** مجاني. يشمل المعاينات والوظائف المفتوحة فعليًا للمستخدمين المجانيين والسجل العام المتاح. يعتمد عدد الاختيارات على المباريات والبيانات المتوفرة؛ ولا يُضمن توقع مجاني يومي عند عدم نشر أي اختيار.",
    "L’offre payante actuellement proposée est **WinPulse Pro — 10 500 FCFA (XOF) pour 30 jours calendaires**, sans reconduction automatique.": "العرض المدفوع الحالي هو **WinPulse Pro — مبلغ 10 500 FCFA (XOF) لمدة 30 يومًا تقويميًا**، دون تجديد تلقائي.",
    "Dans les limites des données et rencontres disponibles, Pro débloque les pronostics réservés aux abonnés, les combinés proposés, le Combo Builder et l’enregistrement de ses combinés, les value bets, les explications de match et les fonctionnalités de montante lorsqu’elles sont disponibles. Le support peut être contacté à l’adresse et au numéro indiqués à l’article 1.": "بحسب البيانات والمباريات المتاحة، يفتح Pro توقعات المشتركين والرهانات المجمعة المعروضة وCombo Builder وحفظ المجموعات ورهانات القيمة وشروح المباريات ووظائف سلسلة الرهان التصاعدي عند توفرها. يمكن التواصل مع الدعم بالعنوان والرقم في المادة 1.",
    "Une sélection, un combiné ou une étape de montante peut ne pas être proposé si les critères du moteur ne sont pas remplis. L’abonnement ne garantit ni un nombre fixe de matchs chaque jour, ni une série quotidienne de paris gagnants.": "قد لا يُقترح اختيار أو رهان مجمع أو مرحلة تصاعدية إذا لم تتحقق معايير المحرك. لا يضمن الاشتراك عددًا ثابتًا من المباريات يوميًا ولا سلسلة يومية من الرهانات الرابحة.",
    "L’ancienne offre Elite et les anciens tarifs ne constituent plus une offre ouverte à de nouvelles commandes dans le catalogue actuel. Les droits attachés à une commande antérieure restent ceux convenus lors de cette commande.": "لم يعد عرض Elite السابق أو الأسعار القديمة متاحًا للطلبات الجديدة في الكتالوج الحالي. وتبقى حقوق الطلبات السابقة وفق ما اتُّفق عليه عند إبرامها.",
    "Le prix total à payer, taxes applicables comprises, est présenté avant la validation de la commande. Si une autre devise ou une conversion est proposée, son montant et ses conditions sont affichés avant paiement. Les éventuels frais de change ou frais de l’établissement de paiement de l’utilisateur relèvent des conditions de ce dernier.": "يُعرض السعر الإجمالي، شاملًا الضرائب المطبقة، قبل تأكيد الطلب. وعند تقديم عملة أخرى أو تحويل عملة، يُعرض المبلغ وشروطه قبل الدفع. تخضع رسوم الصرف أو مؤسسة الدفع الخاصة بالمستخدم لشروط تلك المؤسسة.",
    "Toute évolution tarifaire concerne les commandes futures ; elle ne modifie pas rétroactivement le prix d’une période déjà payée.": "تسري تغييرات الأسعار على الطلبات المستقبلية، ولا تعدّل بأثر رجعي سعر فترة مدفوعة.",
    "4. Commande et paiement": "4. الطلب والدفع",
    "Avant de payer, l’utilisateur vérifie l’offre, le montant, la durée et ses coordonnées. Il doit pouvoir consulter les CGV et corriger les erreurs de saisie avant de confirmer son achat avec une action indiquant clairement l’obligation de payer.": "قبل الدفع، يتحقق المستخدم من العرض والمبلغ والمدة وبياناته. ويجب أن يتمكن من قراءة الشروط وتصحيح أخطاء الإدخال قبل تأكيد الشراء بإجراء يدل بوضوح على الالتزام بالدفع.",
    "Les moyens de paiement utilisables sont ceux effectivement affichés dans le parcours de commande : **paiement mobile** et, uniquement lorsqu’elles y sont activées, cartes bancaires compatibles. La présence d’une carte Visa ou Mastercard n’est pas garantie dans tous les pays ni auprès de tous les prestataires.": "وسائل الدفع هي المعروضة فعليًا أثناء الطلب: **الدفع عبر الهاتف المحمول** والبطاقات البنكية المتوافقة عند تفعيلها فقط. لا يُضمن توفر Visa أو Mastercard في جميع البلدان أو لدى جميع المزوّدين.",
    "Le numéro de support **+33767971752 n’est pas un numéro marchand de paiement**. Un transfert ne doit être effectué que selon les instructions de paiement affichées au moment de la commande.": "رقم الدعم **+33767971752 ليس رقم تاجر لاستقبال المدفوعات**. يجب إجراء التحويلات وفق تعليمات الدفع المعروضة عند الطلب فقط.",
    "L’activation intervient après vérification du paiement par le prestataire ou, lorsqu’une vérification manuelle est prévue et annoncée, par WinPulse. Une simple capture d’écran ou un message WhatsApp ne vaut pas confirmation définitive du règlement. La date d’activation et la date d’expiration doivent être communiquées à l’utilisateur.": "يُفعّل الاشتراك بعد تحقق المزوّد من الدفع أو تحقق WinPulse عند الإعلان مسبقًا عن تحقق يدوي. لا تكفي صورة شاشة أو رسالة WhatsApp لتأكيد السداد نهائيًا. ويجب إبلاغ المستخدم بتاريخي التفعيل والانتهاء.",
    "Une confirmation de commande comprenant les informations contractuelles doit être transmise sur un support durable, par exemple par email. En cas de débit sans activation, l’utilisateur contacte le support avec la référence de transaction, sans transmettre son code PIN, son mot de passe ou le numéro complet de sa carte.": "يجب إرسال تأكيد طلب يتضمن المعلومات التعاقدية على وسيط دائم، كالبريد الإلكتروني. وعند الخصم دون تفعيل، يتواصل المستخدم مع الدعم بمرجع العملية دون إرسال رقمه السري أو كلمة مروره أو رقم بطاقته الكامل.",
    "5. Durée, renouvellement et fin d’accès": "5. المدة والتجديد وانتهاء الوصول",
    "La période payante dure **30 jours calendaires à compter de l’activation confirmée**, sous réserve des dates précises communiquées pour la commande. Elle ne correspond pas nécessairement à un mois civil.": "تستمر الفترة المدفوعة **30 يومًا تقويميًا من التفعيل المؤكد**، وفق التواريخ الدقيقة المبلّغة للطلب. ولا توافق بالضرورة شهرًا تقويميًا كاملًا.",
    "Il n’existe pas de renouvellement automatique ni de prélèvement récurrent au titre de cette offre. À l’expiration, les accès réservés aux abonnés prennent fin et le compte retrouve les accès Free. Un nouvel achat est nécessaire pour prolonger l’accès payant.": "لا يتضمن العرض تجديدًا تلقائيًا أو خصمًا دوريًا. عند الانتهاء تنتهي صلاحيات المشترك ويعود الحساب إلى Free. يلزم شراء جديد لتمديد الوصول المدفوع.",
    "L’utilisateur peut demander la fermeture de son compte à contact@wnpulse.com. Cette fermeture n’écarte pas un éventuel droit légal à remboursement et n’impose pas la suppression des documents dont la conservation est requise par la loi.": "يمكن طلب إغلاق الحساب عبر contact@wnpulse.com. لا يلغي الإغلاق أي حق قانوني محتمل في الاسترداد، ولا يوجب حذف الوثائق التي يفرض القانون حفظها.",
    "6. Rétractation et remboursements": "6. العدول عن العقد والاسترداد",
    "Lorsque le droit de rétractation applicable aux contrats conclus à distance s’applique, le consommateur dispose en principe de **14 jours à compter de la conclusion du contrat** pour notifier sa décision, sans avoir à la justifier.": "عندما يسري حق العدول في العقود المبرمة عن بُعد، يملك المستهلك من حيث المبدأ **14 يومًا من إبرام العقد** لإبلاغ قراره دون بيان الأسباب.",
    "La notification peut être adressée à **contact@wnpulse.com**, avec le nom, l’email du compte et la référence de commande, ou par toute autre déclaration non équivoque recevable. Le modèle placé en annexe peut être utilisé, sans être obligatoire.": "يمكن إرسال الإبلاغ إلى **contact@wnpulse.com** مع الاسم وبريد الحساب ومرجع الطلب، أو بأي تصريح واضح آخر مقبول قانونًا. ويجوز استخدام النموذج المرفق دون إلزام.",
    "L’activation de l’abonnement ou la consultation de pronostics ne supprime pas, à elle seule, les droits du consommateur. Pour un service commencé pendant ce délai, une éventuelle retenue proportionnelle au service fourni doit respecter les conditions légales, notamment l’information préalable et la demande expresse du consommateur.": "لا يُسقط تفعيل الاشتراك أو الاطلاع على التوقعات حقوق المستهلك بذاته. ولخدمة بدأت خلال المهلة، يجب أن يستوفي أي اقتطاع متناسب مع الخدمة المقدمة الشروط القانونية، ومنها الإعلام المسبق وطلب المستهلك الصريح.",
    "Les exceptions propres à certains contenus numériques ne peuvent être invoquées que si les conditions applicables sont réellement remplies, notamment le consentement exprès préalable, la reconnaissance de la perte du droit lorsqu’elle est légalement prévue et la confirmation contractuelle requise. Une acceptation générale des CGV ou une case « aucun remboursement » ne suffit pas à créer ces conditions.": "لا يجوز التمسك باستثناءات بعض المحتويات الرقمية إلا بتحقق شروطها فعلًا، ومنها الموافقة الصريحة المسبقة والإقرار بفقدان الحق عندما ينص القانون عليه والتأكيد التعاقدي المطلوب. ولا يكفي قبول الشروط عمومًا أو وضع علامة «لا استرداد» لإنشاء هذه الشروط.",
    "Les remboursements dus au titre de la rétractation sont effectués dans le délai légal applicable, en principe au plus tard 14 jours après réception de la notification, par le moyen de paiement d’origine sauf accord exprès sur une autre solution sans frais supplémentaires.": "تُرد المبالغ المستحقة بسبب العدول خلال المهلة القانونية، ومن حيث المبدأ خلال 14 يومًا من استلام الإبلاغ، بوسيلة الدفع الأصلية ما لم يُتفق صراحة على بديل دون رسوم إضافية.",
    "Indépendamment de la rétractation, les droits légaux relatifs à un service non fourni ou non conforme, aux prélèvements indus et aux doubles paiements restent applicables. Un pronostic perdant ne constitue pas, à lui seul, un défaut du service d’information vendu.": "بغض النظر عن العدول، تبقى الحقوق القانونية بشأن الخدمة غير المقدمة أو غير المطابقة والخصومات غير المستحقة والمدفوعات المكررة سارية. والتوقع الخاسر وحده ليس عيبًا في خدمة المعلومات المبيعة.",
    "7. Pronostics, statistiques et risques": "7. التوقعات والإحصاءات والمخاطر",
    "Les cotes évoluent et peuvent différer de celles affichées au moment de la publication. L’utilisateur vérifie toujours le marché, les équipes, l’horaire et la cote auprès de l’opérateur avant toute décision.": "تتغير معاملات الرهان وقد تختلف عن المعروضة عند النشر. يتحقق المستخدم دائمًا من السوق والفريقين والتوقيت والمعامل لدى المشغّل قبل اتخاذ القرار.",
    "Les mentions de confiance, scores, niveaux de risque et indicateurs de value sont des estimations ou des indicateurs méthodologiques. Ils ne représentent pas une garantie de résultat ni, sans mesure et explication spécifiques, un taux de réussite constaté.": "درجات الثقة والنتائج ومستويات المخاطرة ومؤشرات القيمة هي تقديرات أو مؤشرات منهجية. لا تمثل ضمانًا للنتيجة ولا معدل نجاح مرصودًا دون قياس وشرح محددين.",
    "La montante et les combinés ne constituent pas des placements, une source de revenus assurée ou une garantie de récupération des pertes. Associer plusieurs sélections peut accroître le risque d’échec du ticket. Les performances passées et les exemples de sélections gagnantes ne garantissent pas les résultats futurs.": "سلاسل الرهان التصاعدي والرهانات المجمعة ليست استثمارات أو دخلًا مضمونًا أو ضمانًا لاستعادة الخسائر. قد يزيد الجمع بين اختيارات متعددة خطر خسارة القسيمة. ولا تضمن النتائج السابقة وأمثلة الاختيارات الرابحة نتائج مستقبلية.",
    "WinPulse ne promet aucun gain. L’utilisateur reste libre de ne pas parier. Les paris peuvent entraîner des pertes financières et une dépendance ; ils ne doivent pas être financés par des sommes nécessaires aux dépenses essentielles.": "لا تعد WinPulse بأي ربح. وللمستخدم حرية عدم الرهان. قد تؤدي المراهنات إلى خسائر مالية وإدمان؛ ويجب ألا تُموّل بأموال النفقات الأساسية.",
    "8. Scores Live, vidéos et actualités": "8. النتائج المباشرة والفيديو والأخبار",
    "Les scores et horaires proviennent de fournisseurs tiers. Ils peuvent être retardés, incomplets, corrigés ou temporairement indisponibles. Les indications de fraîcheur doivent être prises en compte ; le règlement d’un pari dépend des règles de l’opérateur auprès duquel il a été placé.": "تأتي النتائج والمواعيد من مزوّدين خارجيين. قد تتأخر أو تكون ناقصة أو تُصحح أو تتعطل مؤقتًا. يجب مراعاة مؤشرات حداثتها؛ وتسوية الرهان تخضع لقواعد المشغّل الذي وُضع لديه.",
    "Les vidéos éventuellement proposées dans Live sont lues par un lecteur tiers, notamment YouTube, à partir des diffusions intégrables disponibles. Leur accès dépend du diffuseur, du pays, des restrictions et de la disponibilité technique. L’abonnement WinPulse ne comprend pas l’achat de droits de diffusion télévisée et ne garantit pas la retransmission d’un match ou d’un championnat particulier.": "تُعرض فيديوهات Live المحتملة عبر مشغّل خارجي، مثل YouTube، من البث المتاح للتضمين. يعتمد الوصول على جهة البث والبلد والقيود والتوفر التقني. لا يشتري اشتراك WinPulse حقوق بث تلفزيوني ولا يضمن نقل مباراة أو بطولة محددة.",
    "Le blog peut présenter des guides et des liens d’actualité accompagnés de leur source. Une date de repérage automatisé n’est pas nécessairement la date de publication originale. Les liens renvoient à des éditeurs tiers dont les conditions s’appliquent sur leurs propres sites.": "قد تعرض المدونة أدلة وروابط أخبار مع مصادرها. تاريخ الرصد الآلي ليس بالضرورة تاريخ النشر الأصلي. تقود الروابط إلى ناشرين خارجيين تسري شروطهم على مواقعهم.",
    "9. Disponibilité et conformité du service": "9. توفر الخدمة ومطابقتها",
    "WinPulse met en œuvre les moyens raisonnables pour assurer l’accès au service et corriger les anomalies. Des maintenances, incidents ou défaillances de fournisseurs peuvent occasionner des interruptions ; une disponibilité permanente sans interruption n’est pas promise.": "تستخدم WinPulse وسائل معقولة لإتاحة الخدمة وتصحيح الأعطال. قد تسبب الصيانة أو الحوادث أو إخفاقات المزوّدين انقطاعات؛ ولا يُوعد بتوفر دائم دون انقطاع.",
    "En cas d’absence de fourniture ou de non-conformité, l’utilisateur contacte le support afin qu’une solution soit recherchée dans les conditions et délais prévus par la loi. Selon la situation, les recours peuvent comprendre la mise en conformité, une réduction de prix ou la fin du contrat et un remboursement.": "عند عدم تقديم الخدمة أو عدم مطابقتها، يتواصل المستخدم مع الدعم للبحث عن حل وفق الشروط والمواعيد القانونية. وقد تشمل سبل المعالجة بحسب الحالة تحقيق المطابقة أو تخفيض السعر أو إنهاء العقد واسترداد المبلغ.",
    "Aucune disposition des présentes CGV n’exclut les garanties ou responsabilités qui ne peuvent légalement être écartées. La responsabilité de WinPulse est appréciée selon les faits et le droit applicable ; les décisions de pari de l’utilisateur ne justifient pas une exclusion générale de toute responsabilité du fournisseur.": "لا تستبعد هذه الشروط ضمانات أو مسؤوليات لا يجوز استبعادها قانونًا. تُقيّم مسؤولية WinPulse وفق الوقائع والقانون المطبق؛ ولا تبرر قرارات رهان المستخدم استبعادًا عامًا لكل مسؤولية المزوّد.",
    "10. Compte et usage des contenus": "10. الحساب واستخدام المحتوى",
    "L’utilisateur fournit des informations exactes et protège ses identifiants. Les accès payants sont destinés à son usage personnel ; la revente des accès ou la redistribution commerciale des contenus sans autorisation est interdite.": "يقدم المستخدم معلومات صحيحة ويحمي بيانات دخوله. الوصول المدفوع للاستخدام الشخصي؛ ويُحظر إعادة بيع الوصول أو توزيع المحتوى تجاريًا دون إذن.",
    "Une suspension pour fraude ou abus doit être justifiée et proportionnée. Sauf nécessité de sécurité ou impossibilité légale, son motif est communiqué et l’utilisateur peut contacter le support pour contester la décision. Elle n’emporte pas automatiquement la confiscation des sommes correspondant à un service non fourni.": "يجب أن يكون التعليق بسبب الاحتيال أو الإساءة مبررًا ومتناسبًا. ما لم تمنع ضرورة أمنية أو عائق قانوني، يُبلّغ السبب ويمكن الاعتراض لدى الدعم. ولا يعني التعليق تلقائيًا مصادرة مبالغ خدمة لم تُقدم.",
    "11. Données personnelles et WhatsApp": "11. البيانات الشخصية وWhatsApp",
    "Les données nécessaires au compte, au paiement et au support sont traitées dans le cadre du service. La politique de confidentialité doit identifier le responsable du traitement, les finalités, bases légales, destinataires, durées de conservation, éventuels transferts internationaux et modalités d’exercice des droits, conformément au RGPD et aux autres règles applicables.": "تُعالج بيانات الحساب والدفع والدعم الضرورية ضمن الخدمة. يجب أن تحدد السياسة مسؤول المعالجة والأغراض والأسس القانونية والمتلقين ومدد الحفظ والتحويلات الدولية المحتملة وطرق ممارسة الحقوق، وفق اللائحة العامة لحماية البيانات والقواعد الأخرى المطبقة.",
    "La fourniture d’un numéro WhatsApp pour le compte ou le support ne constitue pas automatiquement une autorisation de démarchage. Les communications commerciales et l’inscription à un groupe ou à une communauté doivent respecter les règles applicables, avec les choix et possibilités d’opposition nécessaires. L’adhésion à un groupe ne résulte pas de la seule acceptation des CGV.": "لا يجيز تقديم رقم WhatsApp للحساب أو الدعم التسويق تلقائيًا. يجب أن تلتزم الاتصالات التجارية والانضمام إلى المجموعات أو المجتمعات بالقواعد المطبقة وخيارات الموافقة والاعتراض اللازمة. ولا ينتج الانضمام عن مجرد قبول الشروط.",
    "Pour une demande relative aux données ou aux préférences de contact : **contact@wnpulse.com**.": "للطلبات المتعلقة بالبيانات أو تفضيلات التواصل: **contact@wnpulse.com**.",
    "12. Réclamations, droit applicable et litiges": "12. الشكاوى والقانون المطبق والنزاعات",
    "Une réclamation peut être adressée à **contact@wnpulse.com** ou au **+33767971752**, avec les éléments permettant de retrouver la commande.": "يمكن تقديم الشكوى إلى **contact@wnpulse.com** أو **+33767971752** مع بيانات تتيح تحديد الطلب.",
    "Les présentes CGV sont soumises au **droit irlandais**, sans priver un consommateur des protections impératives dont il bénéficie au titre du droit applicable à sa situation, notamment dans son pays de résidence habituelle lorsque ces protections s’appliquent.": "تخضع هذه الشروط لـ **القانون الإيرلندي** دون حرمان المستهلك من الحماية الإلزامية وفق القانون المنطبق على حالته، لا سيما قانون محل إقامته المعتادة عندما تسري تلك الحماية.",
    "Les parties peuvent rechercher une solution amiable. Cette démarche ne prive pas le consommateur de ses recours ni de l’accès aux juridictions compétentes selon les règles applicables. Aucune compétence exclusive des tribunaux de Dublin n’est imposée à tous les consommateurs.": "يمكن للطرفين السعي لحل ودي. لا يحرم ذلك المستهلك من الطعون أو اللجوء إلى المحاكم المختصة وفق القواعد المطبقة. ولا يُفرض اختصاص حصري لمحاكم دبلن على جميع المستهلكين.",
    "13. Évolution des CGV": "13. تعديل الشروط",
    "La version acceptée lors de la commande régit la période achetée, sous réserve des dispositions légales impératives et des changements valablement convenus. Les nouvelles versions sont datées et rendues consultables avant les commandes auxquelles elles s’appliquent.": "تحكم النسخة المقبولة عند الطلب الفترة المشتراة، مع مراعاة القواعد الإلزامية والتغييرات المتفق عليها بشكل صحيح. تؤرخ النسخ الجديدة وتُتاح قبل الطلبات التي تسري عليها.",
    "Une modification ne réduit pas rétroactivement les droits attachés à un abonnement déjà payé. Toute modification d’un service en cours respecte les conditions d’information et les droits de l’utilisateur imposés par la loi.": "لا يخفض التعديل بأثر رجعي حقوق اشتراك مدفوع. وتلتزم تغييرات الخدمة الجارية بمتطلبات الإعلام وحقوق المستخدم القانونية.",
    "Annexe — Modèle de notification de rétractation": "ملحق — نموذج إبلاغ بالعدول",
    "À envoyer à **contact@wnpulse.com**, ou à l’adresse postale complète de l’exploitant renseignée à l’article 1.": "يُرسل إلى **contact@wnpulse.com** أو العنوان البريدي الكامل للمشغّل الوارد في المادة 1.",
    "« Je vous notifie ma décision de me rétracter du contrat portant sur l’abonnement WinPulse suivant :": "«أبلغكم بقراري العدول عن العقد المتعلق باشتراك WinPulse التالي:",
    "Référence de commande : …": "مرجع الطلب: …",
    "Date de conclusion du contrat : …": "تاريخ إبرام العقد: …",
    "Nom du client : …": "اسم العميل: …",
    "Email associé au compte : …": "البريد المرتبط بالحساب: …",
    "Adresse du client : …": "عنوان العميل: …",
    "Date de notification : …": "تاريخ الإبلاغ: …",
    "Signature, uniquement pour une notification sur papier : … »": "التوقيع، للإبلاغ الورقي فقط: …»",
    "Politique de confidentialité": "سياسة الخصوصية",
    "Compte, paiements, WhatsApp et services tiers : les informations relatives à vos données.": "الحساب والمدفوعات وWhatsApp وخدمات الغير: معلومات عن بياناتك.",
    "Responsable du traitement": "مسؤول المعالجة",
    "L’exploitant de WinPulse détermine les finalités et moyens des traitements liés au compte et au service. Son identité complète et son adresse doivent être renseignées ci-dessous. Contact pour les données : contact@wnpulse.com.": "يحدد مشغّل WinPulse أغراض ووسائل معالجة بيانات الحساب والخدمة. يجب استكمال هويته وعنوانه الكاملين أدناه. للتواصل بشأن البيانات: contact@wnpulse.com.",
    "Données concernées": "البيانات المعنية",
    "Selon les actions réalisées et les fonctionnalités activées, les données concernées comprennent :": "بحسب الإجراءات المنفذة والوظائف المفعلة، تشمل البيانات المعنية:",
    "Compte : nom, email, numéro WhatsApp et identifiants nécessaires à l’authentification. Le mot de passe doit être conservé sous forme hachée, et non en clair.": "الحساب: الاسم والبريد ورقم WhatsApp ومعرّفات المصادقة. يجب حفظ كلمة المرور بصيغة تجزئة، لا كنص واضح.",
    "Abonnement et paiement : formule, dates d’accès, montant, statut, référence de transaction et justificatif éventuellement transmis. Ne communiquez jamais votre PIN, votre cryptogramme ou votre numéro complet de carte au support.": "الاشتراك والدفع: الخطة وتواريخ الوصول والمبلغ والحالة ومرجع العملية وأي إثبات مُرسل. لا ترسل للدعم رقمك السري أو رمز أمان البطاقة أو رقمها الكامل.",
    "Usage et sécurité : pages consultées, horodatages, sessions, journaux techniques, adresse IP et informations de navigateur lorsque ces éléments sont enregistrés.": "الاستخدام والأمن: الصفحات المزارة والطوابع الزمنية والجلسات والسجلات التقنية وعنوان IP ومعلومات المتصفح عند تسجيلها.",
    "Contenus du compte : combinés enregistrés, choix de contact, messages au support et préférences.": "محتوى الحساب: المجموعات المحفوظة وخيارات التواصل ورسائل الدعم والتفضيلات.",
    "Finalités et bases légales": "الأغراض والأسس القانونية",
    "L’authentification, la gestion de l’abonnement, les contenus enregistrés et le support reposent sur l’exécution du contrat ou les démarches demandées avant sa conclusion. Les obligations comptables et demandes légales reposent sur les obligations applicables à l’exploitant.": "تستند المصادقة وإدارة الاشتراك والمحتويات المحفوظة والدعم إلى تنفيذ العقد أو الإجراءات المطلوبة قبل إبرامه. وتستند الواجبات المحاسبية والطلبات القانونية إلى الالتزامات المطبقة على المشغّل.",
    "La sécurité, la prévention de la fraude et le diagnostic d’incidents peuvent reposer sur un intérêt légitime, après examen de leur nécessité et de leurs effets sur vos droits. Le marketing et les traceurs non nécessaires sont soumis aux règles de consentement ou aux autres conditions légales qui leur sont propres.": "قد يستند الأمن ومنع الاحتيال وتشخيص الحوادث إلى مصلحة مشروعة بعد تقييم الضرورة وأثرها على حقوقك. ويخضع التسويق وأدوات التتبع غير الضرورية لقواعد الموافقة أو الشروط القانونية الخاصة بها.",
    "Numéro WhatsApp, prospection et communautés": "رقم WhatsApp والتسويق والمجتمعات",
    "La collecte d’un numéro pour le compte ou le support ne vaut pas consentement général à recevoir des publicités. L’acceptation des CGV ne remplace pas les choix requis pour la prospection électronique.": "جمع الرقم للحساب أو الدعم ليس موافقة عامة على تلقي الإعلانات. ولا يحل قبول الشروط محل الخيارات المطلوبة للتسويق الإلكتروني.",
    "Les sollicitations commerciales doivent respecter votre choix et permettre une opposition simple. Un consentement peut être retiré sans empêcher la réception des messages nécessaires au fonctionnement du compte. Aucun ajout à un groupe ou à une communauté n’est déduit de la seule inscription ; dans un groupe, certaines informations peuvent être visibles des autres membres.": "يجب أن تحترم الاتصالات التجارية اختيارك وتتيح اعتراضًا بسيطًا. يمكن سحب الموافقة دون منع الرسائل الضرورية للحساب. لا يعني التسجيل وحده الانضمام إلى مجموعة أو مجتمع؛ وقد تظهر بعض المعلومات لأعضاء المجموعة الآخرين.",
    "Destinataires et prestataires": "المتلقون ومزوّدو الخدمات",
    "Les données sont accessibles aux personnes habilitées pour l’administration et le support, ainsi qu’aux prestataires nécessaires à leurs missions. La liste nominative des prestataires réellement utilisés et leur rôle doit être complétée avant publication de cette politique.": "تتاح البيانات لموظفي الإدارة والدعم المخوّلين وللمزوّدين بالقدر اللازم لمهامهم. يجب استكمال أسماء المزوّدين المستخدمين فعليًا وأدوارهم قبل نشر السياسة.",
    "Hébergement web : Vercel ; backend, base de données et pays de stockage : à préciser.": "استضافة الموقع: Vercel؛ الخادم الخلفي وقاعدة البيانات وبلدان التخزين: يجب تحديدها.",
    "Emails transactionnels et paiements : prestataires actifs à préciser dans la liste de sous-traitants.": "البريد الخاص بالمعاملات والمدفوعات: يجب تحديد المزوّدين النشطين في قائمة معالجي البيانات.",
    "Explications : service local et, si configurés, fournisseurs d’IA. Les données de match transmises à un fournisseur d’IA ne nécessitent pas l’envoi de votre mot de passe ou de vos coordonnées de paiement.": "الشروح: خدمة محلية ومزوّدو ذكاء اصطناعي عند إعدادهم. إرسال بيانات المباريات إلى مزوّد ذكاء اصطناعي لا يتطلب إرسال كلمة مرورك أو بيانات دفعك.",
    "Vidéos : Google / YouTube lorsque vous ouvrez le lecteur intégré. WhatsApp intervient lorsque vous utilisez ce canal de contact. Ces tiers peuvent également agir pour leurs propres finalités selon leurs politiques.": "الفيديو: Google / YouTube عند فتح المشغّل المضمّن. يتدخل WhatsApp عند استخدام قناة التواصل هذه. وقد يعالج هؤلاء الغير البيانات لأغراضهم الخاصة وفق سياساتهم.",
    "Lecteur vidéo, cookies et stockage local": "مشغّل الفيديو وملفات الارتباط والتخزين المحلي",
    "Le navigateur peut conserver les éléments nécessaires à l’authentification, aux préférences et au cache des scores, notamment via le stockage local ou de session. Effacer ces éléments peut déconnecter votre compte ou réinitialiser certaines préférences.": "قد يحتفظ المتصفح بعناصر ضرورية للمصادقة والتفضيلات وتخزين النتائج مؤقتًا، عبر التخزين المحلي أو تخزين الجلسة. قد يؤدي حذفها إلى تسجيل خروجك أو إعادة ضبط بعض التفضيلات.",
    "Le lecteur YouTube est chargé après une action de lecture. Son ouverture peut transmettre à Google des informations techniques, notamment l’adresse IP et des informations de navigateur. Le mode de confidentialité renforcée du lecteur ne signifie pas une absence totale de traitement par ce tiers.": "يُحمّل مشغّل YouTube بعد إجراء تشغيل. قد يؤدي فتحه إلى إرسال معلومات تقنية إلى Google، ومنها عنوان IP ومعلومات المتصفح. ولا يعني وضع الخصوصية المحسنة عدم قيام الطرف الثالث بأي معالجة.",
    "Les mécanismes de consentement nécessaires aux cookies, traceurs et services intégrés doivent être mis en œuvre avant leur utilisation lorsque la réglementation l’exige. Le seul fait de naviguer sur le site n’est pas présenté comme un consentement à tous les traceurs.": "يجب تطبيق آليات الموافقة اللازمة لملفات الارتباط والتتبع والخدمات المضمّنة قبل استخدامها متى اشترط القانون ذلك. ولا يُقدّم مجرد تصفح الموقع بوصفه موافقة على جميع أدوات التتبع.",
    "Conservation et transferts": "الحفظ والتحويلات",
    "Les durées sont déterminées par la finalité : fourniture du compte, traitement d’une demande, sécurité, obligations comptables ou défense d’un droit. La suppression du compte n’efface pas nécessairement les pièces devant légalement être conservées. Les durées détaillées et les règles de purge réellement appliquées restent à préciser par l’exploitant.": "تتحدد المدد بحسب الغرض: توفير الحساب أو معالجة الطلبات أو الأمن أو الواجبات المحاسبية أو الدفاع عن حق. لا يمحو حذف الحساب بالضرورة الوثائق التي يجب حفظها قانونًا. ويجب على المشغّل تحديد مدد الحفظ التفصيلية وقواعد الحذف المطبقة فعليًا.",
    "Les pays de traitement dépendent des prestataires actifs. Lorsqu’un transfert de données hors de l’Espace économique européen a lieu, il doit reposer sur un mécanisme légal approprié, par exemple une décision d’adéquation applicable ou des garanties contractuelles adaptées. Contactez contact@wnpulse.com pour les informations relatives aux destinataires et garanties.": "تعتمد بلدان المعالجة على المزوّدين النشطين. يجب أن تستند التحويلات خارج المنطقة الاقتصادية الأوروبية إلى آلية قانونية مناسبة، كقرار كفاية سارٍ أو ضمانات تعاقدية ملائمة. للمعلومات عن المتلقين والضمانات: contact@wnpulse.com.",
    "Vos droits et réclamations": "حقوقك والشكاوى",
    "Dans les conditions du RGPD, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité et l’opposition, ainsi que retirer un consentement sans remettre en cause les traitements licites déjà réalisés. Certains droits connaissent des limites liées à la situation et aux obligations légales.": "وفق شروط اللائحة العامة لحماية البيانات، يمكنك طلب الوصول والتصحيح والمحو والتقييد والنقل والاعتراض، وسحب الموافقة دون المساس بالمعالجة القانونية السابقة. تخضع بعض الحقوق لحدود مرتبطة بالحالة والالتزامات القانونية.",
    "Adressez votre demande à contact@wnpulse.com. Le délai de réponse est en principe d’un mois ; une prolongation légalement permise doit vous être expliquée dans ce délai. Une vérification d’identité proportionnée peut être demandée si nécessaire.": "أرسل طلبك إلى contact@wnpulse.com. مهلة الرد من حيث المبدأ شهر واحد؛ ويجب شرح أي تمديد يسمح به القانون خلال هذه المهلة. قد يُطلب تحقق متناسب من الهوية عند الضرورة.",
    "Vous pouvez saisir la [Data Protection Commission irlandaise](https://www.dataprotection.ie/) ou l’autorité compétente de votre lieu de résidence, de travail ou de l’infraction alléguée.": "يمكنك اللجوء إلى [لجنة حماية البيانات الإيرلندية](https://www.dataprotection.ie/) أو السلطة المختصة بمحل الإقامة أو العمل أو وقوع المخالفة المزعومة.",
    "Sécurité et estimations sportives": "الأمن والتقديرات الرياضية",
    "L’exploitant doit appliquer des mesures techniques et organisationnelles adaptées aux risques, limiter les accès et protéger les données transmises. Aucune sécurité absolue ni version précise de protocole n’est garantie par cette page.": "يجب على المشغّل تطبيق تدابير تقنية وتنظيمية تناسب المخاطر، وتقييد الوصول وحماية البيانات المرسلة. لا تضمن هذه الصفحة أمنًا مطلقًا أو إصدارًا محددًا لبروتوكول.",
    "Les indicateurs sportifs portent sur des rencontres et ne sont pas présentés comme des décisions juridiques automatisées concernant votre personne. Un incident ou une demande de confidentialité peut être signalé à contact@wnpulse.com.": "تتعلق المؤشرات الرياضية بالمباريات ولا تُقدّم كقرارات قانونية آلية تخص شخصك. للإبلاغ عن حادث أو طلب خصوصية: contact@wnpulse.com.",
    "Jeu responsable": "اللعب المسؤول",
    "Comprendre les limites des pronostics et garder le contrôle.": "فهم حدود التوقعات والحفاظ على التحكم.",
    "Un service réservé aux personnes majeures": "خدمة للبالغين فقط",
    "L’accès au service est réservé aux personnes âgées d’au moins 18 ans. Les conditions d’âge et d’accès aux opérateurs de jeux dépendent aussi du pays concerné. Une fausse déclaration peut entraîner une suspension, sans supprimer les droits impératifs du consommateur.": "الوصول محصور بمن بلغوا 18 عامًا على الأقل. وتعتمد شروط السن والوصول إلى مشغّلي اللعب أيضًا على البلد. قد تؤدي المعلومات الكاذبة إلى تعليق الحساب دون إسقاط حقوق المستهلك الإلزامية.",
    "Aucun résultat n’est garanti": "لا توجد نتيجة مضمونة",
    "Un score de confiance élevé, une faible cote, une série de résultats positifs ou une mention de risque ne rend pas un pari certain. Les performances passées ne prédisent pas avec certitude les prochaines rencontres.": "الثقة العالية أو المعامل المنخفض أو سلسلة النتائج الإيجابية أو تصنيف المخاطر لا تجعل الرهان مؤكدًا. ولا تتنبأ النتائج السابقة بالمباريات المقبلة بشكل يقيني.",
    "Les combinés et la montante peuvent échouer. Ils ne constituent ni un investissement, ni un revenu assuré, ni un moyen garanti de récupérer des pertes.": "قد تفشل الرهانات المجمعة والسلسلة التصاعدية. وهي ليست استثمارات أو دخلًا مضمونًا أو وسيلة مضمونة لاسترداد الخسائر.",
    "Garder le contrôle": "الحفاظ على التحكم",
    "Vous pouvez utiliser les informations sportives sans parier. Si vous choisissez de parier, ne financez jamais cette activité par un emprunt ou par l’argent nécessaire à vos dépenses essentielles. Évitez de chercher à récupérer vos pertes et faites une pause si le jeu devient une source de stress.": "يمكن الاستفادة من المعلومات الرياضية دون رهان. إذا اخترت الرهان، فلا تموّله بقرض أو بأموال النفقات الأساسية. تجنب مطاردة الخسائر وخذ استراحة إذا أصبح اللعب مصدر ضغط.",
    "Quand demander de l’aide": "متى تطلب المساعدة؟",
    "Si le jeu prend une place excessive, entraîne des difficultés financières ou vous conduit à dissimuler vos habitudes à vos proches, parlez-en à une personne de confiance ou à un professionnel qualifié.": "إذا استحوذ اللعب على مساحة مفرطة أو سبب صعوبات مالية أو دفعك لإخفاء عاداتك عن المقربين، فتحدث إلى شخص تثق به أو متخصص مؤهل.",
    "En Irlande, les ressources officielles d’orientation sont accessibles auprès de la [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). Vous pouvez également consulter [GamblingCare](https://gamblingcare.ie/). Dans un autre pays, recherchez les services publics locaux adaptés.": "في إيرلندا، تتوفر موارد الإرشاد الرسمية لدى [Gambling Regulatory Authority of Ireland](https://www.grai.ie/gambling-safety/understand-your-gambling/get-help). ويمكنك أيضًا الرجوع إلى [GamblingCare](https://gamblingcare.ie/). في البلدان الأخرى ابحث عن الخدمات العامة المحلية المناسبة.",
    "Compte et communications": "الحساب والاتصالات",
    "Pour demander la fermeture de votre compte WinPulse ou l’arrêt des sollicitations commerciales : contact@wnpulse.com. Cette demande ne ferme pas les comptes détenus auprès d’opérateurs de paris tiers ; leurs dispositifs d’exclusion doivent être utilisés séparément.": "لطلب إغلاق حساب WinPulse أو إيقاف الرسائل التجارية: contact@wnpulse.com. لا يغلق الطلب حسابات مشغّلي الرهان الآخرين؛ يجب استخدام آليات الاستبعاد لديهم بصورة منفصلة.",
    "L’historique disponible est consultable sur le [Track record](/resultats). Une sélection de résultats gagnants présentée dans une publicité ne remplace pas l’examen de l’ensemble de cet historique.": "يمكن الاطلاع على السجل المتاح في [سجل النتائج](/resultats). لا يغني عرض اختيارات رابحة في إعلان عن مراجعة السجل كاملًا.",
    "Nom commercial": "الاسم التجاري",
    "Nom légal de l’exploitant": "الاسم القانوني للمشغّل",
    "Forme ou qualité juridique": "الشكل أو الصفة القانونية",
    "Adresse postale complète": "العنوان البريدي الكامل",
    "Ville et pays": "المدينة والبلد",
    "Registre et immatriculation, selon le statut": "السجل ورقم التسجيل بحسب الصفة",
    "TVA, si applicable": "ضريبة القيمة المضافة إن انطبقت",
    "Responsable de publication": "مسؤول النشر",
    "À renseigner avant publication": "يجب استكماله قبل النشر",
    "Email": "البريد الإلكتروني",
    "Téléphone / WhatsApp": "الهاتف / WhatsApp",
    "Dublin": "دبلن",
    "Irlande": "إيرلندا",
    "Informations légales": "المعلومات القانونية",
    "Retour au site": "العودة إلى الموقع",
    "Pages légales": "الصفحات القانونية",
    "Document légal": "وثيقة قانونية",
    "Dernière mise à jour :": "آخر تحديث:",
    "Informations légales à compléter.": "يجب استكمال المعلومات القانونية.",
    "L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.": "يجب إدخال الهوية القانونية للمشغّل وعنوانه البريدي الكامل. تشير عبارة «دبلن، إيرلندا» إلى المدينة والبلد فقط. تبقى الحقول الناقصة موضحة أدناه.",
    "Sommaire de ce document": "محتويات هذه الوثيقة",
    "Une question ? Contactez-nous": "هل لديك سؤال؟ تواصل معنا",
    "Contacter le support sur WhatsApp": "التواصل مع الدعم عبر WhatsApp",
    "← Retour à l’accueil WinPulse": "العودة إلى الصفحة الرئيسية لـ WinPulse →"
  }
};

function translateLegal(language, source) {
  if (typeof source !== "string") return "";
  const dictionary = Object.prototype.hasOwnProperty.call(LEGAL_MESSAGES, language) ? LEGAL_MESSAGES[language] : LEGAL_MESSAGES.fr;
  return Object.prototype.hasOwnProperty.call(dictionary, source) ? dictionary[source] : source;
}

function useLegalText() {
  const context = useLanguage();
  return { ...context, t: source => translateLegal(context.language, source) };
}

function InlineText({ text }) {
  const { t } = useLegalText();
  const parts = t(String(text || "")).split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith("/") && !href.startsWith("//")) {
        return <Link key={index} to={href} className="font-semibold text-orange-700 underline underline-offset-4">{label}</Link>;
      }
      if (href.startsWith("https://")) {
        return <a key={index} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-700 underline underline-offset-4">{label}</a>;
      }
    }
    return <span key={index}>{part}</span>;
  });
}

function CompanyDetails() {
  const { t } = useLegalText();
  const details = [
    ["Nom commercial", COMPANY.name],
    ["Nom légal de l’exploitant", COMPANY.legalName],
    ["Forme ou qualité juridique", COMPANY.legalForm],
    ["Adresse postale complète", COMPANY.fullAddress],
    ["Ville et pays", `${t(COMPANY.city)}, ${t(COMPANY.country)}`],
    ["Registre et immatriculation, selon le statut", COMPANY.registration],
    ["TVA, si applicable", COMPANY.vatNumber],
    ["Responsable de publication", COMPANY.publicationDirector],
  ];
  return <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4 sm:p-5">
    <dl className="space-y-3">
      {details.map(([label, value]) => <div key={label} className="grid min-w-0 gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-4">
        <dt className="font-semibold text-slate-900">{t(label)}</dt>
        <dd className={value ? "min-w-0 break-words text-slate-700" : "min-w-0 break-words text-amber-800"}>{value || t("À renseigner avant publication")}</dd>
      </div>)}
      <div><dt className="font-semibold text-slate-900">{t("Email")}</dt><dd><a className="break-all text-orange-700 underline underline-offset-4" dir="ltr" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></dd></div>
      <div><dt className="font-semibold text-slate-900">{t("Téléphone / WhatsApp")}</dt><dd><a className="text-orange-700 underline underline-offset-4" dir="ltr" href={`tel:${COMPANY.phone}`}>{COMPANY.phone}</a></dd></div>
    </dl>
  </div>;
}

function ContentBlock({ block }) {
  if (block.type === "company") return <CompanyDetails />;
  if (block.type === "list") return <ul className="list-disc space-y-2 ps-5 marker:text-orange-500">
    {block.items.map((item, index) => <li key={index} className="ps-1"><InlineText text={item} /></li>)}
  </ul>;
  return <p><InlineText text={block.text} /></p>;
}

export default function LegalPage() {
  const { t, language, locale, direction } = useLegalText();
  const { slug } = useParams();
  const page = Object.prototype.hasOwnProperty.call(PAGES, slug) ? PAGES[slug] : null;
  if (!page) return <Navigate to="/legal/mentions-legales" replace />;
  const Icon = ICONS[page.icon];
  const missingIdentity = !COMPANY.legalName || !COMPANY.legalForm || !COMPANY.fullAddress;

  return <div lang={language} dir={direction} className="min-h-screen bg-neutral-50 text-slate-900">
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex min-h-20 max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-h-11 min-w-0 items-center gap-3" data-testid="legal-brand-link">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-sm"><Zap className="h-6 w-6" strokeWidth={2.5} fill="currentColor" /></div>
          <div className="min-w-0"><div className="font-heading text-xl font-extrabold leading-tight">WinPulse</div><div className="mt-1 text-xs font-semibold uppercase tracking-widest text-orange-700">{t("Informations légales")}</div></div>
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-neutral-50">{t("Retour au site")}</Link>
      </div>
    </header>

    <main className="mx-auto min-w-0 max-w-4xl px-4 pb-28 pt-6 sm:px-6 sm:pt-9 lg:px-8">
      <nav aria-label={t("Pages légales")} className="mb-7 grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {Object.entries(PAGES).map(([key, item]) => {
          const NavIcon = ICONS[item.icon];
          const active = key === slug;
          return <Link key={key} to={`/legal/${key}`} aria-current={active ? "page" : undefined} data-testid={`legal-nav-${key}`} className={`flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold leading-snug transition-colors sm:px-4 ${active ? "border-orange-600 bg-orange-600 text-white" : "border-neutral-200 bg-white text-slate-700 hover:border-orange-300"}`}>
            <NavIcon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{t(item.title)}</span>
          </Link>;
        })}
      </nav>

      <header className="mb-7 min-w-0">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700"><Icon aria-hidden="true" className="h-4 w-4" />{t("Document légal")}</div>
        <h1 className="break-words font-heading text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl" data-testid={`legal-title-${slug}`}>{t(page.title)}</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{t(page.subtitle)}</p>
        <p className="mt-4 text-sm text-slate-500">{t("Dernière mise à jour :")} <time dateTime={LAST_UPDATE}>{new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${LAST_UPDATE}T12:00:00Z`))}</time></p>
      </header>

      {missingIdentity && <aside role="note" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base leading-relaxed text-amber-950" data-testid="legal-incomplete-identity">
        <strong>{t("Informations légales à compléter.")}</strong>{" "}{t("L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.")}
      </aside>}

      <details className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <summary className="min-h-11 cursor-pointer py-2 text-base font-bold text-slate-900">{t("Sommaire de ce document")}</summary>
        <ol className="mt-3 space-y-1">
          {page.sections.map((section, index) => <li key={section.h}><a href={`#${slug}-section-${index + 1}`} className="block min-h-11 rounded-lg px-2 py-2 text-base leading-relaxed text-orange-700 hover:bg-orange-50">{t(section.h)}</a></li>)}
        </ol>
      </details>

      <Card className="min-w-0 space-y-8 rounded-2xl border-neutral-200 bg-white p-4 sm:space-y-10 sm:p-8" data-testid={`legal-content-${slug}`}>
        {page.sections.map((section, index) => <section key={section.h} id={`${slug}-section-${index + 1}`} className="min-w-0 scroll-mt-6 space-y-4">
          <h2 className="break-words border-s-4 border-orange-500 ps-3 font-heading text-xl font-extrabold leading-snug text-slate-900 sm:text-2xl">{t(section.h)}</h2>
          <div className="min-w-0 space-y-4 break-words text-base leading-8 text-slate-700">{section.blocks.map((block, blockIndex) => <ContentBlock key={blockIndex} block={block} />)}</div>
        </section>)}
      </Card>

      <Card className="mt-6 min-w-0 rounded-2xl border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50 p-5 sm:p-6">
        <h2 className="font-heading text-xl font-extrabold text-slate-900">{t("Une question ? Contactez-nous")}</h2>
        <div className="mt-4 grid min-w-0 gap-4 text-base sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-3"><Mail aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-700" /><a dir="ltr" href={`mailto:${COMPANY.email}`} className="min-w-0 break-all text-slate-700 hover:text-orange-700">{COMPANY.email}</a></div>
          <div className="flex min-w-0 items-start gap-3"><Phone aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-700" /><a dir="ltr" href={`tel:${COMPANY.phone}`} className="text-slate-700 hover:text-orange-700">{COMPANY.phone}</a></div>
          <div className="flex min-w-0 items-start gap-3 sm:col-span-2"><MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-700" /><span className="min-w-0 break-words text-slate-700">{COMPANY.fullAddress ? `${COMPANY.fullAddress}, ` : ""}{t(COMPANY.city)}, {t(COMPANY.country)}</span></div>
        </div>
        <a href={`https://wa.me/${COMPANY.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-base font-semibold text-white hover:bg-orange-700">{t("Contacter le support sur WhatsApp")}</a>
      </Card>
      <div className="mt-7 text-center"><Link to="/" className="inline-flex min-h-12 items-center px-3 text-base text-slate-600 hover:text-orange-700">{t("← Retour à l’accueil WinPulse")}</Link></div>
    </main>
  </div>;
}
