"use client";

import { useEffect, useMemo, useState } from "react";

type Option = { label: string; value: string; score: number; note?: string };
type Answer = { value: string; label: string; score: number; detail?: string };
type SessionUser = { username: string; role: "user" | "admin" };
type Customer = { id: string; username: string; phone: string; createdAt: string; score: null | { total: number; max: number; updatedAt: string; items: { index: number; category: string; answer: string; score: number; max: number }[] } };

const questions: { title: string; eyebrow: string; max: number; options: Option[] }[] = [
  { title: "你的职位属于哪个 NOC TEER？", eyebrow: "职业技能等级", max: 9, options: [
    { label: "TEER 0 或 1", value: "teer01", score: 9 }, { label: "TEER 2 或 3", value: "teer23", score: 6 }, { label: "TEER 4 或 5", value: "teer45", score: 0 },
  ]},
  { title: "你的 NOC 职业大类是什么？", eyebrow: "职业类别", max: 10, options: [
    { label: "3 · 医疗卫生", value: "3", score: 10 }, { label: "7 · 技工与运输", value: "7", score: 8 }, { label: "2 · 自然与应用科学", value: "2", score: 6 }, { label: "0 / 1 / 4 / 8 / 9", value: "other4", score: 4, note: "管理、商业金融、教育法律、自然资源、制造及公用事业" }, { label: "5 / 6 · 艺术、销售和服务", value: "56", score: 2 },
  ]},
  { title: "Job Offer 的时薪是多少？", eyebrow: "工作薪资", max: 15, options: [
    { label: "$40.00 或以上", value: "40", score: 15 }, { label: "$35.00 – $39.99", value: "35", score: 12 }, { label: "$30.00 – $34.99", value: "30", score: 10 }, { label: "$25.00 – $29.99", value: "25", score: 8 }, { label: "$20.00 – $24.99", value: "20", score: 5 }, { label: "低于 $20.00", value: "under20", score: 0 },
  ]},
  { title: "你在安省有多久相关工作经验？", eyebrow: "安省工作经历", max: 18, options: [
    { label: "对应职位超过 24 个月", value: "job24", score: 18 }, { label: "对应职位 13–24 个月", value: "job13", score: 15 }, { label: "对应职位 6–12 个月", value: "job6", score: 12 }, { label: "其他安省经验超过 24 个月", value: "other24", score: 12 }, { label: "其他安省经验 13–24 个月", value: "other13", score: 9 }, { label: "其他安省经验 6–12 个月", value: "other6", score: 6 }, { label: "少于 6 个月", value: "under6", score: 0 },
  ]},
  { title: "过去 5 年最高单年加拿大应税收入？", eyebrow: "加拿大收入", max: 8, options: [
    { label: "$70,000 或以上", value: "70", score: 8 }, { label: "$50,000 – $69,999", value: "50", score: 6 }, { label: "$30,000 – $49,999", value: "30", score: 4 }, { label: "低于 $30,000 或无记录", value: "under30", score: 0 },
  ]},
  { title: "你目前在加拿大的身份是？", eyebrow: "加拿大合法身份", max: 10, options: [
    { label: "有效工签或符合规则的 maintained status", value: "work", score: 10 }, { label: "有效学签", value: "study", score: 5 }, { label: "其他身份", value: "other", score: 0 },
  ]},
  { title: "你的最高学历是？", eyebrow: "教育背景", max: 10, options: [
    { label: "博士或指定专业学位", value: "doctor", score: 10, note: "医学、牙医、兽医或验光" }, { label: "硕士", value: "master", score: 8 }, { label: "学士或高于学士层级的证书/文凭", value: "bachelor", score: 6 }, { label: "学院证书/文凭、研究生证书或技工证书", value: "college", score: 5 }, { label: "低于上述层级", value: "lower", score: 0 },
  ]},
  { title: "你有几个符合条件的加拿大教育证书？", eyebrow: "加拿大教育", max: 10, options: [
    { label: "2 个或以上", value: "2", score: 10 }, { label: "1 个", value: "1", score: 5 }, { label: "0 个", value: "0", score: 0 },
  ]},
  { title: "四项语言成绩中最低的 CLB / NCLC？", eyebrow: "第一官方语言", max: 15, options: [
    { label: "CLB / NCLC 9 或以上", value: "9", score: 15 }, { label: "CLB / NCLC 8", value: "8", score: 12 }, { label: "CLB / NCLC 7", value: "7", score: 8 }, { label: "CLB / NCLC 6", value: "6", score: 4 }, { label: "CLB / NCLC 5 或以下", value: "5", score: 0 },
  ]},
  { title: "你有几种官方语言考试成绩？", eyebrow: "官方语言数量", max: 10, options: [
    { label: "英语和法语均达到四项 CLB / NCLC 6+", value: "2", score: 10 }, { label: "只有一种官方语言考试成绩", value: "1", score: 5 }, { label: "没有有效考试成绩", value: "0", score: 0 },
  ]},
  { title: "Job Offer 或执业地点位于哪里？", eyebrow: "安省地区", max: 15, options: [
    { label: "Northern Ontario", value: "north", score: 15 }, { label: "Eastern Ontario", value: "east", score: 10 }, { label: "Central Ontario（GTA 外）", value: "central", score: 10 }, { label: "Southwestern Ontario", value: "southwest", score: 10 }, { label: "GTA 内、Toronto 外", value: "gta", score: 5 }, { label: "City of Toronto", value: "toronto", score: 0 },
  ]},
];

