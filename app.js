const STORAGE_KEY = "capstone-collab-tracker-v1";
const SELECT_NONE = "__none__";

const defaultState = {
  title: "Projects",
  tasks: [],
  milestones: [],
  meetings: [],
  members: [],
  invitations: [],
  comments: [],
  assignees: [],
  dependencies: []
};

const dom = {
  pageTitle: document.querySelector("#pageTitle"),
  taskCount: document.querySelector("#taskCount"),
  progressPercent: document.querySelector("#progressPercent"),
  progressFill: document.querySelector("#progressFill"),
  taskList: document.querySelector("#taskList"),
  archivedTaskList: document.querySelector("#archivedTaskList"),
  newTaskForm: document.querySelector("#newTaskForm"),
  newTaskTitle: document.querySelector("#newTaskTitle"),
  exportBtn: document.querySelector("#exportBtn"),
  resetDataBtn: document.querySelector("#resetDataBtn"),
  projectSelect: document.querySelector("#projectSelect"),
  openProjectModalBtn: document.querySelector("#openProjectModalBtn"),
  openMilestoneModalBtn: document.querySelector("#openMilestoneModalBtn"),
  openMeetingModalBtn: document.querySelector("#openMeetingModalBtn"),
  openCollaboratorModalBtn: document.querySelector("#openCollaboratorModalBtn"),
  projectForm: document.querySelector("#projectForm"),
  projectNameInput: document.querySelector("#projectNameInput"),
  projectDueInput: document.querySelector("#projectDueInput"),
  milestoneForm: document.querySelector("#milestoneForm"),
  milestoneTitleInput: document.querySelector("#milestoneTitleInput"),
  milestoneDueInput: document.querySelector("#milestoneDueInput"),
  meetingForm: document.querySelector("#meetingForm"),
  meetingTitleInput: document.querySelector("#meetingTitleInput"),
  meetingDateInput: document.querySelector("#meetingDateInput"),
  inviteForm: document.querySelector("#inviteForm"),
  inviteEmailInput: document.querySelector("#inviteEmailInput"),
  inviteRoleInput: document.querySelector("#inviteRoleInput"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  projectDueSummary: document.querySelector("#projectDueSummary"),
  memberList: document.querySelector("#memberList"),
  milestoneList: document.querySelector("#milestoneList"),
  dueSoonList: document.querySelector("#dueSoonList"),
  meetingList: document.querySelector("#meetingList"),
  invitationList: document.querySelector("#invitationList"),
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

let session = null;
let authMode = "signin";
let projects = [];
let state = loadLocalState();
let selectedProjectId = localStorage.getItem("capstone-selected-project-id") || "";
const expandedDetailTaskIds = new Set();

function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(defaultState);
  try {
    const parsed = JSON.parse(saved);
    return { ...structuredClone(defaultState), ...parsed };
  } catch (error) {
    console.error("Failed to parse local state", error);
    return structuredClone(defaultState);
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function saveSelectedProject(projectId) {
  selectedProjectId = projectId;
  localStorage.setItem("capstone-selected-project-id", projectId || "");
}

function resetProjectState() {
  state = structuredClone(defaultState);
  expandedDetailTaskIds.clear();
}

function createTask(title = "", level = 0) {
  return {
    id: crypto.randomUUID(),
    project_id: selectedProjectId,
    milestone_id: null,
    parent_task_id: null,
    created_by: session?.user?.id || null,
    title,
    description: "",
    status: "not_started",
    priority: "medium",
    due_date: "",
    completed_date: "",
    completed_by: null,
    position: state.tasks.length,
    level,
    archived: false,
    collapsed: false
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateValue(value) {
  if (!value) return "";
  const stringValue = String(value).trim();
  const isoMatch = stringValue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function nullableDateValue(value) {
  const normalized = normalizeDateValue(value);
  return normalized || null;
}

function setSyncStatus(message, isError = false) {
  dom.syncStatus.textContent = message;
  dom.syncStatus.dataset.error = isError ? "true" : "false";
}

function setAuthStatus(message, isError = false) {
  dom.authStatus.textContent = message;
  dom.authStatus.dataset.error = isError ? "true" : "false";
}

function getProjectName() {
  return projects.find((project) => project.id === selectedProjectId)?.name || "Projects";
}

function getSelectedProject() {
  return projects.find((project) => project.id === selectedProjectId) || null;
}

function isCurrentUserProjectOwner() {
  return Boolean(session?.user?.id) && getSelectedProject()?.owner_id === session.user.id;
}

function openModal(targetId) {
  dom.modalBackdrop.hidden = false;
  ["projectModal", "milestoneModal", "meetingModal", "collaboratorModal"].forEach((id) => {
    const element = document.querySelector(`#${id}`);
    element.hidden = id !== targetId;
  });
}

function closeModal() {
  dom.modalBackdrop.hidden = true;
  ["projectModal", "milestoneModal", "meetingModal", "collaboratorModal"].forEach((id) => {
    const element = document.querySelector(`#${id}`);
    element.hidden = true;
  });
}

function getTaskAssigneeId(taskId) {
  return state.assignees.find((entry) => entry.task_id === taskId)?.user_id || "";
}

function getTaskAssigneeLabel(taskId) {
  const assigneeId = getTaskAssigneeId(taskId);
  if (!assigneeId) return "";
  const member = state.members.find((entry) => entry.user_id === assigneeId);
  return member?.display_name || member?.email || "";
}

function getMemberLabel(userId) {
  if (!userId) return "";
  const member = state.members.find((entry) => entry.user_id === userId);
  return member?.display_name || member?.email || "";
}

function getTaskCompleterLabel(task) {
  return getMemberLabel(task.completed_by);
}

function getTaskDependencyId(taskId) {
  return state.dependencies.find((entry) => entry.task_id === taskId)?.depends_on_task_id || "";
}

function getTaskComments(taskId) {
  return state.comments
    .filter((comment) => comment.task_id === taskId)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function getTaskDepthChildren(taskIndex) {
  const task = state.tasks[taskIndex];
  const children = [];
  for (let index = taskIndex + 1; index < state.tasks.length; index += 1) {
    const candidate = state.tasks[index];
    if (candidate.level <= task.level) break;
    if (candidate.level === task.level + 1) children.push(candidate);
  }
  return children;
}

function syncParentCompletion() {
  for (let index = state.tasks.length - 1; index >= 0; index -= 1) {
    const task = state.tasks[index];
    const children = getTaskDepthChildren(index);
    if (!children.length) continue;
    const allDone = children.every((child) => child.status === "done");
    task.status = allDone ? "done" : task.status === "done" ? "in_progress" : task.status;
    task.completed_date = allDone
      ? children
          .map((child) => child.completed_date)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || todayISO()
      : "";
    task.completed_by = allDone
      ? children
          .filter((child) => child.completed_date)
          .sort((a, b) => String(a.completed_date).localeCompare(String(b.completed_date)))
          .slice(-1)[0]?.completed_by || task.completed_by || null
      : null;
  }
}

function getProgressStats() {
  const activeTasks = state.tasks.filter((task) => !task.archived);
  const total = activeTasks.length;
  const completed = activeTasks.filter((task) => task.status === "done").length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percent };
}

function renderStats() {
  const { total, completed, percent } = getProgressStats();
  dom.taskCount.textContent = `${completed}/${total} tasks complete`;
  dom.progressPercent.textContent = `${percent}%`;
  dom.progressFill.style.width = `${percent}%`;
}

function renderProjects() {
  dom.projectSelect.innerHTML = "";
  if (!projects.length) {
    const option = document.createElement("option");
    option.textContent = "No projects yet";
    option.value = "";
    dom.projectSelect.appendChild(option);
    dom.projectSelect.disabled = true;
    return;
  }

  dom.projectSelect.disabled = false;
  projects.forEach((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name;
    if (project.id === selectedProjectId) option.selected = true;
    dom.projectSelect.appendChild(option);
  });

  const isOwner = isCurrentUserProjectOwner();
  dom.openMilestoneModalBtn.hidden = !isOwner;
}

function renderMembers() {
  dom.memberList.innerHTML = "";
  if (!state.members.length) {
    dom.memberList.innerHTML = '<div class="muted-line">No members yet</div>';
    return;
  }

  const canRemoveCollaborators = isCurrentUserProjectOwner();
  state.members.forEach((member) => {
    const isRemovable = canRemoveCollaborators && member.role !== "owner" && member.user_id !== session?.user?.id;
    const tag = document.createElement(isRemovable ? "button" : "span");
    tag.className = `member-tag ${isRemovable ? "member-tag-button" : ""}`;
    tag.textContent = `${member.display_name || member.email || "Member"} · ${member.role}`;
    if (isRemovable) {
      tag.type = "button";
      tag.dataset.userId = member.user_id;
      tag.dataset.memberLabel = member.display_name || member.email || "Member";
      tag.title = "Click to remove collaborator";
      tag.addEventListener("click", async () => {
        const confirmed = window.confirm(`Remove ${tag.dataset.memberLabel} from this project?`);
        if (!confirmed) return;
        await removeCollaborator(member.user_id, tag.dataset.memberLabel);
      });
    }
    dom.memberList.appendChild(tag);
  });
}

function renderProjectDue() {
  dom.projectDueSummary.innerHTML = "";
  const project = getSelectedProject();
  if (!project?.due_date) {
    dom.projectDueSummary.innerHTML = '<div class="muted-line">No project due date</div>';
    return;
  }

  const item = document.createElement("div");
  item.className = `list-item ${project.due_date < todayISO() ? "is-overdue" : ""}`;
  item.textContent = project.due_date;
  dom.projectDueSummary.appendChild(item);
}

function renderMilestones() {
  dom.milestoneList.innerHTML = "";
  if (!state.milestones.length) {
    dom.milestoneList.innerHTML = '<div class="muted-line">No milestones</div>';
    return;
  }
  const canRemoveMilestones = isCurrentUserProjectOwner();
  state.milestones
    .sort((a, b) => a.position - b.position)
    .forEach((milestone) => {
      const label = `${milestone.title}${milestone.due_date ? ` · ${milestone.due_date}` : ""}`;
      const item = document.createElement(canRemoveMilestones ? "button" : "div");
      item.className = `list-item ${canRemoveMilestones ? "list-item-button" : ""}`;
      item.textContent = label;
      if (canRemoveMilestones) {
        item.type = "button";
        item.title = "Click to remove milestone";
        item.addEventListener("click", async () => {
          const confirmed = window.confirm(`Remove milestone "${milestone.title}"?`);
          if (!confirmed) return;
          await removeMilestone(milestone.id, milestone.title);
        });
      }
      dom.milestoneList.appendChild(item);
    });
}

function renderMeetings() {
  dom.meetingList.innerHTML = "";
  if (!state.meetings.length) {
    dom.meetingList.innerHTML = '<div class="muted-line">No meetings</div>';
    return;
  }
  state.meetings
    .sort((a, b) => String(a.scheduled_at || "").localeCompare(String(b.scheduled_at || "")))
    .forEach((meeting) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.textContent = `${meeting.title}${meeting.scheduled_at ? ` · ${formatDateTime(meeting.scheduled_at)}` : ""}`;
      dom.meetingList.appendChild(item);
    });
}

function renderInvitations() {
  dom.invitationList.innerHTML = "";
  if (!state.invitations.length) {
    dom.invitationList.innerHTML = '<div class="muted-line">No invitations</div>';
    return;
  }
  state.invitations.forEach((invite) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.textContent = `${invite.email} · ${invite.role} · ${invite.status}`;
    dom.invitationList.appendChild(item);
  });
}

function renderDueSoon() {
  dom.dueSoonList.innerHTML = "";
  const items = state.tasks
    .filter((task) => !task.archived && task.due_date)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 6);

  if (!items.length) {
    dom.dueSoonList.innerHTML = '<div class="muted-line">No dated tasks</div>';
    return;
  }

  items.forEach((task) => {
    const item = document.createElement("div");
    item.className = `list-item ${isOverdue(task) ? "is-overdue" : ""}`;
    item.textContent = `${task.title} · ${task.due_date}`;
    dom.dueSoonList.appendChild(item);
  });
}

function shouldShowTask(index, tasks) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (tasks[i].level < tasks[index].level && tasks[i].collapsed) return false;
  }
  return true;
}

function renderTaskRow(task, index) {
  const row = document.createElement("article");
  row.className = `task-row ${isOverdue(task) ? "is-overdue" : ""}`;
  row.dataset.id = task.id;
  const detailsOpen = expandedDetailTaskIds.has(task.id);

  const leftPadding = 16 + task.level * 24;
  const milestoneOptions = [
    `<option value="${SELECT_NONE}">No milestone</option>`,
    ...state.milestones
      .sort((a, b) => a.position - b.position)
      .map(
        (milestone) =>
          `<option value="${milestone.id}" ${task.milestone_id === milestone.id ? "selected" : ""}>${escapeHtml(milestone.title)}</option>`
      )
  ].join("");

  const memberOptions = [
    `<option value="${SELECT_NONE}">Unassigned</option>`,
    ...state.members.map(
      (member) =>
        `<option value="${member.user_id}" ${getTaskAssigneeId(task.id) === member.user_id ? "selected" : ""}>${escapeHtml(member.display_name || member.email || "Member")}</option>`
    )
  ].join("");

  const dependencyOptions = [
    `<option value="${SELECT_NONE}">No dependency</option>`,
    ...state.tasks
      .filter((candidate) => candidate.id !== task.id)
      .map(
        (candidate) =>
          `<option value="${candidate.id}" ${getTaskDependencyId(task.id) === candidate.id ? "selected" : ""}>${escapeHtml(candidate.title || "Untitled task")}</option>`
      )
  ].join("");

  const commentsMarkup = getTaskComments(task.id)
    .map((comment) => {
      const author =
        state.members.find((member) => member.user_id === comment.user_id)?.display_name ||
        state.members.find((member) => member.user_id === comment.user_id)?.email ||
        "Member";
      return `<div class="comment-item"><strong>${escapeHtml(author)}</strong><span>${escapeHtml(comment.body)}</span></div>`;
    })
    .join("");

  row.innerHTML = `
    <div class="task-main-row" style="padding-left:${leftPadding}px">
      <div class="task-primary">
        <button class="indent-button collapse-button" type="button" aria-label="Collapse task">${task.collapsed ? "+" : "-"}</button>
        <button class="indent-button outdent-button" type="button" aria-label="Remove sub-task">←</button>
        <button class="indent-button indent-action" type="button" aria-label="Make sub-task">→</button>
        <label class="checkbox-wrap">
          <input class="task-check" type="checkbox" ${task.status === "done" ? "checked" : ""} />
        </label>
        <div class="task-title-wrap">
          <textarea class="task-title-input ${task.status === "done" ? "is-complete" : ""} ${task.level === 0 ? "is-main-task" : ""}" placeholder="Checklist item">${escapeHtml(task.title)}</textarea>
          ${getTaskAssigneeLabel(task.id) ? `<span class="assignee-badge">${escapeHtml(getTaskAssigneeLabel(task.id))}</span>` : ""}
          ${task.status === "done" && getTaskCompleterLabel(task) ? `<span class="completion-badge">✓ ${escapeHtml(getTaskCompleterLabel(task))}</span>` : ""}
        </div>
      </div>
      <div class="task-side">
        <div class="task-actions">
          <button class="mini-button delete-task-btn" type="button">Delete</button>
        </div>
      </div>
    </div>
    <div class="task-detail-row" style="padding-left:${leftPadding + 74}px" ${detailsOpen ? "" : "hidden"}>
      <div class="task-meta-row">
        <label class="meta-group">
          <span>Status</span>
          <select class="meta-input task-status-input">
            <option value="not_started" ${task.status === "not_started" ? "selected" : ""}>Not started</option>
            <option value="in_progress" ${task.status === "in_progress" ? "selected" : ""}>In progress</option>
            <option value="blocked" ${task.status === "blocked" ? "selected" : ""}>Blocked</option>
            <option value="done" ${task.status === "done" ? "selected" : ""}>Done</option>
          </select>
        </label>
        <label class="meta-group">
          <span>Priority</span>
          <select class="meta-input task-priority-input">
            <option value="low" ${task.priority === "low" ? "selected" : ""}>Low</option>
            <option value="medium" ${task.priority === "medium" ? "selected" : ""}>Medium</option>
            <option value="high" ${task.priority === "high" ? "selected" : ""}>High</option>
          </select>
        </label>
        <label class="meta-group">
          <span>Due</span>
          <input class="meta-input task-due-input" type="date" value="${normalizeDateValue(task.due_date)}" />
        </label>
        <label class="meta-group">
          <span>Done</span>
          <input class="meta-input task-done-input" type="date" value="${normalizeDateValue(task.completed_date)}" />
        </label>
      </div>
      <textarea class="detail-textarea task-description-input" placeholder="Description / notes">${escapeHtml(task.description || "")}</textarea>
      <div class="detail-grid">
        <label class="meta-group">
          <span>Milestone</span>
          <select class="meta-input task-milestone-input">${milestoneOptions}</select>
        </label>
        <label class="meta-group">
          <span>Assignee</span>
          <select class="meta-input task-assignee-input">${memberOptions}</select>
        </label>
        <label class="meta-group">
          <span>Dependency</span>
          <select class="meta-input task-dependency-input">${dependencyOptions}</select>
        </label>
      </div>
      <div class="comments-block">
        <div class="dashboard-title small">Comments</div>
        <div class="comment-list">${commentsMarkup || '<div class="muted-line">No comments</div>'}</div>
        <form class="comment-form">
          <input class="project-input comment-input" type="text" placeholder="Add comment" />
          <button class="mini-button" type="submit">Comment</button>
        </form>
      </div>
    </div>
  `;

  wireTaskRow(row, task, index);
  return row;
}

function renderTasks() {
  dom.taskList.innerHTML = "";
  dom.archivedTaskList.innerHTML = "";

  const activeTasks = state.tasks
    .filter((task) => !task.archived)
    .sort((a, b) => a.position - b.position);
  const archivedTasks = state.tasks
    .filter((task) => task.archived)
    .sort((a, b) => a.position - b.position);

  if (!activeTasks.length) {
    dom.taskList.innerHTML = '<div class="empty-state">No active tasks yet.</div>';
  } else {
    activeTasks.forEach((task, index) => {
      const originalIndex = state.tasks.findIndex((candidate) => candidate.id === task.id);
      if (!shouldShowTask(originalIndex, state.tasks)) return;
      dom.taskList.appendChild(renderTaskRow(task, originalIndex));
    });
  }

  if (!archivedTasks.length) {
    dom.archivedTaskList.innerHTML = '<div class="muted-line">No archived tasks</div>';
  } else {
    archivedTasks.forEach((task) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.textContent = task.title || "Untitled task";
      dom.archivedTaskList.appendChild(item);
    });
  }
}

