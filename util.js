export function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
export function nowISO(){ return new Date().toISOString(); }

export function showToast(msg){
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(()=>t.classList.remove("show"), 2400);
}

export function safeUsername(raw){
  const v = (raw || "").trim();
  if (v.length < 3) return { ok:false, reason:"Username must be at least 3 characters." };
  if (v.length > 16) return { ok:false, reason:"Username must be 16 characters or less." };
  if (!/^[a-zA-Z0-9_]+$/.test(v)) return { ok:false, reason:"Use only letters, numbers, underscore." };
  return { ok:true, value:v };
}

export function usernameToEmail(username, domain){
  return `${username.toLowerCase()}@${domain}`;
}
