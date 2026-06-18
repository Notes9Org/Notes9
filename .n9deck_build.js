const ROOT = "/tmp/n9assets";
const pptxgen = require(ROOT+"/node_modules/pptxgenjs");
const React = require(ROOT+"/node_modules/react");
const ReactDOMServer = require(ROOT+"/node_modules/react-dom/server");
const sharp = require(ROOT+"/node_modules/sharp");
const FA = require(ROOT+"/node_modules/react-icons/fa");

const INK="2B2926", INK2="5A554E", CREAM="F7F3EA", CARD="FFFFFF",
      TERRA="B85042", TERRA_D="8F3D32", SAGE="7E9886", SAND="EDE6D7",
      GOLD="C98A3D", LINE="E2D9C6";
const HF="Georgia", BF="Calibri";
const W=13.333, H=7.5;
const LOGO_DARK=ROOT+"/notes9-logo.png";
const LOGO_WHITE=ROOT+"/logo_white.png";
const LOGO_TERRA=ROOT+"/logo_terra.png";

let pres=new pptxgen();
pres.defineLayout({name:"W",width:W,height:H});
pres.layout="W";
pres.author="Notes9"; pres.title="Notes9 — Pre-Seed Investor Deck";

const iconCache={};
async function icon(Comp,color="#"+INK,size=256){
  const key=Comp.name+color+size;
  if(iconCache[key])return iconCache[key];
  const svg=ReactDOMServer.renderToStaticMarkup(React.createElement(Comp,{color,size:String(size)}));
  const png=await sharp(Buffer.from(svg)).png().toBuffer();
  const d="image/png;base64,"+png.toString("base64");
  iconCache[key]=d; return d;
}
const mkShadow=()=>({type:"outer",color:"B7AC95",blur:9,offset:3,angle:90,opacity:0.28});
const softShadow=()=>({type:"outer",color:"9C9080",blur:6,offset:2,angle:90,opacity:0.18});
function bg(s,c=CREAM){s.background={color:c};}

// wordmark: real logo mark on light bg; text-only on dark bg (logo interior is opaque)
function wordmark(s,x,y,h,light){
  if(!light) s.addImage({path:LOGO_DARK,x,y,w:h,h});
  const tx = light ? x : x+h+0.1;
  s.addText([{text:"Notes",options:{color:light?"FFFFFF":INK,bold:true}},{text:"9",options:{color:TERRA,bold:true}}],
    {x:tx,y:y-0.02,w:2.8,h:h+0.04,fontFace:HF,fontSize:h*40,align:"left",valign:"middle",margin:0});
}
function kicker(s,x,y,t,c=TERRA){s.addText(t.toUpperCase(),{x,y,w:7,h:0.3,fontFace:BF,fontSize:11.5,bold:true,color:c,charSpacing:3,align:"left",margin:0});}
function footer(s,n,light){
  if(!light) s.addImage({path:LOGO_DARK,x:0.6,y:H-0.46,w:0.28,h:0.28});
  s.addText([{text:"Notes",options:{bold:true,color:light?"C9C2B6":INK2}},{text:"9",options:{bold:true,color:TERRA}},{text:"   ·   Pre-Seed   ·   Confidential",options:{color:"9A9387"}}],
    {x:light?0.6:0.95,y:H-0.46,w:6,h:0.3,fontFace:BF,fontSize:8.5,align:"left",valign:"middle",margin:0});
  s.addText(String(n).padStart(2,"0"),{x:W-1.1,y:H-0.44,w:0.5,h:0.3,fontFace:BF,fontSize:8.5,color:"9A9387",align:"right",margin:0});
}
function slideTitle(s,kick,title,o={}){
  kicker(s,0.7,0.55,kick);
  s.addText(title,{x:0.68,y:0.82,w:o.w||11.9,h:o.h||0.95,fontFace:HF,fontSize:o.size||30,bold:true,color:INK,align:"left",valign:"top",margin:0,lineSpacing:(o.size||30)*1.08});
}

