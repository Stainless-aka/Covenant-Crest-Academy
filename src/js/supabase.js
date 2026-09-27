import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CACHE_PREFIX = "cca_portal_";
const PROFILE_TTL = 30 * 1000;
const REFERENCE_TTL = 5 * 60 * 1000;
const RELATION_TTL = 60 * 1000;

function readCache(key, ttl) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (!item || Date.now() - item.time > ttl) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return item.value;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ time: Date.now(), value }));
  } catch {}
  return value;
}

export function clearPortalCache() {
  try {
    Object.keys(sessionStorage)
      .filter(key => key.startsWith(CACHE_PREFIX))
      .forEach(key => sessionStorage.removeItem(key));
  } catch {}
}

export async function requireUser() {
  const { data, error } = await supabase.auth.getClaims();
  if (error) throw error;
  const claims = data?.claims;
  if (!claims?.sub) {
    window.location.href = "./login.html";
    throw new Error("Not authenticated");
  }
  return {
    id: claims.sub,
    email: claims.email || "",
    user_metadata: claims.user_metadata || {}
  };
}

export async function getProfile(userId) {
  const cacheKey = "profile_" + userId;
  const cached = readCache(cacheKey, PROFILE_TTL);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,role")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return writeCache(cacheKey, data);
}

export async function getTeacherAssignments(teacherId) {
  const cacheKey = "teacher_classes_" + teacherId;
  const cached = readCache(cacheKey, RELATION_TTL);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("teacher_classes")
    .select("class_id,classes(id,name)")
    .eq("teacher_id", teacherId);
  if (error) throw error;
  return writeCache(cacheKey, data || []);
}

export async function getParentLinks(parentId) {
  const cacheKey = "parent_links_" + parentId;
  const cached = readCache(cacheKey, RELATION_TTL);
  if (cached) return cached;

  const { data, error } = await supabase
    .from("parent_students")
    .select("student_id,students(id,full_name,admission_number,classes(name))")
    .eq("parent_id", parentId);
  if (error) throw error;
  return writeCache(cacheKey, data || []);
}

export async function getReferenceData(options = {}) {
  const includeClasses = options.classes === true;
  const includeSubjects = options.subjects === true;

  const tasks = [
    ["sessions", () => supabase.from("academic_sessions").select("id,name,is_current").order("name",{ascending:false})],
    ["terms", () => supabase.from("terms").select("id,name").order("name")]
  ];

  if (includeClasses) {
    tasks.push(["classes", () => supabase.from("classes").select("id,name").order("name")]);
  }
  if (includeSubjects) {
    tasks.push(["subjects", () => supabase.from("subjects").select("id,name").order("name")]);
  }

  const result = {};
  const pending = tasks.map(async ([key, query]) => {
    const cached = readCache("ref_" + key, REFERENCE_TTL);
    if (cached) {
      result[key] = cached;
      return;
    }
    const { data, error } = await query();
    if (error) throw error;
    result[key] = writeCache("ref_" + key, data || []);
  });

  await Promise.all(pending);
  return result;
}
