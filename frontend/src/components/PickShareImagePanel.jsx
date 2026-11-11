import { useEffect, useState } from "react";
import { makePickShareImage } from "@/utils/pickShareImage";

export default function PickShareImagePanel({ cards, t, text = "" }) {
  const [index,setIndex]=useState(0);
  const [rendered,setRendered]=useState(null);
  const [failed,setFailed]=useState(false);
  const [message,setMessage]=useState("");
  const key=JSON.stringify(cards[index] || cards[0] || null);
  useEffect(()=>{
    let active=true,url="";
    setRendered(null);
    setFailed(false);
    setMessage("");
    const card=JSON.parse(key);
    if(card) makePickShareImage(card).then(file=>{
      if(!active)return;
      url=URL.createObjectURL(file);
      setRendered({key,file,url});
    }).catch(()=>{if(active)setFailed(true);});
    return ()=>{active=false;if(url)URL.revokeObjectURL(url);};
  },[key]);
  if(!cards.length)return null;
  const ready=rendered?.key===key ? rendered : null;
  const fileShare=!!ready && typeof navigator.share==="function" && !!navigator.canShare?.({files:[ready.file]});
  return <section className="my-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="admin-share-image">
    {cards.length>1 && <label className="block text-sm font-semibold">{t("Pronostic à illustrer")}
      <select value={index} onChange={event=>setIndex(Number(event.target.value))} className="mt-1 block w-full rounded border bg-white p-2">
        {cards.map((card,i)=><option value={i} key={i}>{card.teams.join(" – ")} · {card.pick}</option>)}
      </select>
    </label>}
    {ready ? <>
      <img src={ready.url} alt={t("Visuel du pronostic sélectionné")} width="1080" height="1080" className="mx-auto block h-auto w-full max-w-[340px] rounded-lg"/>
      <div className="flex flex-wrap gap-2 text-sm font-semibold">
        {fileShare && <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-white" onClick={async()=>{
          try { await navigator.share({files:[ready.file],text}); }
          catch(error){if(error?.name!=="AbortError")setMessage(t("Télécharge le PNG pour le joindre manuellement."));}
        }}>{t("Partager l’image")}</button>}
        <a href={ready.url} download={ready.file.name} className="rounded-lg border bg-white px-3 py-2">{t("Télécharger le PNG")}</a>
      </div>
      <p className="text-xs text-slate-600">{fileShare ? t("Choisis WhatsApp ou Telegram dans le menu de partage.") : t("Télécharge le PNG puis joins-le dans WhatsApp ou Telegram.")}</p>
    </> : <p className="text-sm text-slate-600">{failed ? t("Visuel indisponible. Tu peux encore partager le texte.") : t("Préparation du visuel…")}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
