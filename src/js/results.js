import { supabase, requireUser, getProfile, getReferenceData, clearPortalCache } from "./supabase.js";

const content = document.getElementById("results-content");
const userName = document.getElementById("user-name");
const userRole = document.getElementById("user-role");
const nav = document.getElementById("results-nav");
let user, profile, sessions = [], terms = [], classes = [], subjects = [];

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const grade = n => n >= 80 ? "A" : n >= 70 ? "B" : n >= 60 ? "C" : n >= 50 ? "D" : n >= 40 ? "E" : "F";
const remark = n => n >= 80 ? "Excellent" : n >= 70 ? "Very Good" : n >= 60 ? "Good" : n >= 50 ? "Fair" : n >= 40 ? "Pass" : "Needs Improvement";
const ordinal = n => n % 100 >= 11 && n % 100 <= 13 ? "th" : ({1:"st",2:"nd",3:"rd"}[n % 10] || "th");

async function init() {
  user = await requireUser();
  profile = await getProfile(user.id);
  userName.textContent = profile.full_name;
  userRole.textContent = profile.role.toUpperCase();

  nav.innerHTML = profile.role === "admin"
    ? '<a href="./admin.html">Dashboard</a><a class="active" href="./results.html">Results</a>'
    : '<a href="./dashboard.html">Dashboard</a><a class="active" href="./results.html">Results</a>';

  if (profile.role === "teacher") {
    const [{ sessions: sessionData, terms: termData, subjects: subjectData }, { data: assignments, error }] = await Promise.all([
      getReferenceData({ subjects: true }),
      supabase.from("teacher_classes").select("class_id,classes(id,name)").eq("teacher_id",user.id)
    ]);
    if (error) throw error;
    sessions = sessionData || [];
    terms = termData || [];
    subjects = subjectData || [];
    classes = (assignments || []).map(x => x.classes).filter(Boolean);
    return teacherView();
  }

  const { sessions: sessionData, terms: termData } = await getReferenceData();
  sessions = sessionData || [];
  terms = termData || [];

  if (profile.role === "parent") return parentView();
  return adminView();
}

const select = (id,label,items,selected="") =>
  '<label>'+label+'<select id="'+id+'"><option value="">Select</option>'+
  items.map(x=>'<option value="'+x.id+'" '+(x.id===selected?"selected":"")+'>'+esc(x.name)+'</option>').join("")+
  '</select></label>';

async function teacherView() {
  let allowed = classes;
  if(profile.role === "teacher"){
    const {data,error}=await supabase.from("teacher_classes").select("class_id,classes(id,name)").eq("teacher_id",user.id);
    if(error) throw error;
    allowed=(data||[]).map(x=>x.classes).filter(Boolean);
  }
  if(!allowed.length){content.innerHTML='<div class="empty-state">No classes have been assigned to your account yet.</div>';return;}
  const current=sessions.find(x=>x.is_current)?.id||sessions[0]?.id||"";
  content.innerHTML='<div class="section-heading"><p class="eyebrow">Academics</p><h2>End-of-Term Results</h2><p class="muted">Enter CA and examination scores for a student. Totals and grades are calculated automatically.</p></div>'+
    '<div class="result-toolbar">'+select("session","Academic Session",sessions,current)+select("term","Term",terms,terms[0]?.id||"")+select("class","Class",allowed)+'</div>'+
    '<div class="result-toolbar"><label>Student<select id="student" disabled><option>Select class first</option></select></label></div>'+
    '<div id="entry-area" class="empty-state">Select a class and student to enter results.</div>';
  document.getElementById("class").onchange=loadStudents;
  document.getElementById("student").onchange=loadSheet;
  document.getElementById("session").onchange=loadSheet;
  document.getElementById("term").onchange=loadSheet;
}

async function loadStudents(){
  const classId=document.getElementById("class").value, select=document.getElementById("student");
  select.disabled=!classId;
  select.innerHTML='<option value="">'+(classId?"Select student":"Select class first")+'</option>';
  document.getElementById("entry-area").innerHTML='<div class="empty-state">Select a student to enter results.</div>';
  if(!classId)return;
  const {data,error}=await supabase.from("students").select("id,full_name,admission_number").eq("class_id",classId).order("full_name");
  if(error)return showError(error);
  select.innerHTML+=(data||[]).map(s=>'<option value="'+s.id+'">'+esc(s.full_name)+(s.admission_number?" — "+esc(s.admission_number):"")+'</option>').join("");
}

