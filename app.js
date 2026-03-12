const STORAGE_KEY = "capstone-hierarchical-task-tracker-v3";
const defaultData = { title: "Group Assignment", tasks: [] };

const dom = {
  pageTitle: document.querySelector("#pageTitle"),
  taskCount: document.querySelector("#taskCount"),
  progressPercent: document.querySelector("#progressPercent"),
  progressFill: document.querySelector("#progressFill"),
  taskList: document.querySelector("#taskList"),
  newTaskForm: document.querySelector("#newTaskForm"),
  newTaskTitle: document.querySelector("#newTaskTitle"),
  exportBtn: document.querySelector("#exportBtn"),
  resetDataBtn: document.querySelector("#resetDataBtn"),
  authCard: document.querySelector("#authCard"),
  appCard: document.querySelector("#appCard"),
  authForm: document.querySelector("#authForm"),
  authEmail: document.querySelector("#authEmail"),
  authPassword: document.querySelector("#authPassword"),
  authSubmitBtn: document.querySelector("#authSubmitBtn"),
  authToggleBtn: document.querySelector("#authToggleBtn"),
  authTitle: document.querySelector("#authTitle"),
  authHint: document.querySelector("#authHint"),
  authStatus: document.querySelector("#authStatus"),
  syncStatus: document.querySelector("#syncStatus"),
  userEmail: document.querySelector("#userEmail"),
  signOutBtn: document.querySelector("#signOutBtn")
};

const localSupabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseUrl = localSupabaseConfig.url || "";
const supabaseAnonKey = localSupabaseConfig.anonKey || "";
const supabaseClient =
  window.supabase && supabaseUrl && supabaseAnonKey
    ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
    : null;