const nocSamples = [
  ["20010", "Engineering managers", "TEER 0", "2"], ["21310", "Electrical and electronics engineers", "TEER 1", "2"], ["22310", "Electrical and electronics engineering technologists and technicians", "TEER 2", "2"], ["22233", "Construction inspectors", "TEER 2", "2"], ["72410", "Automotive service technicians", "TEER 2", "7"], ["72106", "Welders and related machine operators", "TEER 2", "7"], ["31301", "Registered nurses and registered psychiatric nurses", "TEER 1", "3"], ["11202", "Professional occupations in advertising, marketing and public relations", "TEER 1", "1"], ["60020", "Retail and wholesale trade managers", "TEER 0", "6"],
];

const regionRows = [
  ["Northern Ontario", "Muskoka、Haliburton、Nipissing、Parry Sound、Manitoulin、Sudbury、Timiskaming、Cochrane、Algoma、Thunder Bay、Rainy River、Kenora"],
  ["Eastern Ontario", "Ottawa、Frontenac、Hastings、Kawartha Lakes、Lanark、Leeds and Grenville、Peterborough、Renfrew 等"],
  ["Central Ontario（GTA 外）", "Dufferin、Grey、Simcoe、Waterloo、Wellington"],
  ["Southwestern Ontario", "Hamilton、Niagara、London / Middlesex、Windsor / Essex、Oxford、Perth、Bruce 等"],
  ["GTA（Toronto 外）", "Durham、Halton、Peel、York"], ["Toronto", "City of Toronto"],
];

function DetailBox({ step }: { step: number }) {
  if (![0, 8, 10].includes(step)) return null;
  if (step === 0) return <details className="info"><summary>如何确认正确的 NOC code？</summary><div className="details-body"><p>职位名称相似不代表 NOC 相同，应以实际主要职责是否匹配为准。可先在下方查询常见职位，再前往加拿大政府网站核对。</p><a href="https://noc.esdc.gc.ca/" target="_blank" rel="noreferrer">打开加拿大政府 NOC 查询 ↗</a></div></details>;
  if (step === 8) return <details className="info"><summary>不知道自己的 CLB？查看 IELTS General 对照表</summary><div className="table-wrap"><table><thead><tr><th>CLB</th><th>阅读</th><th>写作</th><th>听力</th><th>口语</th></tr></thead><tbody>{[["10+","8.0","7.5","8.5","7.5"],["9","7.0","7.0","8.0","7.0"],["8","6.5","6.5","7.5","6.5"],["7","6.0","6.0","6.0","6.0"],["6","5.0","5.5","5.5","5.5"],["5","4.0","5.0","5.0","5.0"],["4","3.5","4.0","4.5","4.0"]].map(r=><tr key={r[0]}>{r.map(c=><td key={c}>{c}</td>)}</tr>)}</tbody></table><p className="fine">仅适用于 IELTS General Training，不适用于 IELTS Academic。</p></div></details>;
  return <details className="info"><summary>查看各地区包含的城市 / 行政区</summary><div className="details-body region-list">{regionRows.map(r=><div key={r[0]}><b>{r[0]}</b><span>{r[1]}</span></div>)}</div></details>;
}

