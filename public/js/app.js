import { api, setSession, clearSession, getToken } from "./api.js";
const authView = document.querySelector("#auth-view");
const appView = document.querySelector("#app-view");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSubmit = document.querySelector("#auth-submit");
const listEl = document.querySelector("#list");
const form = document.querySelector("#event-form");
const formError = document.querySelector("#form-error");
let mode = "login";
const showError = (el, message) => { el.hidden = !message; el.textContent = message || ""; };
function today() { return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10); }

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
  authSubmit.textContent = mode === "login" ? "Entrar" : "Crear cuenta";
}
async function refresh() {
  const data = await api("/api/events");
  document.querySelector("#yes").textContent = data.yes;
  listEl.innerHTML = "";
  data.events.forEach((event) => {
    const li = document.createElement("li");
    li.className = "item";
    const text = document.createElement("span");
    text.textContent = `${event.title} \u00b7 ${event.day}${event.place ? ` \u00b7 ${event.place}` : ""}`;
    const select = document.createElement("select");
    ["pendiente", "si", "no", "tal vez"].forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = value === event.rsvp;
      select.append(option);
    });
    select.addEventListener("change", async () => { await api(`/api/events/${event.id}/rsvp`, { method: "POST", body: JSON.stringify({ rsvp: select.value }) }); await refresh(); });
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost";
    del.textContent = "Borrar";
    del.addEventListener("click", async () => { await api(`/api/events/${event.id}`, { method: "DELETE" }); await refresh(); });
    li.append(text, select, del);
    listEl.append(li);
  });
}
async function boot() {
  if (!getToken()) return;
  try {
    const { user } = await api("/api/auth/me");
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    document.querySelector("#user-name").textContent = user.username;
    document.querySelector("#day").value = today();
    await refresh();
  } catch { clearSession(); }
}
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(authError, "");
  const fd = new FormData(authForm);
  try {
    const data = await api(mode === "login" ? "/api/auth/login" : "/api/auth/register", { method: "POST", body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }) });
    setSession(data.token);
    authForm.reset();
    await boot();
  } catch (err) { showError(authError, err.message); }
});
document.querySelector("#logout").addEventListener("click", () => { clearSession(); appView.classList.add("hidden"); authView.classList.remove("hidden"); });
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError(formError, "");
  try {
    await api("/api/events", { method: "POST", body: JSON.stringify({ title: document.querySelector("#title").value.trim(), place: document.querySelector("#place").value.trim(), day: document.querySelector("#day").value }) });
    form.reset();
    document.querySelector("#day").value = today();
    await refresh();
  } catch (err) { showError(formError, err.message); }
});
boot();
