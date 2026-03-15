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
  refreshBanner: document.querySelector("#refreshBanner"),
  refreshBannerText: document.querySelector("#refreshBannerText"),
  refreshBannerBtn: document.querySelector("#refreshBannerBtn"),
  openProfileModalBtn: document.querySelector("#openProfileModalBtn"),
  openProjectModalBtn: document.querySelector("#openProjectModalBtn"),
  openProjectSettingsBtn: document.querySelector("#openProjectSettingsBtn"),
  openMilestoneModalBtn: document.querySelector("#openMilestoneModalBtn"),
  openMeetingModalBtn: document.querySelector("#openMeetingModalBtn"),
  openCollaboratorModalBtn: document.querySelector("#openCollaboratorModalBtn"),
  projectForm: document.querySelector("#projectForm"),
  projectModalTitle: document.querySelector("#projectModalTitle"),
  projectNameInput: document.querySelector("#projectNameInput"),
  projectDueInput: document.querySelector("#projectDueInput"),
  projectDueSoonInput: document.querySelector("#projectDueSoonInput"),
  projectSubmitBtn: document.querySelector("#projectSubmitBtn"),
  milestoneForm: document.querySelector("#milestoneForm"),
  milestoneTitleInput: document.querySelector("#milestoneTitleInput"),
  milestoneDueInput: document.querySelector("#milestoneDueInput"),
  taskModalBody: document.querySelector("#taskModalBody"),
  meetingForm: document.querySelector("#meetingForm"),
  meetingTitleInput: document.querySelector("#meetingTitleInput"),
  meetingDateInput: document.querySelector("#meetingDateInput"),
  inviteForm: document.querySelector("#inviteForm"),
  inviteEmailInput: document.querySelector("#inviteEmailInput"),
  inviteRoleInput: document.querySelector("#inviteRoleInput"),
  memberSettingsForm: document.querySelector("#memberSettingsForm"),
  memberSettingsLabel: document.querySelector("#memberSettingsLabel"),
  memberRoleInput: document.querySelector("#memberRoleInput"),
  saveMemberSettingsBtn: document.querySelector("#saveMemberSettingsBtn"),
  removeMemberBtn: document.querySelector("#removeMemberBtn"),
  profileForm: document.querySelector("#profileForm"),
  profileDisplayNameInput: document.querySelector("#profileDisplayNameInput"),
  modalBackdrop: document.querySelector("#modalBackdrop"),
  projectDueSummary: document.querySelector("#projectDueSummary"),
  memberList: document.querySelector("#memberList"),
  milestoneList: document.querySelector("#milestoneList"),
  dueSoonTitle: document.querySelector("#dueSoonTitle"),
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
  signOutBtn: document.querySelector("#signOutBtn"),
  openMembersModalBtn: document.querySelector("#openMembersModalBtn"),
  openMilestonesModalBtn: document.querySelector("#openMilestonesModalBtn"),
  openDueSoonModalBtn: document.querySelector("#openDueSoonModalBtn"),
  membersModalBody: document.querySelector("#membersModalBody"),
  milestonesModalBody: document.querySelector("#milestonesModalBody"),
  dueSoonModalBody: document.querySelector("#dueSoonModalBody"),
  dueSoonModalTitle: document.querySelector("#dueSoonModalTitle"),
  openLinksBtn: document.querySelector("#openLinksBtn"),
  closeLinksPanelBtn: document.querySelector("#closeLinksPanelBtn"),
  linksPanel: document.querySelector("#linksPanel"),
  linkChips: document.querySelector("#linkChips"),
  addLinkForm: document.querySelector("#addLinkForm"),
  linkLabelInput: document.querySelector("#linkLabelInput"),
  linkUrlInput: document.querySelector("#linkUrlInput")
};

const localSupabaseConfig = window.SUPABASE_CONFIG || {};
const supabaseUrl = localSupabaseConfig.url || "";
const supabaseAnonKey = localSupabaseConfig.anonKey || "";
const supabaseClient =
  window.supabase && supabaseUrl && supabaseAnonKey
    ? window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

let session = null;
let authMode = "signin";
let projects = [];
let projectLinks = [];
let state = loadLocalState();
let selectedProjectId = localStorage.getItem("capstone-selected-project-id") || "";
let projectModalMode = "create";
const expandedDetailTaskIds = new Set();
let projectChannel = null;
const realtimeClientId = crypto.randomUUID();
let activeTaskModalId = null;
let activeMemberSettingsUserId = null;
let currentProfile = null;
let availableAuthProfiles = [];
let persistQueue = Promise.resolve();
const taskSaveQueues = new Map();
const titleSaveTimers = new Map();
const titleSaveVersions = new Map();
let consistencyReloadTimer = null;
let authResyncInFlight = null;

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
  projectLinks = [];
  titleSaveTimers.forEach((timerId) => window.clearTimeout(timerId));
  titleSaveTimers.clear();
  expandedDetailTaskIds.clear();
  hideRefreshBanner();
  if (dom.linksPanel) dom.linksPanel.hidden = true;
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

