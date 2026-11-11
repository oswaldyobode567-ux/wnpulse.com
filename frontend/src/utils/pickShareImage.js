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
  box(72,60,936,92,24,"#F38C40");
  write("WINPULSE",104,106,35,"#151D30",370);
  write("SÉLECTION",970,106,24,"#151D30",280,"right");
  write(competition,88,190,28,"#FFB57D",900);
  for (let i=0;i<2;i++) {
    const x=[315,765][i], name=teams[i] || "—", badge=badges[i];
    box(x-207,235,414,354,28,"#1C2A43");
    box(x-75,268,150,150,22,"#F2F5FB");
    if (badge) {
      const scale=Math.min(130/badge.naturalWidth,130/badge.naturalHeight);
      const w=badge.naturalWidth*scale,h=badge.naturalHeight*scale;
      ctx.drawImage(badge,x-w/2,343-h/2,w,h);
    } else {
      write(name.split(/\s+/).slice(0,3).map(word=>Array.from(word)[0]).join("").toUpperCase(),x,343,43,"#263D60",140,"center");
    }
    ctx.font="700 32px system-ui, sans-serif";
    const lines=[""];
    for(const word of String(name).split(/\s+/)) {
      const line=(lines.at(-1)+" "+word).trim();
      if(ctx.measureText(line).width>365 && lines.at(-1)) lines.push(word);
      else lines[lines.length-1]=line;
    }
    lines.slice(0,2).forEach((line,j)=>write(line,x,472+j*43,32,"#F6F8FF",365,"center"));
  }
  box(498,328,84,65,14,"#F38C40");
  write("VS",540,361,26,"#151D30",70,"center");
  write(date,96,635,26,"#DAE4F5",870);
  box(96,680,888,245,24,"#F0F3F9");
  write("NOTRE CHOIX",126,722,22,"#6E4C39",600);
  write(pick,126,787,36,"#17253D",625);
  write(market,126,850,23,"#41516B",625);
  if (odds) {
    box(788,730,166,140,20,"#F38C40");
    write("COTE",871,761,19,"#402E25",140,"center");
    write(odds,871,817,40,"#17253D",140,"center");
  }
  if(status)write(status,96,957,24,"#F7B17E",800);
  write("Les analyses sur wnpulse.com",96,1005,25,"#DAE6F8",810);
  write("18+",984,1005,22,"#DAE6F8",85,"right");
  return new Promise((resolve,reject) => {
    canvas.toBlob(blob => blob ? resolve(new File([blob],"winpulse-pronostic.png",{type:"image/png"})) : reject(new Error("Image indisponible")),"image/png");
  });
}