let state = loadLocalState();
let session = null;
let authMode = "signin";

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultData);

  try {
    const parsed = JSON.parse(saved);
    return {
      title: parsed.title || defaultData.title,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    };
  } catch (error) {
    console.error("Failed to parse local tracker state", error);
    return structuredClone(defaultData);
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function createTask(title = "", level = 0) {
  return {
    id: crypto.randomUUID(),
    title,
    level,
    dueDate: "",
    completedDate: "",
    checked: false
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function setSyncStatus(message, isError = false) {
  dom.syncStatus.textContent = message;
  dom.syncStatus.dataset.error = isError ? "true" : "false";
}

function setAuthStatus(message, isError = false) {
  dom.authStatus.textContent = message;
  dom.authStatus.dataset.error = isError ? "true" : "false";
}

function getProgressStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.checked).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

function renderStats() {
  const { total, completed, percent } = getProgressStats();
  dom.taskCount.textContent = `${completed}/${total} tasks complete`;
  dom.progressPercent.textContent = `${percent}%`;
  dom.progressFill.style.width = `${percent}%`;
}

function renderTasks() {
  dom.taskList.innerHTML = "";

  if (!state.tasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = session ? "No tasks yet." : "Sign in to load your tasks.";
    dom.taskList.appendChild(empty);
    return;
  }

  state.tasks.forEach((task, index) => {
    const row = document.createElement("article");
    row.className = "task-row";
    row.dataset.id = task.id;

    const leftPadding = 36 + task.level * 34;

    row.innerHTML = `
      <div class="task-main-row" style="padding-left:${leftPadding}px">
        <label class="checkbox-wrap">
          <input class="task-check" type="checkbox" ${task.checked ? "checked" : ""} />
        </label>
        <input
          class="task-title-input ${task.checked ? "is-complete" : ""}"
          type="text"
          value="${escapeHtml(task.title)}"
          placeholder="Checklist item"
        />
        <div class="task-actions">
          <button class="mini-button add-subtask-btn" type="button">Sub-task</button>
          <button class="mini-button delete-task-btn" type="button">Delete</button>
        </div>
        <div class="task-meta-row">
          <label class="meta-group">
          <span>Due date</span>
          <input class="meta-input task-due-input" type="date" value="${task.dueDate || ""}" />
        </label>
        <label class="meta-group">
          <span>Completed date</span>
          <input class="meta-input task-completed-input" type="date" value="${task.completedDate || ""}" />
        </label>
        </div>
      </div>
    `;

    row.querySelector(".task-check").addEventListener("change", async (event) => {
      task.checked = event.target.checked;
      task.completedDate = task.checked ? task.completedDate || todayISO() : "";
      await persistAndRender("Task updated");
    });

    row.querySelector(".task-title-input").addEventListener("input", async (event) => {
      task.title = event.target.value;
      await persistAndRender("Task updated", false);
    });

    row.querySelector(".task-due-input").addEventListener("input", async (event) => {
      task.dueDate = event.target.value;
      await persistAndRender("Due date saved", false);
    });

    row.querySelector(".task-completed-input").addEventListener("input", async (event) => {
      task.completedDate = event.target.value;
      task.checked = Boolean(event.target.value);
      await persistAndRender("Completion saved");
    });

    row.querySelector(".add-subtask-btn").addEventListener("click", async () => {
      addSubtask(index);
      await persistAndRender("Sub-task added");
      focusTaskById(state.tasks[index + 1]?.id);
    });

    row.querySelector(".delete-task-btn").addEventListener("click", async () => {
      deleteTask(index);
      await persistAndRender("Task deleted");
    });

    dom.taskList.appendChild(row);
  });
}

function renderAuth() {
  const signedIn = Boolean(session);
  dom.authCard.hidden = signedIn;
  dom.appCard.hidden = !signedIn;
  dom.userEmail.textContent = signedIn ? session.user.email : "";
  dom.pageTitle.textContent = state.title;

  if (!supabaseClient) {
    dom.authCard.hidden = false;
    dom.appCard.hidden = true;
    dom.authTitle.textContent = "Connect Supabase";
    dom.authHint.textContent =
      "Add your Supabase project URL and anon key to config.js before signing in.";
    setAuthStatus("Missing Supabase config.", true);
    return;
  }

  dom.authTitle.textContent = authMode === "signin" ? "Sign in" : "Create account";
  dom.authHint.textContent =
    authMode === "signin"
      ? "Use the same email and password on any device to load your synced tasks."
      : "Create an account once, then sign in from any device.";
  dom.authSubmitBtn.textContent = authMode === "signin" ? "Sign in" : "Create account";
  dom.authToggleBtn.textContent =
    authMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign in";
}

function renderApp() {
  renderAuth();
  renderStats();
  renderTasks();
}

function addTask(title = "") {
  state.tasks.push(createTask(title, 0));
}

function addSubtask(parentIndex) {
  const parent = state.tasks[parentIndex];
  const subtask = createTask("", parent.level + 1);
  let insertAt = parentIndex + 1;

  while (insertAt < state.tasks.length && state.tasks[insertAt].level > parent.level) {
    insertAt += 1;
  }

  state.tasks.splice(insertAt, 0, subtask);
}

function deleteTask(index) {
  const startLevel = state.tasks[index].level;
  let deleteCount = 1;

  for (let i = index + 1; i < state.tasks.length; i += 1) {
    if (state.tasks[i].level <= startLevel) break;
    deleteCount += 1;
  }

  state.tasks.splice(index, deleteCount);
}

function focusTaskById(taskId) {
  requestAnimationFrame(() => {
    if (!taskId) return;
    const input = document.querySelector(`[data-id="${taskId}"] .task-title-input`);
    if (input) input.focus();
  });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function taskRowsForDb() {
  return state.tasks.map((task, index) => ({
    id: task.id,
    user_id: session.user.id,
    title: task.title,
    level: task.level,
    due_date: task.dueDate || null,
    completed_date: task.completedDate || null,
    checked: task.checked,
    position: index
  }));
}

async function loadRemoteTasks() {
  if (!supabaseClient || !session) return;

  setSyncStatus("Loading tasks...");
  const { data, error } = await supabaseClient
    .from("tracker_tasks")
    .select("id, title, level, due_date, completed_date, checked, position")
    .order("position", { ascending: true });

  if (error) {
    console.error(error);
    setSyncStatus("Could not load tasks.", true);
    return;
  }

  state.tasks = (data || []).map((row) => ({
    id: row.id,
    title: row.title || "",
    level: row.level || 0,
    dueDate: row.due_date || "",
    completedDate: row.completed_date || "",
    checked: Boolean(row.checked)
  }));

  saveLocalState();
  setSyncStatus("Synced");
  renderApp();
}

async function saveRemoteTasks() {
  if (!supabaseClient || !session) return;

  const rows = taskRowsForDb();
  setSyncStatus("Saving...");

  const { error: deleteError } = await supabaseClient
    .from("tracker_tasks")
    .delete()
    .eq("user_id", session.user.id);

  if (deleteError) {
    console.error(deleteError);
    setSyncStatus("Could not save tasks.", true);
    throw deleteError;
  }

  if (!rows.length) {
    setSyncStatus("Synced");
    return;
  }

  const { error: upsertError } = await supabaseClient.from("tracker_tasks").insert(rows);

  if (upsertError) {
    console.error(upsertError);
    setSyncStatus("Could not save tasks.", true);
    throw upsertError;
  }

  setSyncStatus("Synced");
}

async function persistAndRender(successMessage, rerender = true) {
  saveLocalState();
  if (rerender) renderApp();

  try {
    await saveRemoteTasks();
    if (successMessage) setSyncStatus(successMessage);
  } catch (error) {
    setSyncStatus("Save failed. Check Supabase setup.", true);
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (!supabaseClient) {
    setAuthStatus("Add your Supabase config first.", true);
    return;
  }

  const email = dom.authEmail.value.trim();
  const password = dom.authPassword.value;

  if (!email || !password) {
    setAuthStatus("Enter both email and password.", true);
    return;
  }

  setAuthStatus(authMode === "signin" ? "Signing in..." : "Creating account...");

  const action =
    authMode === "signin"
      ? supabaseClient.auth.signInWithPassword({ email, password })
      : supabaseClient.auth.signUp({ email, password });

  const { data, error } = await action;

  if (error) {
    setAuthStatus(error.message, true);
    return;
  }

  session = data.session || session;
  setAuthStatus(authMode === "signin" ? "Signed in." : "Account created. Sign in if needed.");

  if (!session) {
    authMode = "signin";
    renderAuth();
    return;
  }

  await loadRemoteTasks();
}

async function handleSignOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  session = null;
  state = loadLocalState();
  setSyncStatus("Signed out");
  renderApp();
}

async function initializeAuth() {
  if (!supabaseClient) {
    renderApp();
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    console.error(error);
    setAuthStatus("Could not restore session.", true);
  }

  session = data.session;
  renderApp();

  if (session) {
    await loadRemoteTasks();
  }

  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    renderApp();
    if (session) {
      await loadRemoteTasks();
    }
  });
}

dom.newTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = dom.newTaskTitle.value.trim();
  if (!title || !session) return;
  addTask(title);
  dom.newTaskTitle.value = "";
  await persistAndRender("Task added");
});

dom.authForm.addEventListener("submit", handleAuthSubmit);
dom.authToggleBtn.addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  setAuthStatus("");
  renderAuth();
});
dom.signOutBtn.addEventListener("click", handleSignOut);
dom.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "task-tracker-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
});
dom.resetDataBtn.addEventListener("click", async () => {
  state = structuredClone(defaultData);
  await persistAndRender("Tracker reset");
});

initializeAuth();