function addDaysISO(isoDate, days) {
  const base = new Date(`${isoDate}T00:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
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

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })
  ]);
}

function scheduleConsistencyReload(delayMs = 1800) {
  if (consistencyReloadTimer) {
    window.clearTimeout(consistencyReloadTimer);
  }
  consistencyReloadTimer = window.setTimeout(async () => {
    consistencyReloadTimer = null;
    const activeElement = document.activeElement;
    if (
      activeElement?.classList?.contains("task-title-input") ||
      activeElement?.classList?.contains("task-description-input") ||
      activeElement?.classList?.contains("comment-input")
    ) {
      scheduleConsistencyReload(1200);
      return;
    }
    await loadProjectData({ silent: true });
  }, delayMs);
}

async function saveTaskWithRetry(taskId, attempts = 2) {
  return queueTaskSave(taskId, async () => {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const taskSnapshot = cloneTaskSnapshot(taskId);
      try {
        await withTimeout(upsertTasks([taskId]), 8000, "Task save");
        return;
      } catch (error) {
        lastError = error;
        if (attempt === attempts) break;
        const isTimeout = String(error?.message || "").toLowerCase().includes("timed out");
        if (isTimeout) {
          try {
            await loadProjectData({ silent: true });
            restoreTaskSnapshot(taskSnapshot);
          } catch (reloadError) {
            console.error("Recovery reload failed", reloadError);
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }
    }
    throw lastError;
  });
}

function formatDisplayDate(value) {
  const normalized = normalizeDateValue(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

function setSyncStatus(message, isError = false) {
  dom.syncStatus.textContent = message;
  dom.syncStatus.dataset.error = isError ? "true" : "false";
  const lowerMessage = String(message || "").toLowerCase();
  if (isError) {
    dom.syncStatus.dataset.state = "error";
  } else if (lowerMessage.includes("saving") || lowerMessage.includes("creating")) {
    dom.syncStatus.dataset.state = "saving";
  } else if (lowerMessage.includes("loading")) {
    dom.syncStatus.dataset.state = "loading";
  } else {
    dom.syncStatus.dataset.state = "success";
  }
}

function setAuthStatus(message, isError = false) {
  dom.authStatus.textContent = message;
  dom.authStatus.dataset.error = isError ? "true" : "false";
}

async function ensureActiveSession(options = {}) {
  if (!supabaseClient) return null;
  if (authResyncInFlight) {
    return authResyncInFlight;
  }

  authResyncInFlight = (async () => {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    let nextSession = data.session || null;
    const expiresAt = Number(nextSession?.expires_at || 0);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const shouldRefresh = nextSession && expiresAt > 0 && expiresAt - nowSeconds < 120;

    if (shouldRefresh) {
      const refreshResult = await supabaseClient.auth.refreshSession();
      if (refreshResult.error) throw refreshResult.error;
      nextSession = refreshResult.data.session || nextSession;
    }

    session = nextSession;
    if (!session && options.requireSession !== false) {
      throw new Error("Your session expired. Refresh and sign in again.");
    }
    return session;
  })();

  try {
    return await authResyncInFlight;
  } finally {
    authResyncInFlight = null;
  }
}

async function handleSessionResyncOnFocus() {
  if (!supabaseClient) return;
  try {
    const previousUserId = session?.user?.id || null;
    const nextSession = await ensureActiveSession({ requireSession: false });
    if (!nextSession) {
      if (previousUserId) {
        teardownProjectRealtimeSubscription();
        currentProfile = null;
        projects = [];
        saveSelectedProject("");
        resetProjectState();
        renderApp();
      }
      return;
    }

    if (previousUserId !== nextSession.user?.id) {
      await loadCurrentProfile();
      await loadProjects();
      return;
    }

    if (selectedProjectId) {
      await loadProjectData({ silent: true });
    }
  } catch (error) {
    console.error("Session resync failed", error);
  }
}

function showRefreshBanner(message = "This project changed. Refresh to load the latest updates.") {
  dom.refreshBannerText.textContent = message;
  dom.refreshBanner.hidden = false;
}

function hideRefreshBanner() {
  dom.refreshBanner.hidden = true;
}

function getProjectName() {
  return projects.find((project) => project.id === selectedProjectId)?.name || "Projects";
}

function getSelectedProject() {
  return projects.find((project) => project.id === selectedProjectId) || null;
}

function getSelectedProjectDueSoonDays() {
  const value = Number.parseInt(getSelectedProject()?.due_soon_days, 10);
  return Number.isFinite(value) && value > 0 ? value : 7;
}

function isCurrentUserProjectOwner() {
  if (!session?.user?.id) return false;
  return state.members.some((member) => member.user_id === session.user.id && member.role === "owner")
    || getSelectedProject()?.owner_id === session.user.id;
}

function formatProjectModal(mode) {
  projectModalMode = mode;
  const isEdit = mode === "edit";
  dom.projectModalTitle.textContent = isEdit ? "Edit Project" : "New Project";
  dom.projectSubmitBtn.textContent = isEdit ? "Save changes" : "Create project";
}

function openCreateProjectModal() {
  formatProjectModal("create");
  dom.projectNameInput.value = "";
  dom.projectDueInput.value = "";
  dom.projectDueSoonInput.value = "7";
  openModal("projectModal");
}

function openEditProjectModal() {
  const project = getSelectedProject();
  if (!project) return;
  formatProjectModal("edit");
  dom.projectNameInput.value = project.name || "";
  dom.projectDueInput.value = normalizeDateValue(project.due_date);
  dom.projectDueSoonInput.value = String(getSelectedProjectDueSoonDays());
  openModal("projectModal");
}

const ALL_MODAL_IDS = [
  "projectModal", "milestoneModal", "meetingModal", "collaboratorModal",
  "memberSettingsModal", "profileModal", "taskModal",
  "membersModal", "milestonesModal", "dueSoonModal"
];

function openModal(targetId) {
  dom.modalBackdrop.hidden = false;
  ALL_MODAL_IDS.forEach((id) => {
    const element = document.querySelector(`#${id}`);
    if (element) element.hidden = id !== targetId;
  });
}

function closeModal() {
  dom.modalBackdrop.hidden = true;
  ALL_MODAL_IDS.forEach((id) => {
    const element = document.querySelector(`#${id}`);
    if (element) element.hidden = true;
  });
  activeTaskModalId = null;
  activeMemberSettingsUserId = null;
  dom.taskModalBody.innerHTML = "";
}

function openProfileModal() {
  dom.profileDisplayNameInput.value = currentProfile?.display_name || "";
  openModal("profileModal");
}

function getOwnerCount() {
  return state.members.filter((member) => member.role === "owner").length;
}

function openMemberSettingsModal(userId) {
  const member = state.members.find((entry) => entry.user_id === userId);
  if (!member || !isCurrentUserProjectOwner()) return;
  activeMemberSettingsUserId = userId;
  dom.memberSettingsLabel.textContent = member.display_name || member.email || "Member";
  dom.memberRoleInput.value = member.role;
  const isSelf = userId === session?.user?.id;
  const isLastOwner = member.role === "owner" && getOwnerCount() <= 1;
  dom.memberRoleInput.disabled = isSelf && isLastOwner;
  dom.saveMemberSettingsBtn.disabled = isSelf && isLastOwner;
  dom.removeMemberBtn.disabled = isSelf || isLastOwner;
  openModal("memberSettingsModal");
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

function getTaskById(taskId) {
  return state.tasks.find((task) => task.id === taskId) || null;
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
    dom.openProjectSettingsBtn.disabled = true;
    return;
  }

  dom.projectSelect.disabled = false;
  dom.openProjectSettingsBtn.disabled = false;
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
  // Compact: show first 3 avatars + overflow count
  const shown = state.members.slice(0, 3);
  const overflow = state.members.length - shown.length;
  shown.forEach((member) => {
    const tag = document.createElement("span");
    tag.className = "member-tag";
    tag.textContent = member.display_name || member.email?.split("@")[0] || "Member";
    dom.memberList.appendChild(tag);
  });
  if (overflow > 0) {
    const more = document.createElement("span");
    more.className = "member-tag member-tag-more";
    more.textContent = `+${overflow} more`;
    dom.memberList.appendChild(more);
  }
}

