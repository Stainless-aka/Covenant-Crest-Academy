import { supabase, requireUser, getProfile } from "./supabase.js";

const content=document.getElementById("admin-content");
const title=document.getElementById("page-title");
const nav=document.getElementById("admin-nav");
let user,profile;

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
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
  title.textContent={overview:"Dashboard",students:"Students",classes:"Classes",results:"Results",parents:"Parents"}[r]||"Dashboard";
  if(r==="students")return students();
  if(r==="classes")return classes();
  if(r==="results"){window.location.href="./results.html";return;}
  if(r==="parents")return parents();
  return overview();
}
async function overview(){
 const a=await Promise.all([
  supabase.from("students").select("*",{count:"exact",head:true}),
  supabase.from("classes").select("*",{count:"exact",head:true}),
  supabase.from("result_records").select("*",{count:"exact",head:true})
 ]);
 content.innerHTML='<div class="welcome"><div><p class="eyebrow">Administration</p><h2>Welcome, '+esc(profile.full_name)+'.</h2><p>Manage the school from one place.</p></div><img src="./public/images/logo.jpg" alt=""></div>'+
 '<div class="stat-grid"><div class="stat-card"><span>Students</span><strong>'+(a[0].count??0)+'</strong></div><div class="stat-card"><span>Classes</span><strong>'+(a[1].count??0)+'</strong></div><div class="stat-card"><span>Result Entries</span><strong>'+(a[2].count??0)+'</strong></div></div>';
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
 (r.data||[]).map(c=>'<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+ (t.data||[]).filter(x=>(by[c.id]||[]).includes(x.id)).map(x=>esc(x.full_name)).join(", ")||"None"+'</td><td><button class="table-action" data-edit="'+c.id+'">Manage</button></td></tr>').join("")+'</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=()=>classModal();
 document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>classModal(b.dataset.edit));
}
async function classModal(id){
 const cr=await supabase.from("classes").select("*").eq("id",id).single();
 const tr=await supabase.from("profiles").select("id,full_name").eq("role","teacher").order("full_name");
 const ar=await supabase.from("teacher_classes").select("teacher_id").eq("class_id",id);
 const selected=(ar.data||[]).map(x=>x.teacher_id);
 const current=cr.data;
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Teacher Assignment</p><h2>Assign Teacher(s)</h2>'+
 '<p class="muted">Class: <strong>'+esc(current?.name||"")+'</strong></p>'+
 '<div class="teacher-assignment"><span class="field-label">Teachers for this class</span><div class="teacher-checklist">'+
 (tr.data||[]).map(x=>'<label class="teacher-option"><input type="checkbox" name="teacher_ids" value="'+x.id+'" '+(selected.includes(x.id)?"checked":"")+'><span>'+esc(x.full_name)+'</span></label>').join("")+
 '</div></div>'+
 '<small class="muted">Select one or more teachers. Saving will replace the current teacher assignments for this class.</small><button class="btn btn-primary btn-block">Save Assignment</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{e.preventDefault();const ids=[...e.target.querySelectorAll('input[name="teacher_ids"]:checked')].map(x=>x.value);const msg=document.getElementById("msg");const del=await supabase.from("teacher_classes").delete().eq("class_id",id);if(del.error){msg.textContent=del.error.message;msg.className="form-message error";return;}if(ids.length){const add=await supabase.from("teacher_classes").insert(ids.map(teacher_id=>({teacher_id,class_id:id})));if(add.error){msg.textContent=add.error.message;msg.className="form-message error";return;}}document.getElementById("modal-root").innerHTML="";classes();};
}
async function parents(){
 const [p,s,l]=await Promise.all([supabase.from("profiles").select("id,full_name,email").eq("role","parent").order("full_name"),supabase.from("students").select("id,full_name,admission_number").order("full_name"),supabase.from("parent_students").select("parent_id,student_id")]);
 const map={};(l.data||[]).forEach(x=>(map[x.parent_id]??=[]).push(x.student_id));
 content.innerHTML='<div class="page-actions"><div><p class="eyebrow">Parent Management</p><h2>Parents & Children</h2></div><button class="btn btn-primary" id="add">Manage Children</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Parent</th><th>Email</th><th>Children</th></tr></thead><tbody>'+
 (p.data||[]).map(x=>'<tr><td><strong>'+esc(x.full_name)+'</strong></td><td>'+esc(x.email||"—")+'</td><td>'+((map[x.id]||[]).map(id=>(s.data||[]).find(y=>y.id===id)?.full_name).filter(Boolean).map(esc).join(", ")||"No child linked")+'</td></tr>').join("")+'</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=()=>linkModal(p.data||[],s.data||[],l.data||[]);
}
function linkModal(parents,students,links){
 const selectedByParent={};(links||[]).forEach(x=>(selectedByParent[x.parent_id]??=[]).push(x.student_id));
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Parent Relationship</p><h2>Manage Parent Children</h2>'+
 '<label>Parent<select name="parent_id" id="parent_id" required><option value="">Select parent</option>'+parents.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+' — '+esc(x.email||"")+'</option>').join("")+'</select></label>'+
 '<label>Children<select name="student_ids" id="student_ids" multiple size="8">'+students.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+' — '+esc(x.admission_number||"")+'</option>').join("")+'</select></label>'+
 '<small class="muted">Select all children who belong to this parent. Hold Ctrl/Cmd to select multiple.</small>'+
 '<button class="btn btn-primary btn-block">Save Children</button><div id="msg" class="form-message"></div></form></div>';
 const parentSelect=document.getElementById("parent_id");
 const studentSelect=document.getElementById("student_ids");
 const syncSelection=()=>{const ids=new Set(selectedByParent[parentSelect.value]||[]);[...studentSelect.options].forEach(o=>o.selected=ids.has(o.value));};
 parentSelect.onchange=syncSelection;
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{
   e.preventDefault();
   const parentId=parentSelect.value;
   const selected=[...studentSelect.selectedOptions].map(o=>o.value);
   const msg=document.getElementById("msg");
   if(!parentId){msg.textContent="Please select a parent.";return;}
   const current=selectedByParent[parentId]||[];
   const removed=current.filter(id=>!selected.includes(id));
   if(removed.length){
     const del=await supabase.from("parent_students").delete().eq("parent_id",parentId).in("student_id",removed);
     if(del.error){msg.textContent=del.error.message;return;}
   }
   if(selected.length){
     const add=await supabase.from("parent_students").upsert(selected.map(student_id=>({parent_id:parentId,student_id})),{onConflict:"parent_id,student_id"});
     if(add.error){msg.textContent=add.error.message;return;}
   }
   document.getElementById("modal-root").innerHTML="";
   parents();
 };
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