async function build(){
  // ---------- 1 TITLE ----------
  {
    const s=pres.addSlide(); bg(s,INK);
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.28,h:H,fill:{color:TERRA}});
    s.addText("9",{x:8.3,y:-1.1,w:6,h:9,fontFace:HF,fontSize:560,bold:true,color:"34302B",align:"center",valign:"middle",margin:0});
    wordmark(s,0.85,0.7,0.55,true);
    s.addText("AI-NATIVE LAB NOTEBOOK",{x:0.9,y:2.5,w:9,h:0.4,fontFace:BF,fontSize:13,bold:true,color:SAGE,charSpacing:4,margin:0});
    s.addText("AI that answers from your\nlab's actual work.",{x:0.85,y:2.9,w:9.4,h:1.9,fontFace:HF,fontSize:46,bold:true,color:"FFFFFF",lineSpacing:48,margin:0});
    s.addText("Stop re-explaining your science to AI. Notes9 connects every paper, protocol, experiment and result into one memory that Catalyst reasons over — and cites.",
      {x:0.9,y:4.9,w:8.0,h:1.0,fontFace:BF,fontSize:15,color:"C9C2B6",lineSpacing:22,margin:0});
    s.addText([{text:"Pre-Seed Investment Memorandum",options:{color:"FFFFFF",bold:true,breakLine:true}},{text:"June 2026  ·  Distributed team — India · United States · United Kingdom",options:{color:"9A9387"}}],
      {x:0.9,y:6.35,w:9,h:0.7,fontFace:BF,fontSize:11.5,lineSpacing:17,margin:0});
    s.addText("notes9.com",{x:W-2.6,y:6.55,w:2,h:0.3,fontFace:BF,fontSize:11,bold:true,color:TERRA,align:"right",margin:0});
  }

  // ---------- 2 PROBLEM ----------
  {
    const s=pres.addSlide(); bg(s);
    slideTitle(s,"The problem","You already use AI. It simply\ncan't see your work.",{size:28,h:1.3});
    s.addText("Researchers have embraced AI for reading and writing — but it runs outside the lab, blind to the project. So the same context gets pasted in week after week, the reasoning behind “why condition B” scatters, and months later no one can reconstruct it.",
      {x:0.7,y:2.15,w:6.0,h:1.7,fontFace:BF,fontSize:14.5,color:INK2,lineSpacing:22,margin:0});
    s.addText("YOUR STACK TODAY",{x:0.7,y:3.95,w:5,h:0.3,fontFace:BF,fontSize:10.5,bold:true,color:TERRA,charSpacing:2,margin:0});
    const chips=["paper.pdf","plate_map.xlsx","notes","protocol.docx","ai-chat","slides.pptx","figure.png","analysis.py","email inbox","shared drive"];
    let cx=0.7,cy=4.35;
    chips.forEach(c=>{ const w=0.36+c.length*0.095;
      if(cx+w>6.7){cx=0.7;cy+=0.62;}
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:cx,y:cy,w,h:0.46,fill:{color:CARD},line:{color:LINE,width:1},rectRadius:0.07,shadow:softShadow()});
      s.addText(c,{x:cx,y:cy,w,h:0.46,fontFace:BF,fontSize:11,color:INK2,align:"center",valign:"middle",margin:0});
      cx+=w+0.18;
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:7.15,y:1.55,w:5.5,h:5.35,fill:{color:INK},rectRadius:0.12,shadow:mkShadow()});
    s.addShape(pres.shapes.RECTANGLE,{x:7.15,y:1.55,w:0.12,h:5.35,fill:{color:TERRA}});
    s.addText("The gap isn't whether researchers use AI.\nIt's that their AI is disconnected from the work.",
      {x:7.5,y:1.85,w:4.9,h:0.95,fontFace:BF,fontSize:13,italic:true,color:"D9D2C6",lineSpacing:18,margin:0});
    const stats=[["84%","of researchers now use AI in their work","Wiley ExplanAItions, 2025"],
      ["61%","use it to find & summarise the latest research","Elsevier global survey, 2025"],
      ["77%","of biologists have failed to reproduce another lab's experiment","Nature, 2016"],
      ["50%+","of scientists can't reproduce their own published results","Nature, 2016"]];
    let sy=2.95;
    stats.forEach(st=>{
      s.addText(st[0],{x:7.5,y:sy,w:1.6,h:0.7,fontFace:HF,fontSize:30,bold:true,color:TERRA,align:"left",valign:"middle",margin:0});
      s.addText([{text:st[1],options:{color:"FFFFFF",bold:true,breakLine:true}},{text:st[2],options:{color:"8E877B",fontSize:9}}],
        {x:9.15,y:sy,w:3.35,h:0.85,fontFace:BF,fontSize:11.5,lineSpacing:14,valign:"middle",margin:0});
      sy+=0.97;
    });
    footer(s,2);
  }

  // ---------- 3 WHY NOW ----------
  {
    const s=pres.addSlide(); bg(s);
    slideTitle(s,"Why now","AI adoption is mainstream.\nConnected context is the missing layer.");
    const cards=[
      [FA.FaBolt,"AI is already in the workflow","Adoption jumped from 37% (2024) to ~58–84% of researchers in a single year. The behaviour is set; the infrastructure isn't."],
      [FA.FaUnlink,"The tools stay disconnected","80% use ChatGPT-class tools, but only ~25% use a specialised research assistant. AI lives outside the notebook, experiment and report."],
      [FA.FaRedo,"Reproducibility is a crisis","Most scientists can't reproduce others' — or their own — results. The lost ingredient is the connected reasoning trail Notes9 preserves."],
      [FA.FaUserGraduate,"A new generation expects it","95% of UK undergraduates already use AI for coursework. They enter labs expecting AI-native research, not passive notebooks."]];
    const cw=5.9,ch=2.15;
    for(let i=0;i<cards.length;i++){
      const col=i%2,row=Math.floor(i/2);
      const x=0.7+col*(cw+0.33),y=2.25+row*(ch+0.3);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w:cw,h:ch,fill:{color:CARD},line:{color:LINE,width:1},rectRadius:0.1,shadow:softShadow()});
      s.addShape(pres.shapes.OVAL,{x:x+0.35,y:y+0.35,w:0.78,h:0.78,fill:{color:SAND}});
      s.addImage({data:await icon(cards[i][0],"#"+TERRA,256),x:x+0.54,y:y+0.54,w:0.4,h:0.4});
      s.addText(cards[i][1],{x:x+1.35,y:y+0.32,w:cw-1.6,h:0.55,fontFace:HF,fontSize:16.5,bold:true,color:INK,valign:"middle",margin:0});
      s.addText(cards[i][2],{x:x+1.35,y:y+0.92,w:cw-1.65,h:1.05,fontFace:BF,fontSize:12,color:INK2,lineSpacing:16.5,margin:0});
    }
    footer(s,3);
  }

  // ---------- 4 SOLUTION ----------
  {
    const s=pres.addSlide(); bg(s,INK);
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.28,h:H,fill:{color:TERRA}});
    kicker(s,0.7,0.55,"The solution");
    s.addText("One connected memory for\nyour whole research team.",{x:0.68,y:0.85,w:12,h:1.2,fontFace:HF,fontSize:30,bold:true,color:"FFFFFF",lineSpacing:33,margin:0});
    s.addText("Notes9 links every paper, protocol, experiment and result, so the reasoning is always one click away — and Catalyst, our biology-first AI, reasons over it and cites the source behind every answer.",
      {x:0.7,y:2.15,w:11.8,h:0.8,fontFace:BF,fontSize:14,color:"C9C2B6",lineSpacing:20,margin:0});
    const chain=["Literature","Hypothesis","Protocol","Experiment","Result","Report"];
    const n=chain.length,gap=0.45,totalW=12.0,bw=(totalW-gap*(n-1))/n;
    let bx=0.7,by=3.25;
    for(let i=0;i<n;i++){
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:bx,y:by,w:bw,h:0.85,fill:{color:"37322C"},line:{color:TERRA,width:1},rectRadius:0.08});
      s.addText(chain[i],{x:bx,y:by,w:bw,h:0.85,fontFace:BF,fontSize:12.5,bold:true,color:"FFFFFF",align:"center",valign:"middle",margin:0});
      if(i<n-1)s.addText("→",{x:bx+bw,y:by,w:gap,h:0.85,fontFace:BF,fontSize:18,bold:true,color:TERRA,align:"center",valign:"middle",margin:0});
      bx+=bw+gap;
    }
    s.addText("One traceable thread — from first paper to final report.",{x:0.7,y:4.2,w:12,h:0.3,fontFace:BF,fontSize:11,italic:true,color:"8E877B",align:"center",margin:0});
    const before=["Context scattered across five tools","The “why” lost between people","Weeks to reconstruct an old result","Re-pasting context into ChatGPT every time","Onboarding a new member takes weeks"];
    const after=["One traceable project memory","Every result linked to its rationale","Recall the full chain in seconds","AI that already sees your project & cites it","Onboard a new member in minutes"];
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:0.7,y:4.75,w:5.85,h:2.4,fill:{color:"322D28"},rectRadius:0.1});
    s.addText("WITHOUT NOTES9",{x:1.0,y:4.95,w:5,h:0.3,fontFace:BF,fontSize:11,bold:true,color:"9A9387",charSpacing:2,margin:0});
    s.addText(before.map(t=>({text:t,options:{bullet:{code:"2715"},color:"C9C2B6",breakLine:true,paraSpaceAfter:5}})),
      {x:1.0,y:5.35,w:5.4,h:1.7,fontFace:BF,fontSize:11.5,lineSpacing:14,margin:0});
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:6.8,y:4.75,w:5.85,h:2.4,fill:{color:TERRA},rectRadius:0.1,shadow:mkShadow()});
    s.addText("WITH NOTES9",{x:7.1,y:4.95,w:5,h:0.3,fontFace:BF,fontSize:11,bold:true,color:"FBE4DF",charSpacing:2,margin:0});
    s.addText(after.map(t=>({text:t,options:{bullet:{code:"2713"},color:"FFFFFF",breakLine:true,paraSpaceAfter:5}})),
      {x:7.1,y:5.35,w:5.4,h:1.7,fontFace:BF,fontSize:11.5,bold:true,lineSpacing:14,margin:0});
  }

  // ---------- 5 PRODUCT / CATALYST ----------
  {
    const s=pres.addSlide(); bg(s);
    slideTitle(s,"Product","Catalyst: biology-first AI that\nreasons over your real lab.");
    s.addText("Because your whole project lives in one connected memory, Catalyst receives complete, structured context automatically — no giant prompts, and every claim backed by a checkable source.",
      {x:0.7,y:2.1,w:6.0,h:1.3,fontFace:BF,fontSize:14,color:INK2,lineSpacing:21,margin:0});
    const feats=[
      [FA.FaDatabase,"One source of truth","Papers, protocols, experiments, notes & results live together — not across five apps."],
      [FA.FaProjectDiagram,"Structured & linked","Everything is connected, so Catalyst gets precise context instead of a pile of files."],
      [FA.FaQuoteRight,"Grounded, cited answers","It reasons over your real work and shows its sources — so you can trust and verify."],
      [FA.FaFileAlt,"Reports from memory","Turn the connected trail into cited drafts, updates and manuscript sections."]];
    let y=3.45;
    for(let i=0;i<feats.length;i++){
      s.addShape(pres.shapes.OVAL,{x:0.7,y,w:0.62,h:0.62,fill:{color:SAND}});
      s.addImage({data:await icon(feats[i][0],"#"+TERRA,256),x:0.85,y:y+0.15,w:0.32,h:0.32});
      s.addText([{text:feats[i][1]+"  ",options:{bold:true,color:INK}},{text:feats[i][2],options:{color:INK2}}],
        {x:1.5,y:y-0.02,w:5.3,h:0.75,fontFace:BF,fontSize:12,lineSpacing:15.5,valign:"middle",margin:0});
      y+=0.85;
    }
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:7.2,y:2.0,w:5.45,h:4.95,fill:{color:CARD},line:{color:LINE,width:1},rectRadius:0.12,shadow:mkShadow()});
    s.addShape(pres.shapes.RECTANGLE,{x:7.2,y:2.0,w:5.45,h:0.62,fill:{color:INK}});
    s.addShape(pres.shapes.OVAL,{x:7.4,y:2.13,w:0.36,h:0.36,fill:{color:TERRA}});
    s.addImage({data:await icon(FA.FaRobot,"#FFFFFF",128),x:7.475,y:2.205,w:0.21,h:0.21});
    s.addText([{text:"Catalyst",options:{bold:true,color:"FFFFFF"}},{text:"   Biology-first",options:{color:SAGE,fontSize:10}}],
      {x:7.85,y:2.0,w:4.6,h:0.62,fontFace:BF,fontSize:13,valign:"middle",margin:0});
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:9.0,y:2.85,w:3.4,h:0.55,fill:{color:SAND},rectRadius:0.1});
    s.addText("Why did condition B win?",{x:9.0,y:2.85,w:3.4,h:0.55,fontFace:BF,fontSize:11.5,color:INK,align:"center",valign:"middle",margin:0});
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:7.45,y:3.6,w:4.9,h:1.75,fill:{color:CREAM},line:{color:LINE,width:1},rectRadius:0.1});
    s.addText("Condition B used a 3:1 PEI:DNA ratio — it gave the highest transient yield in your earlier screen and matches the ratio in the two papers you saved.",
      {x:7.65,y:3.72,w:4.5,h:1.5,fontFace:BF,fontSize:11.5,color:INK,lineSpacing:16,valign:"top",margin:0});
    s.addText("SOURCES",{x:7.45,y:5.5,w:3,h:0.25,fontFace:BF,fontSize:9,bold:true,color:TERRA,charSpacing:2,margin:0});
    const src=["Expt #14 · PEI screen","Lab note · 12 Mar","Longo et al., 2023"];
    let sx2=7.45;
    src.forEach(t=>{ const w=0.3+t.length*0.072;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:sx2,y:5.78,w,h:0.4,fill:{color:CARD},line:{color:SAGE,width:1},rectRadius:0.06});
      s.addText(t,{x:sx2,y:5.78,w,h:0.4,fontFace:BF,fontSize:8.5,color:SAGE,bold:true,align:"center",valign:"middle",margin:0});
      sx2+=w+0.12;
    });
    s.addText("Biology-first · Genomics · Proteomics · Cell culture · Assays · Constructs",{x:7.45,y:6.42,w:5,h:0.3,fontFace:BF,fontSize:9.5,italic:true,color:INK2,margin:0});
    footer(s,5);
  }

  // ---------- 6 BUILT & LIVE ----------
  {
    const s=pres.addSlide(); bg(s,SAND);
    slideTitle(s,"Built & live","A real product, not a prototype.");
    s.addText("Notes9 is in early access today, free on a live workflow: projects, experiments, lab notes, protocols, samples, connected literature, a research map, and Catalyst with cited answers — built on Next.js + Supabase with a dedicated agent backend.",
      {x:0.7,y:1.9,w:11.9,h:0.8,fontFace:BF,fontSize:13.5,color:INK2,lineSpacing:20,margin:0});
    const mods=[
      [FA.FaFolderOpen,"Projects","The single root for all research context"],
      [FA.FaFlask,"Experiments","Setup, samples & results, linked"],
      [FA.FaBook,"Literature","Papers connected to the work they shape"],
      [FA.FaPenFancy,"Lab notes & protocols","Rich notes that stay part of the trail"],
      [FA.FaSitemap,"Research map","See how every object connects"],
      [FA.FaRobot,"Catalyst AI","Cited answers over your own project"]];
    const cw=3.78,ch=1.55;
    for(let i=0;i<mods.length;i++){
      const col=i%3,row=Math.floor(i/3);
      const x=0.7+col*(cw+0.28),y=2.95+row*(ch+0.28);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w:cw,h:ch,fill:{color:CARD},rectRadius:0.1,shadow:softShadow()});
      s.addShape(pres.shapes.RECTANGLE,{x,y,w:0.1,h:ch,fill:{color:TERRA}});
      s.addShape(pres.shapes.OVAL,{x:x+0.32,y:y+0.32,w:0.62,h:0.62,fill:{color:SAND}});
      s.addImage({data:await icon(mods[i][0],"#"+TERRA_D,256),x:x+0.47,y:y+0.47,w:0.32,h:0.32});
      s.addText(mods[i][1],{x:x+1.1,y:y+0.3,w:cw-1.25,h:0.5,fontFace:HF,fontSize:15,bold:true,color:INK,valign:"middle",margin:0});
      s.addText(mods[i][2],{x:x+1.1,y:y+0.78,w:cw-1.3,h:0.6,fontFace:BF,fontSize:10.5,color:INK2,lineSpacing:14,margin:0});
    }
    footer(s,6);
  }

  // ---------- 7 MARKET ----------
  {
    const s=pres.addSlide(); bg(s);
    slideTitle(s,"Market","A large, digitising market —\nentered through an underserved wedge.");
    const rings=[
      ["TAM","$4.0B","Laboratory informatics (LIMS + ELN + AI), growing to ~$5.2B by 2030",TERRA,5.5],
      ["SAM","$1.0B","Electronic lab notebook software — 7.3% CAGR to ~$1.03B by 2030",GOLD,4.0],
      ["SOM","$60–120M","Lean, literature-heavy R&D teams: academic labs, PhD programmes & seed–Series A biotech",SAGE,2.6]];
    let ry=2.35;
    rings.forEach(r=>{
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:0.7,y:ry,w:r[4],h:1.2,fill:{color:r[3]},rectRadius:0.1,shadow:softShadow()});
      s.addText(r[0],{x:0.9,y:ry+0.13,w:r[4]-0.4,h:0.3,fontFace:BF,fontSize:11,bold:true,color:"FFFFFF",charSpacing:2,margin:0});
      s.addText(r[1],{x:0.9,y:ry+0.4,w:r[4]-0.4,h:0.65,fontFace:HF,fontSize:28,bold:true,color:"FFFFFF",valign:"middle",margin:0});
      s.addText(r[2],{x:r[4]+0.95,y:ry+0.02,w:12.4-(r[4]+0.95)-0.3,h:1.15,fontFace:BF,fontSize:12.5,color:INK2,valign:"middle",lineSpacing:17,margin:0});
      ry+=1.4;
    });
    s.addText("Sources: MarketsandMarkets (ELN, 2025); Grand View Research (lab informatics, 2024). SOM is a Notes9 estimate of the early-adopter segment.",
      {x:0.7,y:6.62,w:11.9,h:0.3,fontFace:BF,fontSize:8.5,italic:true,color:"9A9387",margin:0});
    footer(s,7);
  }

  // ---------- 8 COMPETITION ----------
  {
    const s=pres.addSlide(); bg(s);
    slideTitle(s,"Competition","The vision is no longer unclaimed.\nThe segment is.");
    const mx=0.95,my=2.35,mw=6.1,mh=4.4;
    s.addShape(pres.shapes.RECTANGLE,{x:mx,y:my,w:mw,h:mh,fill:{color:CARD},line:{color:LINE,width:1},shadow:softShadow()});
    s.addShape(pres.shapes.RECTANGLE,{x:mx+mw/2,y:my,w:mw/2,h:mh/2,fill:{color:"F3E7E4"}});
    s.addShape(pres.shapes.LINE,{x:mx,y:my+mh/2,w:mw,h:0,line:{color:"C8BCA6",width:1}});
    s.addShape(pres.shapes.LINE,{x:mx+mw/2,y:my,w:0,h:mh,line:{color:"C8BCA6",width:1}});
    s.addText("AI reasons over YOUR lab →",{x:mx,y:my+mh+0.05,w:mw,h:0.3,fontFace:BF,fontSize:9.5,bold:true,color:INK2,align:"center",margin:0});
    s.addText("Connected research memory ↑",{x:mx-2.5,y:my+mh/2-0.15,w:4.4,h:0.3,fontFace:BF,fontSize:9.5,bold:true,color:INK2,align:"center",valign:"middle",rotate:270,margin:0});
    const pts=[["Benchling / LIMS",0.30,0.72,INK2],["LabArchives · SciNote",0.22,0.55,INK2],
      ["ChatGPT · Claude",0.70,0.20,INK2],["Elicit · SciSpace",0.55,0.30,INK2],
      ["Sapio · Scispot",0.62,0.66,GOLD],["Notes9",0.81,0.85,TERRA]];
    pts.forEach(p=>{
      const px=mx+p[1]*mw,py=my+(1-p[2])*mh,big=p[0]==="Notes9";
      s.addShape(pres.shapes.OVAL,{x:px-(big?0.14:0.08),y:py-(big?0.14:0.08),w:big?0.28:0.16,h:big?0.28:0.16,fill:{color:p[3]},line:big?{color:"FFFFFF",width:1.5}:undefined});
      s.addText(p[0],{x:px+0.16,y:py-0.16,w:2.4,h:0.32,fontFace:BF,fontSize:big?11:9.5,bold:big,color:big?TERRA:INK2,valign:"middle",margin:0});
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:7.45,y:2.35,w:5.2,h:4.4,fill:{color:INK},rectRadius:0.12,shadow:mkShadow()});
    s.addShape(pres.shapes.RECTANGLE,{x:7.45,y:2.35,w:0.12,h:4.4,fill:{color:TERRA}});
    s.addText("The missing middle",{x:7.8,y:2.6,w:4.6,h:0.5,fontFace:HF,fontSize:19,bold:true,color:"FFFFFF",margin:0});
    s.addText("Incumbent ELNs and LIMS record what happened but barely reason. Literature AIs are grounded but stop at the paper. Enterprise AI-native labs (Sapio, Scispot) target heavy biopharma with long implementations.",
      {x:7.8,y:3.2,w:4.65,h:1.6,fontFace:BF,fontSize:12,color:"C9C2B6",lineSpacing:17,margin:0});
    s.addText("Notes9 wins the segment they ignore:",{x:7.8,y:4.75,w:4.6,h:0.35,fontFace:BF,fontSize:12,bold:true,color:"FFFFFF",margin:0});
    s.addText(["Academic & PhD-led labs","Postdoc programmes","Seed–Series A biotech R&D","Lean teams that want AI over their own work — without enterprise weight, price or rollout"].map(t=>({text:t,options:{bullet:{code:"2713"},color:"FFFFFF",breakLine:true,paraSpaceAfter:4}})),
      {x:7.95,y:5.15,w:4.5,h:1.5,fontFace:BF,fontSize:11.5,lineSpacing:14,margin:0});
    footer(s,8);
  }

  // ---------- 9 WHY WE WIN ----------
  {
    const s=pres.addSlide(); bg(s,SAND);
    slideTitle(s,"Why we win","ELNs record what happened.\nNotes9 remembers why.");
    const rows=[["Records what happened",true,false,true],["Remembers why it happened",false,false,true],
      ["Answers from your lab's context",false,true,true],["Traces every output to its sources",false,false,true],
      ["Links papers → protocols → results",false,false,true]];
    const tx=0.7,tyTop=2.35,rh=0.66,c0=5.6,cW=2.05;
    const heads=["ELN","AI chat","Notes9"];
    s.addShape(pres.shapes.RECTANGLE,{x:tx+c0+2*cW,y:tyTop,w:cW,h:rh*rows.length+0.55,fill:{color:"FBEDE9"}});
    [c0,c0+cW,c0+2*cW].forEach((cx,idx)=>{
      const col=idx===2?TERRA:INK;
      s.addText(heads[idx],{x:tx+cx,y:tyTop,w:cW,h:0.55,fontFace:BF,fontSize:idx===2?15:13,bold:true,color:col,align:"center",valign:"middle",margin:0});
    });
    let yy=tyTop+0.6;
    for(let i=0;i<rows.length;i++){
      if(i%2===0)s.addShape(pres.shapes.RECTANGLE,{x:tx,y:yy,w:c0+3*cW,h:rh,fill:{color:CARD}});
      s.addText(rows[i][0],{x:tx+0.25,y:yy,w:c0-0.3,h:rh,fontFace:BF,fontSize:13,bold:true,color:INK,valign:"middle",margin:0});
      for(let c=0;c<3;c++){
        const on=rows[i][c+1],cx=tx+c0+c*cW;
        const mark=on?FA.FaCheckCircle:FA.FaTimes;
        const col=on?(c===2?TERRA:SAGE):"C9BFAE";
        s.addImage({data:await icon(mark,"#"+col,256),x:cx+cW/2-0.16,y:yy+rh/2-0.16,w:0.32,h:0.32});
      }
      yy+=rh;
    }
    s.addText("Not another static ELN. Not another empty AI chat. Notes9 is connected research memory your AI can actually read — and cite.",
      {x:0.7,y:yy+0.2,w:11.9,h:0.5,fontFace:BF,fontSize:13,italic:true,color:INK2,align:"center",margin:0});
    footer(s,9);
  }

  // ---------- 10 TRACTION ----------
  {
    const s=pres.addSlide(); bg(s,INK);
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.28,h:H,fill:{color:TERRA}});
    kicker(s,0.7,0.55,"Traction");
    s.addText("Early, but the signal is real.",{x:0.68,y:0.85,w:12,h:0.8,fontFace:HF,fontSize:30,bold:true,color:"FFFFFF",margin:0});
    const kpis=[["40","researchers signed up","in early access, no paid marketing yet"],
      ["5","ready to sign LOIs","a 12.5% signup → design-partner intent rate"],
      ["Live","free product","full workflow + Catalyst, running today"],
      ["3","geographies","India · United States · United Kingdom"]];
    const cw=2.95,gap=0.22;
    for(let i=0;i<kpis.length;i++){
      const x=0.7+i*(cw+gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:1.95,w:cw,h:2.3,fill:{color:"34302B"},line:{color:"4A443D",width:1},rectRadius:0.1});
      s.addShape(pres.shapes.RECTANGLE,{x,y:1.95,w:cw,h:0.1,fill:{color:TERRA}});
      s.addText(kpis[i][0],{x,y:2.2,w:cw,h:0.95,fontFace:HF,fontSize:46,bold:true,color:TERRA,align:"center",valign:"middle",margin:0});
      s.addText(kpis[i][1],{x:x+0.2,y:3.15,w:cw-0.4,h:0.45,fontFace:BF,fontSize:13,bold:true,color:"FFFFFF",align:"center",margin:0});
      s.addText(kpis[i][2],{x:x+0.2,y:3.55,w:cw-0.4,h:0.6,fontFace:BF,fontSize:10,color:"9A9387",align:"center",lineSpacing:13,margin:0});
    }
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:0.7,y:4.55,w:5.85,h:2.35,fill:{color:"34302B"},rectRadius:0.1});
    s.addText("What it proves",{x:1.0,y:4.75,w:5,h:0.4,fontFace:HF,fontSize:16,bold:true,color:"FFFFFF",margin:0});
    s.addText(["Researchers will adopt an AI-native notebook unprompted","Strong pull to commit: 1 in 8 signups wants a pilot","Product is real and usable today, not vaporware","Distribution already spans three research markets"].map(t=>({text:t,options:{bullet:{code:"2713"},color:"C9C2B6",breakLine:true,paraSpaceAfter:6}})),
      {x:1.0,y:5.2,w:5.4,h:1.6,fontFace:BF,fontSize:12,lineSpacing:15,margin:0});
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:6.8,y:4.55,w:5.85,h:2.35,fill:{color:TERRA},rectRadius:0.1,shadow:mkShadow()});
    s.addText("Channels already live",{x:7.1,y:4.75,w:5,h:0.4,fontFace:HF,fontSize:16,bold:true,color:"FFFFFF",margin:0});
    s.addText(["Website & free sign-up (notes9.com)","LinkedIn company + founder-led posting","Instagram (@notes9_ai) · X (@CatalystAI_N9)","YouTube demos (@Notes9-catalyst)","Reddit & research-community listening"].map(t=>({text:t,options:{bullet:{code:"2022"},color:"FFFFFF",breakLine:true,paraSpaceAfter:5}})),
      {x:7.1,y:5.2,w:5.4,h:1.6,fontFace:BF,fontSize:12,bold:true,lineSpacing:15,margin:0});
  }

  // ---------- 11 BUSINESS MODEL ----------
  {
    const s=pres.addSlide(); bg(s);
    slideTitle(s,"Business model","Free to land. Enterprise to expand.");
    s.addText("A bottom-up motion: researchers adopt Notes9 free on a live workflow, then teams and institutions convert to paid Enterprise for shared workspaces, security review and onboarding.",
      {x:0.7,y:2.05,w:11.9,h:0.7,fontFace:BF,fontSize:13.5,color:INK2,lineSpacing:19,margin:0});
    const cardY=2.95,cardH=3.5;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:0.7,y:cardY,w:5.85,h:cardH,fill:{color:CARD},line:{color:LINE,width:1},rectRadius:0.12,shadow:softShadow()});
    s.addText("FREE",{x:1.05,y:cardY+0.3,w:5,h:0.35,fontFace:BF,fontSize:13,bold:true,color:SAGE,charSpacing:2,margin:0});
    s.addText("Researcher",{x:1.05,y:cardY+0.62,w:5,h:0.6,fontFace:HF,fontSize:24,bold:true,color:INK,margin:0});
    s.addText("Individual researchers & small teams building their first connected project memory.",{x:1.05,y:cardY+1.25,w:5.2,h:0.7,fontFace:BF,fontSize:11.5,color:INK2,lineSpacing:15,margin:0});
    s.addText(["Full product on a live workflow","Projects, experiments, notes, protocols, samples","Catalyst AI with cited answers","No credit card"].map(t=>({text:t,options:{bullet:{code:"2713"},color:INK,breakLine:true,paraSpaceAfter:5}})),
      {x:1.05,y:cardY+2.0,w:5.2,h:1.4,fontFace:BF,fontSize:11.5,lineSpacing:14,margin:0});
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:6.8,y:cardY,w:5.85,h:cardH,fill:{color:INK},rectRadius:0.12,shadow:mkShadow()});
    s.addShape(pres.shapes.RECTANGLE,{x:6.8,y:cardY,w:5.85,h:0.1,fill:{color:TERRA}});
    s.addText("ENTERPRISE",{x:7.15,y:cardY+0.3,w:5,h:0.35,fontFace:BF,fontSize:13,bold:true,color:TERRA,charSpacing:2,margin:0});
    s.addText("Teams & institutions",{x:7.15,y:cardY+0.62,w:5,h:0.6,fontFace:HF,fontSize:24,bold:true,color:"FFFFFF",margin:0});
    s.addText("Labs, biotech & universities needing shared workspaces, onboarding and security review. Priced per-seat, annual.",{x:7.15,y:cardY+1.25,w:5.2,h:0.7,fontFace:BF,fontSize:11.5,color:"C9C2B6",lineSpacing:15,margin:0});
    s.addText(["Shared projects across the whole team","Onboarding & workflow mapping","Data controls, security review, SSO","Priority support & design-partner pilots"].map(t=>({text:t,options:{bullet:{code:"2713"},color:"FFFFFF",breakLine:true,paraSpaceAfter:5}})),
      {x:7.15,y:cardY+2.0,w:5.2,h:1.4,fontFace:BF,fontSize:11.5,bold:true,lineSpacing:14,margin:0});
    s.addText("Land free with individuals → expand to paid teams. Free while in early access; LOIs convert to the first Enterprise pilots.",
      {x:0.7,y:cardY+cardH+0.18,w:11.9,h:0.4,fontFace:BF,fontSize:11.5,italic:true,color:INK2,align:"center",margin:0});
    footer(s,11);
  }

  // ---------- 12 GTM ----------
  {
    const s=pres.addSlide(); bg(s);
    slideTitle(s,"Go-to-market","A founder-led, researcher-first\ngrowth engine.");
    s.addText("Turn workflow pain into community trust, trust into trials, and trials into design-partner pilots — the motion the pre-seed round is built to fund.",
      {x:0.7,y:2.1,w:11.9,h:0.6,fontFace:BF,fontSize:13.5,color:INK2,lineSpacing:19,margin:0});
    const phases=[
      [FA.FaBullhorn,"Visibility","Founder-led LinkedIn, workflow teardowns, Reddit & community listening, SEO on “research memory.”"],
      [FA.FaHandshake,"Design partners","Recruit 5 partner labs around literature-linked experiment design & experiment-to-report. (5 LOIs already lined up.)"],
      [FA.FaChartLine,"Proof","Convert pilots into anonymised case studies, before/after demos, and a “Notes9 vs ELN + ref manager + ChatGPT” page."],
      [FA.FaRocket,"Scale","Repeatable inbound + outbound to PIs and founder-scientists; sales-assist where domains show repeat signups."]];
    const cw=2.92,gap=0.18,cardH=3.0;
    for(let i=0;i<phases.length;i++){
      const x=0.7+i*(cw+gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:2.95,w:cw,h:cardH,fill:{color:CARD},line:{color:LINE,width:1},rectRadius:0.1,shadow:softShadow()});
      s.addShape(pres.shapes.OVAL,{x:x+cw/2-0.42,y:3.2,w:0.84,h:0.84,fill:{color:SAND}});
      s.addImage({data:await icon(phases[i][0],"#"+TERRA,256),x:x+cw/2-0.23,y:3.41,w:0.46,h:0.46});
      s.addText("0"+(i+1),{x:x+0.2,y:3.2,w:0.5,h:0.3,fontFace:HF,fontSize:13,bold:true,color:TERRA,margin:0});
      s.addText(phases[i][1],{x:x+0.15,y:4.2,w:cw-0.3,h:0.45,fontFace:HF,fontSize:16,bold:true,color:INK,align:"center",margin:0});
      s.addText(phases[i][2],{x:x+0.22,y:4.7,w:cw-0.44,h:1.15,fontFace:BF,fontSize:10.5,color:INK2,align:"center",lineSpacing:14,margin:0});
    }
    s.addText("Priority ICP:  newly established academic labs  ·  pre-seed–Series A biotech  ·  small CRO / service labs with flexible documentation.",
      {x:0.7,y:6.25,w:11.9,h:0.4,fontFace:BF,fontSize:11.5,bold:true,color:TERRA,align:"center",margin:0});
    footer(s,12);
  }

  // ---------- 13 TEAM ----------
  {
    const s=pres.addSlide(); bg(s,SAND);
    slideTitle(s,"Team","A multidisciplinary team across\nscience, AI and product.");
    s.addText("Notes9 is built by a distributed team spanning scientific research, AI systems and product engineering — across India, the United States and the United Kingdom.",
      {x:0.7,y:2.1,w:11.9,h:0.6,fontFace:BF,fontSize:13.5,color:INK2,lineSpacing:19,margin:0});
    const roles=[
      [FA.FaDna,"Scientific research","Life-science domain depth — the bench reality Catalyst is tuned for."],
      [FA.FaBrain,"AI systems","The agent backend, retrieval and citation engine behind Catalyst."],
      [FA.FaLaptopCode,"Product engineering","The connected workspace: Next.js + Supabase, shipped and live."]];
    const cw=3.85,gap=0.27,cy=2.95,ch=2.5;
    for(let i=0;i<roles.length;i++){
      const x=0.7+i*(cw+gap);
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:cy,w:cw,h:ch,fill:{color:CARD},rectRadius:0.12,shadow:softShadow()});
      s.addShape(pres.shapes.OVAL,{x:x+cw/2-0.5,y:cy+0.35,w:1.0,h:1.0,fill:{color:INK}});
      s.addImage({data:await icon(roles[i][0],"#"+TERRA,256),x:x+cw/2-0.27,y:cy+0.58,w:0.54,h:0.54});
      s.addText(roles[i][1],{x:x+0.2,y:cy+1.5,w:cw-0.4,h:0.4,fontFace:HF,fontSize:16,bold:true,color:INK,align:"center",margin:0});
      s.addText(roles[i][2],{x:x+0.3,y:cy+1.95,w:cw-0.6,h:0.5,fontFace:BF,fontSize:11,color:INK2,align:"center",lineSpacing:14,margin:0});
    }
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:0.7,y:5.75,w:11.95,h:1.05,fill:{color:"FBEDE9"},line:{color:TERRA,width:1},rectRadius:0.1});
    s.addText([{text:"Add named founder bios here.  ",options:{bold:true,color:TERRA_D}},{text:"Replace this band with founders' names, photos, prior labs/companies and the specific reason this team wins — investors back people first at pre-seed.",options:{color:INK2}}],
      {x:1.0,y:5.85,w:11.3,h:0.85,fontFace:BF,fontSize:12,valign:"middle",lineSpacing:16,margin:0});
    footer(s,13);
  }

  // ---------- 14 THE ASK ----------
  {
    const s=pres.addSlide(); bg(s,INK);
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:0.28,h:H,fill:{color:TERRA}});
    s.addText("9",{x:9.0,y:-1.1,w:5,h:9,fontFace:HF,fontSize:520,bold:true,color:"322D28",align:"center",valign:"middle",margin:0});
    kicker(s,0.7,0.55,"The ask");
    s.addText("Raising a $750K pre-seed",{x:0.68,y:0.85,w:12,h:0.85,fontFace:HF,fontSize:34,bold:true,color:"FFFFFF",margin:0});
    s.addText("On a SAFE, to fund ~18 months: convert the 5 LOIs into paying design-partner pilots, build the founder-led growth engine, and reach a repeatable land-and-expand motion.",
      {x:0.7,y:1.75,w:7.3,h:1.1,fontFace:BF,fontSize:14,color:"C9C2B6",lineSpacing:21,margin:0});
    const funds=[
      ["Marketing & growth","45%","Founder-led content, design-partner recruitment, SEO, demand gen — the round's primary focus",TERRA],
      ["Product & engineering","35%","Deepen Catalyst, team workspaces, security review & SSO for Enterprise",GOLD],
      ["Pilots & customer success","12%","Onboarding and workflow mapping to convert LOIs into reference pilots",SAGE],
      ["Operations & runway","8%","Distributed-team infrastructure and reserve","8E877B"]];
    let fy=3.0;
    funds.forEach(f=>{
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:0.7,y:fy,w:7.3,h:0.86,fill:{color:"34302B"},rectRadius:0.08});
      s.addText(f[1],{x:0.85,y:fy,w:1.1,h:0.86,fontFace:HF,fontSize:24,bold:true,color:f[3],valign:"middle",margin:0});
      s.addText([{text:f[0]+"   ",options:{bold:true,color:"FFFFFF"}},{text:f[2],options:{color:"9A9387",fontSize:10}}],
        {x:2.0,y:fy,w:5.85,h:0.86,fontFace:BF,fontSize:12,valign:"middle",lineSpacing:14,margin:0});
      fy+=0.96;
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:8.35,y:1.75,w:4.3,h:5.15,fill:{color:TERRA},rectRadius:0.12,shadow:mkShadow()});
    s.addText("What this unlocks",{x:8.65,y:2.0,w:3.8,h:0.5,fontFace:HF,fontSize:18,bold:true,color:"FFFFFF",margin:0});
    s.addText(["5 → 15 paying design-partner labs","First Enterprise contracts signed","Repeatable inbound + outbound engine","Published proof: case studies & demos","Metrics & references for a strong seed round"].map(t=>({text:t,options:{bullet:{code:"2713"},color:"FFFFFF",breakLine:true,paraSpaceAfter:11}})),
      {x:8.65,y:2.65,w:3.75,h:3.9,fontFace:BF,fontSize:13,bold:true,lineSpacing:17,margin:0});
    s.addText("$750K is a planning figure — final size to be set with the lead investor.",{x:0.7,y:6.95,w:7.3,h:0.3,fontFace:BF,fontSize:9,italic:true,color:"9A9387",margin:0});
  }

  // ---------- 15 CLOSING ----------
  {
    const s=pres.addSlide(); bg(s,CREAM);
    s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:W,h:0.28,fill:{color:TERRA}});
    s.addImage({path:LOGO_DARK,x:W/2-0.55,y:1.3,w:1.1,h:1.1});
    s.addText([{text:"Notes",options:{color:INK,bold:true}},{text:"9",options:{color:TERRA,bold:true}}],
      {x:0,y:2.5,w:W,h:0.9,fontFace:HF,fontSize:44,align:"center",margin:0});
    s.addText("Turn scattered research work into\nreusable scientific memory.",
      {x:0,y:3.5,w:W,h:1.2,fontFace:HF,fontSize:26,bold:true,color:INK,align:"center",lineSpacing:30,margin:0});
    s.addText("Preserve not just what happened, but why — from literature review to experiment to final report.",
      {x:0,y:4.65,w:W,h:0.5,fontFace:BF,fontSize:14,italic:true,color:INK2,align:"center",margin:0});
    const cs=["notes9.com","admin@notes9.com","linkedin.com/company/notes9","@notes9_ai"];
    const total=cs.reduce((a,c)=>a+(0.5+c.length*0.09)+0.2,-0.2);
    let cx=(W-total)/2;
    cs.forEach(c=>{ const w=0.5+c.length*0.09;
      s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:cx,y:5.45,w,h:0.55,fill:{color:CARD},line:{color:LINE,width:1},rectRadius:0.1,shadow:softShadow()});
      s.addText(c,{x:cx,y:5.45,w,h:0.55,fontFace:BF,fontSize:12.5,bold:true,color:INK,align:"center",valign:"middle",margin:0});
      cx+=w+0.2;
    });
    s.addText("Let's talk.  Start free or book a 15-minute workflow demo.",{x:0,y:6.35,w:W,h:0.4,fontFace:BF,fontSize:13,bold:true,color:TERRA,align:"center",margin:0});
    s.addText("Distributed team · India · United States · United Kingdom",{x:0,y:6.85,w:W,h:0.3,fontFace:BF,fontSize:10,color:"9A9387",align:"center",margin:0});
  }

  await pres.writeFile({fileName:ROOT+"/Notes9_PreSeed_Deck.pptx"});
  console.log("written");
}
build().catch(e=>{console.error(e);process.exit(1);});