function openMembersModal() {
  const body = dom.membersModalBody;
  body.innerHTML = "";
  const isOwner = isCurrentUserProjectOwner();

  // ── Member list ──
  const memberHeading = document.createElement("div");
  memberHeading.className = "modal-section-heading";
  memberHeading.textContent = `Members (${state.members.length})`;
  body.appendChild(memberHeading);

  if (!state.members.length) {
    const empty = document.createElement("div");
    empty.className = "muted-line";
    empty.textContent = "No members yet.";
    body.appendChild(empty);
  } else {
    state.members.forEach((member) => {
      const row = document.createElement("div");
      row.className = "modal-list-row";
      const label = member.display_name || member.email || "Member";
      row.innerHTML = `
        <span class="modal-list-name">${label}</span>
        <span class="modal-list-meta">${member.role}</span>
        ${isOwner ? `<button class="mini-button modal-list-action" data-uid="${member.user_id}">Manage</button>` : ""}
      `;
      if (isOwner) {
        row.querySelector("[data-uid]").addEventListener("click", () => openMemberSettingsModal(member.user_id));
      }
      body.appendChild(row);
    });
  }

  // ── Pending invitations ──
  if (state.invitations.length) {
    const invHeading = document.createElement("div");
    invHeading.className = "modal-section-heading";
    invHeading.textContent = "Pending Invitations";
    body.appendChild(invHeading);
    state.invitations.forEach((invite) => {
      const row = document.createElement("div");
      row.className = "modal-list-row";
      row.innerHTML = `
        <span class="modal-list-name">${invite.email}</span>
        <span class="modal-list-meta">${invite.role} · ${invite.status}</span>
      `;
      body.appendChild(row);
    });
  }

  // ── Add collaborator ──
  if (isOwner) {
    const addHeading = document.createElement("div");
    addHeading.className = "modal-section-heading";
    addHeading.textContent = "Add Collaborator";
    body.appendChild(addHeading);

    const form = document.createElement("form");
    form.className = "modal-inline-form";
    form.innerHTML = `
      <input class="project-input" type="email" placeholder="Email address" autocomplete="off" required />
      <select class="project-select modal-inline-select">
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
        <option value="owner">Owner</option>
      </select>
      <button class="mini-button" type="submit">Add</button>
    `;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = form.querySelector("input").value.trim().toLowerCase();
      const role = form.querySelector("select").value;
      if (!email) return;
      const btn = form.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Adding…";
      await doInviteCollaborator(email, role);
      btn.disabled = false;
      btn.textContent = "Add";
      form.querySelector("input").value = "";
      openMembersModal(); // re-render
    });
    body.appendChild(form);
  }

  openModal("membersModal");
}

function renderProjectDue() {
  dom.projectDueSummary.innerHTML = "";
  const project = getSelectedProject();
  if (!project?.due_date) {
    dom.projectDueSummary.innerHTML = '<div class="muted-line">No project due date</div>';
    return;
  }

  const today = todayISO();
  const msPerDay = 1000 * 60 * 60 * 24;
  const diffMs = new Date(`${project.due_date}T00:00:00`) - new Date(`${today}T00:00:00`);
  const diffDays = Math.round(diffMs / msPerDay);
  const isOverdue = diffDays < 0;

  let countdown;
  if (diffDays === 0) countdown = "Due today";
  else if (diffDays === 1) countdown = "1 day left";
  else if (isOverdue) countdown = `${Math.abs(diffDays)} days overdue`;
  else countdown = `${diffDays} days left`;

  const item = document.createElement("div");
  item.className = `list-item ${isOverdue ? "is-overdue" : ""}`;
  item.textContent = formatDisplayDate(project.due_date);
  dom.projectDueSummary.appendChild(item);

  const countdownEl = document.createElement("div");
  countdownEl.className = `project-due-countdown ${isOverdue ? "is-overdue" : diffDays <= 7 ? "due-soon" : ""}`;
  countdownEl.textContent = countdown;
  dom.projectDueSummary.appendChild(countdownEl);
}

function renderMilestones() {
  dom.milestoneList.innerHTML = "";
  if (!state.milestones.length) {
    dom.milestoneList.innerHTML = '<div class="muted-line">No milestones</div>';
    return;
  }
  // Compact: show first 3
  const sorted = [...state.milestones].sort((a, b) => a.position - b.position);
  const overflow = sorted.length - 3;
  sorted.slice(0, 3).forEach((ms) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.textContent = `${ms.title}${ms.due_date ? ` · ${formatDisplayDate(ms.due_date)}` : ""}`;
    dom.milestoneList.appendChild(item);
  });
  if (overflow > 0) {
    const more = document.createElement("div");
    more.className = "list-item muted-line";
    more.textContent = `+${overflow} more`;
    dom.milestoneList.appendChild(more);
  }
}

function openMilestonesModal() {
  const body = dom.milestonesModalBody;
  body.innerHTML = "";
  const isOwner = isCurrentUserProjectOwner();
  const sorted = [...state.milestones].sort((a, b) => a.position - b.position);

  // ── Milestone list ──
  if (!sorted.length) {
    const empty = document.createElement("div");
    empty.className = "muted-line";
    empty.textContent = "No milestones yet.";
    body.appendChild(empty);
  } else {
    sorted.forEach((ms) => {
      const row = document.createElement("div");
      row.className = "modal-list-row";
      row.innerHTML = `
        <span class="modal-list-name">${ms.title}</span>
        <span class="modal-list-meta">${ms.due_date ? formatDisplayDate(ms.due_date) : "No due date"}</span>
        ${isOwner ? `<button class="mini-button danger-button modal-list-action" data-mid="${ms.id}" data-mtitle="${ms.title}">Delete</button>` : ""}
      `;
      if (isOwner) {
        row.querySelector("[data-mid]").addEventListener("click", async (e) => {
          const id = e.currentTarget.dataset.mid;
          const title = e.currentTarget.dataset.mtitle;
          const confirmed = window.confirm(`Delete milestone "${title}"?`);
          if (!confirmed) return;
          await removeMilestone(id, title);
          openMilestonesModal(); // re-render
        });
      }
      body.appendChild(row);
    });
  }

  // ── Add milestone ──
  if (isOwner) {
    const addHeading = document.createElement("div");
    addHeading.className = "modal-section-heading";
    addHeading.textContent = "Add Milestone";
    body.appendChild(addHeading);

    const form = document.createElement("form");
    form.className = "modal-inline-form";
    form.innerHTML = `
      <input class="project-input" type="text" placeholder="Milestone title" required />
      <input class="project-input" type="date" title="Due date (optional)" />
      <button class="mini-button" type="submit">Add</button>
    `;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = form.querySelector("input[type=text]").value.trim();
      const due_date = form.querySelector("input[type=date]").value || null;
      if (!title) return;
      const btn = form.querySelector("button");
      btn.disabled = true;
      btn.textContent = "Adding…";
      await doAddMilestone(title, due_date);
      btn.disabled = false;
      btn.textContent = "Add";
      form.querySelector("input[type=text]").value = "";
      form.querySelector("input[type=date]").value = "";
      openMilestonesModal(); // re-render
    });
    body.appendChild(form);
  }

  openModal("milestonesModal");
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
  const dueSoonDays = getSelectedProjectDueSoonDays();
  dom.dueSoonTitle.textContent = `Due Soon (${dueSoonDays} days)`;
  const cutoffDate = addDaysISO(todayISO(), dueSoonDays);
  const allItems = state.tasks
    .filter((task) => !task.archived && task.due_date && (task.due_date <= cutoffDate || isOverdue(task)))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

  if (!allItems.length) {
    dom.dueSoonList.innerHTML = `<div class="muted-line">No tasks due in the next ${dueSoonDays} days</div>`;
    return;
  }

  // Compact: show first 3
  const overflow = allItems.length - 3;
  allItems.slice(0, 3).forEach((task) => {
    const item = document.createElement("div");
    item.className = `list-item ${isOverdue(task) ? "is-overdue" : ""}`;
    item.textContent = `${task.title} · ${formatDisplayDate(task.due_date)}`;
    dom.dueSoonList.appendChild(item);
  });
  if (overflow > 0) {
    const more = document.createElement("div");
    more.className = "list-item muted-line";
    more.textContent = `+${overflow} more`;
    dom.dueSoonList.appendChild(more);
  }
}

