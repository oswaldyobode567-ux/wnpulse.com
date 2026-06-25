/**
 * Legal pages — Mentions légales, CGV, Politique de confidentialité, Jeu responsable.
 * Adapté à la législation béninoise et au RGPD/CEDEAO.
 * Éditeur: WinPulse SARL — Cotonou, Littoral, Bénin.
 */
import { useParams, Link, Navigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Zap, FileText, Shield, Lock, AlertTriangle, Phone, Mail, MapPin } from "lucide-react";

const COMPANY = {
  name: "WinPulse SARL",
  city: "Cotonou",
  region: "Littoral",
  country: "Bénin",
  email: "contact@winpulse.com",
  phone: "+229 01 67 30 54 39",
  whatsapp: "+229 01 67 30 54 39",
  host: "Emergent (https://emergent.sh)",
  domain: "winpulse.com",
};

const PAGES = {
  "mentions-legales": {
    icon: FileText,
    title: "Mentions légales",
    subtitle: "Informations légales sur l'éditeur de WinPulse.",
    sections: [
      {
        h: "Éditeur du site",
        b: (
          <div className="space-y-1.5">
            <p><strong>Raison sociale :</strong> {COMPANY.name}</p>
            <p><strong>Forme juridique :</strong> Société à Responsabilité Limitée (SARL)</p>
            <p><strong>RCCM :</strong> En cours d'immatriculation (à compléter)</p>
            <p><strong>Adresse du siège :</strong> {COMPANY.city}, {COMPANY.region}, {COMPANY.country}</p>
            <p><strong>Téléphone :</strong> <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="text-orange-600 hover:underline">{COMPANY.phone}</a></p>
            <p><strong>Email :</strong> <a href={`mailto:${COMPANY.email}`} className="text-orange-600 hover:underline">{COMPANY.email}</a></p>
            <p><strong>Directeur de la publication :</strong> Représentant légal de {COMPANY.name}</p>
          </div>
        ),
      },
      {
        h: "Hébergement",
        b: (
          <p>
            Le site WinPulse est hébergé par <strong>{COMPANY.host}</strong>. L'hébergeur est responsable de la conservation des données techniques nécessaires au bon fonctionnement du service.
          </p>
        ),
      },
      {
        h: "Propriété intellectuelle",
        b: (
          <p>
            L'ensemble des éléments présents sur ce site (textes, images, logo, design, code source, algorithmes de prédiction, base de données de matchs) est la propriété exclusive de {COMPANY.name}. Toute reproduction, représentation, modification, publication ou adaptation, totale ou partielle, est interdite sans autorisation écrite préalable de l'éditeur, sous peine de poursuites au titre du Code de la Propriété Intellectuelle et des accords internationaux applicables au Bénin (OAPI).
          </p>
        ),
      },
      {
        h: "Données personnelles & contact",
        b: (
          <p>
            Pour toute question relative à vos données personnelles, à l'exercice de vos droits ou à un signalement, vous pouvez nous contacter à <a href={`mailto:${COMPANY.email}`} className="text-orange-600 hover:underline">{COMPANY.email}</a>. Consultez également notre{" "}
            <Link to="/legal/confidentialite" className="text-orange-600 hover:underline">politique de confidentialité</Link>.
          </p>
        ),
      },
      {
        h: "Avertissement légal",
        b: (
          <div className="space-y-2">
            <p>
              WinPulse est un outil d'analyse et de pronostic sportif <strong>à but informatif</strong>. WinPulse <strong>n'organise pas de paris</strong>, n'accepte aucune mise, et ne joue pas pour ses utilisateurs. Les paris sportifs s'effectuent uniquement chez des opérateurs agréés.
            </p>
            <p>
              L'utilisation de WinPulse est strictement réservée aux personnes <strong>majeures (18 ans révolus)</strong>. Consultez notre page{" "}
              <Link to="/legal/jeu-responsable" className="text-orange-600 hover:underline">Jeu responsable</Link>.
            </p>
          </div>
        ),
      },
    ],
  },

  "cgv": {
    icon: Shield,
    title: "Conditions Générales de Vente",
    subtitle: "CGV applicables aux abonnements Pro et Elite de WinPulse.",
    sections: [
      {
        h: "1. Objet",
        b: (
          <p>
            Les présentes Conditions Générales de Vente (CGV) régissent les relations contractuelles entre {COMPANY.name} (ci-après « WinPulse ») et toute personne physique majeure souscrivant un abonnement payant (« Pro » ou « Elite ») sur le site {COMPANY.domain}.
          </p>
        ),
      },
      {
        h: "2. Offres et tarifs",
        b: (
          <div className="space-y-2">
            <p>WinPulse propose 3 plans d'accès :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Free</strong> — gratuit : 1 pick gratuit/jour, track record public, fonctionnalités limitées.</li>
              <li><strong>Pro</strong> — <strong>4 900 FCFA / mois</strong> : accès complet aux pronostics, aux 3 combinés journaliers et à l'analyse IA.</li>
              <li><strong>Elite</strong> — <strong>14 900 FCFA / mois</strong> : tout l'offre Pro + picks VIP, stratégie bankroll Kelly et support prioritaire.</li>
            </ul>
            <p>Les tarifs sont indiqués en Francs CFA (XOF), toutes taxes comprises. WinPulse se réserve le droit de modifier ses tarifs à tout moment ; le tarif applicable est celui en vigueur au moment de la souscription.</p>
          </div>
        ),
      },
      {
        h: "3. Paiement",
        b: (
          <div className="space-y-2">
            <p>
              Le paiement s'effectue par <strong>MTN Mobile Money Bénin</strong> sur le numéro marchand <strong className="font-mono">{COMPANY.phone}</strong>. Une confirmation par WhatsApp est requise pour activer le compte. L'activation est manuelle et intervient généralement <strong>sous 1 heure</strong> après réception du SMS MTN de confirmation.
            </p>
            <p>L'abonnement est activé pour une durée de <strong>30 jours calendaires</strong> à compter de la date de validation par WinPulse.</p>
          </div>
        ),
      },
      {
        h: "4. Politique de remboursement",
        b: (
          <div className="space-y-2 bg-rose-50 border border-rose-200 rounded-lg p-3">
            <p className="font-semibold text-rose-900">
              ⚠️ Aucun remboursement ne sera effectué après activation de l'abonnement.
            </p>
            <p className="text-slate-700">
              En raison de la nature immédiatement consommable du service (accès instantané à des contenus exclusifs : pronostics, analyses IA, combinés), le droit de rétractation prévu par la loi ne s'applique pas, conformément aux usages applicables aux services numériques fournis sans délai.
            </p>
            <p className="text-slate-700">
              L'utilisateur reconnaît avoir explicitement consenti à l'exécution immédiate du service en cochant la case <em>« J'ai compris : aucun remboursement après activation »</em> lors du paiement.
            </p>
          </div>
        ),
      },
      {
        h: "5. Reconduction et résiliation",
        b: (
          <p>
            L'abonnement n'est <strong>pas reconduit automatiquement</strong>. À l'issue des 30 jours, le compte repasse en plan Free et l'utilisateur peut souscrire à nouveau s'il le souhaite. L'utilisateur peut également supprimer son compte à tout moment en envoyant un email à <a href={`mailto:${COMPANY.email}`} className="text-orange-600 hover:underline">{COMPANY.email}</a>.
          </p>
        ),
      },
      {
        h: "6. Limites de responsabilité",
        b: (
          <div className="space-y-2">
            <p>
              WinPulse fournit des <strong>analyses et pronostics à titre informatif</strong>. Les performances passées ne garantissent en aucun cas les performances futures. <strong>Aucun pronostic n'est sûr à 100%</strong>. WinPulse ne pourra être tenue responsable d'éventuelles pertes financières liées à des paris effectués par l'utilisateur auprès de tiers (bookmakers).
            </p>
            <p>
              L'utilisateur reconnaît que les paris sportifs comportent un risque de perte financière et qu'il joue à ses risques et périls, en pleine conscience.
            </p>
          </div>
        ),
      },
      {
        h: "7. Accès au service & disponibilité",
        b: (
          <p>
            WinPulse s'engage à fournir un service disponible <strong>24h/24 et 7j/7</strong>, sous réserve des interruptions techniques nécessaires à la maintenance, des cas de force majeure ou des défaillances des fournisseurs tiers (notamment l'API de données sportives). Aucune indemnisation ne pourra être réclamée en cas d'interruption ponctuelle.
          </p>
        ),
      },
      {
        h: "8. Données personnelles",
        b: (
          <p>
            Le traitement des données personnelles de l'utilisateur est régi par notre{" "}
            <Link to="/legal/confidentialite" className="text-orange-600 hover:underline">politique de confidentialité</Link>, conforme à la loi n° 2017-20 du Bénin portant Code du numérique.
          </p>
        ),
      },
      {
        h: "9. Loi applicable & juridiction",
        b: (
          <p>
            Les présentes CGV sont régies par le <strong>droit béninois</strong>. En cas de litige, et après tentative de règlement amiable, les tribunaux compétents seront ceux de <strong>Cotonou (Bénin)</strong>.
          </p>
        ),
      },
      {
        h: "10. Modification des CGV",
        b: (
          <p>
            WinPulse se réserve le droit de modifier les présentes CGV à tout moment. Les utilisateurs seront informés des modifications majeures par email. Les CGV en vigueur sont celles consultables sur cette page à la date de la souscription.
          </p>
        ),
      },
    ],
  },

  "confidentialite": {
    icon: Lock,
    title: "Politique de confidentialité",
    subtitle: "Comment WinPulse collecte, utilise et protège vos données personnelles.",
    sections: [
      {
        h: "Responsable du traitement",
        b: (
          <p>
            Le responsable du traitement des données personnelles est <strong>{COMPANY.name}</strong>, sis à {COMPANY.city}, {COMPANY.region}, {COMPANY.country}. Pour toute question, contactez <a href={`mailto:${COMPANY.email}`} className="text-orange-600 hover:underline">{COMPANY.email}</a>.
          </p>
        ),
      },
      {
        h: "Données collectées",
        b: (
          <div className="space-y-2">
            <p>Lors de votre utilisation de WinPulse, nous collectons :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Données d'identification :</strong> nom, prénom, adresse email, mot de passe (chiffré).</li>
              <li><strong>Données de paiement :</strong> numéro MTN MoMo, nom du payeur, montant, référence de transaction. <em>Aucune donnée bancaire n'est stockée.</em></li>
              <li><strong>Données d'usage :</strong> picks consultés, sessions, pages visitées, horodatages.</li>
              <li><strong>Données techniques :</strong> adresse IP, type de navigateur, appareil utilisé.</li>
            </ul>
          </div>
        ),
      },
      {
        h: "Finalités du traitement",
        b: (
          <div className="space-y-1.5">
            <p>Vos données sont utilisées exclusivement pour :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Fournir l'accès au service (authentification, gestion d'abonnement).</li>
              <li>Vous envoyer les pronostics, analyses et notifications souscrits.</li>
              <li>Vous adresser des emails marketing (offres, picks teasers) — vous pouvez vous désinscrire à tout moment.</li>
              <li>Améliorer le service via des statistiques d'usage anonymisées.</li>
              <li>Respecter nos obligations légales et comptables.</li>
            </ul>
          </div>
        ),
      },
      {
        h: "Base légale",
        b: (
          <p>
            Les traitements reposent sur (a) l'<strong>exécution du contrat</strong> que vous concluez avec WinPulse, (b) votre <strong>consentement</strong> explicite pour les communications marketing, et (c) le respect des <strong>obligations légales</strong> applicables au Bénin.
          </p>
        ),
      },
      {
        h: "Durée de conservation",
        b: (
          <div className="space-y-1.5">
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Compte actif :</strong> données conservées tant que le compte existe.</li>
              <li><strong>Compte supprimé :</strong> données supprimées sous 30 jours, sauf obligations légales (facturation : 10 ans).</li>
              <li><strong>Logs techniques :</strong> 12 mois maximum.</li>
            </ul>
          </div>
        ),
      },
      {
        h: "Vos droits",
        b: (
          <div className="space-y-2">
            <p>Conformément à la loi n° 2017-20 du 20 avril 2018 portant Code du numérique au Bénin, vous disposez des droits suivants :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Droit d'accès</strong> à vos données.</li>
              <li><strong>Droit de rectification</strong> de données inexactes.</li>
              <li><strong>Droit à l'effacement</strong> (« droit à l'oubli »).</li>
              <li><strong>Droit à la portabilité</strong> de vos données.</li>
              <li><strong>Droit d'opposition</strong> au traitement à des fins marketing.</li>
              <li><strong>Droit de retirer votre consentement</strong> à tout moment.</li>
            </ul>
            <p>Pour exercer un droit, écrivez-nous à <a href={`mailto:${COMPANY.email}`} className="text-orange-600 hover:underline">{COMPANY.email}</a>. Nous répondrons sous 30 jours maximum.</p>
            <p>Vous pouvez également déposer une réclamation auprès de l'<strong>Autorité de Protection des Données Personnelles (APDP) du Bénin</strong>.</p>
          </div>
        ),
      },
      {
        h: "Cookies & traceurs",
        b: (
          <p>
            WinPulse utilise des cookies strictement nécessaires au fonctionnement du site (authentification, préférences). Aucun cookie publicitaire ou de tracking tiers n'est utilisé sans votre consentement. Vous pouvez désactiver les cookies dans votre navigateur, au risque de perdre certaines fonctionnalités.
          </p>
        ),
      },
      {
        h: "Sécurité",
        b: (
          <p>
            Vos données sont stockées sur des serveurs sécurisés. Les mots de passe sont hachés avec bcrypt. Les communications sont chiffrées via HTTPS (TLS 1.3). Nous ne vendons ni ne louons vos données à des tiers.
          </p>
        ),
      },
      {
        h: "Sous-traitants",
        b: (
          <div className="space-y-1.5">
            <p>Pour fournir le service, nous utilisons les sous-traitants suivants, tous engagés contractuellement à respecter la confidentialité de vos données :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Emergent</strong> — hébergement applicatif.</li>
              <li><strong>Resend</strong> — envoi des emails transactionnels.</li>
              <li><strong>Anthropic</strong> — moteur d'analyse IA (Claude Sonnet).</li>
              <li><strong>The Odds API</strong> — cotes sportives.</li>
              <li><strong>MTN Bénin</strong> — paiements mobiles.</li>
            </ul>
          </div>
        ),
      },
    ],
  },

  "jeu-responsable": {
    icon: AlertTriangle,
    title: "Jeu responsable",
    subtitle: "Le pari sportif doit rester un loisir. WinPulse s'engage pour un jeu responsable.",
    sections: [
      {
        h: "Réservé aux 18 ans et plus",
        b: (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-4">
            <p className="font-semibold text-rose-900">
              🔞 L'accès à WinPulse et la pratique des paris sportifs sont <strong>strictement interdits aux mineurs</strong>.
            </p>
            <p className="text-slate-700 mt-2">
              En utilisant WinPulse, vous certifiez avoir au moins <strong>18 ans révolus</strong>. Toute fausse déclaration peut entraîner la suppression immédiate du compte sans remboursement.
            </p>
          </div>
        ),
      },
      {
        h: "Les paris comportent des risques",
        b: (
          <div className="space-y-2">
            <p>Le pari sportif est un divertissement à risque financier. Aucun pronostic n'est garanti, même les plus probables. Quelques règles essentielles :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Ne misez jamais</strong> plus que ce que vous pouvez vous permettre de perdre.</li>
              <li><strong>Fixez-vous un budget mensuel</strong> et respectez-le strictement.</li>
              <li><strong>Ne jouez pas</strong> pour récupérer une perte (« chasing losses »).</li>
              <li><strong>Ne jouez pas</strong> sous l'effet de l'alcool, de la fatigue ou du stress.</li>
              <li><strong>Faites des pauses</strong> régulières et entourez-vous de proches qui peuvent vous alerter.</li>
            </ul>
          </div>
        ),
      },
      {
        h: "Signes d'une dépendance au jeu",
        b: (
          <div className="space-y-2">
            <p>Demandez-vous :</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Le jeu prend-il une place trop importante dans ma vie ?</li>
              <li>Est-ce que je mise des sommes que je ne peux pas perdre ?</li>
              <li>Est-ce que je mens à mes proches sur mes mises ?</li>
              <li>Est-ce que je joue pour fuir mes problèmes ou mes émotions ?</li>
              <li>Est-ce que je ressens de l'anxiété quand je ne peux pas jouer ?</li>
            </ul>
            <p>Si vous répondez « oui » à plusieurs de ces questions, parlez-en. Vous n'êtes pas seul·e.</p>
          </div>
        ),
      },
      {
        h: "Ressources d'aide",
        b: (
          <div className="space-y-2">
            <p><strong>Au Bénin :</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Centre de santé mentale (CNHU, Cotonou) — consultation gratuite.</li>
              <li>SOS Écoute / Ligne psychologique d'aide : à compléter localement.</li>
            </ul>
            <p><strong>International :</strong></p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Gamblers Anonymous — <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">gamblersanonymous.org</a></li>
              <li>BeGambleAware — <a href="https://www.begambleaware.org" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">begambleaware.org</a></li>
            </ul>
          </div>
        ),
      },
      {
        h: "Notre engagement",
        b: (
          <p>
            WinPulse s'engage à ne <strong>jamais inciter</strong> à miser des sommes inconsidérées. Nos communications ne promettent jamais de gains certains. Nos statistiques sont vérifiables publiquement sur la page{" "}
            <Link to="/resultats" className="text-orange-600 hover:underline">Track record</Link>. Si vous souhaitez fermer votre compte ou bloquer votre accès, contactez <a href={`mailto:${COMPANY.email}`} className="text-orange-600 hover:underline">{COMPANY.email}</a> — nous traitons ces demandes sous 24h.
          </p>
        ),
      },
    ],
  },
};