function renderAuth() {
  const signedIn = Boolean(session);
  dom.authCard.hidden = signedIn;
  dom.appCard.hidden = !signedIn;
  dom.userEmail.textContent = signedIn ? session.user.email : "";

  if (!supabaseClient) {
    dom.authCard.hidden = false;
    dom.appCard.hidden = true;
    dom.authTitle.textContent = "Connect Supabase";
    dom.authHint.textContent = "Add your Supabase project URL and anon key to config.js before signing in.";
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
  syncParentCompletion();
  dom.pageTitle.textContent = getProjectName();
  renderAuth();
  renderProjects();
  renderProjectDue();
  renderMembers();
  renderMilestones();
  renderMeetings();
  renderInvitations();
  renderDueSoon();
  renderStats();
  renderTasks();
  saveLocalState();
}

function wireTaskRow(row, task, index) {
  const titleInput = row.querySelector(".task-title-input");
  autoResizeTextarea(titleInput);
  titleInput.addEventListener("input", async (event) => {
    autoResizeTextarea(event.target);
    task.title = event.target.value;
    await persistProjectData("Task updated", false);
  });

  row.querySelector(".task-description-input").addEventListener("input", async (event) => {
    task.description = event.target.value;
    await persistProjectData("Description saved", false);
  });

  row.querySelector(".task-check").addEventListener("change", async (event) => {
    task.status = event.target.checked ? "done" : "not_started";
    task.completed_date = event.target.checked ? task.completed_date || todayISO() : "";
    task.completed_by = event.target.checked ? session?.user?.id || null : null;
    await persistProjectData("Task updated");
  });

  row.querySelector(".task-status-input").addEventListener("change", async (event) => {
    task.status = event.target.value;
    task.completed_date = task.status === "done" ? task.completed_date || todayISO() : "";
    task.completed_by = task.status === "done" ? task.completed_by || session?.user?.id || null : null;
    if (task.status !== "done") task.completed_date = "";
    await persistProjectData("Status saved");
  });

  row.querySelector(".task-priority-input").addEventListener("change", async (event) => {
    task.priority = event.target.value;
    await persistProjectData("Priority saved", false);
  });

  row.querySelector(".task-due-input").addEventListener("input", async (event) => {
    task.due_date = event.target.value;
    await persistProjectData("Due date saved", false);
  });

  row.querySelector(".task-done-input").addEventListener("input", async (event) => {
    task.completed_date = event.target.value;
    task.status = event.target.value ? "done" : "not_started";
    task.completed_by = event.target.value ? task.completed_by || session?.user?.id || null : null;
    await persistProjectData("Completion saved");
  });

  row.querySelector(".task-milestone-input").addEventListener("change", async (event) => {
    task.milestone_id = event.target.value === SELECT_NONE ? null : event.target.value;
    await persistProjectData("Milestone saved", false);
  });

  row.querySelector(".task-assignee-input").addEventListener("change", async (event) => {
    setTaskAssignee(task.id, event.target.value === SELECT_NONE ? null : event.target.value);
    await persistProjectData("Assignee saved", false);
  });

  row.querySelector(".task-dependency-input").addEventListener("change", async (event) => {
    setTaskDependency(task.id, event.target.value === SELECT_NONE ? null : event.target.value);
    await persistProjectData("Dependency saved", false);
  });

  row.querySelector(".collapse-button").addEventListener("click", async () => {
    task.collapsed = !task.collapsed;
    await persistProjectData(task.collapsed ? "Subtasks collapsed" : "Subtasks expanded");
  });

  row.querySelector(".task-primary").addEventListener("click", (event) => {
    if (
      event.target.closest(".collapse-button") ||
      event.target.closest(".outdent-button") ||
      event.target.closest(".indent-action") ||
      event.target.closest(".checkbox-wrap")
    ) {
      return;
    }
    if (expandedDetailTaskIds.has(task.id)) {
      expandedDetailTaskIds.delete(task.id);
    } else {
      expandedDetailTaskIds.add(task.id);
    }
    renderApp();
  });

  row.querySelector(".outdent-button").disabled = task.level === 0;
  row.querySelector(".outdent-button").addEventListener("click", async () => {
    task.level = Math.max(0, task.level - 1);
    await persistProjectData("Task outdented");
  });

  row.querySelector(".indent-action").disabled = index === 0;
  row.querySelector(".indent-action").addEventListener("click", async () => {
    if (index <= 0) return;
    const maxLevel = state.tasks[index - 1].level + 1;
    task.level = Math.min(task.level + 1, maxLevel);
    await persistProjectData("Task indented");
  });

  row.querySelector(".delete-task-btn").addEventListener("click", async () => {
    deleteTask(index);
    await persistProjectData("Task deleted");
  });

  row.querySelector(".comment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = row.querySelector(".comment-input");
    const body = input.value.trim();
    if (!body) return;
    state.comments.push({
      id: crypto.randomUUID(),
      task_id: task.id,
      user_id: session.user.id,
      body,
      created_at: new Date().toISOString()
    });
    input.value = "";
    await persistProjectData("Comment added");
  });
}