function openDueSoonModal() {
  const body = dom.dueSoonModalBody;
  body.innerHTML = "";
  const dueSoonDays = getSelectedProjectDueSoonDays();
  dom.dueSoonModalTitle.textContent = `Due Soon (${dueSoonDays} days)`;
  const cutoffDate = addDaysISO(todayISO(), dueSoonDays);
  const allItems = state.tasks
    .filter((task) => !task.archived && task.due_date && (task.due_date <= cutoffDate || isOverdue(task)))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

  if (!allItems.length) {
    const empty = document.createElement("div");
    empty.className = "muted-line";
    empty.textContent = `No tasks due in the next ${dueSoonDays} days.`;
    body.appendChild(empty);
  } else {
    allItems.forEach((task) => {
      const row = document.createElement("div");
      row.className = `modal-list-row ${isOverdue(task) ? "is-overdue" : ""}`;
      row.innerHTML = `
        <span class="modal-list-name">${task.title}</span>
        <span class="modal-list-meta ${isOverdue(task) ? "is-overdue-text" : ""}">${formatDisplayDate(task.due_date)}</span>
      `;
      body.appendChild(row);
    });
  }

  openModal("dueSoonModal");
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
  row.dataset.level = Math.min(task.level, 4);

  const leftPadding = 16 + task.level * 22;

  row.innerHTML = `
    <div class="task-main-row">
      <div class="task-primary" style="padding-left:${leftPadding}px">
        <button class="indent-button collapse-button" type="button" aria-label="Collapse task">${task.collapsed ? "▶" : "▾"}</button>
        <button class="indent-button outdent-button" type="button" aria-label="Remove sub-task">←</button>
        <button class="indent-button indent-action" type="button" aria-label="Make sub-task">→</button>
        <label class="checkbox-wrap">
          <input class="task-check" type="checkbox" ${task.status === "done" ? "checked" : ""} />
        </label>
        <div class="task-title-wrap">
          <textarea class="task-title-input ${task.status === "done" ? "is-complete" : ""} task-level-${Math.min(task.level, 4)}" placeholder="Checklist item">${escapeHtml(task.title)}</textarea>
          <div class="task-badges">
            ${task.due_date ? `<span class="task-due-badge">${escapeHtml(formatDisplayDate(task.due_date))}</span>` : ""}
            ${getTaskAssigneeLabel(task.id) ? `<span class="assignee-badge">${escapeHtml(getTaskAssigneeLabel(task.id))}</span>` : ""}
            ${task.status === "done" && getTaskCompleterLabel(task) ? `<span class="completion-badge">✓ ${escapeHtml(getTaskCompleterLabel(task))}</span>` : ""}
            ${(state.comments.filter(c => c.task_id === task.id).length > 0) ? `<button class="task-comment-badge" type="button" title="View comments">💬 ${state.comments.filter(c => c.task_id === task.id).length} comment${state.comments.filter(c => c.task_id === task.id).length !== 1 ? "s" : ""}</button>` : ""}
          </div>
        </div>
      </div>
      <div class="task-row-actions">
        <button class="inline-add-subtask-button ${task.status === "done" ? "is-complete" : ""}" type="button" aria-label="Add sub-task" title="Add sub-task">+</button>
        <button class="inline-delete-task-button" type="button" aria-label="Delete task" title="Delete task">×</button>
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
  dom.userEmail.textContent = signedIn ? currentProfile?.display_name || session.user.email : "";

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

async function loadCurrentProfile() {
  if (!supabaseClient || !session?.user?.id) {
    currentProfile = null;
    return;
  }
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, email, display_name")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) {
    console.error(error);
    setSyncStatus(`Could not load profile: ${error.message}`, true);
    return;
  }
  currentProfile = data || { id: session.user.id, email: session.user.email || "", display_name: "" };
}

function renderApp() {
  syncParentCompletion();
  dom.pageTitle.textContent = getProjectName();
  renderAuth();
  renderProjects();
  dom.openProjectSettingsBtn.hidden = !selectedProjectId;
  dom.openProjectSettingsBtn.disabled = !selectedProjectId || !isCurrentUserProjectOwner();
  renderProjectDue();
  renderMembers();
  renderMilestones();
  renderMeetings();
  renderInvitations();
  renderDueSoon();
  renderStats();
  renderTasks();
  renderLinksPanel();
  saveLocalState();
}

function focusTaskTitle(taskId, cursorPosition = null) {
  const input = document.querySelector(`.task-row[data-id="${taskId}"] .task-title-input`);
  if (!input) return;
  autoResizeTextarea(input);
  input.focus();
  const position = typeof cursorPosition === "number" ? cursorPosition : input.value.length;
  try {
    input.setSelectionRange(position, position);
  } catch (_error) {
    // Ignore selection issues on unfocused or unsupported states.
  }
}

function wireTaskRow(row, task, index) {
  const titleInput = row.querySelector(".task-title-input");
  autoResizeTextarea(titleInput);
  requestAnimationFrame(() => autoResizeTextarea(titleInput));
  titleInput.addEventListener("focus", () => {
    autoResizeTextarea(titleInput);
    requestAnimationFrame(() => autoResizeTextarea(titleInput));
  });
  titleInput.addEventListener("click", () => {
    autoResizeTextarea(titleInput);
    requestAnimationFrame(() => autoResizeTextarea(titleInput));
  });
  titleInput.addEventListener("input", (event) => {
    autoResizeTextarea(event.target);
    task.title = event.target.value;
    saveLocalState();
    const existingTimer = titleSaveTimers.get(task.id);
    if (existingTimer) window.clearTimeout(existingTimer);
    const nextVersion = (titleSaveVersions.get(task.id) || 0) + 1;
    titleSaveVersions.set(task.id, nextVersion);
    const cursorPosition = event.target.selectionStart;
    const timerId = window.setTimeout(async () => {
      titleSaveTimers.delete(task.id);
      if (titleSaveVersions.get(task.id) !== nextVersion) return;
      setSyncStatus("Saving...");
      try {
        await saveTaskWithRetry(task.id, 2);
        await broadcastProjectChanged("A teammate updated this project. Refresh to load the latest changes.");
        if (titleSaveVersions.get(task.id) === nextVersion) {
          setSyncStatus("Task saved");
          scheduleConsistencyReload();
        }
      } catch (error) {
        console.error(error);
        if (titleSaveVersions.get(task.id) === nextVersion) setSyncStatus(`Save failed: ${error.message}`, true);
      }
      requestAnimationFrame(() => focusTaskTitle(task.id, cursorPosition));
    }, 5000);
    titleSaveTimers.set(task.id, timerId);
  });

  row.querySelector(".task-check").addEventListener("change", async (event) => {
    task.status = event.target.checked ? "done" : "not_started";
    task.completed_date = event.target.checked ? task.completed_date || todayISO() : "";
    task.completed_by = event.target.checked ? session?.user?.id || null : null;
    syncParentCompletion();
    const changedTaskIds = [task.id, ...getAncestorIndexes(index).map((ancestorIndex) => state.tasks[ancestorIndex].id)];
    await saveTaskFields(changedTaskIds, "Task updated");
  });

  row.querySelector(".collapse-button").addEventListener("click", async () => {
    task.collapsed = !task.collapsed;
    await persistProjectData(task.collapsed ? "Subtasks collapsed" : "Subtasks expanded");
  });

  const commentBadge = row.querySelector(".task-comment-badge");
  if (commentBadge) {
    commentBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      openTaskModal(task.id);
    });
  }

  row.querySelector(".task-primary").addEventListener("dblclick", (event) => {
    if (
      event.target.closest(".collapse-button") ||
      event.target.closest(".outdent-button") ||
      event.target.closest(".indent-action") ||
      event.target.closest(".checkbox-wrap") ||
      event.target.closest(".task-comment-badge")
    ) {
      return;
    }
    if (!task.title.trim()) {
      return;
    }
    openTaskModal(task.id);
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

  row.querySelector(".inline-delete-task-button").addEventListener("click", async () => {
    const deletedTaskIds = deleteTask(index);
    saveLocalState();
    renderApp();
    setSyncStatus("Saving...");
    try {
      await deleteTasksByIds(deletedTaskIds);
      await broadcastProjectChanged("A teammate updated this project. Refresh to load the latest changes.");
      setSyncStatus("Task deleted");
      scheduleConsistencyReload();
    } catch (error) {
      console.error(error);
      setSyncStatus(`Save failed: ${error.message}`, true);
    }
  });

  row.querySelector(".inline-add-subtask-button").addEventListener("click", async () => {
    addSubtask(index);
    renderApp();
    const parent = state.tasks[index];
    const nextTask = state.tasks[index + 1];
    if (nextTask && nextTask.level === parent.level + 1) {
      requestAnimationFrame(() => focusTaskTitle(nextTask.id, 0));
    }
  });
}

function renderTaskModal(task) {
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

  dom.taskModalBody.innerHTML = `
    <textarea class="detail-textarea task-description-input" placeholder="Description / notes">${escapeHtml(task.description || "")}</textarea>
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
  `;

  wireTaskModal(task);
}

function openTaskModal(taskId) {
  const task = getTaskById(taskId);
  if (!task || !task.title.trim()) return;
  activeTaskModalId = taskId;
  renderTaskModal(task);
  openModal("taskModal");
}

function refreshTaskModalIfOpen() {
  if (!activeTaskModalId) return;
  const task = getTaskById(activeTaskModalId);
  if (!task) {
    closeModal();
    return;
  }
  renderTaskModal(task);
}

function wireTaskModal(task) {
  dom.taskModalBody.querySelector(".task-description-input").addEventListener("input", async (event) => {
    task.description = event.target.value;
    await saveTaskFields([task.id], "Description saved", false);
  });

  dom.taskModalBody.querySelector(".task-status-input").addEventListener("change", async (event) => {
    task.status = event.target.value;
    task.completed_date = task.status === "done" ? task.completed_date || todayISO() : "";
    task.completed_by = task.status === "done" ? task.completed_by || session?.user?.id || null : null;
    if (task.status !== "done") {
      task.completed_date = "";
      task.completed_by = null;
    }
    syncParentCompletion();
    const taskIndex = getTaskIndex(task.id);
    const changedTaskIds = [task.id, ...getAncestorIndexes(taskIndex).map((ancestorIndex) => state.tasks[ancestorIndex].id)];
    await saveTaskFields(changedTaskIds, "Status saved");
  });

  dom.taskModalBody.querySelector(".task-priority-input").addEventListener("change", async (event) => {
    task.priority = event.target.value;
    await saveTaskFields([task.id], "Priority saved", false);
  });

  dom.taskModalBody.querySelector(".task-due-input").addEventListener("input", async (event) => {
    task.due_date = event.target.value;
    await saveTaskFields([task.id], "Due date saved", false);
  });

  dom.taskModalBody.querySelector(".task-done-input").addEventListener("input", async (event) => {
    task.completed_date = event.target.value;
    task.status = event.target.value ? "done" : "not_started";
    task.completed_by = event.target.value ? task.completed_by || session?.user?.id || null : null;
    if (!event.target.value) task.completed_by = null;
    syncParentCompletion();
    const taskIndex = getTaskIndex(task.id);
    const changedTaskIds = [task.id, ...getAncestorIndexes(taskIndex).map((ancestorIndex) => state.tasks[ancestorIndex].id)];
    await saveTaskFields(changedTaskIds, "Completion saved");
  });

  dom.taskModalBody.querySelector(".task-milestone-input").addEventListener("change", async (event) => {
    task.milestone_id = event.target.value === SELECT_NONE ? null : event.target.value;
    await saveTaskFields([task.id], "Milestone saved", false);
  });

  dom.taskModalBody.querySelector(".task-assignee-input").addEventListener("change", async (event) => {
    setTaskAssignee(task.id, event.target.value === SELECT_NONE ? null : event.target.value);
    saveLocalState();
    setSyncStatus("Saving...");
    try {
      await replaceTaskAssignee(task.id);
      await broadcastProjectChanged("A teammate updated this project. Refresh to load the latest changes.");
      setSyncStatus("Assignee saved");
      refreshTaskModalIfOpen();
      renderApp();
      scheduleConsistencyReload();
    } catch (error) {
      console.error(error);
      setSyncStatus(`Save failed: ${error.message}`, true);
    }
  });

  dom.taskModalBody.querySelector(".task-dependency-input").addEventListener("change", async (event) => {
    setTaskDependency(task.id, event.target.value === SELECT_NONE ? null : event.target.value);
    saveLocalState();
    setSyncStatus("Saving...");
    try {
      await replaceTaskDependency(task.id);
      await broadcastProjectChanged("A teammate updated this project. Refresh to load the latest changes.");
      setSyncStatus("Dependency saved");
      refreshTaskModalIfOpen();
      renderApp();
      scheduleConsistencyReload();
    } catch (error) {
      console.error(error);
      setSyncStatus(`Save failed: ${error.message}`, true);
    }
  });

  dom.taskModalBody.querySelector(".comment-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = dom.taskModalBody.querySelector(".comment-input");
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
    const newComment = state.comments[state.comments.length - 1];
    saveLocalState();
    setSyncStatus("Saving...");
    try {
      await insertTaskComment(newComment);
      await broadcastProjectChanged("A teammate updated this project. Refresh to load the latest changes.");
      setSyncStatus("Comment added");
      refreshTaskModalIfOpen();
      renderApp();
      scheduleConsistencyReload();
    } catch (error) {
      console.error(error);
      setSyncStatus(`Save failed: ${error.message}`, true);
    }
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
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(2);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year}, ${hours}:${minutes}`;
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
  idsToDelete.forEach((taskId) => {
    expandedDetailTaskIds.delete(taskId);
    const timerId = titleSaveTimers.get(taskId);
    if (timerId) window.clearTimeout(timerId);
    titleSaveTimers.delete(taskId);
  });
  state.tasks.splice(index, deleteCount);
  state.assignees = state.assignees.filter((entry) => !idsToDelete.has(entry.task_id));
  state.dependencies = state.dependencies.filter(
    (entry) => !idsToDelete.has(entry.task_id) && !idsToDelete.has(entry.depends_on_task_id)
  );
  state.comments = state.comments.filter((entry) => !idsToDelete.has(entry.task_id));
  refreshTaskPositions();
  return [...idsToDelete];
}

