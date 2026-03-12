const STORAGE_KEY = "capstone-hierarchical-task-tracker-v2";

const defaultData = {
  title: "Group Assignment",
  tasks: []
};

let state = loadData();

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultData);

  try {
    const parsed = JSON.parse(saved);
    return {
      title: parsed.title || defaultData.title,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    };
  } catch (error) {
    console.error("Failed to parse tracker data", error);
    return structuredClone(defaultData);
  }
}

function saveData() {
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

function getProgressStats() {
  const total = state.tasks.length;
  const completed = state.tasks.filter((task) => task.checked).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

function renderStats() {
  const { total, completed, percent } = getProgressStats();
  document.querySelector("#taskCount").textContent = `${completed}/${total} tasks complete`;
  document.querySelector("#progressPercent").textContent = `${percent}%`;
  document.querySelector("#progressFill").style.width = `${percent}%`;
}

function renderTasks() {
  const list = document.querySelector("#taskList");
  list.innerHTML = "";

  if (state.tasks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No tasks yet.";
    list.appendChild(empty);
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
      </div>
      <div class="task-meta-row" style="padding-left:${leftPadding + 52}px">
        <label class="meta-group">
          <span>Due date</span>
          <input class="meta-input task-due-input" type="date" value="${task.dueDate || ""}" />
        </label>
        <label class="meta-group">
          <span>Completed date</span>
          <input class="meta-input task-completed-input" type="date" value="${task.completedDate || ""}" />
        </label>
      </div>
    `;

    const check = row.querySelector(".task-check");
    check.addEventListener("change", () => {
      task.checked = check.checked;
      task.completedDate = check.checked ? task.completedDate || todayISO() : "";
      saveAndRender();
    });

    const titleInput = row.querySelector(".task-title-input");
    titleInput.addEventListener("input", () => {
      task.title = titleInput.value;
      saveData();
    });

    const dueInput = row.querySelector(".task-due-input");
    dueInput.addEventListener("input", () => {
      task.dueDate = dueInput.value;
      saveData();
    });

    const completedInput = row.querySelector(".task-completed-input");
    completedInput.addEventListener("input", () => {
      task.completedDate = completedInput.value;
      task.checked = Boolean(completedInput.value);
      saveAndRender();
    });

    row.querySelector(".add-subtask-btn").addEventListener("click", () => addSubtask(index));
    row.querySelector(".delete-task-btn").addEventListener("click", () => deleteTask(index));

    list.appendChild(row);
  });
}

function addTask(title = "") {
  const task = createTask(title, 0);
  state.tasks.push(task);
  saveAndRender();
  focusTaskById(task.id);
}

function addSubtask(parentIndex) {
  const parent = state.tasks[parentIndex];
  const subtask = createTask("", parent.level + 1);
  let insertAt = parentIndex + 1;

  while (insertAt < state.tasks.length && state.tasks[insertAt].level > parent.level) {
    insertAt += 1;
  }

  state.tasks.splice(insertAt, 0, subtask);
  saveAndRender();
  focusTaskById(subtask.id);
}

function deleteTask(index) {
  const startLevel = state.tasks[index].level;
  let deleteCount = 1;

  for (let i = index + 1; i < state.tasks.length; i += 1) {
    if (state.tasks[i].level <= startLevel) break;
    deleteCount += 1;
  }

  state.tasks.splice(index, deleteCount);
  saveAndRender();
}

function focusTaskById(taskId) {
  requestAnimationFrame(() => {
    const input = document.querySelector(`[data-id="${taskId}"] .task-title-input`);
    if (input) input.focus();
  });
}

function saveAndRender() {
  saveData();
  renderApp();
}

function renderApp() {
  document.querySelector("#pageTitle").textContent = state.title;
  renderStats();
  renderTasks();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "task-tracker-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function resetData() {
  state = structuredClone(defaultData);
  saveAndRender();
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

document.querySelector("#newTaskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#newTaskTitle");
  const title = input.value.trim();
  if (!title) return;
  addTask(title);
  input.value = "";
});

document.querySelector("#exportBtn").addEventListener("click", exportData);
document.querySelector("#resetDataBtn").addEventListener("click", resetData);

renderApp();
