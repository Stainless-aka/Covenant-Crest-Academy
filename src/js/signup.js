import { supabase } from "./supabase.js";
const form=document.getElementById("signup-form"),msg=document.getElementById("message");
form.addEventListener("submit",async e=>{
 e.preventDefault();
 const full_name=document.getElementById("full-name").value.trim(),email=document.getElementById("email").value.trim(),password=document.getElementById("password").value,confirm=document.getElementById("confirm").value;
 if(password!==confirm){msg.textContent="Passwords do not match.";msg.className="form-message error";return;}
 msg.textContent="Creating account...";
 const {error}=await supabase.auth.signUp({email,password,options:{data:{full_name}}});
 if(error){msg.textContent=error.message;msg.className="form-message error";return;}
 msg.textContent="Account created. Check your email if confirmation is enabled, then sign in.";
 msg.className="form-message success";form.reset();
});