function refreshTaskPositions() {
  state.tasks.forEach((task, index) => {
    task.position = index;
  });
}

function cloneTaskSnapshot(taskId) {
  const index = getTaskIndex(taskId);
  if (index < 0) return null;
  return structuredClone(state.tasks[index]);
}

function restoreTaskSnapshot(taskSnapshot) {
  if (!taskSnapshot) return;
  const existingIndex = getTaskIndex(taskSnapshot.id);
  if (existingIndex >= 0) {
    state.tasks[existingIndex] = {
      ...state.tasks[existingIndex],
      ...taskSnapshot
    };
  } else {
    const insertAt = Math.max(0, Math.min(taskSnapshot.position ?? state.tasks.length, state.tasks.length));
    state.tasks.splice(insertAt, 0, taskSnapshot);
  }
  refreshTaskPositions();
  saveLocalState();
  renderApp();
}

function queueTaskSave(taskId, operation) {
  const previous = taskSaveQueues.get(taskId) || Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  taskSaveQueues.set(taskId, next);
  next.finally(() => {
    if (taskSaveQueues.get(taskId) === next) {
      taskSaveQueues.delete(taskId);
    }
  });
  return next;
}

function getTaskIndex(taskId) {
  return state.tasks.findIndex((task) => task.id === taskId);
}

