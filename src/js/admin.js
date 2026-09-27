import { supabase, requireUser, getProfile, getReferenceData, clearPortalCache } from "./supabase.js";

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
  const page = r === "results.html" ? "results" : r;
  nav.querySelectorAll("a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+page || (page==="results" && a.getAttribute("href")==="./results.html")));
  title.textContent={overview:"Dashboard",students:"Students",classes:"Classes",results:"Results",parents:"Parents"}[page]||"Dashboard";
  if(page==="students")return students();
  if(page==="classes")return classes();
  if(page==="results")return results();
  if(page==="parents")return parents();
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
 const [{ data:rData, error:rError }, { data:tData, error:tError }, { data:assignData, error:assignError }] = await Promise.all([
  supabase.from("classes").select("id,name").order("name"),
  supabase.from("profiles").select("id,full_name").eq("role","teacher").order("full_name"),
  supabase.from("teacher_classes").select("teacher_id,class_id")
 ]);
 if(rError||tError||assignError)return showError(rError||tError||assignError);
 const r={data:rData||[]}, t={data:tData||[]}, assigns={data:assignData||[]};
 const by={};(assigns.data||[]).forEach(x=>(by[x.class_id]??=[]).push(x.teacher_id));
 const teacherById={};(t.data||[]).forEach(x=>teacherById[x.id]=x.full_name);
 content.innerHTML='<div class="page-actions"><div><p class="eyebrow">Academic Structure</p><h2>Classes</h2><p class="muted">Create classes and assign a teacher to each class.</p></div><button class="btn btn-primary" id="add">Add Class</button></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Class</th><th>Teacher</th><th></th></tr></thead><tbody>'+
 (r.data||[]).map(c=>{const ids=by[c.id]||[];const names=ids.map(id=>teacherById[id]).filter(Boolean);return '<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(names[0]||"Not assigned")+'</td><td><button class="table-action" data-assign="'+c.id+'">Assign Teacher</button></td></tr>';}).join("")+'</tbody></table></div><div id="modal-root"></div>';
 document.getElementById("add").onclick=()=>addClassModal(t.data||[]);
 document.querySelectorAll("[data-assign]").forEach(b=>b.onclick=()=>assignTeacherModal(b.dataset.assign));
}
function addClassModal(teachers){
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Class Management</p><h2>Add Class</h2>'+
 '<label>Class name<input name="name" placeholder="e.g. Primary 7" required></label>'+
 '<label>Assign teacher<select name="teacher_id"><option value="">No teacher yet</option>'+teachers.map(x=>'<option value="'+x.id+'">'+esc(x.full_name)+'</option>').join("")+'</select></label>'+
 '<small class="muted">You can assign a teacher now or assign one later from the Classes list.</small>'+
 '<button class="btn btn-primary btn-block">Add Class</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{
   e.preventDefault();
   const fd=new FormData(e.target);
   const name=String(fd.get("name")||"").trim();
   const teacherId=String(fd.get("teacher_id")||"");
   const msg=document.getElementById("msg");
   const r=await supabase.from("classes").insert({name}).select().single();
   if(r.error){msg.textContent=r.error.message;msg.className="form-message error";return;}
   if(teacherId){
     const add=await supabase.from("teacher_classes").insert({teacher_id:teacherId,class_id:r.data.id});
     if(add.error){msg.textContent=add.error.message;msg.className="form-message error";return;}
   }
   document.getElementById("modal-root").innerHTML="";
   classes();
 };
}
async function assignTeacherModal(classId){
 const cr=await supabase.from("classes").select("id,name").eq("id",classId).single();
 const tr=await supabase.from("profiles").select("id,full_name").eq("role","teacher").order("full_name");
 const ar=await supabase.from("teacher_classes").select("teacher_id").eq("class_id",classId).limit(1);
 const selected=ar.data?.[0]?.teacher_id||"";
 if(cr.error)return showError(cr.error);
 document.getElementById("modal-root").innerHTML='<div class="modal-backdrop"><form class="modal" id="form"><button type="button" class="modal-close" id="close">×</button><p class="eyebrow">Teacher Assignment</p><h2>Assign Teacher</h2>'+
 '<p class="muted">Class: <strong>'+esc(cr.data.name)+'</strong></p>'+
 '<label>Teacher<select name="teacher_id" required><option value="">Select teacher</option>'+tr.data.map(x=>'<option value="'+x.id+'" '+(x.id===selected?"selected":"")+'>'+esc(x.full_name)+'</option>').join("")+'</select></label>'+
 '<small class="muted">Selecting a new teacher will replace the current teacher for this class.</small>'+
 '<button class="btn btn-primary btn-block">Save Assignment</button><div id="msg" class="form-message"></div></form></div>';
 document.getElementById("close").onclick=()=>document.getElementById("modal-root").innerHTML="";
 document.getElementById("form").onsubmit=async e=>{
   e.preventDefault();
   const teacherId=new FormData(e.target).get("teacher_id");
   const msg=document.getElementById("msg");
   const del=await supabase.from("teacher_classes").delete().eq("class_id",classId);
   if(del.error){msg.textContent=del.error.message;msg.className="form-message error";return;}
   const add=await supabase.from("teacher_classes").insert({teacher_id:teacherId,class_id:classId});
   if(add.error){msg.textContent=add.error.message;msg.className="form-message error";return;}
   document.getElementById("modal-root").innerHTML="";
   classes();
 };
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
 const { sessions: current, terms: termsList } = await getReferenceData();
 const sessionId=current.find(x=>x.is_current)?.id||current[0]?.id||"";
 const termId=termsList[0]?.id||"";
 content.innerHTML='<div class="section-heading"><p class="eyebrow">Administration</p><h2>Result Review</h2><p class="muted">Review teacher-submitted result sheets before they are published to parents.</p></div>'+
 '<div class="result-toolbar"><label>Academic Session<select id="result-session"><option value="">Select</option>'+current.map(x=>'<option value="'+x.id+'" '+(x.id===sessionId?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label>'+
 '<label>Term<select id="result-term"><option value="">Select</option>'+termsList.map(x=>'<option value="'+x.id+'" '+(x.id===termId?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select></label></div><div id="admin-results"></div>';
 document.getElementById("result-session").onchange=renderAdminResults;
 document.getElementById("result-term").onchange=renderAdminResults;
 await renderAdminResults();
}
async function renderAdminResults(){
 const sessionId=document.getElementById("result-session").value,termId=document.getElementById("result-term").value,box=document.getElementById("admin-results");
 if(!sessionId||!termId){box.innerHTML='<div class="empty-state">Select an academic session and term.</div>';return;}
 const {data,error}=await supabase.from("result_summaries").select("id,student_id,average,position,teacher_remark,published,submitted_for_review,submitted_at,students(full_name,admission_number,classes(name))").eq("session_id",sessionId).eq("term_id",termId).order("submitted_for_review",{ascending:false}).order("average",{ascending:false});
 if(error){box.innerHTML='<div class="empty-state">'+esc(error.message)+'</div>';return;}
 const pending=(data||[]).filter(x=>x.submitted_for_review&&!x.published).length;
 box.innerHTML='<div class="review-banner"><div><strong>'+pending+' result sheet'+(pending===1?"":"s")+' awaiting review</strong><span>Teachers must submit results before they can be published to parents.</span></div></div>'+
 '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Average</th><th>Position</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
 (data||[]).map(x=>{const status=x.published?"Published":x.submitted_for_review?"Awaiting Review":"Draft";return '<tr><td><strong>'+esc(x.students?.full_name)+'</strong><br><small>'+esc(x.students?.admission_number||"")+'</small></td><td>'+esc(x.students?.classes?.name||"—")+'</td><td>'+Number(x.average).toFixed(1)+'%</td><td>'+ (x.position?x.position+ordinal(x.position):"—")+'</td><td><span class="status '+(x.published?"paid":x.submitted_for_review?"review-status":"")+'">'+status+'</span></td><td><button class="table-action" data-review="'+x.id+'" data-student="'+x.student_id+'" data-published="'+x.published+'">'+(x.published?"View":"Review")+'</button></td></tr>';}).join("")+
 '</tbody></table></div><div id="review-modal-root"></div>';
 box.querySelectorAll("[data-review]").forEach(button=>button.onclick=()=>reviewAdminResult(button.dataset.review,button.dataset.student,sessionId,termId,button.dataset.published==="true"));
}
async function reviewAdminResult(summaryId,studentId,sessionId,termId,published){
 const [{data:summary,error:summaryError},{data:rows,error:rowsError}]=await Promise.all([
  supabase.from("result_summaries").select("average,position,teacher_remark,published,students(full_name,admission_number,classes(name))").eq("id",summaryId).single(),
  supabase.from("result_records").select("ca_score,exam_score,total_score,grade,remark,subjects(name)").eq("student_id",studentId).eq("session_id",sessionId).eq("term_id",termId).order("subjects(name)")
 ]);
 if(summaryError||rowsError){alert((summaryError||rowsError).message);return;}
 document.getElementById("review-modal-root").innerHTML='<div class="modal-backdrop"><div class="modal review-modal"><button type="button" class="modal-close" id="review-close">×</button><p class="eyebrow">Result Review</p><h2>'+esc(summary.students?.full_name)+'</h2><p class="muted">'+esc(summary.students?.classes?.name||"Class")+' · Average '+Number(summary.average).toFixed(1)+'% · Position '+(summary.position?summary.position+ordinal(summary.position):"—")+'</p><div class="table-wrap"><table><thead><tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Remark</th></tr></thead><tbody>'+
 (rows||[]).map(r=>'<tr><td>'+esc(r.subjects?.name)+'</td><td>'+r.ca_score+'</td><td>'+r.exam_score+'</td><td><strong>'+r.total_score+'</strong></td><td>'+esc(r.grade)+'</td><td>'+esc(r.remark)+'</td></tr>').join("")+
 '</tbody></table></div><div class="review-remark"><strong>Teacher\'s Overall Remark</strong><p>'+esc(summary.teacher_remark||"No overall remark provided.")+'</p></div>'+
 (published?'<div class="review-footer"><span class="status paid">Published to parents</span><button class="btn btn-light" id="review-close-2">Close</button></div>':'<div class="review-footer"><span class="muted">Publishing makes this result visible to the linked parent account.</span><button class="btn btn-primary" id="publish-reviewed">Publish to Parents</button></div>')+
 '</div></div>';
 document.getElementById("review-close").onclick=()=>document.getElementById("review-modal-root").innerHTML="";
 document.getElementById("review-close-2")?.addEventListener("click",()=>document.getElementById("review-modal-root").innerHTML="");
 document.getElementById("publish-reviewed")?.addEventListener("click",async()=>{
  const button=document.getElementById("publish-reviewed");button.disabled=true;button.textContent="Publishing...";
  const r1=await supabase.from("result_records").update({published:true}).eq("student_id",studentId).eq("session_id",sessionId).eq("term_id",termId);
  if(r1.error){alert(r1.error.message);button.disabled=false;button.textContent="Publish to Parents";return;}
  const r2=await supabase.from("result_summaries").update({published:true,reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq("id",summaryId);
  if(r2.error){alert(r2.error.message);button.disabled=false;button.textContent="Publish to Parents";return;}
  document.getElementById("review-modal-root").innerHTML="";
  renderAdminResults();
 });
}

function showError(e){content.innerHTML='<div class="empty-state">'+esc(e.message)+'</div>';}
document.getElementById("logout").onclick=async()=>{clearPortalCache();await supabase.auth.signOut();location.href="./login.html";};
document.getElementById("menu-toggle").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
window.addEventListener("hashchange",route);
init();