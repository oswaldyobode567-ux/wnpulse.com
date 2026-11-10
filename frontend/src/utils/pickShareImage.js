const BADGE = /^https:\/\/(?:media(?:-1)?\.api-sports\.io\/(?:[a-z]+\/)?teams\/\d+\.png|crests\.football-data\.org\/[\w-]+\.png)$/i;

function loadBadge(source) {
  if (!BADGE.test(source || "")) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    const finish = value => { clearTimeout(timer); image.onload = null; image.onerror = null; resolve(value); };
    const timer = setTimeout(() => finish(null), 3500);
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.onload = () => finish(image.naturalWidth ? image : null);
    image.onerror = () => finish(null);
    image.src = source;
  });
}

export async function makePickShareImage({teams, badgeSources, competition, date, market, pick, odds, status}) {
  const badges = await Promise.all(badgeSources.map(loadBadge));
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  const box = (x,y,w,h,r,color) => {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=color; ctx.fill();
  };
  const write = (value,x,y,size,color,maxWidth,align="left",weight=700) => {
    const original = String(value || "").replace(/[\u0000-\u001f\u007f]/g," ").trim();
    const chars = Array.from(original);
    let text=original;
    ctx.font=`${weight} ${size}px system-ui, sans-serif`;
    while (ctx.measureText(text).width>maxWidth && chars.length) { chars.pop(); text=chars.join("")+"…"; }
    ctx.textAlign=align; ctx.textBaseline="middle"; ctx.fillStyle=color; ctx.fillText(text,x,y);
  };
  const backdrop=ctx.createLinearGradient(0,0,1080,1080);
  backdrop.addColorStop(0,"#111a31"); backdrop.addColorStop(1,"#22182d");
  ctx.fillStyle=backdrop; ctx.fillRect(0,0,1080,1080);
  write("WINPULSE  /  MATCH CENTER",86,82,30,"#FFB479",860);
  write([competition,date].filter(Boolean).join("   •   "),86,145,30,"#DFEAFA",900);
  box(86,202,908,416,32,"#192D4B");
  ctx.strokeStyle="#34577D"; ctx.lineWidth=3;
  ctx.strokeRect(111,228,858,364);
  ctx.beginPath();ctx.moveTo(540,228);ctx.lineTo(540,592);ctx.stroke();
  ctx.beginPath();ctx.arc(540,406,85,0,Math.PI*2);ctx.stroke();
  for (let i=0;i<2;i++) {
    const x=[312,768][i], name=teams[i] || "—", badge=badges[i];
    box(x-96,282,192,192,26,"#EFF4FF");
    if (badge) {
      const scale=Math.min(158/badge.naturalWidth,158/badge.naturalHeight);
      const w=badge.naturalWidth*scale,h=badge.naturalHeight*scale;
      ctx.drawImage(badge,x-w/2,378-h/2,w,h);
    } else {
      write(name.split(/\s+/).slice(0,3).map(word=>Array.from(word)[0]).join("").toUpperCase(),x,378,60,"#263D60",175,"center");
    }
    write(name,x,532,35,"#F6F8FF",370,"center");
  }
  box(497,367,86,78,14,"#111A31");
  write("VS",540,406,32,"#FFB479",70,"center");
  box(86,659,908,284,28,"#10182A");
  write(market,119,716,32,"#FFB479",610);
  write(pick,119,798,48,"#F8FAFF",620);
  write(status,119,883,27,"#C9DAF5",600);
  if (odds) { box(782,741,174,118,19,"#FFB479"); write(odds,869,801,49,"#151B2F",150,"center"); }
  write("wnpulse.com",86,1005,29,"#DAE6F8",650);
  write("18+",994,1005,26,"#DAE6F8",85,"right");
  return new Promise((resolve,reject) => {
    canvas.toBlob(blob => blob ? resolve(new File([blob],"winpulse-pronostic.png",{type:"image/png"})) : reject(new Error("Image indisponible")),"image/png");
  });
}