function getAncestorIndexes(taskIndex) {
  const task = state.tasks[taskIndex];
  if (!task) return [];
  const ancestors = [];
  let currentLevel = task.level;
  for (let index = taskIndex - 1; index >= 0; index -= 1) {
    const candidate = state.tasks[index];
    if (candidate.level < currentLevel) {
      ancestors.unshift(index);
      currentLevel = candidate.level;
      if (currentLevel === 0) break;
    }
  }
  return ancestors;
}

function buildTaskRowForDb(task, index = getTaskIndex(task.id)) {
  return {
    ...task,
    due_date: nullableDateValue(task.due_date),
    completed_date: nullableDateValue(task.completed_date),
    completed_by: task.completed_by || null,
    project_id: selectedProjectId,
    position: index,
    parent_task_id: null
  };
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
  return state.tasks.map((task, index) => buildTaskRowForDb(task, index));
}

async function loadProjects() {
  if (!supabaseClient || !session) return;
  await acceptPendingInvitations();
  const { data, error } = await supabaseClient
    .from("projects")
    .select("id, name, owner_id, due_date, due_soon_days")
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
    saveSelectedProject(projects[projects.length - 1].id);
  }
  setupProjectRealtimeSubscription();
  await loadProjectData();
}

function teardownProjectRealtimeSubscription() {
  if (!supabaseClient || !projectChannel) return;
  supabaseClient.removeChannel(projectChannel);
  projectChannel = null;
}

function setupProjectRealtimeSubscription() {
  if (!supabaseClient || !session || !selectedProjectId) {
    teardownProjectRealtimeSubscription();
    return;
  }

  const nextChannelName = `project-updates:${selectedProjectId}`;
  if (projectChannel?.topic === nextChannelName) return;

  teardownProjectRealtimeSubscription();
  projectChannel = supabaseClient
    .channel(nextChannelName)
    .on("broadcast", { event: "project-updated" }, ({ payload }) => {
      if (!payload || payload.senderId === realtimeClientId) return;
      showRefreshBanner(payload.message || "This project changed. Refresh to load the latest updates.");
    })
    .subscribe();
}

async function broadcastProjectChanged(message) {
  if (!projectChannel) return;
  Promise.resolve(
    projectChannel.send({
      type: "broadcast",
      event: "project-updated",
      payload: {
        senderId: realtimeClientId,
        message: message || "This project changed. Refresh to load the latest updates."
      }
    })
  ).catch((error) => {
    console.error("Broadcast failed", error);
  });
}

async function acceptPendingInvitations() {
  if (!supabaseClient || !session?.user?.email) return;
  const { error } = await supabaseClient.rpc("accept_pending_invitations");
  if (error) {
    console.error(error);
    setSyncStatus(`Could not accept invitations: ${error.message}`, true);
  }
}