function autoResizeTextarea(textarea) {
  textarea.style.height = "0px";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isOverdue(task) {
  return Boolean(task.due_date) && task.status !== "done" && task.due_date < todayISO();
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function addSubtask(parentIndex) {
  const parent = state.tasks[parentIndex];
  const subtask = createTask("", parent.level + 1);
  let insertAt = parentIndex + 1;
  while (insertAt < state.tasks.length && state.tasks[insertAt].level > parent.level) {
    insertAt += 1;
  }
  state.tasks.splice(insertAt, 0, subtask);
  refreshTaskPositions();
}

function deleteTask(index) {
  const startLevel = state.tasks[index].level;
  let deleteCount = 1;
  for (let i = index + 1; i < state.tasks.length; i += 1) {
    if (state.tasks[i].level <= startLevel) break;
    deleteCount += 1;
  }
  const idsToDelete = new Set(state.tasks.slice(index, index + deleteCount).map((task) => task.id));
  idsToDelete.forEach((taskId) => expandedDetailTaskIds.delete(taskId));
  state.tasks.splice(index, deleteCount);
  state.assignees = state.assignees.filter((entry) => !idsToDelete.has(entry.task_id));
  state.dependencies = state.dependencies.filter(
    (entry) => !idsToDelete.has(entry.task_id) && !idsToDelete.has(entry.depends_on_task_id)
  );
  state.comments = state.comments.filter((entry) => !idsToDelete.has(entry.task_id));
  refreshTaskPositions();
}

function refreshTaskPositions() {
  state.tasks.forEach((task, index) => {
    task.position = index;
  });
}

function setTaskAssignee(taskId, userId) {
  state.assignees = state.assignees.filter((entry) => entry.task_id !== taskId);
  if (userId) {
    state.assignees.push({ task_id: taskId, user_id: userId });
  }
}

function setTaskDependency(taskId, dependencyId) {
  state.dependencies = state.dependencies.filter((entry) => entry.task_id !== taskId);
  if (dependencyId) {
    state.dependencies.push({ task_id: taskId, depends_on_task_id: dependencyId });
  }
}

function taskRowsForDb() {
  return state.tasks.map((task, index) => ({
    ...task,
    due_date: nullableDateValue(task.due_date),
    completed_date: nullableDateValue(task.completed_date),
    completed_by: task.completed_by || null,
    project_id: selectedProjectId,
    position: index,
    parent_task_id: null
  }));
}

async function loadProjects() {
  if (!supabaseClient || !session) return;
  await acceptPendingInvitations();
  const { data, error } = await supabaseClient
    .from("projects")
    .select("id, name, owner_id, due_date")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    setSyncStatus(`Could not load projects: ${error.message}`, true);
    return;
  }
  projects = data || [];
  if (!projects.length) {
    saveSelectedProject("");
    resetProjectState();
    renderApp();
    return;
  }
  if (!projects.some((project) => project.id === selectedProjectId)) {
    saveSelectedProject(projects[0].id);
  }
  await loadProjectData();
}

async function acceptPendingInvitations() {
  if (!supabaseClient || !session?.user?.email) return;
  const { error } = await supabaseClient.rpc("accept_pending_invitations");
  if (error) {
    console.error(error);
    setSyncStatus(`Could not accept invitations: ${error.message}`, true);
  }
}

async function loadProjectData() {
  if (!supabaseClient || !session || !selectedProjectId) {
    resetProjectState();
    renderApp();
    return;
  }

  setSyncStatus("Loading project...");

  const [
    tasksResult,
    milestonesResult,
    meetingsResult,
    invitesResult,
    membersResult
  ] = await Promise.all([
    supabaseClient
      .from("tasks")
      .select("id, project_id, milestone_id, parent_task_id, created_by, title, description, status, priority, due_date, completed_date, completed_by, position, level, archived, collapsed")
      .eq("project_id", selectedProjectId)
      .order("position", { ascending: true }),
    supabaseClient
      .from("milestones")
      .select("id, project_id, title, due_date, position")
      .eq("project_id", selectedProjectId)
      .order("position", { ascending: true }),
    supabaseClient
      .from("project_meetings")
      .select("id, project_id, title, notes, scheduled_at, created_by")
      .eq("project_id", selectedProjectId)
      .order("scheduled_at", { ascending: true }),
    supabaseClient
      .from("project_invitations")
      .select("id, project_id, email, role, status")
      .eq("project_id", selectedProjectId)
      .order("created_at", { ascending: true }),
    supabaseClient
      .from("project_members")
      .select("project_id, user_id, role")
      .eq("project_id", selectedProjectId)
  ]);

  const hasError = [tasksResult, milestonesResult, meetingsResult, invitesResult, membersResult].find(
    (result) => result.error
  );
  if (hasError) {
    console.error(hasError.error);
    setSyncStatus(`Could not load project data: ${hasError.error.message}`, true);
    return;
  }

  const taskIds = (tasksResult.data || []).map((task) => task.id);
  const memberIds = (membersResult.data || []).map((member) => member.user_id);

  const [assigneesResult, depsResult, commentsResult, profilesResult] = await Promise.all([
    taskIds.length
      ? supabaseClient.from("task_assignees").select("task_id, user_id").in("task_id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? supabaseClient.from("task_dependencies").select("task_id, depends_on_task_id").in("task_id", taskIds)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length
      ? supabaseClient
          .from("task_comments")
          .select("id, task_id, user_id, body, created_at")
          .in("task_id", taskIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    memberIds.length
      ? supabaseClient.from("profiles").select("id, email, display_name").in("id", memberIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  const secondaryError = [assigneesResult, depsResult, commentsResult, profilesResult].find(
    (result) => result.error
  );
  if (secondaryError) {
    console.error(secondaryError.error);
    setSyncStatus(`Could not load related data: ${secondaryError.error.message}`, true);
    return;
  }

  const profilesById = new Map((profilesResult.data || []).map((profile) => [profile.id, profile]));

  state.tasks = (tasksResult.data || []).map((task) => ({
    ...task,
    due_date: normalizeDateValue(task.due_date),
    completed_date: normalizeDateValue(task.completed_date),
    completed_by: task.completed_by || null
  }));
  state.milestones = (milestonesResult.data || []).map((milestone) => ({
    ...milestone,
    due_date: normalizeDateValue(milestone.due_date)
  }));
  state.meetings = meetingsResult.data || [];
  state.invitations = invitesResult.data || [];
  state.assignees = assigneesResult.data || [];
  state.dependencies = depsResult.data || [];
  state.comments = commentsResult.data || [];
  state.members = (membersResult.data || []).map((member) => ({
    ...member,
    email: profilesById.get(member.user_id)?.email || "",
    display_name: profilesById.get(member.user_id)?.display_name || ""
  }));

  setSyncStatus("Synced");
  renderApp();
}

async function persistProjectData(message, rerender = true) {
  if (!supabaseClient || !session || !selectedProjectId) return;

  syncParentCompletion();
  refreshTaskPositions();
  if (rerender) renderApp();
  saveLocalState();
  setSyncStatus("Saving...");

  const projectTaskIds = state.tasks.map((task) => task.id);
  const projectMilestoneIds = state.milestones.map((milestone) => milestone.id);
  const projectMeetingIds = state.meetings.map((meeting) => meeting.id);
  const isOwner = isCurrentUserProjectOwner();

  try {
    if (projectTaskIds.length) {
      await supabaseClient.from("task_assignees").delete().in("task_id", projectTaskIds);
      await supabaseClient.from("task_dependencies").delete().in("task_id", projectTaskIds);
      await supabaseClient.from("task_comments").delete().in("task_id", projectTaskIds);
    }

    await supabaseClient.from("tasks").delete().eq("project_id", selectedProjectId);
    await supabaseClient.from("project_meetings").delete().eq("project_id", selectedProjectId);
    if (isOwner) {
      await supabaseClient.from("milestones").delete().eq("project_id", selectedProjectId);
    }

    if (isOwner && projectMilestoneIds.length) {
      const { error } = await supabaseClient.from("milestones").insert(
        state.milestones.map((milestone, index) => ({
          ...milestone,
          due_date: nullableDateValue(milestone.due_date),
          project_id: selectedProjectId,
          position: index
        }))
      );
      if (error) throw error;
    }

    if (state.tasks.length) {
      const { error } = await supabaseClient.from("tasks").insert(taskRowsForDb());
      if (error) throw error;
    }

    if (state.assignees.length) {
      const { error } = await supabaseClient.from("task_assignees").insert(state.assignees);
      if (error) throw error;
    }

    if (state.dependencies.length) {
      const { error } = await supabaseClient.from("task_dependencies").insert(state.dependencies);
      if (error) throw error;
    }

    if (state.comments.length) {
      const { error } = await supabaseClient.from("task_comments").insert(state.comments);
      if (error) throw error;
    }

    if (projectMeetingIds.length) {
      const { error } = await supabaseClient.from("project_meetings").insert(state.meetings);
      if (error) throw error;
    }

    setSyncStatus(message || "Synced");
    if (rerender) renderApp();
  } catch (error) {
    console.error(error);
    setSyncStatus(`Save failed: ${error.message}`, true);
  }
}

async function createProject(name) {
  if (!supabaseClient || !session || !name.trim()) return;
  setSyncStatus("Creating project...");
  const { data, error } = await supabaseClient
    .from("projects")
    .insert([{ owner_id: session.user.id, name: name.trim(), due_date: dom.projectDueInput.value || null }])
    .select("id, name, owner_id, due_date")
    .single();
  if (error) {
    console.error(error);
    setSyncStatus(`Could not create project: ${error.message}`, true);
    return;
  }
  projects.push(data);
  saveSelectedProject(data.id);
  dom.projectNameInput.value = "";
  dom.projectDueInput.value = "";
  closeModal();
  await loadProjectData();
}

async function addMilestone() {
  const title = dom.milestoneTitleInput.value.trim();
  if (!title || !selectedProjectId || !isCurrentUserProjectOwner()) return;
  state.milestones.push({
    id: crypto.randomUUID(),
    project_id: selectedProjectId,
    title,
    due_date: dom.milestoneDueInput.value || null,
    position: state.milestones.length
  });
  dom.milestoneTitleInput.value = "";
  dom.milestoneDueInput.value = "";
  closeModal();
  await persistProjectData("Milestone added");
}

async function removeMilestone(milestoneId, title) {
  if (!isCurrentUserProjectOwner()) return;
  state.milestones = state.milestones.filter((milestone) => milestone.id !== milestoneId);
  state.tasks = state.tasks.map((task) =>
    task.milestone_id === milestoneId ? { ...task, milestone_id: null } : task
  );
  await persistProjectData(`Milestone "${title}" removed`);
}

async function addMeeting() {
  const title = dom.meetingTitleInput.value.trim();
  if (!title || !selectedProjectId) return;
  state.meetings.push({
    id: crypto.randomUUID(),
    project_id: selectedProjectId,
    title,
    notes: "",
    scheduled_at: dom.meetingDateInput.value ? new Date(dom.meetingDateInput.value).toISOString() : null,
    created_by: session.user.id
  });
  dom.meetingTitleInput.value = "";
  dom.meetingDateInput.value = "";
  closeModal();
  await persistProjectData("Meeting added");
}

async function inviteCollaborator() {
  const email = dom.inviteEmailInput.value.trim().toLowerCase();
  const role = dom.inviteRoleInput.value;
  if (!email || !selectedProjectId) return;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("id, email, display_name")
    .eq("email", email)
    .maybeSingle();

  if (profile?.id) {
    const { error } = await supabaseClient
      .from("project_members")
      .upsert([{ project_id: selectedProjectId, user_id: profile.id, role }], { onConflict: "project_id,user_id" });
    if (error) {
      console.error(error);
      setSyncStatus(`Could not add collaborator: ${error.message}`, true);
      return;
    }
  } else {
    const { error } = await supabaseClient.from("project_invitations").insert([
      { project_id: selectedProjectId, email, role, invited_by: session.user.id, status: "pending" }
    ]);
    if (error) {
      console.error(error);
      setSyncStatus(`Could not create invitation: ${error.message}`, true);
      return;
    }
  }

  dom.inviteEmailInput.value = "";
  closeModal();
  await loadProjectData();
  setSyncStatus("Collaborator update saved");
}

async function removeCollaborator(userId, label) {
  if (!supabaseClient || !selectedProjectId || !isCurrentUserProjectOwner()) return;
  const { error } = await supabaseClient
    .from("project_members")
    .delete()
    .eq("project_id", selectedProjectId)
    .eq("user_id", userId);

  if (error) {
    console.error(error);
    setSyncStatus(`Could not remove collaborator: ${error.message}`, true);
    return;
  }

  state.assignees = state.assignees.filter((entry) => entry.user_id !== userId);
  await persistProjectData(`${label} removed`);
  await loadProjectData();
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
  setAuthStatus(authMode === "signin" ? "Signed in." : "Account created.");
  if (!session) {
    setAuthStatus(
      "Account created. Check your email for a confirmation link, then sign in.",
      false
    );
    authMode = "signin";
    renderAuth();
    return;
  }
  await loadProjects();
}

async function handleSignOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  session = null;
  projects = [];
  saveSelectedProject("");
  resetProjectState();
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
    setAuthStatus(`Could not restore session: ${error.message}`, true);
  }
  session = data.session;
  renderApp();
  if (session) await loadProjects();
  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    if (session) {
      await loadProjects();
    } else {
      projects = [];
      saveSelectedProject("");
      resetProjectState();
      renderApp();
    }
  });
}

dom.newTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = dom.newTaskTitle.value.trim();
  if (!title || !selectedProjectId) return;
  state.tasks.push(createTask(title, 0));
  dom.newTaskTitle.value = "";
  await persistProjectData("Task added");
});

