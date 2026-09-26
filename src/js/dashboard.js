import { supabase, requireUser, getProfile } from "./supabase.js";

const content = document.getElementById("app-content");
const title = document.getElementById("page-title");
const userName = document.getElementById("user-name");
const userRole = document.getElementById("user-role");
const nav = document.getElementById("app-nav");

let user;
let profile;

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

const money = value =>
  new Intl.NumberFormat("en-NG", { style:"currency", currency:"NGN", maximumFractionDigits:0 }).format(Number(value || 0));

async function init() {
  try {
    user = await requireUser();
    profile = await getProfile(user.id);

    if (profile.role === "admin") {
      window.location.href = "./admin.html";
      return;
    }

    userName.textContent = profile.full_name;
    userRole.textContent = profile.role.toUpperCase();
    renderNav(profile.role);
    await route();
  } catch (error) {
    console.error(error);
    content.innerHTML = `<div class="empty-state">Unable to load your account. Check your profile setup.</div>`;
  }
}

function renderNav(role) {
  const links = {
    admin: [
      ["overview", "Overview"],
      ["students", "Students"],
      ["fees", "School Fees"],
      ["results", "Results"]
    ],
    teacher: [
      ["overview", "Overview"],
      ["results", "Enter Results"]
    ],
    parent: [
      ["overview", "Overview"],
      ["fees", "School Fees"],
      ["results", "Results"]
    ]
  }[role] || [];

  nav.innerHTML = links.map(([id, label]) =>
    `<a href="#${id}" data-route="${id}">${label}</a>`
  ).join("");

  nav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      location.hash = a.dataset.route;
      await route();
    });
  });
}

async function route() {
  const routeName = location.hash.replace("#", "") || "overview";
  document.querySelectorAll("[data-route]").forEach(a =>
    a.classList.toggle("active", a.dataset.route === routeName)
  );

  title.textContent = routeName === "overview" ? "Dashboard" :
    routeName[0].toUpperCase() + routeName.slice(1);

  if (routeName === "students" && profile.role === "admin") return studentsPage();
  if (routeName === "fees") return feesPage();
  if (routeName === "results") return resultsPage();
  return overviewPage();
}

async function overviewPage() {
  if (profile.role === "admin") {
    const [{ count: students }, { count: payments }, { count: results }] = await Promise.all([
      supabase.from("students").select("*", { count:"exact", head:true }),
      supabase.from("payments").select("*", { count:"exact", head:true }),
      supabase.from("result_records").select("*", { count:"exact", head:true })
    ]);

    content.innerHTML = `
      <div class="welcome">
        <div><p class="eyebrow">Administration</p><h2>Good day, ${esc(profile.full_name)}.</h2>
        <p>Manage the core school records from one place.</p></div>
        <img src="./public/images/logo.jpg" alt="">
      </div>
      <div class="stat-grid">
        <div class="stat-card"><span>Students</span><strong>${students ?? 0}</strong></div>
        <div class="stat-card"><span>Payments</span><strong>${payments ?? 0}</strong></div>
        <div class="stat-card"><span>Result Entries</span><strong>${results ?? 0}</strong></div>
      </div>`;
    return;
  }

  if (profile.role === "teacher") {
    content.innerHTML = `
      <div class="welcome"><div><p class="eyebrow">Teacher Portal</p>
      <h2>Welcome, ${esc(profile.full_name)}.</h2>
      <p>Enter and review academic results for your students.</p></div></div>
      <div class="quick-grid">
        <a class="quick-card" href="#results"><span>Results</span><strong>Enter scores →</strong></a>
      </div>`;
    return;
  }

  const { data: links } = await supabase
    .from("parent_students")
    .select("student_id, students(id, full_name, admission_number, classes(name))")
    .eq("parent_id", user.id);

  content.innerHTML = `
    <div class="welcome"><div><p class="eyebrow">Parent Portal</p>
    <h2>Welcome, ${esc(profile.full_name)}.</h2>
    <p>View your children's school information, fees and published results.</p></div></div>
    <div class="section-heading compact"><h2>My Children</h2></div>
    <div class="student-grid">
      ${(links || []).map(x => `
        <article class="student-card">
          <div class="avatar">${esc((x.students.full_name || "?")[0])}</div>
          <div><h3>${esc(x.students.full_name)}</h3>
          <p>${esc(x.students.classes?.name || "Class not assigned")}</p>
          <small>Admission: ${esc(x.students.admission_number || "—")}</small></div>
        </article>`).join("") || `<div class="empty-state">No children are linked to this parent account yet.</div>`}
    </div>`;
}

