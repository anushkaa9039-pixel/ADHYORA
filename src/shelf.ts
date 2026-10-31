// @ts-nocheck
// Imperative 3D bookshelf from the approved interface, wrapped so React can mount and unmount it.
const TABS=['diagnostic','graph','model','model','practice','roadmap','revision','pyq','teacher'];
const STAT=[
 'Live: profile and a diagnostic test for any subject (AI-written, or built-in for Class 10 Physics and Maths). Paste or load your own syllabus as text. Not built: PDF and photo upload.',
 'Live: a concept graph for your syllabus, with prerequisite tracing. Built-in for Class 10 Physics (17 concepts) and Maths; AI-written for every other subject.',
 'Live: mastery is updated after every answer, with history and a progress report. No scores are pre-filled.',
 'Live: weakness map and misconception detection. Reading your written reasoning needs an AI key on the server.',
 'Live: adaptive questions and the Study Buddy chat. Fresh AI-written questions and chat need an AI key. Diagrams appear in chat only.',
 'Live: roadmap, unavailable days and in-app alerts. Not built: mobile push or SMS.',
 'Live: spaced repetition and the revision planner.',
 'Live: your own previous-year questions with frequency analysis. Not built: mock exams, formula tracker, Exam Rescue Mode, bundled papers.',
 'Live: class-wide mastery, gaps and misconceptions. Chats and written reasoning are never shown.'];