async function loadProjectData(options = {}) {
  if (!supabaseClient || !session || !selectedProjectId) {
    resetProjectState();
    renderApp();
    return;
  }

  const silent = Boolean(options.silent);
  if (!silent) setSyncStatus("Loading project...");
  hideRefreshBanner();

  const [
    tasksResult,
    milestonesResult,
    meetingsResult,
    invitesResult,
    membersResult,
    linksResult
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
      .eq("project_id", selectedProjectId),
    supabaseClient
      .from("project_links")
      .select("id, project_id, label, url, created_by")
      .eq("project_id", selectedProjectId)
      .order("created_at", { ascending: true })
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
  projectLinks = linksResult.data || [];

  if (!silent) setSyncStatus("Synced");
  renderApp();
}

async function upsertTasks(taskIds) {
  if (!supabaseClient || !selectedProjectId || !taskIds.length) return;
  await ensureActiveSession();
  refreshTaskPositions();
  const rows = taskIds
    .map((taskId) => {
      const index = getTaskIndex(taskId);
      return index >= 0 ? buildTaskRowForDb(state.tasks[index], index) : null;
    })
    .filter(Boolean);
  if (!rows.length) return;
  const { error } = await supabaseClient.from("tasks").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

async function replaceTaskAssignee(taskId) {
  if (!supabaseClient || !selectedProjectId) return;
  await ensureActiveSession();
  const { error: deleteError } = await supabaseClient.from("task_assignees").delete().eq("task_id", taskId);
  if (deleteError) throw deleteError;
  const next = state.assignees.find((entry) => entry.task_id === taskId);
  if (!next) return;
  const { error: insertError } = await supabaseClient.from("task_assignees").insert(next);
  if (insertError) throw insertError;
}

async function replaceTaskDependency(taskId) {
  if (!supabaseClient || !selectedProjectId) return;
  await ensureActiveSession();
  const { error: deleteError } = await supabaseClient.from("task_dependencies").delete().eq("task_id", taskId);
  if (deleteError) throw deleteError;
  const next = state.dependencies.find((entry) => entry.task_id === taskId);
  if (!next) return;
  const { error: insertError } = await supabaseClient.from("task_dependencies").insert(next);
  if (insertError) throw insertError;
}

async function insertTaskComment(comment) {
  if (!supabaseClient || !comment) return;
  await ensureActiveSession();
  const { error } = await supabaseClient.from("task_comments").insert(comment);
  if (error) throw error;
}

async function deleteTasksByIds(taskIds) {
  if (!supabaseClient || !taskIds.length) return;
  await ensureActiveSession();
  const { error } = await supabaseClient.from("tasks").delete().in("id", taskIds);
  if (error) throw error;
}

async function saveTaskFields(taskIds, message, rerender = true) {
  if (!supabaseClient || !selectedProjectId) return;
  await ensureActiveSession();
  saveLocalState();
  setSyncStatus("Saving...");
  try {
    await withTimeout(upsertTasks(taskIds), 8000, "Task save");
    await broadcastProjectChanged("A teammate updated this project. Refresh to load the latest changes.");
    setSyncStatus(message || "Synced");
    refreshTaskModalIfOpen();
    if (rerender) renderApp();
    scheduleConsistencyReload();
  } catch (error) {
    console.error(error);
    setSyncStatus(`Save failed: ${error.message}`, true);
  }
}

async function persistProjectDataNow(message, rerender = true) {
  if (!supabaseClient || !selectedProjectId) return;
  await ensureActiveSession();

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

    await broadcastProjectChanged("A teammate updated this project. Refresh to load the latest changes.");
    setSyncStatus(message || "Synced");
    refreshTaskModalIfOpen();
    if (rerender) renderApp();
  } catch (error) {
    console.error(error);
    setSyncStatus(`Save failed: ${error.message}`, true);
  }
}

function persistProjectData(message, rerender = true) {
  persistQueue = persistQueue
    .catch(() => {})
    .then(() => persistProjectDataNow(message, rerender));
  return persistQueue;
}

async function createProject(name) {
  if (!supabaseClient || !session || !name.trim()) return;
  const dueSoonDays = Number.parseInt(dom.projectDueSoonInput.value, 10);
  setSyncStatus("Creating project...");

  // Insert without .select() to avoid PostgREST mis-reporting a SELECT RLS
  // violation as an INSERT violation before the owner-member trigger fires.
  const { error } = await supabaseClient
    .from("projects")
    .insert([
      {
        owner_id: session.user.id,
        name: name.trim(),
        due_date: dom.projectDueInput.value || null,
        due_soon_days: Number.isFinite(dueSoonDays) && dueSoonDays > 0 ? dueSoonDays : 7
      }
    ]);
  if (error) {
    console.error(error);
    setSyncStatus(`Could not create project: ${error.message}`, true);
    return;
  }

  dom.projectNameInput.value = "";
  dom.projectDueInput.value = "";
  dom.projectDueSoonInput.value = "7";
  closeModal();

  // Reload the full project list — the new project will appear and be selected.
  await loadProjects();
}

async function updateProjectSettings() {
  const project = getSelectedProject();
  const name = dom.projectNameInput.value.trim();
  if (!supabaseClient || !session || !project || !name) return;

  const dueSoonDays = Number.parseInt(dom.projectDueSoonInput.value, 10);
  const payload = {
    name,
    due_date: dom.projectDueInput.value || null,
    due_soon_days: Number.isFinite(dueSoonDays) && dueSoonDays > 0 ? dueSoonDays : 7
  };

  setSyncStatus("Saving project settings...");
  const { data, error } = await supabaseClient
    .from("projects")
    .update(payload)
    .eq("id", project.id)
    .select("id, name, owner_id, due_date, due_soon_days")
    .single();

  if (error) {
    console.error(error);
    setSyncStatus(`Could not update project: ${error.message}`, true);
    return;
  }

  projects = projects.map((entry) => (entry.id === data.id ? data : entry));
  closeModal();
  renderApp();
  await broadcastProjectChanged("Project settings changed. Refresh to load the latest details.");
  setSyncStatus("Project settings saved");
}

async function doAddMilestone(title, due_date) {
  if (!title || !selectedProjectId || !isCurrentUserProjectOwner()) return;
  state.milestones.push({
    id: crypto.randomUUID(),
    project_id: selectedProjectId,
    title,
    due_date: due_date || null,
    position: state.milestones.length
  });
  await persistProjectData("Milestone added");
}

async function addMilestone() {
  const title = dom.milestoneTitleInput.value.trim();
  if (!title) return;
  await doAddMilestone(title, dom.milestoneDueInput.value);
  dom.milestoneTitleInput.value = "";
  dom.milestoneDueInput.value = "";
  closeModal();
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

async function doInviteCollaborator(email, role) {
  if (!email || !selectedProjectId) return;
  const safeRole = ["owner", "editor", "viewer"].includes(role) ? role : "viewer";

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("id, email, display_name")
    .eq("email", email)
    .maybeSingle();

  if (profile?.id) {
    const { error } = await supabaseClient
      .from("project_members")
      .upsert([{ project_id: selectedProjectId, user_id: profile.id, role: safeRole }], { onConflict: "project_id,user_id" });
    if (error) {
      console.error(error);
      setSyncStatus(`Could not add collaborator: ${error.message}`, true);
      return;
    }
  } else {
    const { error } = await supabaseClient.from("project_invitations").insert([
      { project_id: selectedProjectId, email, role: safeRole, invited_by: session.user.id, status: "pending" }
    ]);
    if (error) {
      console.error(error);
      setSyncStatus(`Could not create invitation: ${error.message}`, true);
      return;
    }
  }

  await loadProjectData();
  await broadcastProjectChanged("A teammate updated collaborators on this project. Refresh to reload members.");
  setSyncStatus("Collaborator update saved");
}

async function inviteCollaborator() {
  const email = dom.inviteEmailInput.value.trim().toLowerCase();
  if (!email) return;
  await doInviteCollaborator(email, dom.inviteRoleInput.value);
  dom.inviteEmailInput.value = "";
  closeModal();
}

async function removeCollaborator(userId, label) {
  if (!supabaseClient || !selectedProjectId || !isCurrentUserProjectOwner()) return;
  const member = state.members.find((entry) => entry.user_id === userId);
  if (member?.role === "owner" && getOwnerCount() <= 1) {
    setSyncStatus("At least one owner must remain on the project.", true);
    return;
  }
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

async function updateCollaboratorRole(userId, nextRole) {
  if (!supabaseClient || !selectedProjectId || !isCurrentUserProjectOwner()) return;
  const member = state.members.find((entry) => entry.user_id === userId);
  if (!member || !["viewer", "editor", "owner"].includes(nextRole)) return;
  if (member.role === "owner" && nextRole !== "owner" && getOwnerCount() <= 1) {
    setSyncStatus("At least one owner must remain on the project.", true);
    return;
  }

  const { error } = await supabaseClient
    .from("project_members")
    .update({ role: nextRole })
    .eq("project_id", selectedProjectId)
    .eq("user_id", userId);

  if (error) {
    console.error(error);
    setSyncStatus(`Could not update member role: ${error.message}`, true);
    return;
  }

  closeModal();
  await loadProjectData();
  await broadcastProjectChanged("A teammate updated member roles. Refresh to reload member permissions.");
  setSyncStatus("Member role updated");
}

async function updateProfileDisplayName() {
  if (!supabaseClient || !session?.user?.id) return;
  const displayName = dom.profileDisplayNameInput.value.trim();
  const { data, error } = await supabaseClient
    .from("profiles")
    .upsert(
      [{ id: session.user.id, email: session.user.email || "", display_name: displayName || null }],
      { onConflict: "id" }
    )
    .select("id, email, display_name")
    .single();

  if (error) {
    console.error(error);
    setSyncStatus(`Could not update profile: ${error.message}`, true);
    return;
  }

  currentProfile = data;
  closeModal();
  if (selectedProjectId) {
    await loadProjectData();
    await broadcastProjectChanged("A teammate updated their profile name. Refresh to reload member labels.");
  } else {
    renderApp();
  }
  setSyncStatus("Profile saved");
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
  await loadCurrentProfile();
  await loadProjects();
}

async function handleSignOut() {
  if (!supabaseClient) return;
  teardownProjectRealtimeSubscription();
  await supabaseClient.auth.signOut();
  session = null;
  currentProfile = null;
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
  if (session) {
    await loadCurrentProfile();
    await loadProjects();
  }
  supabaseClient.auth.onAuthStateChange(async (_event, nextSession) => {
    session = nextSession;
    if (session) {
      await loadCurrentProfile();
      await loadProjects();
    } else {
      teardownProjectRealtimeSubscription();
      currentProfile = null;
      projects = [];
      saveSelectedProject("");
      resetProjectState();
      renderApp();
    }
  });
  window.addEventListener("focus", () => {
    void handleSessionResyncOnFocus();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void handleSessionResyncOnFocus();
    }
  });
}

// ── Useful Links ────────────────────────────────────────────────────────────

function renderLinksPanel() {
  const container = dom.linkChips;
  if (!container) return;
  container.innerHTML = "";
  projectLinks.forEach((link) => {
    const chip = document.createElement("div");
    chip.className = "link-chip";
    chip.innerHTML = `
      <a class="link-chip-anchor" href="${link.url}" target="_blank" rel="noopener noreferrer">
        <svg class="link-chip-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M6.5 9.5a3.536 3.536 0 0 0 5 0l2-2a3.536 3.536 0 0 0-5-5l-1 1"/>
          <path d="M9.5 6.5a3.536 3.536 0 0 0-5 0l-2 2a3.536 3.536 0 0 0 5 5l1-1"/>
        </svg>
        <span class="link-chip-label">${link.label}</span>
      </a>
      <button class="link-chip-delete" data-id="${link.id}" aria-label="Remove link">×</button>
    `;
    chip.querySelector(".link-chip-delete").addEventListener("click", () => deleteProjectLink(link.id));
    container.appendChild(chip);
  });
}

async function addProjectLink(label, url) {
  if (!supabaseClient || !session || !selectedProjectId) return;
  const { data, error } = await supabaseClient
    .from("project_links")
    .insert([{ project_id: selectedProjectId, label: label.trim(), url: url.trim(), created_by: session.user.id }])
    .select("id, project_id, label, url, created_by")
    .single();
  if (error) {
    console.error("Could not add link:", error);
    return;
  }
  projectLinks.push(data);
  renderLinksPanel();
}

async function deleteProjectLink(id) {
  if (!supabaseClient || !session) return;
  const { error } = await supabaseClient.from("project_links").delete().eq("id", id);
  if (error) {
    console.error("Could not delete link:", error);
    return;
  }
  projectLinks = projectLinks.filter((l) => l.id !== id);
  renderLinksPanel();
}

dom.openLinksBtn.addEventListener("click", () => {
  dom.linksPanel.hidden = !dom.linksPanel.hidden;
  if (!dom.linksPanel.hidden) dom.linkLabelInput.focus();
});

dom.closeLinksPanelBtn.addEventListener("click", () => {
  dom.linksPanel.hidden = true;
  dom.linkLabelInput.value = "";
  dom.linkUrlInput.value = "";
});

dom.addLinkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const label = dom.linkLabelInput.value.trim();
  const url = dom.linkUrlInput.value.trim();
  if (!label || !url) return;
  const btn = dom.addLinkForm.querySelector("button[type=submit]");
  btn.disabled = true;
  await addProjectLink(label, url);
  btn.disabled = false;
  dom.linkLabelInput.value = "";
  dom.linkUrlInput.value = "";
  dom.linksPanel.hidden = true;
});

