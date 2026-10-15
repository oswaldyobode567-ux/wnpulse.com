/**
 * WinPulse — pages légales réunies, version du 15 octobre 2026.
 * À placer dans frontend/src/pages/LegalPage.jsx. Aucun fichier CSS à ajouter.
 * Avant publication : compléter l'identité de l'exploitant, l'adresse postale
 * complète, les informations d'hébergement et la politique de données réelle.
 * Ce fichier présente des informations ; il ne change ni le paiement,
 * ni la collecte des consentements, ni les outils d'exercice des droits.
 */
import { useParams, Link, Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
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

const LAST_UPDATE = "15 octobre 2026";
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

function InlineText({ text }) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
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
  const details = [
    ["Nom commercial", COMPANY.name],
    ["Nom légal de l’exploitant", COMPANY.legalName],
    ["Forme ou qualité juridique", COMPANY.legalForm],
    ["Adresse postale complète", COMPANY.fullAddress],
    ["Ville et pays", `${COMPANY.city}, ${COMPANY.country}`],
    ["Registre et immatriculation, selon le statut", COMPANY.registration],
    ["TVA, si applicable", COMPANY.vatNumber],
    ["Responsable de publication", COMPANY.publicationDirector],
  ];
  return <div className="rounded-2xl border border-orange-100 bg-orange-50/40 p-4 sm:p-5">
    <dl className="space-y-3">
      {details.map(([label, value]) => <div key={label} className="grid min-w-0 gap-0.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-4">
        <dt className="font-semibold text-slate-900">{label}</dt>
        <dd className={value ? "min-w-0 break-words text-slate-700" : "min-w-0 break-words text-amber-800"}>{value || "À renseigner avant publication"}</dd>
      </div>)}
      <div><dt className="font-semibold text-slate-900">Email</dt><dd><a className="break-all text-orange-700 underline underline-offset-4" href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></dd></div>
      <div><dt className="font-semibold text-slate-900">Téléphone / WhatsApp</dt><dd><a className="text-orange-700 underline underline-offset-4" href={`tel:${COMPANY.phone}`}>{COMPANY.phone}</a></dd></div>
    </dl>
  </div>;
}

function ContentBlock({ block }) {
  if (block.type === "company") return <CompanyDetails />;
  if (block.type === "list") return <ul className="list-disc space-y-2 pl-5 marker:text-orange-500">
    {block.items.map((item, index) => <li key={index} className="pl-1"><InlineText text={item} /></li>)}
  </ul>;
  return <p><InlineText text={block.text} /></p>;
}