async function loadSheet(){
  const studentId=document.getElementById("student").value, sessionId=document.getElementById("session").value, termId=document.getElementById("term").value, area=document.getElementById("entry-area");
  if(!studentId||!sessionId||!termId){area.innerHTML='<div class="empty-state">Select student, session and term.</div>';return;}
  const [{data:student},{data:existing,error}]=await Promise.all([
    supabase.from("students").select("id,full_name,admission_number,classes(name)").eq("id",studentId).single(),
    supabase.from("result_records").select("*").eq("student_id",studentId).eq("session_id",sessionId).eq("term_id",termId)
  ]);
  if(error)return showError(error);
  const map=Object.fromEntries((existing||[]).map(r=>[r.subject_id,r]));
  const {data:summary}=await supabase.from("result_summaries").select("teacher_remark,submitted_for_review,published").eq("student_id",studentId).eq("session_id",sessionId).eq("term_id",termId).maybeSingle();
  area.innerHTML='<div class="result-sheet-header"><div><p class="eyebrow">'+esc(student.classes?.name||"Class")+'</p><h2>'+esc(student.full_name)+'</h2><p class="muted">'+esc(student.admission_number||"")+'</p></div><span class="status">Draft</span></div>'+
    '<div class="table-wrap result-entry-table"><table><thead><tr><th>Subject</th><th>CA / 40</th><th>Exam / 60</th><th>Total</th><th>Grade</th><th>Remark</th></tr></thead><tbody>'+
    subjects.map(s=>{const r=map[s.id]||{},total=Number(r.ca_score||0)+Number(r.exam_score||0);return '<tr data-subject="'+s.id+'"><td><strong>'+esc(s.name)+'</strong></td><td><input class="score-input ca" type="number" min="0" max="40" step="0.5" value="'+(r.ca_score??"")+'"></td><td><input class="score-input exam" type="number" min="0" max="60" step="0.5" value="'+(r.exam_score??"")+'"></td><td class="row-total"><strong>'+total+'</strong></td><td class="row-grade">'+grade(total)+'</td><td class="row-remark">'+remark(total)+'</td></tr>';}).join("")+
    '</tbody></table></div><div class="result-summary-form"><label>Teacher\'s Overall Remark<textarea id="teacher-remark" rows="3" placeholder="Enter an overall remark...">'+esc(summary?.teacher_remark||"")+'</textarea></label><div class="result-form-actions"><button class="btn btn-light" id="save-draft" type="button">Save Draft</button><button class="btn btn-primary" id="submit-review" type="button">Submit for Review</button></div><div id="save-message" class="form-message"></div></div>';
  area.querySelectorAll(".score-input").forEach(i=>i.oninput=()=>updateRow(i.closest("tr")));
  document.getElementById("save-draft").onclick=()=>saveSheet(false);
  document.getElementById("submit-review").onclick=()=>saveSheet(true);
}

function updateRow(row){
  const ca=Math.min(40,Math.max(0,Number(row.querySelector(".ca").value||0))), exam=Math.min(60,Math.max(0,Number(row.querySelector(".exam").value||0))), total=ca+exam;
  row.querySelector(".row-total").innerHTML="<strong>"+total+"</strong>";
  row.querySelector(".row-grade").textContent=grade(total);
  row.querySelector(".row-remark").textContent=remark(total);
}