// ── End Useful Links ─────────────────────────────────────────────────────────

dom.newTaskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = dom.newTaskTitle.value.trim();
  if (!title || !selectedProjectId) return;
  const task = createTask(title, 0);
  state.tasks.push(task);
  dom.newTaskTitle.value = "";
  await saveTaskFields([task.id], "Task added");
  requestAnimationFrame(() => focusTaskTitle(task.id, task.title.length));
});

dom.authForm.addEventListener("submit", handleAuthSubmit);
dom.projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (projectModalMode === "edit") {
    await updateProjectSettings();
    return;
  }
  await createProject(dom.projectNameInput.value);
});
dom.projectSelect.addEventListener("change", async (event) => {
  saveSelectedProject(event.target.value);
  setupProjectRealtimeSubscription();
  await loadProjectData();
});
dom.refreshBannerBtn.addEventListener("click", async () => {
  await loadProjectData();
});
dom.openProfileModalBtn.addEventListener("click", openProfileModal);
dom.openProjectModalBtn.addEventListener("click", openCreateProjectModal);
dom.openProjectSettingsBtn.addEventListener("click", openEditProjectModal);
dom.openMembersModalBtn.addEventListener("click", openMembersModal);
dom.openMilestonesModalBtn.addEventListener("click", openMilestonesModal);
dom.openDueSoonModalBtn.addEventListener("click", openDueSoonModal);
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
dom.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await updateProfileDisplayName();
});
dom.memberSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeMemberSettingsUserId) return;
  await updateCollaboratorRole(activeMemberSettingsUserId, dom.memberRoleInput.value);
});
dom.removeMemberBtn.addEventListener("click", async () => {
  if (!activeMemberSettingsUserId) return;
  const member = state.members.find((entry) => entry.user_id === activeMemberSettingsUserId);
  if (!member) return;
  const label = member.display_name || member.email || "Member";
  const confirmed = window.confirm(`Remove ${label} from this project?`);
  if (!confirmed) return;
  await removeCollaborator(member.user_id, label);
  closeModal();
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