export function initShelf(){
const offs=[];let raf=0,dead=false;
const L=(t,f,o)=>{addEventListener(t,f,o);offs.push(()=>removeEventListener(t,f,o))};

const K="#1B3A2C",Y="#E8B04A",W="#fff";
const ART=[
c=>`<circle cx="100" cy="75" r="58" fill="${W}"/><circle cx="100" cy="75" r="38" fill="${Y}"/><circle cx="100" cy="75" r="16" fill="${K}"/><path d="M150 25l-45 45" stroke="${K}" stroke-width="6" stroke-linecap="round"/><path d="M28 118l10 10 20-24" stroke="${K}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
c=>`<g stroke="${K}" stroke-width="4"><path d="M100 30L45 85M100 30L155 85M45 85L80 125M155 85L120 125M80 125h40M100 30V75"/></g><g fill="${W}" stroke="${K}" stroke-width="4"><circle cx="100" cy="30" r="14"/><circle cx="45" cy="85" r="14"/><circle cx="155" cy="85" r="14"/></g><g fill="${Y}" stroke="${K}" stroke-width="4"><circle cx="80" cy="125" r="12"/><circle cx="120" cy="125" r="12"/><circle cx="100" cy="75" r="12"/></g>`,
c=>`<g fill="${W}"><rect x="28" y="95" width="22" height="35"/><rect x="62" y="75" width="22" height="55"/><rect x="96" y="55" width="22" height="75"/></g><rect x="130" y="30" width="22" height="100" fill="${Y}"/><path d="M20 105L62 82L100 62L142 32L168 22" stroke="${K}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
c=>`<g fill="${W}"><rect x="25" y="85" width="24" height="45"/><rect x="60" y="50" width="24" height="80"/><rect x="95" y="100" width="24" height="30"/></g><circle cx="140" cy="62" r="32" fill="${Y}" stroke="${K}" stroke-width="6"/><path d="M163 85l22 28" stroke="${K}" stroke-width="9" stroke-linecap="round"/><path d="M128 62h24M140 50v24" stroke="${K}" stroke-width="5"/>`,
c=>`<rect x="20" y="22" width="100" height="44" rx="10" fill="${W}"/><path d="M40 66v16l18-16" fill="${W}"/><rect x="82" y="78" width="100" height="40" rx="10" fill="${Y}"/><path d="M162 118v14l-16-14" fill="${Y}"/><g stroke="${K}" stroke-width="5" stroke-linecap="round"><path d="M36 40h60M36 52h38M98 92h66M98 104h40"/></g>`,
c=>`<rect x="24" y="24" width="152" height="108" rx="8" fill="${W}"/><rect x="24" y="24" width="152" height="26" rx="8" fill="${K}"/><g fill="${c}" stroke="${K}" stroke-width="2"><rect x="38" y="62" width="24" height="20"/><rect x="72" y="62" width="24" height="20"/><rect x="106" y="62" width="24" height="20" fill="${Y}"/><rect x="140" y="62" width="24" height="20"/><rect x="38" y="94" width="24" height="20" fill="${Y}"/><rect x="72" y="94" width="24" height="20"/><rect x="106" y="94" width="24" height="20"/></g>`,
c=>`<g fill="none" stroke-width="6" stroke-linecap="round"><path d="M100 75m-18 0a18 18 0 1 0 36 0a18 18 0 1 0 -36 0" stroke="${K}"/><path d="M100 75m-38 0a38 38 0 1 0 76 0a38 38 0 1 0 -76 0" stroke="${W}"/><path d="M100 75m-58 0a58 58 0 1 0 116 0a58 58 0 1 0 -116 0" stroke="${Y}"/></g><circle cx="100" cy="75" r="7" fill="${K}"/><circle cx="100" cy="17" r="8" fill="${Y}"/><circle cx="62" cy="75" r="7" fill="${W}"/>`,
c=>`<rect x="48" y="14" width="104" height="124" rx="6" fill="${W}"/><g stroke="${K}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M64 40l7 7 12-13M64 70l7 7 12-13M96 42h40M96 72h40M64 100h72"/></g><circle cx="150" cy="112" r="30" fill="${Y}" stroke="${K}" stroke-width="5"/><path d="M150 94v18l12 8" stroke="${K}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
c=>{let s="";const col=[W,Y,c,W,Y,W,c,Y,W,W,Y,W,W,Y,Y,W,c,W,Y,W];for(let r=0;r<4;r++)for(let q=0;q<5;q++){const f=col[r*5+q];s+=`<rect x="${26+q*30}" y="${22+r*28}" width="26" height="24" rx="3" fill="${f===c?K:f}"/>`}return s}
];
const B=[
{n:"Diagnose",t:"Start with a diagnostic",d:"A first test finds what you already know, where the gaps are and which earlier ideas hold you back.",c:"#A9C3A3",f:[["Academic profile","School or college details, goal and exam date. No account or sign-up: start straight away."],["Your syllabus","Any class, any subject. The AI writes the syllabus, or you paste yours and untick topics your board removed. Not built: PDF and photo reading."],["Diagnostic test","Checks each topic and its prerequisites before any plan is made."]]},
{n:"Map",t:"See how topics connect",d:"A concept graph for your syllabus, in any subject, shows what depends on what.",c:"#9CBFB0",f:[["Concept graph","Topics, links, dependencies and prerequisites in one interconnected map."],["Prerequisite tracing","If you struggle with lenses, the graph checks the ideas underneath first."]]},
{n:"Model",t:"Your learner model",d:"One mastery score per concept, updated after every answer from correctness, difficulty, attempts and your reasoning.",c:"#B5C99A",f:[["Dynamic mastery","Each answer moves the score for that concept, with history kept."],["Progress reports","Measured growth over time, per subject and per concept."]]},
{n:"Detect",t:"Find weak spots and misconceptions",d:"Wrong answers are read for the idea behind them, not only marked wrong.",c:"#8C2F45",tc:"#fff",f:[["Weakness map","Shows the weakest concepts that block the most other topics."],["Misconception detection","Reads your reasoning, spots recurring misunderstandings and asks a targeted follow-up."],["Mistake notebook","Every mistake saved with its corrected explanation."]]},
{n:"Practise",t:"Questions built for you",d:"Ask doubts, get step-by-step help, then practise questions that target weak concepts and get harder as you improve.",c:"#8FB59E",f:[["AI Study Buddy","Conversation, worked examples, quizzes and tests. Try it below."],["Adaptive questions","Difficulty is calibrated to your performance and rises with mastery."],["Visual learning","Labelled diagrams, block diagrams, flowcharts and mind maps next to explanations."]]},
{n:"Plan",t:"A roadmap that bends",d:"Long-term, monthly, weekly and daily plans from your goals, syllabus, free hours and exam dates.",c:"#E4D5AE",f:[["Study roadmap","Plans at every scale, based on your level and dates."],["Smart notifications","Mobile reminders and missed-session alerts. Reply, reschedule or say you are unavailable."],["Backlog recovery","If you miss sessions, a gentle recovery plan is proposed without overloading you."]]},
{n:"Revise",t:"Remember it for the exam",d:"Revision returns just before you are likely to forget, using mastery, mistakes and past reviews.",c:"#9DBB8E",f:[["Spaced repetition","Review dates set by forgetting risk for each concept."],["Revision planner","One calendar for what to revisit and when."]]},
{n:"Exam",t:"Get exam-ready",d:"Practise on real previous-year papers, take mock exams and know where marks are slipping.",c:"#C9D4A8",f:[["PYQ intelligence","Upload and analyse past papers. Real PYQs are always labelled apart from AI-made practice."],["Mock exams","Timed tests with answer evaluation and performance analysis."],["Formula tracker and Exam Rescue Mode","Keep key formulas close, and get a focused plan when time is short."]]},
{n:"Teach",t:"Insight for teachers",d:"Teachers see where the whole class struggles. Private student conversations stay private.",c:"#A34A5E",tc:"#fff",f:[["Class mastery","Concept-level mastery across the class."],["Common misconceptions","The mistakes many students share, so lessons can fix them."],["Privacy by design","Teachers see patterns, never individual chats."]]}
];
const svgOf=(i,c)=>`<svg viewBox="0 0 200 150" aria-hidden="true">${ART[i](c)}</svg>`;
const N=B.length,RM=matchMedia('(prefers-reduced-motion:reduce)').matches;
const $=id=>document.getElementById(id),st=$('stage'),sh=$('shelf'),cur=$('cur'),dt=$('dt');
let H,ws,d,gap,T=4,active=-1,mx=innerWidth/2,my=innerHeight/2,cx=mx,cy=my,tilt=[0,0],tg=[0,0],drag=null,moved=false,wt,isOpen=false;
B.forEach((x,i)=>{const e=document.createElement('div');e.className='tape';
e.innerHTML=`<div class="f sp" style="--c:${x.c};--tc:${x.tc||'#1B2B22'}">${svgOf(i,x.c).replace('<svg','<svg width="24" height="18"')}<span>${x.n}</span><i>ADH</i></div><div class="f cv" style="--c:${x.c}"><div class="ar">${svgOf(i,x.c)}</div><div class="tx"><small>Book ${i+1} of ${N}</small><h3>${x.t}</h3><p>${x.d}</p></div></div>`;
e.addEventListener('click',()=>{if(moved)return;const r=i-T;if(Math.abs(r)<.5){launch();return}T=i;go()});
e.addEventListener('pointerenter',()=>{e.dataset.h='1'});e.addEventListener('pointerleave',()=>{e.dataset.h='0'});
st.appendChild(e)});
const tapes=[...st.children];
function measure(){const p=document.createElement('div');p.style.cssText='position:absolute;visibility:hidden;height:var(--H)';document.body.appendChild(p);H=p.offsetHeight;p.remove();
ws=H*142/840;d=H*474/900;gap=H*.03;st.style.setProperty('--h',H+'px');st.style.setProperty('--ws',ws+'px');st.style.setProperty('--d',d+'px');render()}
const Bf=r=>Math.abs(r)<1?(r+Math.sin(Math.PI*r)/Math.PI)/2:Math.sign(r)*.5,ss=x=>x*x*(3-2*x);
function render(){const W=innerWidth;tapes.forEach((e,i)=>{const r=i-T,o=ss(Math.max(0,1-Math.abs(r)));
const x=r*(ws+gap)+(d-ws+1.6*gap)*Bf(r),hv=e.dataset.h==='1'&&Math.abs(r)>.5?1:0;
e.style.transform=`translate3d(${x}px,${-o*.025*H-hv*.045*H}px,${o*.2*H}px) rotateZ(${-4.5*o}deg) rotateX(${tilt[1]*o}deg) rotateY(${-90*o+tilt[0]*o}deg)`;
e.style.zIndex=Math.round(100-Math.abs(r)*4);e.style.visibility=Math.abs(x)>W/2+1.5*d?'hidden':'visible';
e.children[0].style.setProperty('--sh',o*.55);e.children[1].style.setProperty('--sh',(1-o)*.5)})}
function swap(el,txt,dir){const s=document.createElement('span');s.textContent=txt;
[...el.children].forEach(c=>{if(c.lv)return;c.lv=1;if(RM){c.remove();return}c.classList.add('o');c.animate([{transform:'translateY(0)'},{transform:`translateY(${-dir*105}%)`}],{duration:650,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'}).onfinish=()=>c.remove()});
el.appendChild(s);if(!RM)s.animate([{transform:`translateY(${dir*105}%)`},{transform:'translateY(0)'}],{duration:650,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'})}
function setActive(i,dir){active=i;$('openb').textContent=LBL[i]||'Open';swap($('ct'),B[i].t,dir);swap($('cs'),`Book ${i+1} of ${N}: ${B[i].n}`,dir)}
function go(){T=Math.max(0,Math.min(N-1,T));const i=Math.round(T);if(i!==active)setActive(i,i>active?1:-1);render()}
$('pv').onclick=()=>{T=Math.round(T)-1;go()};$('nx').onclick=()=>{T=Math.round(T)+1;go()};
const typing=e=>/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);
L('keydown',e=>{if(typing(e))return;if(isOpen){if(e.key==='Escape')closeD();return}
if(e.key==='ArrowLeft'){T=Math.round(T)-1;go()}if(e.key==='ArrowRight'){T=Math.round(T)+1;go()}if(e.key==='Enter'&&document.activeElement===document.body)launch()});
sh.addEventListener('wheel',e=>{const dl=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:0;if(!dl)return;e.preventDefault();T=Math.max(0,Math.min(N-1,T+dl/(ws+gap)*.5));clearTimeout(wt);wt=setTimeout(()=>{T=Math.round(T);go()},160);render()},{passive:false});
sh.addEventListener('pointerdown',e=>{drag={x:e.clientX,T0:T};moved=false});
L('pointermove',e=>{mx=e.clientX;my=e.clientY;if(drag){const dx=e.clientX-drag.x;if(Math.abs(dx)>5)moved=true;if(moved){T=Math.max(0,Math.min(N-1,drag.T0-dx/(ws+gap)));render()}}});
L('pointerup',()=>{if(drag&&moved){T=Math.round(T);go();setTimeout(()=>moved=false,0)}drag=null});
$('openb').onclick=()=>launch();
/* a book opens its own interface directly */
const LBL=['Take the test','See the topic map','See my scores','Find weak topics','Practise now','Open my study plan','Revise now','Open past papers','Open teacher insights'];
function launch(){window.dispatchEvent(new CustomEvent('adhyora:tab',{detail:{tab:TABS[active],solo:true}}))}
/* detail */
function openD(){if(isOpen)return;isOpen=true;const b=B[active],r=tapes[active].children[1].getBoundingClientRect();
dt.style.setProperty('--cc',b.c);
$('dl').innerHTML=`<div class="mk"><div class="ln k">Book ${active+1} of ${N}</div></div><div class="mk"><h2 class="ln">${b.t}</h2></div><div class="mk"><p class="ln">${b.d}</p></div><div class="mk"><ul class="fl ln">${b.f.map(f=>`<li><b>${f[0]}</b>${f[1]}</li>`).join('')}</ul></div><div class="mk"><div class="ln st">${STAT[active]}</div></div><div class="mk"><div class="ln btnrow"><button class="btn1" id="wsb">Open in workspace</button><button class="btn1" id="askb" style="background:var(--navy2)">Ask Study Buddy about this</button></div></div>`;
$('dr').style.setProperty('--cc',b.c);$('dr').style.background=b.c;$('dr').innerHTML=svgOf(active,b.c);
$('askb').onclick=()=>{closeD();setTimeout(()=>{window.dispatchEvent(new CustomEvent('adhyora:ask',{detail:{topic:b.t}}))},RM?0:880)};
$('wsb').onclick=()=>{const tab=TABS[active];closeD();setTimeout(()=>{window.dispatchEvent(new CustomEvent('adhyora:tab',{detail:{tab}}))},RM?0:880)};
document.body.style.overflow='hidden';dt.scrollTop=0;dt.style.visibility='visible';
dt.style.transformOrigin=`${r.left+r.width/2}px ${r.top+r.height/2}px`;
const ins=`inset(${r.top}px ${innerWidth-r.right}px ${innerHeight-r.bottom}px ${r.left}px round 3px)`;
dt.animate([{clipPath:ins,transform:'rotate(-4.5deg)'},{clipPath:'inset(0 0 0 0 round 0)',transform:'rotate(0deg)'}],{duration:RM?1:1050,easing:'cubic-bezier(.76,0,.18,1)',fill:'both'});
[...dt.querySelectorAll('.ln')].forEach((l,i)=>l.animate([{transform:'translateY(110%)'},{transform:'translateY(0)'}],{duration:RM?1:900,delay:RM?0:620+i*75,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'}));
$('dr').animate([{clipPath:'circle(0% at 50% 50%)'},{clipPath:'circle(78% at 50% 50%)'}],{duration:RM?1:1250,delay:RM?0:520,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'})}
function closeD(){if(!isOpen)return;isOpen=false;const r=tapes[active].children[1].getBoundingClientRect();
const ins=`inset(${r.top}px ${innerWidth-r.right}px ${innerHeight-r.bottom}px ${r.left}px round 3px)`;
const a=dt.animate([{clipPath:'inset(0 0 0 0 round 0)',transform:'rotate(0deg)'},{clipPath:ins,transform:'rotate(-4.5deg)'}],{duration:RM?1:850,easing:'cubic-bezier(.76,0,.18,1)',fill:'both'});
a.onfinish=()=>{dt.style.visibility='hidden';dt.getAnimations().forEach(x=>x.cancel());[...dt.querySelectorAll('.ln')].forEach(l=>l.getAnimations().forEach(x=>x.cancel()));document.body.style.overflow=''}}
$('cls').onclick=()=>closeD();
/* loop */
let last=performance.now();
function frame(t){if(dead)return;const dt_=Math.min(.05,(t-last)/1000);last=t;
cx+=(mx-cx)*(1-Math.exp(-16*dt_));cy+=(my-cy)*(1-Math.exp(-16*dt_));cur.style.transform=`translate3d(${cx}px,${cy}px,0)`;
const hr=$('hero').getBoundingClientRect(),inHero=hr.bottom>0&&hr.top<innerHeight&&!isOpen;
const r=sh.getBoundingClientRect(),mid=r.top+r.height/2,W=innerWidth;
const on=inHero&&Math.abs(mx-W/2)<.55*d&&Math.abs(my-mid)<.55*H;
const t0=document.elementFromPoint(mx,my),cl=s=>!!(t0&&t0.closest&&t0.closest(s));
cur.classList.toggle('on',on);cur.classList.toggle('btn',!on&&cl('button,a,input,textarea'));cur.classList.toggle('spine',!on&&cl('.tape'));
if(on)tg=[(mx-W/2)/(.55*d)*9,-(my-mid)/(H/2)*6];else tg=[(mx-W/2)/W*5,0];
const k=1-Math.exp(-7*dt_);tilt[0]+=(tg[0]-tilt[0])*k;tilt[1]+=(tg[1]-tilt[1])*k;render();raf=requestAnimationFrame(frame)}
L('resize',measure);document.fonts&&document.fonts.ready.then(()=>{if(!dead)measure()});
setActive(4,1);measure();if(!RM)raf=requestAnimationFrame(frame);


return ()=>{dead=true;cancelAnimationFrame(raf);offs.forEach(f=>f());st.innerHTML='';$('ct').innerHTML='';$('cs').innerHTML='';document.body.style.overflow=''}
}
