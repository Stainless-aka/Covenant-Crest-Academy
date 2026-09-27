import { supabase, requireUser, getProfile } from "./supabase.js";

const content = document.getElementById("app-content");
const title = document.getElementById("page-title");
const userName = document.getElementById("user-name");
const userRole = document.getElementById("user-role");
const nav = document.getElementById("app-nav");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidebarClose = document.getElementById("sidebar-close");
const menuToggle = document.getElementById("menu-toggle");

let user;
let profile;

const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));

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

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
  sidebarOverlay.setAttribute("aria-hidden", "true");
  menuToggle.setAttribute("aria-label", "Open menu");
}

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.classList.add("open");
  sidebarOverlay.setAttribute("aria-hidden", "false");
  menuToggle.setAttribute("aria-label", "Close menu");
}

function renderNav(role) {
  const links = {
    admin: [
      ["overview", "Overview"],
      ["students", "Students"],
      ["results", "Results"]
    ],
    teacher: [
      ["overview", "Overview"],
      ["results", "Enter Results"]
    ],
    parent: [
      ["overview", "Overview"],
      ["results", "Results"]
    ]
  }[role] || [];

  nav.innerHTML = links.map(([id, label]) =>
    `<a href="#${id}" data-route="${id}">${label}</a>`
  ).join("");

  nav.querySelectorAll("a").forEach(a => {
    a.addEventListener("click", async (e) => {
      closeSidebar();
      if (a.dataset.route === "results") {
        e.preventDefault();
        window.location.href = "./results.html";
        return;
      }
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
  if (routeName === "results") return resultsPage();
  return overviewPage();
}

async function overviewPage() {
  if (profile.role === "admin") {
    const [{ count: students }, { count: results }] = await Promise.all([
      supabase.from("students").select("*", { count:"exact", head:true }),
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
        <div class="stat-card"><span>Result Entries</span><strong>${results ?? 0}</strong></div>
      </div>`;
    return;
  }

  if (profile.role === "teacher") {
    const { data: assignments, error: assignmentError } = await supabase
      .from("teacher_classes")
      .select("class_id, classes(id, name)")
      .eq("teacher_id", user.id);

    if (assignmentError) throw assignmentError;

    const assignedClasses = (assignments || []).map(x => x.classes).filter(Boolean);
    const classIds = assignedClasses.map(c => c.id);

    let students = [];
    if (classIds.length) {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, admission_number, class_id, classes(name)")
        .in("class_id", classIds)
        .order("full_name");

      if (error) throw error;
      students = data || [];
    }

    content.innerHTML = `
      <div class="welcome">
        <div>
          <p class="eyebrow">Teacher Portal</p>
          <h2>Welcome, ${esc(profile.full_name)}.</h2>
          <p>You can only access students in classes assigned to you.</p>
        </div>
      </div>

      <div class="stat-grid teacher-stat-grid">
        <div class="stat-card">
          <div class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 19V9m0 0 8-5 8 5m-16 0h16M7 19v-6h4v6m2 0v-6h4v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <span>Assigned Classes</span><strong>${assignedClasses.length}</strong>
        </div>
        <div class="stat-card">
          <div class="stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20m6-9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm5-6.5a3 3 0 0 1 0 5.8M17 15.2a3.5 3.5 0 0 1 3 3.3V20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></div>
          <span>Your Students</span><strong>${students.length}</strong>
        </div>
      </div>

      <div class="section-heading compact">
        <h2>My Classes</h2>
      </div>

      <div class="teacher-class-grid">
        ${assignedClasses.map(c => `
          <article class="teacher-class-card">
            <div class="class-card-top">
              <div class="class-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 8.5 12 4l8 4.5-8 4.5L4 8.5Zm3 2.2V16l5 3 5-3v-5.3M20 9v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
              <span class="class-label">CLASS</span>
            </div>
            <div>
            <div>
              <h3>${esc(c.name)}</h3>
              <p>${students.filter(s => s.class_id === c.id).length} student(s)</p>
              <a class="class-action" href="./results.html">Enter Results <span aria-hidden="true">→</span></a>
            </div>
          </article>`).join("") ||
          '<div class="empty-state">No classes have been assigned to your account yet.</div>'}
      </div>

      ${students.length ? `
        <div class="section-heading compact"><h2>My Students</h2></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Admission No.</th><th>Class</th></tr></thead>
            <tbody>
              ${students.map(s => `<tr>
                <td><strong>${esc(s.full_name)}</strong></td>
                <td>${esc(s.admission_number || "—")}</td>
                <td>${esc(s.classes?.name || "—")}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>` : ""}
    `;
    return;
  }

  const { data: links } = await supabase
    .from("parent_students")
    .select("student_id, students(id, full_name, admission_number, classes(name))")
    .eq("parent_id", user.id);

  content.innerHTML = `
    <div class="welcome"><div><p class="eyebrow">Parent Portal</p>
    <h2>Welcome, ${esc(profile.full_name)}.</h2>
    <p>View your children's school information and published results.</p></div></div>
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

async function resultsPage() {
  if (profile.role === "parent") {
    const { data: links, error: linkError } = await supabase
      .from("parent_students")
      .select("student_id")
      .eq("parent_id", user.id);
    if (linkError) throw linkError;
    const studentIds = (links || []).map(x => x.student_id);
    if (!studentIds.length) {
      content.innerHTML = '<div class="section-heading"><p class="eyebrow">Academics</p><h2>Published Results</h2></div><div class="empty-state">No children are linked to this parent account yet.</div>';
      return;
    }
    const { data, error } = await supabase
      .from("result_records")
      .select("*, students!inner(full_name), subjects(name), terms(name), academic_sessions(name)")
      .in("student_id", studentIds)
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

menuToggle.onclick = () => {
  if (sidebar.classList.contains("open")) closeSidebar();
  else openSidebar();
};

sidebarClose.onclick = closeSidebar;
sidebarOverlay.onclick = closeSidebar;

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSidebar();
});

window.addEventListener("hashchange", route);
init();