async function saveSheet(submitForReview=false){
  const msg=document.getElementById("save-message"), draftButton=document.getElementById("save-draft"), submitButton=document.getElementById("submit-review");
  const button=submitForReview?submitButton:draftButton;
  const studentId=document.getElementById("student").value, sessionId=document.getElementById("session").value, termId=document.getElementById("term").value, classId=document.getElementById("class").value;
  const teacherRemark=document.getElementById("teacher-remark").value.trim();
  button.disabled=true;msg.textContent="Saving...";
  const payload=[...document.querySelectorAll("[data-subject]")].map(row=>{
    const ca=Number(row.querySelector(".ca").value||0),exam=Number(row.querySelector(".exam").value||0),total=ca+exam;
    return {student_id:studentId,subject_id:row.dataset.subject,session_id:sessionId,term_id:termId,teacher_id:user.id,ca_score:ca,exam_score:exam,total_score:total,grade:grade(total),remark:remark(total),published:false};
  });
  const {error}=await supabase.from("result_records").upsert(payload,{onConflict:"student_id,subject_id,session_id,term_id"});
  if(error){msg.textContent=error.message;msg.className="form-message error";button.disabled=false;return;}
  const {data:students,error:studentError}=await supabase.from("students").select("id").eq("class_id",classId);
  if(studentError){msg.textContent=studentError.message;msg.className="form-message error";button.disabled=false;return;}
  const ids=(students||[]).map(x=>x.id);
  const {data:scores,error:scoreError}=await supabase.from("result_records").select("student_id,total_score").eq("session_id",sessionId).eq("term_id",termId).in("student_id",ids);
  if(scoreError){msg.textContent=scoreError.message;msg.className="form-message error";button.disabled=false;return;}
  const by={};(scores||[]).forEach(r=>(by[r.student_id]??=[]).push(Number(r.total_score)));
  const complete=Object.entries(by).filter(([,v])=>v.length>=subjects.length).map(([id,v])=>({id,average:v.reduce((a,b)=>a+b,0)/subjects.length})).sort((a,b)=>b.average-a.average);
  const ranks=new Map();let prev=null,rank=0;complete.forEach((x,i)=>{if(x.average!==prev)rank=i+1;ranks.set(x.id,rank);prev=x.average;});
  const summaries=complete.map(x=>({student_id:x.id,session_id:sessionId,term_id:termId,class_id:classId,average:Number(x.average.toFixed(2)),position:ranks.get(x.id)}));
  const current=summaries.find(x=>x.student_id===studentId);
  if(current)current.teacher_remark=teacherRemark;
  else summaries.push({student_id:studentId,session_id:sessionId,term_id:termId,class_id:classId,average:Number((payload.reduce((a,r)=>a+r.total_score,0)/Math.max(payload.length,1)).toFixed(2)),position:null,teacher_remark:teacherRemark});
  const {error:summaryError}=await supabase.from("result_summaries").upsert(summaries,{onConflict:"student_id,session_id,term_id"});
  if(summaryError){button.disabled=false;msg.textContent=summaryError.message;msg.className="form-message error";return;}
  if(submitForReview){
    const {error:submitError}=await supabase.from("result_summaries").update({submitted_for_review:true,submitted_at:new Date().toISOString()}).eq("student_id",studentId).eq("session_id",sessionId).eq("term_id",termId);
    if(submitError){button.disabled=false;msg.textContent=submitError.message;msg.className="form-message error";return;}
  }
  draftButton.disabled=false;submitButton.disabled=false;
  msg.textContent=submitForReview?"Result sheet submitted to the administrator for review.":"Draft saved. The result has not been submitted or published.";
  msg.className="form-message success";
  await loadSheet();
}

async function adminView(){
  const current=sessions.find(x=>x.is_current)?.id||sessions[0]?.id||"";
  content.innerHTML='<div class="section-heading"><p class="eyebrow">Administration</p><h2>Result Publishing</h2><p class="muted">Review completed result sheets and publish them to parent accounts.</p></div>'+
    '<div class="result-toolbar">'+select("session","Academic Session",sessions,current)+select("term","Term",terms,terms[0]?.id||"")+'</div><div id="admin-results"></div>';
  document.getElementById("session").onchange=renderAdmin;
  document.getElementById("term").onchange=renderAdmin;
  await renderAdmin();
}

async function renderAdmin(){
  const sessionId=document.getElementById("session").value, termId=document.getElementById("term").value, box=document.getElementById("admin-results");
  const {data,error}=await supabase.from("result_summaries").select("id,student_id,average,position,teacher_remark,published,submitted_for_review,submitted_at,students(full_name,admission_number,classes(name))").eq("session_id",sessionId).eq("term_id",termId).order("submitted_for_review",{ascending:false}).order("average",{ascending:false});
  if(error){box.innerHTML='<div class="empty-state">'+esc(error.message)+'</div>';return;}
  const pending=(data||[]).filter(x=>x.submitted_for_review&&!x.published).length;
  box.innerHTML='<div class="review-banner"><div><strong>'+pending+' result sheet'+(pending===1?"":"s")+' awaiting review</strong><span>Teachers must submit results before they can be published to parents.</span></div></div>'+
    '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Average</th><th>Position</th><th>Status</th><th>Action</th></tr></thead><tbody>'+
    (data||[]).map(x=>{
      const status=x.published?"Published":x.submitted_for_review?"Awaiting Review":"Draft";
      return '<tr><td><strong>'+esc(x.students?.full_name)+'</strong><br><small>'+esc(x.students?.admission_number||"")+'</small></td><td>'+esc(x.students?.classes?.name||"—")+'</td><td>'+Number(x.average).toFixed(1)+'%</td><td>'+ (x.position?x.position+ordinal(x.position):"—")+'</td><td><span class="status '+(x.published?"paid":x.submitted_for_review?"review-status":"")+'">'+status+'</span></td><td><button class="table-action" data-review="'+x.id+'" data-student="'+x.student_id+'" data-published="'+x.published+'">'+(x.published?"View":"Review")+'</button></td></tr>';
    }).join("")+
    '</tbody></table></div><div id="review-modal-root"></div>';
  box.querySelectorAll("[data-review]").forEach(button=>button.onclick=()=>reviewResult(button.dataset.review,button.dataset.student,sessionId,termId,button.dataset.published==="true"));
}