export default function LegalPage() {
  const { slug } = useParams();
  const page = Object.prototype.hasOwnProperty.call(PAGES, slug) ? PAGES[slug] : null;
  if (!page) return <Navigate to="/legal/mentions-legales" replace />;
  const Icon = ICONS[page.icon];
  const missingIdentity = !COMPANY.legalName || !COMPANY.legalForm || !COMPANY.fullAddress;

  return <div className="min-h-screen bg-neutral-50 text-slate-900">
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex min-h-20 max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-h-11 min-w-0 items-center gap-3" data-testid="legal-brand-link">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 text-white shadow-sm"><Zap className="h-6 w-6" strokeWidth={2.5} fill="currentColor" /></div>
          <div className="min-w-0"><div className="font-heading text-xl font-extrabold leading-tight">WinPulse</div><div className="mt-1 text-xs font-semibold uppercase tracking-widest text-orange-700">Informations légales</div></div>
        </Link>
        <Link to="/" className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-neutral-50">Retour au site</Link>
      </div>
    </header>

    <main className="mx-auto min-w-0 max-w-4xl px-4 pb-28 pt-6 sm:px-6 sm:pt-9 lg:px-8">
      <nav aria-label="Pages légales" className="mb-7 grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {Object.entries(PAGES).map(([key, item]) => {
          const NavIcon = ICONS[item.icon];
          const active = key === slug;
          return <Link key={key} to={`/legal/${key}`} aria-current={active ? "page" : undefined} data-testid={`legal-nav-${key}`} className={`flex min-h-12 min-w-0 items-center gap-2 rounded-xl border px-3 py-3 text-sm font-semibold leading-snug transition-colors sm:px-4 ${active ? "border-orange-600 bg-orange-600 text-white" : "border-neutral-200 bg-white text-slate-700 hover:border-orange-300"}`}>
            <NavIcon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{item.title}</span>
          </Link>;
        })}
      </nav>

      <header className="mb-7 min-w-0">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-700"><Icon aria-hidden="true" className="h-4 w-4" />Document légal</div>
        <h1 className="break-words font-heading text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl" data-testid={`legal-title-${slug}`}>{page.title}</h1>
        <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">{page.subtitle}</p>
        <p className="mt-4 text-sm text-slate-500">Dernière mise à jour : <time dateTime="2026-10-15">{LAST_UPDATE}</time></p>
      </header>

      {missingIdentity && <aside role="note" className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base leading-relaxed text-amber-950" data-testid="legal-incomplete-identity">
        <strong>Informations légales à compléter.</strong> L’identité juridique de l’exploitant et son adresse postale complète doivent être renseignées. La mention « Dublin, Irlande » indique uniquement la ville et le pays. Les champs incomplets restent signalés ci-dessous.
      </aside>}

      <details className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <summary className="min-h-11 cursor-pointer py-2 text-base font-bold text-slate-900">Sommaire de ce document</summary>
        <ol className="mt-3 space-y-1">
          {page.sections.map((section, index) => <li key={section.h}><a href={`#${slug}-section-${index + 1}`} className="block min-h-11 rounded-lg px-2 py-2 text-base leading-relaxed text-orange-700 hover:bg-orange-50">{section.h}</a></li>)}
        </ol>
      </details>

      <Card className="min-w-0 space-y-8 rounded-2xl border-neutral-200 bg-white p-4 sm:space-y-10 sm:p-8" data-testid={`legal-content-${slug}`}>
        {page.sections.map((section, index) => <section key={section.h} id={`${slug}-section-${index + 1}`} className="min-w-0 scroll-mt-6 space-y-4">
          <h2 className="break-words border-l-4 border-orange-500 pl-3 font-heading text-xl font-extrabold leading-snug text-slate-900 sm:text-2xl">{section.h}</h2>
          <div className="min-w-0 space-y-4 break-words text-base leading-8 text-slate-700">{section.blocks.map((block, blockIndex) => <ContentBlock key={blockIndex} block={block} />)}</div>
        </section>)}
      </Card>

      <Card className="mt-6 min-w-0 rounded-2xl border-orange-200 bg-gradient-to-br from-orange-50 to-rose-50 p-5 sm:p-6">
        <h2 className="font-heading text-xl font-extrabold text-slate-900">Une question ? Contactez-nous</h2>
        <div className="mt-4 grid min-w-0 gap-4 text-base sm:grid-cols-2">
          <div className="flex min-w-0 items-start gap-3"><Mail aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-700" /><a href={`mailto:${COMPANY.email}`} className="min-w-0 break-all text-slate-700 hover:text-orange-700">{COMPANY.email}</a></div>
          <div className="flex min-w-0 items-start gap-3"><Phone aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-700" /><a href={`tel:${COMPANY.phone}`} className="text-slate-700 hover:text-orange-700">{COMPANY.phone}</a></div>
          <div className="flex min-w-0 items-start gap-3 sm:col-span-2"><MapPin aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-orange-700" /><span className="min-w-0 break-words text-slate-700">{COMPANY.fullAddress ? `${COMPANY.fullAddress}, ` : ""}{COMPANY.city}, {COMPANY.country}</span></div>
        </div>
        <a href={`https://wa.me/${COMPANY.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-600 px-5 py-3 text-base font-semibold text-white hover:bg-orange-700">Contacter le support sur WhatsApp</a>
      </Card>
      <div className="mt-7 text-center"><Link to="/" className="inline-flex min-h-12 items-center px-3 text-base text-slate-600 hover:text-orange-700">← Retour à l’accueil WinPulse</Link></div>
    </main>
  </div>;
}
