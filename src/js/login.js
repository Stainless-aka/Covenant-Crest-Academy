import { supabase } from "./supabase.js";

const form = document.getElementById("login-form");
const message = document.getElementById("message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Signing in...";
  message.className = "form-message";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    message.textContent = error.message;
    message.className = "form-message error";
    return;
  }

  window.location.href = "./dashboard.html";
});