dom.authForm.addEventListener("submit", handleAuthSubmit);
dom.projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await createProject(dom.projectNameInput.value);
});
dom.projectSelect.addEventListener("change", async (event) => {
  saveSelectedProject(event.target.value);
  await loadProjectData();
});
dom.openProjectModalBtn.addEventListener("click", () => openModal("projectModal"));
dom.openMilestoneModalBtn.addEventListener("click", () => openModal("milestoneModal"));
dom.openMeetingModalBtn.addEventListener("click", () => openModal("meetingModal"));
dom.openCollaboratorModalBtn.addEventListener("click", () => openModal("collaboratorModal"));
document.querySelectorAll(".close-modal-btn").forEach((button) => {
  button.addEventListener("click", closeModal);
});
dom.modalBackdrop.addEventListener("click", (event) => {
  if (event.target === dom.modalBackdrop) closeModal();
});
dom.milestoneForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addMilestone();
});
dom.meetingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await addMeeting();
});
dom.inviteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await inviteCollaborator();
});
dom.authToggleBtn.addEventListener("click", () => {
  authMode = authMode === "signin" ? "signup" : "signin";
  setAuthStatus("");
  renderAuth();
});
dom.signOutBtn.addEventListener("click", handleSignOut);
dom.exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ projects, state }, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "assignment-tracker-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
});
dom.resetDataBtn.addEventListener("click", async () => {
  resetProjectState();
  await persistProjectData("Project reset");
});

initializeAuth();