async function reviewResult(summaryId,studentId,sessionId,termId,published){
  const [{data:summary,error:summaryError},{data:rows,error:rowsError}]=await Promise.all([
    supabase.from("result_summaries").select("average,position,teacher_remark,submitted_for_review,submitted_at,published,students(full_name,admission_number,classes(name))").eq("id",summaryId).single(),
    supabase.from("result_records").select("subject_id,ca_score,exam_score,total_score,grade,remark,subjects(name)").eq("student_id",studentId).eq("session_id",sessionId).eq("term_id",termId).order("subjects(name)")
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
    renderAdmin();
  });
}

async function parentView(){
  const {data:links,error}=await supabase.from("parent_students").select("student_id,students(id,full_name,admission_number,classes(name))").eq("parent_id",user.id);
  if(error)throw error;
  window.parentLinks=links||[];
  const current=sessions.find(x=>x.is_current)?.id||sessions[0]?.id||"";
  content.innerHTML='<div class="section-heading"><p class="eyebrow">Parent Portal</p><h2>End-of-Term Results</h2><p class="muted">Only results published by the school are shown here.</p></div>'+
    '<div class="result-toolbar">'+select("session","Academic Session",sessions,current)+select("term","Term",terms,terms[0]?.id||"")+'</div><div id="parent-results"></div>';
  document.getElementById("session").onchange=renderParent;
  document.getElementById("term").onchange=renderParent;
  renderParent();
}

async function renderParent(){
  const ids=window.parentLinks.map(x=>x.student_id),sessionId=document.getElementById("session").value,termId=document.getElementById("term").value,box=document.getElementById("parent-results");
  if(!ids.length){box.innerHTML='<div class="empty-state">No children are linked to this parent account.</div>';return;}
  const [r,s]=await Promise.all([
    supabase.from("result_records").select("student_id,ca_score,exam_score,total_score,grade,subjects(name)").in("student_id",ids).eq("session_id",sessionId).eq("term_id",termId).eq("published",true),
    supabase.from("result_summaries").select("student_id,average,position,teacher_remark").in("student_id",ids).eq("session_id",sessionId).eq("term_id",termId).eq("published",true)
  ]);
  if(r.error||s.error){box.innerHTML='<div class="empty-state">'+esc((r.error||s.error).message)+'</div>';return;}
  const summaries=Object.fromEntries((s.data||[]).map(x=>[x.student_id,x]));
  box.innerHTML=window.parentLinks.map(link=>{
    const st=link.students,rows=(r.data||[]).filter(x=>x.student_id===st.id),sum=summaries[st.id];
    return '<article class="report-card"><div class="report-card-head"><div><p class="eyebrow">'+esc(st.classes?.name||"Class")+'</p><h2>'+esc(st.full_name)+'</h2><small>'+esc(st.admission_number||"")+'</small></div><div class="report-stat"><span>Average</span><strong>'+(sum?Number(sum.average).toFixed(1)+"%":"—")+'</strong></div></div>'+
      (rows.length?'<div class="table-wrap"><table><thead><tr><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.subjects?.name)+'</td><td>'+x.ca_score+'</td><td>'+x.exam_score+'</td><td><strong>'+x.total_score+'</strong></td><td>'+esc(x.grade)+'</td></tr>').join("")+'</tbody></table></div><div class="report-footer"><span>Position: <strong>'+(sum?.position?sum.position+ordinal(sum.position):"—")+'</strong></span><span>Remark: <strong>'+esc(sum?.teacher_remark||"—")+'</strong></span></div>':'<div class="empty-state">No published result for this term.</div>')+'</article>';
  }).join("");
}

function showError(e){content.innerHTML='<div class="empty-state">'+esc(e.message)+'</div>';}
document.getElementById("logout").onclick=async()=>{await supabase.auth.signOut();location.href="./login.html";};
document.getElementById("menu-toggle").onclick=()=>document.getElementById("sidebar").classList.toggle("open");
init().catch(showError);
