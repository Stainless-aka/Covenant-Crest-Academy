import { supabase, requireUser, getProfile } from "./supabase.js";

const content=document.getElementById("admin-content");
const title=document.getElementById("page-title");
const nav=document.getElementById("admin-nav");
let user,profile;

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=v=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v||0));
const grade=v=>v>=80?"A":v>=70?"B":v>=60?"C":v>=50?"D":"F";

async function init(){
  user=await requireUser();
  profile=await getProfile(user.id);
  if(profile.role!=="admin"){ window.location.href="./dashboard.html"; return; }
  document.getElementById("user-name").textContent=profile.full_name;
  nav.querySelectorAll("a").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();location.hash=a.getAttribute("href");route();}));
  await route();
}
async function route(){
  const r=location.hash.replace("#","")||"overview";
  nav.querySelectorAll("a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+r));
  title.textContent={overview:"Dashboard",students:"Students",classes:"Classes",fees:"School Fees",payments:"Payments",results:"Results",parents:"Parents"}[r]||"Dashboard";
  if(r==="students")return students();
  if(r==="classes")return classes();
  if(r==="fees")return fees();
  if(r==="payments")return payments();
  if(r==="results")return results();
  if(r==="parents")return parents();
  return overview();
}
async function overview(){
 const a=await Promise.all([
  supabase.from("students").select("*",{count:"exact",head:true}),
  supabase.from("classes").select("*",{count:"exact",head:true}),
  supabase.from("payments").select("*",{count:"exact",head:true}),
  supabase.from("result_records").select("*",{count:"exact",head:true})
 ]);
 content.innerHTML='<div class="welcome"><div><p class="eyebrow">Administration</p><h2>Welcome, '+esc(profile.full_name)+'.</h2><p>Manage the school from one place.</p></div><img src="./public/images/logo.jpg" alt=""></div>'+
 '<div class="stat-grid"><div class="stat-card"><span>Students</span><strong>'+(a[0].count??0)+'</strong></div><div class="stat-card"><span>Classes</span><strong>'+(a[1].count??0)+'</strong></div><div class="stat-card"><span>Payments</span><strong>'+(a[2].count??0)+'</strong></div><div class="stat-card"><span>Result Entries</span><strong>'+(a[3].count??0)+'</strong></div></div>';
}
async function students(){
 const r=await supabase.from("students").select("*,classes(name)").order("created_at",{ascending:false});
 if(r.error)return showError(r.error);
 content.innerHTML='<div class="page-actions"><div><p class="eyebrow">Student Management</p><h2>Students</h2></div><button class="btn btn-primary" id="add">Register Student</button></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Admission</th><th>Class</th><th>Gender</th><th></th></tr></thead><tbody>'+
 (r.data||[]).map(s=>'<tr><td><strong>'+esc(s.full_name)+'</strong></td><td>'+esc(s.admission_number||"—")+'</td><td>'+esc(s.classes?.name||"—")+'</td><td>'+esc(s.gender||"—")+'</td><td><button class="table-action" data-edit="'+s.id+'">Edit</button></td></tr>').join("")+
 '</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=()=>studentModal();
 document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>studentModal(b.dataset.edit));
}
async function studentModal(id){
 const cr=await supabase.from("classes").select("*").order("name");
 const sr=id?await supabase.from("students").select("*").eq("id",id).single():{data:null};
 const s=sr.data;
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Student</p><h2>'+(id?"Edit":"Register")+' Student</h2>'+
 '<label>Full name<input name="full_name" value="'+esc(s?.full_name||"")+'" required></label>'+
 '<label>Admission number<input name="admission_number" value="'+esc(s?.admission_number||"")+'"></label>'+
 '<label>Date of birth<input name="date_of_birth" type="date" value="'+esc(s?.date_of_birth||"")+'"></label>'+
 '<label>Gender<select name="gender"><option value="">Select</option><option '+(s?.gender==="Male"?"selected":"")+'>Male</option><option '+(s?.gender==="Female"?"selected":"")+'>Female</option></select></label>'+
 '<label>Class<select name="class_id" required><option value="">Select class</option>'+ (cr.data||[]).map(c=>'<option value="'+c.id+'" '+(s?.class_id===c.id?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></label>'+
 '<button class="btn btn-primary btn-block">Save Student</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target).entries());const r=id?await supabase.from("students").update(p).eq("id",id):await supabase.from("students").insert(p);if(r.error){document.getElementById("msg").textContent=r.error.message;return;}document.getElementById("modal-root").innerHTML="";students();};
}
async function classes(){
 const r=await supabase.from("classes").select("*").order("name");
 const t=await supabase.from("profiles").select("id,full_name").eq("role","teacher").order("full_name");
 if(r.error)return showError(r.error);
 const assigns=await supabase.from("teacher_classes").select("teacher_id,class_id");
 const by={};(assigns.data||[]).forEach(x=>(by[x.class_id]??=[]).push(x.teacher_id));
 content.innerHTML='<div class="page-actions"><div><p class="eyebrow">Academic Structure</p><h2>Classes</h2></div><button class="btn btn-primary" id="add">Add Class</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Class</th><th>Teachers</th><th></th></tr></thead><tbody>'+
 (r.data||[]).map(c=>'<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+ (t.data||[]).filter(x=>(by[c.id]||[]).includes(x.id)).map(x=>esc(x.full_name)).join(", ")||"None")+'</td><td><button class="table-action" data-edit="'+c.id+'">Manage</button></td></tr>').join("")+'</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=()=>classModal();
 document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>classModal(b.dataset.edit));
}
async function classModal(id){
 const cr=id?await supabase.from("classes").select("*").eq("id",id).single():{data:null};
 const tr=await supabase.from("profiles").select("id,full_name").eq("role","teacher").order("full_name");
 const ar=id?await supabase.from("teacher_classes").select("teacher_id").eq("class_id",id):{data:[]};
 const selected=(ar.data||[]).map(x=>x.teacher_id);
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Class Management</p><h2>'+(id?"Manage":"Add")+' Class</h2>'+
 '<label>Class name<input name="name" value="'+esc(cr.data?.name||"")+'" required></label>'+
 '<label>Teachers<select name="teachers" multiple size="6">'+(tr.data||[]).map(x=>'<option value="'+x.id+'" '+(selected.includes(x.id)?"selected":"")+'>'+esc(x.full_name)+'</option>').join("")+'</select></label>'+
 '<small class="muted">Hold Ctrl/Cmd to select multiple teachers.</small><button class="btn btn-primary btn-block">Save</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target);const name=fd.get("name").trim();const ids=[...e.target.teachers.selectedOptions].map(x=>x.value);const r=id?await supabase.from("classes").update({name}).eq("id",id).select().single():await supabase.from("classes").insert({name}).select().single();if(r.error){document.getElementById("msg").textContent=r.error.message;return;}const cid=id||r.data.id;await supabase.from("teacher_classes").delete().eq("class_id",cid);if(ids.length)await supabase.from("teacher_classes").insert(ids.map(teacher_id=>({teacher_id,class_id:cid})));document.getElementById("modal-root").innerHTML="";classes();};
}
async function fees(){
 const [f,c,s,t]=await Promise.all([supabase.from("fee_structures").select("*,classes(name),academic_sessions(name),terms(name)").order("created_at",{ascending:false}),supabase.from("classes").select("*").order("name"),supabase.from("academic_sessions").select("*").order("name",{ascending:false}),supabase.from("terms").select("*").order("name")]);
 content.innerHTML='<div class="page-actions"><div><p class="eyebrow">Finance</p><h2>School Fee Structure</h2></div><button class="btn btn-primary" id="add">Add Fee</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Description</th><th>Class</th><th>Term</th><th>Session</th><th>Amount</th><th></th></tr></thead><tbody>'+
 (f.data||[]).map(x=>'<tr><td>'+esc(x.description)+'</td><td>'+esc(x.classes?.name||"All")+'</td><td>'+esc(x.terms?.name||"—")+'</td><td>'+esc(x.academic_sessions?.name||"—")+'</td><td>'+money(x.amount)+'</td><td><button class="table-action" data-edit="'+x.id+'">Edit</button></td></tr>').join("")+'</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=()=>feeModal(null,c.data,s.data,t.data);
 document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>feeModal(b.dataset.edit,c.data,s.data,t.data));
}
async function feeModal(id,classes,sessions,terms){
 const old=id?(await supabase.from("fee_structures").select("*").eq("id",id).single()).data:null;
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Finance</p><h2>'+(id?"Edit":"Add")+' Fee</h2>'+
 '<label>Description<input name="description" value="'+esc(old?.description||"School Fees")+'" required></label>'+
 '<label>Class<select name="class_id"><option value="">All classes</option>'+classes.map(c=>'<option value="'+c.id+'" '+(old?.class_id===c.id?"selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></label>'+
 '<label>Session<select name="session_id" required><option value="">Select</option>'+sessions.map(s=>'<option value="'+s.id+'" '+(old?.session_id===s.id?"selected":"")+'>'+esc(s.name)+'</option>').join("")+'</select></label>'+
 '<label>Term<select name="term_id" required><option value="">Select</option>'+terms.map(t=>'<option value="'+t.id+'" '+(old?.term_id===t.id?"selected":"")+'>'+esc(t.name)+'</option>').join("")+'</select></label>'+
 '<label>Amount<input name="amount" type="number" min="0" step="0.01" value="'+(old?.amount||"")+'" required></label>'+
 '<button class="btn btn-primary btn-block">Save Fee</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target).entries());p.amount=Number(p.amount);p.class_id=p.class_id||null;const r=id?await supabase.from("fee_structures").update(p).eq("id",id):await supabase.from("fee_structures").insert(p);if(r.error){document.getElementById("msg").textContent=r.error.message;return;}document.getElementById("modal-root").innerHTML="";fees();};
}
async function payments(){
 const r=await supabase.from("payments").select("*,students(full_name),fee_structures(description)").order("created_at",{ascending:false});
 content.innerHTML='<div class="page-actions"><div><p class="eyebrow">Finance</p><h2>Payment Records</h2></div><button class="btn btn-primary" id="add">Record Payment</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Fee</th><th>Amount</th><th>Status</th><th>Reference</th><th>Date</th></tr></thead><tbody>'+
 (r.data||[]).map(p=>'<tr><td>'+esc(p.students?.full_name||"—")+'</td><td>'+esc(p.fee_structures?.description||"—")+'</td><td>'+money(p.amount)+'</td><td><span class="status '+esc(p.status)+'">'+esc(p.status)+'</span></td><td>'+esc(p.reference||"—")+'</td><td>'+ (p.paid_at?new Date(p.paid_at).toLocaleDateString("en-NG"):"—")+'</td></tr>').join("")+'</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=paymentModal;
}
async function paymentModal(){
 const [s,f]=await Promise.all([supabase.from("students").select("id,full_name").order("full_name"),supabase.from("fee_structures").select("id,description").order("description")]);
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Payment</p><h2>Record Payment</h2>'+
 '<label>Student<select name="student_id" required><option value="">Select</option>'+ (s.data||[]).map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+'</option>').join("")+'</select></label>'+
 '<label>Fee<select name="fee_structure_id"><option value="">Select</option>'+ (f.data||[]).map(x=>'<option value="'+x.id+'">'+esc(x.description)+'</option>').join("")+'</select></label>'+
 '<label>Amount<input name="amount" type="number" min="1" step="0.01" required></label><label>Reference<input name="reference"></label>'+
 '<label>Method<select name="payment_method"><option>manual</option><option>cash</option><option>bank_transfer</option><option>paystack</option></select></label>'+
 '<button class="btn btn-primary btn-block">Save Payment</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target).entries());p.amount=Number(p.amount);p.status="paid";p.paid_at=new Date().toISOString();const st=await supabase.from("students").select("parent_id").eq("id",p.student_id).single();p.parent_id=st.data?.parent_id||null;const r=await supabase.from("payments").insert(p);if(r.error){document.getElementById("msg").textContent=r.error.message;return;}if(p.fee_structure_id){const a=await supabase.from("fee_assignments").select("id,amount_paid").eq("student_id",p.student_id).eq("fee_structure_id",p.fee_structure_id).maybeSingle();if(a.data)await supabase.from("fee_assignments").update({amount_paid:Number(a.data.amount_paid||0)+p.amount}).eq("id",a.data.id);}document.getElementById("modal-root").innerHTML="";payments();};
}
async function parents(){
 const [p,s,l]=await Promise.all([supabase.from("profiles").select("id,full_name,email").eq("role","parent").order("full_name"),supabase.from("students").select("id,full_name,admission_number").order("full_name"),supabase.from("parent_students").select("parent_id,student_id")]);
 const map={};(l.data||[]).forEach(x=>(map[x.parent_id]??=[]).push(x.student_id));
 content.innerHTML='<div class="page-actions"><div><p class="eyebrow">Parent Management</p><h2>Parents & Children</h2></div><button class="btn btn-primary" id="add">Link Child</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Parent</th><th>Email</th><th>Children</th></tr></thead><tbody>'+
 (p.data||[]).map(x=>'<tr><td><strong>'+esc(x.full_name)+'</strong></td><td>'+esc(x.email||"—")+'</td><td>'+((map[x.id]||[]).map(id=>(s.data||[]).find(y=>y.id===id)?.full_name).filter(Boolean).map(esc).join(", ")||"No child linked")+'</td></tr>').join("")+'</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=()=>linkModal(p.data||[],s.data||[]);
}
function linkModal(parents,students){
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Parent Relationship</p><h2>Link Child</h2>'+
 '<label>Parent<select name="parent_id" required><option value="">Select</option>'+parents.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+' — '+esc(x.email||"")+'</option>').join("")+'</select></label>'+
 '<label>Student<select name="student_id" required><option value="">Select</option>'+students.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+' — '+esc(x.admission_number||"")+'</option>').join("")+'</select></label>'+
 '<button class="btn btn-primary btn-block">Link</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target).entries());const r=await supabase.from("parent_students").upsert(p,{onConflict:"parent_id,student_id"});if(r.error){document.getElementById("msg").textContent=r.error.message;return;}await supabase.from("students").update({parent_id:p.parent_id}).eq("id",p.student_id);document.getElementById("modal-root").innerHTML="";parents();};
}
async function results(){
 const r=await supabase.from("result_records").select("id,total_score,grade,published,students(full_name),subjects(name),terms(name),academic_sessions(name)").order("created_at",{ascending:false}).limit(200);
 content.innerHTML='<div class="section-heading"><p class="eyebrow">Academics</p><h2>Result Publishing</h2></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Subject</th><th>Term</th><th>Total</th><th>Grade</th><th>Status</th><th></th></tr></thead><tbody>'+
 (r.data||[]).map(x=>'<tr><td>'+esc(x.students?.full_name)+'</td><td>'+esc(x.subjects?.name)+'</td><td>'+esc(x.terms?.name)+'</td><td>'+x.total_score+'</td><td>'+esc(x.grade)+'</td><td>'+ (x.published?"Published":"Draft")+'</td><td><button class="table-action" data-id="'+x.id+'" data-next="'+(!x.published)+'">'+(x.published?"Unpublish":"Publish")+'</button></td></tr>').join("")+'</tbody></table></div>';
 document.querySelectorAll("[data-id]").forEach(b=>b.onclick=async()=>{const e=await supabase.from("result_records").update({published:b.dataset.next==="true"}).eq("id",b.dataset.id);if(e.error)alert(e.error.message);else results();});
}
function showError(e){content.innerHTML='<div class="empty-state">'+esc(e.message)+'</div>';}
document.getElementById("logout").onclick=async()=>{await supabase.auth.signOut();location.href="./login.html";};
document.getElementById("menu-toggle").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
window.addEventListener("hashchange",route);
init();