export default function LegalPage() {
  const { slug } = useParams();
  const page = PAGES[slug];

  if (!page) return <Navigate to="/legal/mentions-legales" replace />;

  const Icon = page.icon;
  const lastUpdate = "1er février 2026";

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-neutral-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="legal-brand-link">
            <div className="h-9 w-9 rounded-xl wp-gradient-warm grid place-items-center text-white shadow-lg shadow-orange-600/30">
              <Zap className="h-5 w-5" strokeWidth={2.5} fill="white" />
            </div>
            <div>
              <div className="font-heading font-extrabold text-lg leading-none">WinPulse</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-orange-600 font-semibold">Mentions légales</div>
            </div>
          </Link>
          <nav className="hidden sm:flex items-center gap-1 text-xs">
            {Object.entries(PAGES).map(([key, p]) => {
              const I = p.icon;
              const active = key === slug;
              return (
                <Link
                  key={key}
                  to={`/legal/${key}`}
                  data-testid={`legal-nav-${key}`}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold transition-colors ${
                    active ? "bg-orange-50 text-orange-700 ring-1 ring-orange-200" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <I className="h-3.5 w-3.5" />
                  <span>{p.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Mobile nav */}
        <nav className="sm:hidden mb-6 -mx-1 flex gap-1 overflow-x-auto scrollbar-thin pb-2">
          {Object.entries(PAGES).map(([key, p]) => {
            const active = key === slug;
            return (
              <Link
                key={key}
                to={`/legal/${key}`}
                className={`inline-flex shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  active ? "bg-orange-500 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                }`}
              >
                {p.title}
              </Link>
            );
          })}
        </nav>

        <header className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-bold text-orange-700 mb-4">
            <Icon className="h-3.5 w-3.5" /> Document légal
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900" data-testid={`legal-title-${slug}`}>
            {page.title}
          </h1>
          <p className="mt-3 text-base text-slate-600">{page.subtitle}</p>
          <div className="mt-3 text-xs text-slate-500">Dernière mise à jour : {lastUpdate}</div>
        </header>

        <Card className="bg-white border-neutral-200 p-6 sm:p-8 space-y-7" data-testid={`legal-content-${slug}`}>
          {page.sections.map((s, i) => (
            <section key={i} className="space-y-2">
              <h2 className="font-heading text-lg font-extrabold text-slate-900 border-l-4 border-orange-500 pl-3">{s.h}</h2>
              <div className="text-sm text-slate-700 leading-relaxed">{s.b}</div>
            </section>
          ))}
        </Card>

        {/* Contact footer block */}
        <Card className="mt-6 bg-gradient-to-br from-orange-50 to-rose-50 border-orange-200 p-5">
          <div className="font-heading font-extrabold text-slate-900 mb-3">Une question ? Contactez-nous</div>
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-orange-600 mt-0.5" />
              <a href={`mailto:${COMPANY.email}`} className="text-slate-700 hover:text-orange-700 break-all">{COMPANY.email}</a>
            </div>
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-orange-600 mt-0.5" />
              <a href={`tel:${COMPANY.phone.replace(/\s/g, "")}`} className="text-slate-700 hover:text-orange-700">{COMPANY.phone}</a>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-orange-600 mt-0.5" />
              <span className="text-slate-700">{COMPANY.city}, {COMPANY.region}, {COMPANY.country}</span>
            </div>
          </div>
        </Card>

        <div className="mt-8 text-center">
          <Link to="/" className="text-sm text-slate-500 hover:text-orange-600">← Retour à l'accueil WinPulse</Link>
        </div>
      </main>
    </div>
  );
}