export default function Home() {
  const [view, setView] = useState<"home"|"type"|"quiz"|"result"|"auth"|"admin">("home");
  const [step, setStep] = useState(0); const [doctor, setDoctor] = useState(false);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [nocSearch, setNocSearch] = useState(""); const [showQr, setShowQr] = useState(false);
  const [wechat, setWechat] = useState("OINP-Consult"); const [qr, setQr] = useState("");
  const [user, setUser] = useState<SessionUser|null>(null);
  const [authMode, setAuthMode] = useState<"login"|"register">("login");
  const [authForm, setAuthForm] = useState({ username:"", phone:"", password:"" });
  const [authError, setAuthError] = useState(""); const [busy, setBusy] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]); const [adminError, setAdminError] = useState("");
  // Restore a small local draft after hydration; no network or account data is involved.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{ try { const saved=localStorage.getItem("oinp-state"); if(saved){const s=JSON.parse(saved);setAnswers(s.answers||{});setStep(s.step||0);setDoctor(!!s.doctor)} } catch {}
    const wantsAdmin=new URLSearchParams(location.search).get("admin")==="1";
    Promise.all([fetch("/api/auth").then(r=>r.json()),fetch("/api/settings").then(r=>r.json())]).then(async([a,s])=>{setUser(a.user||null);setWechat(s.wechat||"OINP-Consult");setQr(s.qr||"");if(wantsAdmin){if(a.user?.role==="admin"){await loadAdmin();setView("admin")}else{setAuthMode("login");setView("auth")}}}).catch(()=>{});
  },[]);
  useEffect(()=>{localStorage.setItem("oinp-state",JSON.stringify({answers,step,doctor}))},[answers,step,doctor]);
  const total = useMemo(()=>Object.entries(answers).reduce((n,[k,a])=>n+(doctor&&Number(k)===2?0:a.score),0),[answers,doctor]);
  const max = doctor ? 115 : 130;
  const choose=(o:Option)=>setAnswers(a=>({...a,[step]:{value:o.value,label:o.label,score:doctor&&step===2?0:o.score,detail:o.note}}));
  const reset=()=>{setAnswers({});setStep(0);setDoctor(false);localStorage.removeItem("oinp-state");setView("home")};
  const current=questions[step]; const selected=answers[step];
  const filteredNoc=nocSamples.filter(n=>!nocSearch||n.join(" ").toLowerCase().includes(nocSearch.toLowerCase()));
  const startQuiz=(isDoctor:boolean)=>{setDoctor(isDoctor); if(isDoctor)setAnswers(a=>({...a,2:{value:"na",label:"自雇医生：不适用",score:0}})); setStep(0);setView("quiz")};
  const scorePayload=()=>({total,max,items:questions.map((q,i)=>({index:i,category:q.eyebrow,answer:answers[i]?.label||"未作答",score:answers[i]?.score||0,max:doctor&&i===2?0:q.max}))});
  const consult=async()=>{if(!user||user.role!=="user"){setAuthMode("login");setAuthError("");setView("auth");return} setBusy(true);const r=await fetch("/api/score",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(scorePayload())});setBusy(false);if(r.ok)setShowQr(true);else{setUser(null);setView("auth")}};
  const submitAuth=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setAuthError("");const r=await fetch("/api/auth",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:authMode,...authForm})});const data=await r.json();setBusy(false);if(!r.ok){setAuthError(data.error||"操作失败");return}setUser(data.user);if(data.user.role==="admin"){await loadAdmin();setView("admin")}else{await fetch("/api/score",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(scorePayload())});setView("result");setShowQr(true)}};
  const loadAdmin=async()=>{const r=await fetch("/api/admin");const data=await r.json();if(r.ok){setCustomers(data.customers);setWechat(data.settings.wechat);setQr(data.settings.qr)}else setAdminError(data.error||"后台加载失败")};
  const saveSettings=async()=>{setBusy(true);const r=await fetch("/api/admin",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({wechat,qr})});setBusy(false);alert(r.ok?"设置已保存":"保存失败")};
  return <main>
    <header><button className="brand" onClick={()=>setView("home")} aria-label="返回首页"><span className="trillium">✦</span><span>Ontario EOI <small>评分工具</small></span></button><div className="header-right"><span className="policy">政策版本 · 2026.07</span>{user?.role==="admin"&&<button className="admin-link" onClick={()=>{loadAdmin();setView("admin")}}>管理后台</button>}</div></header>
    {view==="home"&&<section className="hero"><div className="hero-inner"><div className="tag">ONTARIO IMMIGRANT NOMINEE PROGRAM</div><h1>清楚了解你的<br/><em>EOI 预估分数</em></h1><p className="lead">逐项完成 11 个评分模块，根据 Ontario Workforce Priority 最新规则快速估算。</p><button className="primary hero-cta" onClick={()=>setView("type")}>开始估分 <span>→</span></button><div className="trust"><span>✓ 无需注册</span><span>✓ 约 3 分钟</span><span>✓ 自动保存</span></div></div><aside className="score-preview"><div className="preview-top"><span>评分构成</span><b>满分 130</b></div>{[["职业与工作","52"],["教育与语言","45"],["身份与收入","18"],["工作地区","15"]].map(x=><div className="preview-row" key={x[0]}><span>{x[0]}</span><b>{x[1]} 分</b></div>)}<div className="seal">11 项<br/><small>逐项计算</small></div></aside><div className="disclaimer">本工具仅供信息参考，不构成法律或移民建议；最终以安省政府审核及最新政策为准。</div></section>}
    {view==="type"&&<section className="shell"><button className="backlink" onClick={()=>setView("home")}>← 返回</button><div className="question-card intro-card"><span className="step-label">开始前</span><h2>请选择你的申请类别</h2><p className="sub">这会影响时薪项目是否计分。</p><div className="option-grid type-grid"><button onClick={()=>startQuiz(false)}><span className="radio"/><strong>普通 Job Offer</strong><small>理论最高 130 分</small></button><button onClick={()=>startQuiz(true)}><span className="radio"/><strong>自雇医生</strong><small>时薪不适用，理论最高 115 分</small></button></div></div></section>}
    {view==="quiz"&&<section className="shell quiz-shell"><div className="progress-head"><span>第 <b>{step+1}</b> / 11 项</span><span>{Math.round((step+1)/11*100)}% 完成</span></div><div className="progress"><i style={{width:`${(step+1)/11*100}%`}}/></div><div className="question-card"><span className="step-label">{current.eyebrow}</span><h2>{current.title}</h2><p className="sub">请选择最符合你情况的一项</p>
      {step===0&&<div className="noc-search"><input value={nocSearch} onChange={e=>setNocSearch(e.target.value)} placeholder="搜索职位名称或 5 位 NOC code"/><span>⌕</span>{nocSearch&&<div className="noc-results">{filteredNoc.length?filteredNoc.map(n=><button key={n[0]} onClick={()=>{const teer=n[2].slice(-1);choose({value:n[0],label:`${n[0]} · ${n[1]} (${n[2]})`,score:["0","1"].includes(teer)?9:["2","3"].includes(teer)?6:0})}}><b>{n[0]}</b><span>{n[1]}</span><small>{n[2]}</small></button>):<p>暂无匹配，请使用下方 TEER 选项。</p>}</div>}</div>}
      <div className="option-grid">{(doctor&&step===2?[{label:"自雇医生：此项不适用",value:"na",score:0}]:current.options).map(o=><button key={o.value} className={selected?.value===o.value?"selected":""} onClick={()=>choose(o)}><span className="radio"/><span><strong>{o.label}</strong>{o.note&&<small>{o.note}</small>}</span><b>+{o.score}</b></button>)}</div><DetailBox step={step}/>{selected&&<div className="instant"><span>本项预计得分</span><b>{selected.score} <small>/ {doctor&&step===2?0:current.max}</small></b></div>}
      <div className="actions"><button className="secondary" onClick={()=>step?setStep(step-1):setView("type")}>上一步</button><button className="primary" disabled={!selected} onClick={()=>step<10?setStep(step+1):setView("result")}>{step===10?"查看结果":"下一步"} →</button></div></div></section>}
    {view==="result"&&<section className="shell result-shell"><div className="result-hero"><span className="step-label">估分完成</span><p>你的 OINP EOI 预估分数</p><div className="big-score">{total}<small> / {max}</small></div><p className="result-note">这是排名估算，不代表满足全部资格或一定获邀。</p><button className="consult" disabled={busy} onClick={consult}>{busy?"正在保存…":"进一步咨询"} <span>微信扫码 →</span></button></div><div className="breakdown"><div className="break-title"><h2>得分明细</h2><button onClick={()=>{setStep(0);setView("quiz")}}>修改答案</button></div>{questions.map((q,i)=>{const a=answers[i];return <details key={q.title}><summary><span><i>{String(i+1).padStart(2,"0")}</i><b>{q.eyebrow}</b><small>{a?.label||"未作答"}</small></span><strong>{doctor&&i===2?"—":`${a?.score||0} / ${q.max}`}</strong></summary><p>根据你选择的“{a?.label||"未作答"}”，此项计 {a?.score||0} 分。最终认定以官方审核为准。</p></details>})}<button className="reset" onClick={reset}>重新测算</button></div></section>}
    {view==="auth"&&<section className="shell"><button className="backlink" onClick={()=>setView("result")}>← 返回评分结果</button><form className="question-card auth-card" onSubmit={submitAuth}><span className="step-label">{authMode==="login"?"登录":"注册账户"}</span><h2>{authMode==="login"?"登录后继续咨询":"注册后继续咨询"}</h2><p className="sub">登录成功后会自动回到当前评分结果，不会丢失答案。</p><label>用户名<input required minLength={2} autoComplete="username" value={authForm.username} onChange={e=>setAuthForm({...authForm,username:e.target.value})}/></label>{authMode==="register"&&<label>手机号<input required inputMode="tel" autoComplete="tel" value={authForm.phone} onChange={e=>setAuthForm({...authForm,phone:e.target.value})}/></label>}<label>密码<input required minLength={8} type="password" autoComplete={authMode==="login"?"current-password":"new-password"} value={authForm.password} onChange={e=>setAuthForm({...authForm,password:e.target.value})}/></label>{authError&&<p className="form-error">{authError}</p>}<button className="primary" disabled={busy}>{busy?"请稍候…":authMode==="login"?"登录":"注册并继续"}</button><button type="button" className="auth-switch" onClick={()=>{setAuthMode(authMode==="login"?"register":"login");setAuthError("")}}>{authMode==="login"?"没有账户？立即注册":"已有账户？返回登录"}</button></form></section>}
    {view==="admin"&&user?.role==="admin"&&<section className="shell admin-shell"><button className="backlink" onClick={()=>setView("home")}>← 返回前台</button><div className="question-card admin-card"><span className="step-label">管理员后台</span><h2>咨询设置</h2><label>微信号<input value={wechat} onChange={e=>setWechat(e.target.value)} placeholder="输入微信号"/></label><label>二维码图片<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f&&f.size<=2*1024*1024){const reader=new FileReader();reader.onload=()=>setQr(String(reader.result));reader.readAsDataURL(f)}}}/></label>{qr&&<img className="qr-preview" src={qr} alt="二维码预览"/>}<button className="primary" disabled={busy} onClick={saveSettings}>保存设置</button></div><div className="customer-panel"><div className="break-title"><h2>客户评分记录</h2><b>{customers.length} 位客户</b></div>{adminError&&<p className="form-error">{adminError}</p>}<div className="customer-table-wrap"><table className="customer-table"><thead><tr><th>用户名</th><th>电话</th><th>总分</th><th>各分项</th><th>注册时间</th></tr></thead><tbody>{customers.map(c=><tr key={c.id}><td><b>{c.username}</b></td><td>{c.phone}</td><td>{c.score?<b>{c.score.total} / {c.score.max}</b>:"尚未提交"}</td><td>{c.score?<details><summary>查看 11 项</summary><ul>{c.score.items.map(i=><li key={i.index}><span>{i.category}：{i.answer}</span><b>{i.score}/{i.max}</b></li>)}</ul></details>:"—"}</td><td>{new Date(c.createdAt).toLocaleDateString("zh-CN")}</td></tr>)}</tbody></table></div></div></section>}
    {showQr&&<div className="modal" onClick={()=>setShowQr(false)}><div className="modal-card" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setShowQr(false)}>×</button><span className="step-label">进一步咨询</span><h2>微信扫码，进一步咨询</h2>{qr?<img src={qr} alt="微信二维码"/>:<div className="qr-placeholder"><span>＋</span><small>请在管理页面<br/>上传二维码</small></div>}<p>微信号：<b>{wechat}</b></p><button className="secondary" onClick={()=>navigator.clipboard?.writeText(wechat)}>复制微信号</button></div></div>}
    <footer><span>Ontario EOI 评分工具</span><a href="https://www.ontario.ca/page/ontario-workforce-priority-stream" target="_blank" rel="noreferrer">查看官方规则 ↗</a></footer>
  </main>
}