async function studentsPage() {
  const { data, error } = await supabase
    .from("students")
    .select("*, classes(name)")
    .order("created_at", { ascending:false });

  if (error) throw error;

  content.innerHTML = `
    <div class="page-actions">
      <div><p class="eyebrow">Student Management</p><h2>Students</h2></div>
      <button class="btn btn-primary" id="new-student">Register Student</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Admission No.</th><th>Class</th><th>Gender</th></tr></thead>
        <tbody>${(data || []).map(s => `<tr>
          <td><strong>${esc(s.full_name)}</strong></td>
          <td>${esc(s.admission_number || "—")}</td>
          <td>${esc(s.classes?.name || "—")}</td>
          <td>${esc(s.gender || "—")}</td>
        </tr>`).join("") || `<tr><td colspan="4">No students registered.</td></tr>`}</tbody>
      </table>
    </div>
    <div id="modal-root"></div>`;

  document.getElementById("new-student").onclick = openStudentModal;
}

async function openStudentModal() {
  const { data: classes } = await supabase.from("classes").select("*").order("name");
  document.getElementById("modal-root").innerHTML = `
    <div class="modal-backdrop">
      <form class="modal" id="student-form">
        <button type="button" class="modal-close" id="close-modal">×</button>
        <p class="eyebrow">Registration</p><h2>Register Student</h2>
        <label>Full name<input name="full_name" required></label>
        <label>Admission number<input name="admission_number"></label>
        <label>Date of birth<input name="date_of_birth" type="date"></label>
        <label>Gender<select name="gender"><option value="">Select</option><option>Male</option><option>Female</option></select></label>
        <label>Class<select name="class_id" required><option value="">Select class</option>
          ${(classes || []).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}
        </select></label>
        <button class="btn btn-primary btn-block" type="submit">Register Student</button>
        <div id="modal-message" class="form-message"></div>
      </form>
    </div>`;
  document.getElementById("close-modal").onclick = () => document.getElementById("modal-root").innerHTML = "";
  document.getElementById("student-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    if (!payload.class_id) delete payload.class_id;
    const { error } = await supabase.from("students").insert({
      ...payload,
      class_id: payload.class_id || null
    });
    const msg = document.getElementById("modal-message");
    if (error) { msg.textContent = error.message; msg.className = "form-message error"; return; }
    document.getElementById("modal-root").innerHTML = "";
    studentsPage();
  };
}

async function feesPage() {
  if (profile.role === "parent") {
    const { data, error } = await supabase
      .from("fee_assignments")
      .select("id, amount_due, amount_paid, balance, fee_structures(description, term, academic_sessions(name)), students!inner(id, full_name)")
      .eq("parent_id", user.id)
      .order("created_at", { ascending:false });
    if (error) throw error;
    content.innerHTML = `
      <div class="section-heading"><p class="eyebrow">Finance</p><h2>School Fees</h2></div>
      <div class="fee-grid">${(data || []).map(f => `
        <article class="fee-card">
          <p class="muted">${esc(f.students.full_name)}</p>
          <h3>${esc(f.fee_structures?.description || "School Fee")}</h3>
          <small>${esc(f.fee_structures?.term || "")} · ${esc(f.fee_structures?.academic_sessions?.name || "")}</small>
          <div class="fee-row"><span>Due</span><strong>${money(f.amount_due)}</strong></div>
          <div class="fee-row"><span>Paid</span><strong>${money(f.amount_paid)}</strong></div>
          <div class="fee-row balance"><span>Balance</span><strong>${money(f.balance)}</strong></div>
        </article>`).join("") || `<div class="empty-state">No fee assignments found.</div>`}</div>`;
    return;
  }

  const { data, error } = await supabase
    .from("payments")
    .select("*, students(full_name), fee_structures(description, term)")
    .order("paid_at", { ascending:false });
  if (error) throw error;

  content.innerHTML = `
    <div class="section-heading"><p class="eyebrow">Finance</p><h2>Payment Records</h2></div>
    <div class="table-wrap"><table><thead><tr><th>Student</th><th>Fee</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
    <tbody>${(data || []).map(p => `<tr>
      <td>${esc(p.students?.full_name || "—")}</td>
      <td>${esc(p.fee_structures?.description || "—")}</td>
      <td>${money(p.amount)}</td><td><span class="status ${p.status}">${esc(p.status)}</span></td>
      <td>${p.paid_at ? new Date(p.paid_at).toLocaleDateString("en-NG") : "—"}</td>
    </tr>`).join("") || `<tr><td colspan="5">No payments recorded.</td></tr>`}</tbody></table></div>`;
}

async function resultsPage() {
  if (profile.role === "parent") {
    const { data, error } = await supabase
      .from("result_records")
      .select("*, students!inner(full_name), subjects(name), terms(name), academic_sessions(name)")
      .eq("students.parent_id", user.id)
      .eq("published", true)
      .order("created_at", { ascending:false });
    if (error) throw error;
    content.innerHTML = `
      <div class="section-heading"><p class="eyebrow">Academics</p><h2>Published Results</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Student</th><th>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th></tr></thead>
      <tbody>${(data || []).map(r => `<tr>
        <td>${esc(r.students?.full_name || "—")}</td><td>${esc(r.subjects?.name || "—")}</td>
        <td>${r.ca_score}</td><td>${r.exam_score}</td><td><strong>${r.total_score}</strong></td><td>${esc(r.grade)}</td>
      </tr>`).join("") || `<tr><td colspan="6">No published results found.</td></tr>`}</tbody></table></div>`;
    return;
  }

  const { data: students } = await supabase.from("students").select("id, full_name").order("full_name");
  const { data: subjects } = await supabase.from("subjects").select("*").order("name");
  const { data: terms } = await supabase.from("terms").select("*").order("name");
  const { data: sessions } = await supabase.from("academic_sessions").select("*").order("name", { ascending:false });

  content.innerHTML = `
    <div class="section-heading"><p class="eyebrow">Academics</p><h2>Enter Result</h2></div>
    <form class="result-form" id="result-form">
      <label>Student<select name="student_id" required><option value="">Select student</option>${(students||[]).map(s=>`<option value="${s.id}">${esc(s.full_name)}</option>`).join("")}</select></label>
      <label>Subject<select name="subject_id" required><option value="">Select subject</option>${(subjects||[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
      <label>Session<select name="session_id" required><option value="">Select session</option>${(sessions||[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></label>
      <label>Term<select name="term_id" required><option value="">Select term</option>${(terms||[]).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label>
      <label>CA score<input name="ca_score" type="number" min="0" max="40" required></label>
      <label>Exam score<input name="exam_score" type="number" min="0" max="60" required></label>
      <label>Remark<textarea name="remark" rows="3"></textarea></label>
      <button class="btn btn-primary" type="submit">Save Result</button>
      <div id="result-message" class="form-message"></div>
    </form>`;
  document.getElementById("result-form").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const p = Object.fromEntries(fd.entries());
    const ca = Number(p.ca_score), exam = Number(p.exam_score), total = ca + exam;
    const grade = total >= 80 ? "A" : total >= 70 ? "B" : total >= 60 ? "C" : total >= 50 ? "D" : "F";
    const { error } = await supabase.from("result_records").upsert({
      student_id: p.student_id, subject_id: p.subject_id, session_id: p.session_id,
      term_id: p.term_id, ca_score: ca, exam_score: exam, total_score: total,
      grade, remark: p.remark, teacher_id: user.id, published: false
    }, { onConflict: "student_id,subject_id,session_id,term_id" });
    const msg = document.getElementById("result-message");
    if (error) { msg.textContent = error.message; msg.className = "form-message error"; }
    else { msg.textContent = `Saved. Total: ${total}, Grade: ${grade}.`; msg.className = "form-message success"; }
  };
}

document.getElementById("logout").onclick = async () => {
  await supabase.auth.signOut();
  window.location.href = "./login.html";
};

document.getElementById("menu-toggle").onclick = () => {
  document.getElementById("sidebar").classList.toggle("open");
};

window.addEventListener("hashchange", route);
init();
