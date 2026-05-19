const STORAGE_KEY = "personal_task_planner_data";

const defaultCategoryNames = [
  "Работа",
  "Финансы",
  "Дом",
  "Семья",
  "Здоровье",
  "Обучение",
  "Личное",
  "Без категории",
];
const defaultCategoryColors = ["#4F46E5", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#8B5CF6", "#EC4899", "#6B7280"];
const UNCATEGORIZED_ID = "uncategorized";

let appData = null;
let editingTaskId = null;
let modalSubtasks = [];
let calendarState = {
  view: "week",
  currentDate: "",
};
let allTasksSearchTimer = null;

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function initDefaultData() {
  return {
    tasks: [],
    categories: defaultCategoryNames.map((name, index) => ({
      id: name === "Без категории" ? UNCATEGORIZED_ID : generateId(),
      name,
      color: defaultCategoryColors[index],
    })),
    settings: {
      theme: "light",
      accentColor: "#4F46E5",
      cardSize: "standard",
    },
  };
}

function normalizeData(data) {
  const defaultData = initDefaultData();
  const sourceData = data && typeof data === "object" ? data : {};
  const categories = normalizeCategories(sourceData.categories, defaultData.categories);
  const categoryIds = categories.map((category) => category.id);

  return {
    tasks: Array.isArray(sourceData.tasks)
      ? sourceData.tasks.map(normalizeTask).map((task) => ({
          ...task,
          categoryId: categoryIds.includes(task.categoryId) ? task.categoryId : UNCATEGORIZED_ID,
        }))
      : [],
    categories,
    settings: {
      ...defaultData.settings,
      ...(sourceData.settings || {}),
    },
  };
}

function normalizeCategories(categories, fallbackCategories) {
  const sourceCategories = Array.isArray(categories) && categories.length ? categories : fallbackCategories;
  const normalizedCategories = sourceCategories.map((category, index) => ({
    id: category.name === "Без категории" ? UNCATEGORIZED_ID : category.id || generateId(),
    name: category.name || "Новая категория",
    color: category.color || defaultCategoryColors[index % defaultCategoryColors.length],
  }));

  if (!normalizedCategories.some((category) => category.id === UNCATEGORIZED_ID)) {
    normalizedCategories.push({
      id: UNCATEGORIZED_ID,
      name: "Без категории",
      color: "#6B7280",
    });
  }

  return normalizedCategories;
}

function normalizeTask(task) {
  return {
    ...task,
    subtasks: Array.isArray(task.subtasks) ? task.subtasks.map(normalizeSubtask) : [],
  };
}

function normalizeSubtask(subtask) {
  return {
    id: subtask.id || generateId(),
    title: subtask.title || "",
    completed: Boolean(subtask.completed ?? subtask.isCompleted),
  };
}

function loadData() {
  const rawData = localStorage.getItem(STORAGE_KEY);

  if (!rawData) {
    const defaultData = initDefaultData();
    saveData(defaultData);
    return defaultData;
  }

  try {
    const parsedData = normalizeData(JSON.parse(rawData));
    saveData(parsedData);
    return parsedData;
  } catch (error) {
    console.error("Не удалось прочитать данные планировщика:", error);
    const defaultData = initDefaultData();
    saveData(defaultData);
    return defaultData;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function applySettings() {
  document.documentElement.dataset.theme = appData.settings.theme;
  document.documentElement.style.setProperty("--accent", appData.settings.accentColor);
  document.body.classList.toggle("compact-cards", appData.settings.cardSize === "compact");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");

  if (!container) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.append(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3000);
}

function createTask(taskData) {
  appData.tasks.push(taskData);
  saveData(appData);
  renderTasks();
  return taskData;
}

function updateTask(taskId, updates) {
  const taskIndex = appData.tasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    return null;
  }

  appData.tasks[taskIndex] = {
    ...appData.tasks[taskIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveData(appData);
  renderTasks();
  return appData.tasks[taskIndex];
}

function deleteTask(taskId) {
  appData.tasks = appData.tasks.filter((task) => task.id !== taskId);
  saveData(appData);
  renderTasks();
}

function cancelTask(taskId) {
  return updateTask(taskId, {
    status: "canceled",
    completedAt: null,
  });
}

function completeTask(taskId) {
  const taskIndex = appData.tasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    return null;
  }

  const now = new Date().toISOString();
  const completedTask = {
    ...appData.tasks[taskIndex],
    status: "completed",
    completedAt: now,
    updatedAt: now,
  };

  appData.tasks[taskIndex] = completedTask;

  if (completedTask.repeat && completedTask.repeat !== "none") {
    createNextRecurringTask(completedTask);
  }

  saveData(appData);
  renderTasks();
  showToast("Выполнено");
  return completedTask;
}

function createNextRecurringTask(completedTask) {
  const nextDueDate = getNextRecurringDate(completedTask.dueDate || getTodayDateString(), completedTask.repeat);

  if (!nextDueDate) {
    return null;
  }

  const now = new Date().toISOString();
  const nextTask = {
    ...completedTask,
    id: generateId(),
    status: "active",
    dueDate: nextDueDate,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    subtasks: Array.isArray(completedTask.subtasks)
      ? completedTask.subtasks.map((subtask) => ({
          ...normalizeSubtask(subtask),
          completed: false,
        }))
      : [],
  };

  appData.tasks.push(nextTask);
  return nextTask;
}

function getCategoryName(categoryId) {
  const category = appData.categories.find((item) => item.id === categoryId);
  return category ? category.name : "Без категории";
}

function getDefaultCategoryId() {
  return appData.categories.some((category) => category.id === UNCATEGORIZED_ID)
    ? UNCATEGORIZED_ID
    : appData.categories[0]?.id || "";
}

function getTodayDateString() {
  return dateToInputString(new Date());
}

function dateToInputString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDate(dateA, dateB) {
  return Boolean(dateA && dateB && String(dateA).slice(0, 10) === String(dateB).slice(0, 10));
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateToInputString(date);
}

function addMonths(dateString, months) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setMonth(date.getMonth() + months);
  return dateToInputString(date);
}

function parseInputDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonday(dateString) {
  const date = parseInputDate(dateString);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return dateToInputString(date);
}

function getMonthStart(dateString) {
  const date = parseInputDate(dateString);
  return dateToInputString(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getMonthTitle(dateString) {
  const date = parseInputDate(dateString);
  return date.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
}

function getNextRecurringDate(dateString, repeat) {
  if (!dateString || repeat === "none") {
    return "";
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (repeat === "daily") {
    date.setDate(date.getDate() + 1);
  }

  if (repeat === "weekly") {
    date.setDate(date.getDate() + 7);
  }

  if (repeat === "monthly") {
    date.setMonth(date.getMonth() + 1);
  }

  if (repeat === "yearly") {
    date.setFullYear(date.getFullYear() + 1);
  }

  return dateToInputString(date);
}

function formatHumanDate(dateString) {
  if (!dateString) {
    return "";
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTaskDate(task) {
  if (!task.dueDate) {
    return "";
  }

  return task.dueTime ? `${task.dueDate} ${task.dueTime}` : task.dueDate;
}

function getActiveTasks() {
  return appData.tasks.filter((task) => task.status === "active");
}

function getMainFocusTasks() {
  return getActiveTasks()
    .filter((task) => task.isMainFocus)
    .sort(sortTodayTasks)
    .slice(0, 3);
}

function getTodayTasks() {
  const today = getTodayDateString();
  return getActiveTasks()
    .filter((task) => task.dueDate === today)
    .sort(sortTodayTasks);
}

function getOverdueTasks() {
  const today = getTodayDateString();
  return getActiveTasks()
    .filter((task) => task.dueDate && task.dueDate < today)
    .sort((taskA, taskB) => taskA.dueDate.localeCompare(taskB.dueDate) || sortTodayTasks(taskA, taskB));
}

function getUpcomingTasks() {
  const today = getTodayDateString();
  const limitDate = addDays(today, 7);
  return getActiveTasks()
    .filter((task) => task.dueDate && task.dueDate > today && task.dueDate <= limitDate)
    .sort((taskA, taskB) => taskA.dueDate.localeCompare(taskB.dueDate) || sortTodayTasks(taskA, taskB));
}

function getUndatedTasks() {
  return getActiveTasks()
    .filter((task) => !task.dueDate)
    .sort(sortTodayTasks);
}

function getCompletedTodayTasks() {
  const today = getTodayDateString();
  return appData.tasks
    .filter((task) => task.status === "completed" && isSameDate(task.completedAt, today))
    .sort((taskA, taskB) => String(taskB.completedAt || "").localeCompare(String(taskA.completedAt || "")));
}

function getPriorityRank(priority) {
  const priorityMap = {
    high: 0,
    medium: 2,
    low: 3,
    none: 4,
  };
  return priorityMap[priority] ?? priorityMap.none;
}

function sortTodayTasks(taskA, taskB) {
  const focusDiff = Number(Boolean(taskB.isMainFocus)) - Number(Boolean(taskA.isMainFocus));
  if (focusDiff) {
    return focusDiff;
  }

  const highDiff = Number(taskB.priority === "high") - Number(taskA.priority === "high");
  if (highDiff) {
    return highDiff;
  }

  const timeDiff = Number(Boolean(taskB.dueTime)) - Number(Boolean(taskA.dueTime));
  if (timeDiff) {
    return timeDiff;
  }

  if (taskA.dueTime && taskB.dueTime && taskA.dueTime !== taskB.dueTime) {
    return taskA.dueTime.localeCompare(taskB.dueTime);
  }

  const priorityDiff = getPriorityRank(taskA.priority) - getPriorityRank(taskB.priority);
  if (priorityDiff) {
    return priorityDiff;
  }

  return String(taskA.createdAt || "").localeCompare(String(taskB.createdAt || ""));
}

function getTodaySearchFilteredTasks(tasks) {
  const searchInput = document.getElementById("today-search");
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  if (!query) {
    return tasks;
  }

  return tasks.filter((task) => {
    const haystack = `${task.title} ${task.description || ""} ${getCategoryName(task.categoryId)}`.toLowerCase();
    return haystack.includes(query);
  });
}

function getTaskSearchText(task) {
  const subtaskText = Array.isArray(task.subtasks)
    ? task.subtasks.map((subtask) => normalizeSubtask(subtask).title).join(" ")
    : "";

  return [
    task.title || "",
    task.description || "",
    subtaskText,
    getCategoryName(task.categoryId),
  ].join(" ").toLowerCase();
}

function isTaskInNextSevenDays(task) {
  const today = getTodayDateString();
  const limitDate = addDays(today, 7);
  return Boolean(task.dueDate && task.dueDate > today && task.dueDate <= limitDate);
}

function matchesStatusFilter(task, statusFilter) {
  const today = getTodayDateString();

  if (statusFilter === "active") {
    return task.status === "active";
  }

  if (statusFilter === "today") {
    return task.status === "active" && task.dueDate === today;
  }

  if (statusFilter === "overdue") {
    return task.status === "active" && task.dueDate && task.dueDate < today;
  }

  if (statusFilter === "upcoming") {
    return task.status === "active" && isTaskInNextSevenDays(task);
  }

  if (statusFilter === "undated") {
    return task.status === "active" && !task.dueDate;
  }

  if (statusFilter === "completed") {
    return task.status === "completed";
  }

  if (statusFilter === "canceled") {
    return task.status === "canceled";
  }

  return true;
}

function compareDate(taskA, taskB) {
  const dateA = taskA.dueDate || "9999-12-31";
  const dateB = taskB.dueDate || "9999-12-31";
  return dateA.localeCompare(dateB) || String(taskA.dueTime || "").localeCompare(String(taskB.dueTime || ""));
}

function comparePriority(taskA, taskB) {
  return getPriorityRank(taskA.priority) - getPriorityRank(taskB.priority) || compareDate(taskA, taskB);
}

function compareCategory(taskA, taskB) {
  return getCategoryName(taskA.categoryId).localeCompare(getCategoryName(taskB.categoryId), "ru")
    || compareDate(taskA, taskB);
}

function compareCreated(taskA, taskB) {
  return String(taskB.createdAt || "").localeCompare(String(taskA.createdAt || ""));
}

function compareOverdueFirst(taskA, taskB) {
  const today = getTodayDateString();
  const overdueA = Boolean(taskA.status === "active" && taskA.dueDate && taskA.dueDate < today);
  const overdueB = Boolean(taskB.status === "active" && taskB.dueDate && taskB.dueDate < today);
  return Number(overdueB) - Number(overdueA) || compareDate(taskA, taskB);
}

function getFilteredTasks() {
  const searchQuery = document.getElementById("all-tasks-search")?.value.trim().toLowerCase() || "";
  const statusFilter = document.getElementById("all-tasks-status-filter")?.value || "active";
  const categoryFilter = document.getElementById("all-tasks-category-filter")?.value || "all";
  const priorityFilter = document.getElementById("all-tasks-priority-filter")?.value || "all";
  const repeatFilter = document.getElementById("all-tasks-repeat-filter")?.value || "all";
  const sortMode = document.getElementById("all-tasks-sort")?.value || "date";

  const filteredTasks = appData.tasks.filter((task) => {
    const matchesSearch = !searchQuery || getTaskSearchText(task).includes(searchQuery);
    const matchesStatus = matchesStatusFilter(task, statusFilter);
    const matchesCategory = categoryFilter === "all" || task.categoryId === categoryFilter;
    const matchesPriority = priorityFilter === "all" || (task.priority || "none") === priorityFilter;
    const matchesRepeat = repeatFilter === "all" || (task.repeat || "none") === repeatFilter;

    return matchesSearch && matchesStatus && matchesCategory && matchesPriority && matchesRepeat;
  });

  const sorters = {
    date: compareDate,
    priority: comparePriority,
    category: compareCategory,
    created: compareCreated,
    "overdue-first": compareOverdueFirst,
  };

  return filteredTasks.sort(sorters[sortMode] || compareDate);
}

function canMarkMainFocus(taskId = null) {
  return appData.tasks.filter((task) => task.status === "active" && task.isMainFocus && task.id !== taskId).length < 3;
}

function showLimitMessage() {
  alert("Можно выбрать не больше 3 главных задач дня.");
}

function setTaskMainFocus(taskId, isMainFocus) {
  if (isMainFocus && !canMarkMainFocus(taskId)) {
    showLimitMessage();
    return null;
  }

  return updateTask(taskId, { isMainFocus });
}

function moveTaskToDate(taskId, dateString) {
  return updateTask(taskId, {
    dueDate: dateString,
    dueTime: "",
  });
}

function createEmptyTask(title) {
  const now = new Date().toISOString();

  return {
    id: generateId(),
    title,
    description: "",
    categoryId: getDefaultCategoryId(),
    dueDate: "",
    dueTime: "",
    priority: "none",
    status: "active",
    isMainFocus: false,
    repeat: "none",
    reminder: null,
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

function quickAddTask() {
  const input = document.getElementById("quick-task-title");
  const title = input.value.trim();

  if (!title) {
    return;
  }

  createTask(createEmptyTask(title));
  input.value = "";
}

function getActiveTaskCountByCategory(categoryId) {
  return appData.tasks.filter((task) => task.status === "active" && task.categoryId === categoryId).length;
}

function createCategory(name, color) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    showToast("Введите название категории", "error");
    return null;
  }

  const category = {
    id: generateId(),
    name: trimmedName,
    color: color || "#4F46E5",
  };

  appData.categories.push(category);
  saveData(appData);
  renderTasks();
  return category;
}

function updateCategory(categoryId, updates) {
  const categoryIndex = appData.categories.findIndex((category) => category.id === categoryId);

  if (categoryIndex === -1) {
    return null;
  }

  const nextName = (updates.name || appData.categories[categoryIndex].name).trim();

  if (!nextName) {
    showToast("Введите название категории", "error");
    return null;
  }

  appData.categories[categoryIndex] = {
    ...appData.categories[categoryIndex],
    ...updates,
    name: nextName,
  };
  saveData(appData);
  renderTasks();
  return appData.categories[categoryIndex];
}

function deleteCategory(categoryId) {
  if (categoryId === UNCATEGORIZED_ID) {
    showToast("Категорию Без категории нельзя удалить", "error");
    return;
  }

  appData.categories = appData.categories.filter((category) => category.id !== categoryId);
  appData.tasks = appData.tasks.map((task) => (
    task.categoryId === categoryId ? { ...task, categoryId: UNCATEGORIZED_ID, updatedAt: new Date().toISOString() } : task
  ));
  saveData(appData);
  renderTasks();
}

function renderTaskCard(task) {
  const card = document.createElement("article");
  card.className = `task-card priority-${task.priority || "none"}`;
  card.classList.toggle("completed", task.status === "completed");
  card.dataset.taskId = task.id;

  const checkbox = document.createElement("input");
  checkbox.className = "task-checkbox";
  checkbox.type = "checkbox";
  checkbox.checked = task.status === "completed";
  checkbox.setAttribute("aria-label", "Отметить задачу выполненной");
  checkbox.addEventListener("change", () => {
    if (checkbox.checked) {
      completeTask(task.id);
    } else {
      updateTask(task.id, {
        status: "active",
        completedAt: null,
      });
    }
  });

  const body = document.createElement("div");
  body.className = "task-body";

  const title = document.createElement("button");
  title.className = "task-title";
  title.type = "button";
  title.textContent = task.title;
  title.addEventListener("click", () => openTaskModal(task.id));

  const meta = document.createElement("div");
  meta.className = "task-meta";

  const category = document.createElement("span");
  category.textContent = getCategoryName(task.categoryId);
  meta.append(category);

  const taskDate = formatTaskDate(task);
  if (taskDate) {
    const date = document.createElement("span");
    date.textContent = taskDate;
    meta.append(date);
  }

  if (task.isMainFocus) {
    const focus = document.createElement("span");
    focus.textContent = "Главная";
    meta.append(focus);
  }

  const subtasks = Array.isArray(task.subtasks) ? task.subtasks.map(normalizeSubtask) : [];
  if (subtasks.length) {
    const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
    const progress = document.createElement("span");
    progress.className = "subtask-progress";
    progress.textContent = `${completedSubtasks}/${subtasks.length} подзадач`;
    meta.append(progress);
  }

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const actionSelect = document.createElement("select");
  actionSelect.className = "task-action-select";
  actionSelect.setAttribute("aria-label", "Быстрые действия");
  actionSelect.innerHTML = `
    <option value="">Действие</option>
    <option value="complete">Выполнить</option>
    <option value="cancel">Отменить</option>
    <option value="delete">Удалить</option>
    <option value="move-today">Перенести на сегодня</option>
    <option value="move-tomorrow">Перенести на завтра</option>
    <option value="toggle-focus">${task.isMainFocus ? "Снять главную" : "Отметить главной"}</option>
  `;
  actionSelect.addEventListener("change", () => {
    handleTaskAction(task.id, actionSelect.value);
    actionSelect.value = "";
  });

  actions.append(actionSelect);
  body.append(title, meta);
  card.append(checkbox, body, actions);

  return card;
}

function handleTaskAction(taskId, action) {
  if (!action) {
    return;
  }

  const task = appData.tasks.find((item) => item.id === taskId);
  if (!task) {
    return;
  }

  if (action === "complete") {
    completeTask(taskId);
  }

  if (action === "cancel") {
    cancelTask(taskId);
  }

  if (action === "delete") {
    deleteTask(taskId);
  }

  if (action === "move-today") {
    moveTaskToDate(taskId, getTodayDateString());
  }

  if (action === "move-tomorrow") {
    moveTaskToDate(taskId, addDays(getTodayDateString(), 1));
  }

  if (action === "toggle-focus") {
    setTaskMainFocus(taskId, !task.isMainFocus);
  }
}

function renderTaskList(container, tasks, emptyText) {
  container.innerHTML = "";

  if (!tasks.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = emptyText;
    container.append(emptyState);
    return;
  }

  tasks.forEach((task) => {
    container.append(renderTaskCard(task));
  });
}

function renderGroupedTaskList(container, tasks, emptyText) {
  container.innerHTML = "";

  if (!tasks.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = emptyText;
    container.append(emptyState);
    return;
  }

  const groups = tasks.reduce((acc, task) => {
    if (!acc[task.dueDate]) {
      acc[task.dueDate] = [];
    }
    acc[task.dueDate].push(task);
    return acc;
  }, {});

  Object.keys(groups).sort().forEach((dateString) => {
    const group = document.createElement("section");
    group.className = "date-group";

    const title = document.createElement("div");
    title.className = "date-group-title";
    title.textContent = formatHumanDate(dateString);

    const list = document.createElement("div");
    list.className = "task-list";
    groups[dateString].forEach((task) => list.append(renderTaskCard(task)));

    group.append(title, list);
    container.append(group);
  });
}

function setCount(id, count) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = String(count);
  }
}

function renderTodayView() {
  const dateTitle = document.getElementById("today-date-title");
  if (dateTitle) {
    dateTitle.textContent = formatHumanDate(getTodayDateString());
  }

  const mainFocusTasks = getTodaySearchFilteredTasks(getMainFocusTasks());
  const overdueTasks = getTodaySearchFilteredTasks(getOverdueTasks());
  const todayTasks = getTodaySearchFilteredTasks(getTodayTasks());
  const upcomingTasks = getTodaySearchFilteredTasks(getUpcomingTasks());
  const undatedTasks = getTodaySearchFilteredTasks(getUndatedTasks());
  const completedTodayTasks = getTodaySearchFilteredTasks(getCompletedTodayTasks());

  renderTaskList(document.getElementById("main-focus-task-list"), mainFocusTasks, "Главные задачи не выбраны.");
  renderTaskList(document.getElementById("overdue-task-list"), overdueTasks, "Просроченных задач нет.");
  renderTaskList(document.getElementById("today-task-list"), todayTasks, "На сегодня задач нет.");
  renderGroupedTaskList(document.getElementById("upcoming-task-list"), upcomingTasks, "На ближайшие 7 дней задач нет.");
  renderTaskList(document.getElementById("undated-task-list"), undatedTasks, "Задач без даты нет.");
  renderTaskList(document.getElementById("completed-today-task-list"), completedTodayTasks, "Сегодня выполненных задач нет.");

  setCount("main-focus-count", mainFocusTasks.length);
  setCount("overdue-count", overdueTasks.length);
  setCount("today-count", todayTasks.length);
  setCount("upcoming-count", upcomingTasks.length);
  setCount("undated-count", undatedTasks.length);
  setCount("completed-today-count", completedTodayTasks.length);
}

function renderAllTasksView() {
  const allTaskList = document.getElementById("all-task-list");
  if (!allTaskList) {
    return;
  }

  fillAllTasksCategoryFilter();
  renderTaskList(allTaskList, getFilteredTasks(), "Задачи не найдены.");
}

function renderCategoriesView() {
  const categoryList = document.getElementById("category-list");

  if (!categoryList) {
    return;
  }

  categoryList.innerHTML = "";

  appData.categories.forEach((category) => {
    const card = document.createElement("article");
    card.className = "category-card";

    const header = document.createElement("div");
    header.className = "category-card-header";

    const dot = document.createElement("span");
    dot.className = "category-color-dot";
    dot.style.background = category.color;

    const title = document.createElement("strong");
    title.textContent = category.name;

    const count = document.createElement("div");
    count.className = "category-count";
    count.textContent = `${getActiveTaskCountByCategory(category.id)} активных задач`;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = category.name;
    nameInput.disabled = category.id === UNCATEGORIZED_ID;

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = category.color;

    const actions = document.createElement("div");
    actions.className = "category-card-actions";

    const saveButton = document.createElement("button");
    saveButton.className = "secondary-button";
    saveButton.type = "button";
    saveButton.textContent = "Сохранить";
    saveButton.addEventListener("click", () => {
      updateCategory(category.id, {
        name: nameInput.value,
        color: colorInput.value,
      });
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger-button";
    deleteButton.type = "button";
    deleteButton.textContent = "Удалить";
    deleteButton.disabled = category.id === UNCATEGORIZED_ID;
    deleteButton.addEventListener("click", () => {
      deleteCategory(category.id);
    });

    header.append(dot, title);
    actions.append(saveButton, deleteButton);
    card.append(header, count, nameInput, colorInput, actions);
    categoryList.append(card);
  });
}

function renderSettingsView() {
  const themeSelect = document.getElementById("settings-theme");

  if (!themeSelect) {
    return;
  }

  themeSelect.value = appData.settings.theme;
  document.getElementById("settings-accent").value = appData.settings.accentColor;
  document.getElementById("settings-card-size").value = appData.settings.cardSize;
}

function updateSettings(updates) {
  appData.settings = {
    ...appData.settings,
    ...updates,
  };
  saveData(appData);
  applySettings();
  renderSettingsView();
}

function exportJson() {
  const today = getTodayDateString();
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `task_planner_backup_${today}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Экспорт завершен");
}

function validateImportedData(data) {
  return Boolean(data && typeof data === "object" && Array.isArray(data.tasks));
}

function importJson(file) {
  const reader = new FileReader();

  reader.addEventListener("load", () => {
    try {
      const parsedData = JSON.parse(reader.result);

      if (!validateImportedData(parsedData)) {
        showToast("Ошибка импорта: неверная структура файла", "error");
        return;
      }

      appData = normalizeData(parsedData);
      saveData(appData);
      applySettings();
      renderTasks();
      showToast("Импорт завершен");
    } catch (error) {
      showToast("Ошибка импорта: невалидный JSON", "error");
    }
  });

  reader.addEventListener("error", () => {
    showToast("Ошибка импорта: файл не прочитан", "error");
  });

  reader.readAsText(file);
}

function clearAllData() {
  if (!window.confirm("Вы уверены?")) {
    return;
  }

  appData = initDefaultData();
  saveData(appData);
  applySettings();
  renderTasks();
  showToast("Данные очищены");
}

function renderTasks() {
  renderTodayView();
  renderAllTasksView();
  renderCalendarView();
  renderCategoriesView();
  renderSettingsView();
}

function getTasksByDate(dateString) {
  return appData.tasks
    .filter((task) => task.status !== "canceled" && task.dueDate === dateString)
    .sort(sortTodayTasks);
}

function createCalendarTaskButton(task) {
  const button = document.createElement("button");
  button.className = "calendar-task-mini";
  button.type = "button";
  button.addEventListener("click", () => openTaskModal(task.id));

  const dot = document.createElement("span");
  dot.className = `priority-dot priority-${task.priority || "none"}`;

  const title = document.createElement("span");
  title.className = "calendar-task-title";
  title.textContent = task.title;

  button.append(dot, title);
  return button;
}

function renderCalendarTaskCard(task) {
  const button = document.createElement("button");
  button.className = "calendar-task-card";
  button.type = "button";
  button.addEventListener("click", () => openTaskModal(task.id));

  const dot = document.createElement("span");
  dot.className = `priority-dot priority-${task.priority || "none"}`;

  const content = document.createElement("span");
  content.className = "calendar-task-content";

  const title = document.createElement("span");
  title.className = "calendar-task-card-title";
  title.textContent = task.title;

  const metaParts = [];
  if (task.dueTime) {
    metaParts.push(task.dueTime);
  }

  const subtasks = Array.isArray(task.subtasks) ? task.subtasks.map(normalizeSubtask) : [];
  if (subtasks.length) {
    const completedSubtasks = subtasks.filter((subtask) => subtask.completed).length;
    metaParts.push(`${completedSubtasks}/${subtasks.length} подзадач`);
  }

  content.append(title);

  if (metaParts.length) {
    const meta = document.createElement("span");
    meta.className = "calendar-task-card-meta";
    meta.textContent = metaParts.join(" · ");
    content.append(meta);
  }

  button.append(dot, content);
  return button;
}

function createCalendarAddButton(dateString) {
  const button = document.createElement("button");
  button.className = "calendar-add-button";
  button.type = "button";
  button.textContent = "+";
  button.setAttribute("aria-label", `Добавить задачу на ${dateString}`);
  button.addEventListener("click", () => openTaskModal(null, { dueDate: dateString }));
  return button;
}

function renderWeekCalendar(container) {
  const weekStart = getMonday(calendarState.currentDate);
  const weekGrid = document.createElement("div");
  weekGrid.className = "week-grid";

  for (let index = 0; index < 7; index += 1) {
    const dateString = addDays(weekStart, index);
    const tasks = getTasksByDate(dateString);
    const day = parseInputDate(dateString);
    const column = document.createElement("section");
    column.className = "week-day";
    column.classList.toggle("today", dateString === getTodayDateString());

    const head = document.createElement("div");
    head.className = "calendar-day-head";

    const name = document.createElement("span");
    name.className = "calendar-day-name";
    name.textContent = day.toLocaleDateString("ru-RU", { weekday: "short" });

    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(day.getDate());

    const list = document.createElement("div");
    list.className = "calendar-day-tasks";

    if (tasks.length) {
      tasks.forEach((task) => list.append(renderCalendarTaskCard(task)));
    } else {
      const empty = document.createElement("div");
      empty.className = "calendar-empty";
      empty.textContent = "Задач нет";
      list.append(empty);
    }

    head.append(name, number);
    column.append(head, list, createCalendarAddButton(dateString));
    weekGrid.append(column);
  }

  container.append(weekGrid);
}

function renderMonthCalendar(container) {
  const monthStart = getMonthStart(calendarState.currentDate);
  const monthStartDate = parseInputDate(monthStart);
  const firstGridDate = getMonday(monthStart);
  const monthGrid = document.createElement("div");
  monthGrid.className = "month-grid";

  ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach((dayName) => {
    const weekday = document.createElement("div");
    weekday.className = "month-weekday";
    weekday.textContent = dayName;
    monthGrid.append(weekday);
  });

  for (let index = 0; index < 42; index += 1) {
    const dateString = addDays(firstGridDate, index);
    const dayDate = parseInputDate(dateString);
    const tasks = getTasksByDate(dateString);
    const cell = document.createElement("div");
    cell.className = "month-day";
    cell.classList.toggle("today", dateString === getTodayDateString());
    cell.classList.toggle("outside", dayDate.getMonth() !== monthStartDate.getMonth());

    const number = document.createElement("div");
    number.className = "month-day-number";
    number.textContent = String(dayDate.getDate());

    const list = document.createElement("div");
    list.className = "calendar-day-tasks";

    tasks.slice(0, 3).forEach((task) => list.append(createCalendarTaskButton(task)));

    if (tasks.length > 3) {
      const more = document.createElement("div");
      more.className = "month-more";
      more.textContent = `+${tasks.length - 3}`;
      list.append(more);
    }

    cell.append(number, list);
    monthGrid.append(cell);
  }

  container.append(monthGrid);
}

function renderCalendarView() {
  const container = document.getElementById("calendar-view");
  const title = document.getElementById("calendar-title");

  if (!container || !title) {
    return;
  }

  container.innerHTML = "";

  if (!calendarState.currentDate) {
    calendarState.currentDate = getTodayDateString();
  }

  document.querySelectorAll("[data-calendar-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.calendarView === calendarState.view);
  });

  if (calendarState.view === "week") {
    const weekStart = getMonday(calendarState.currentDate);
    const weekEnd = addDays(weekStart, 6);
    title.textContent = `${formatHumanDate(weekStart)} - ${formatHumanDate(weekEnd)}`;
    renderWeekCalendar(container);
    return;
  }

  title.textContent = getMonthTitle(calendarState.currentDate);
  renderMonthCalendar(container);
}

function setActiveScreen(screenName) {
  document.querySelectorAll("[data-screen-panel]").forEach((screen) => {
    const isActive = screen.dataset.screenPanel === screenName;
    screen.hidden = !isActive;
    screen.classList.toggle("active", isActive);
  });

  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screenName);
  });
}

function initNavigation() {
  document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      setActiveScreen(button.dataset.screen);
    });
  });
}

function fillCategorySelect(selectedCategoryId = "") {
  const categorySelect = document.getElementById("task-category");
  categorySelect.innerHTML = "";

  appData.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === selectedCategoryId;
    categorySelect.append(option);
  });
}

function fillAllTasksCategoryFilter() {
  const categorySelect = document.getElementById("all-tasks-category-filter");

  if (!categorySelect) {
    return;
  }

  const selectedValue = categorySelect.value || "all";
  categorySelect.innerHTML = '<option value="all">Все категории</option>';

  appData.categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    option.selected = category.id === selectedValue;
    categorySelect.append(option);
  });
}

function setModalError(message) {
  const errorBox = document.getElementById("task-form-error");
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function renderModalSubtasks() {
  const subtaskList = document.getElementById("subtask-list");
  subtaskList.innerHTML = "";

  modalSubtasks.forEach((subtask) => {
    const item = document.createElement("div");
    item.className = "subtask-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(subtask.completed);
    checkbox.addEventListener("change", () => {
      subtask.completed = checkbox.checked;
    });

    const title = document.createElement("span");
    title.textContent = subtask.title;

    const removeButton = document.createElement("button");
    removeButton.className = "subtask-remove";
    removeButton.type = "button";
    removeButton.textContent = "Удалить";
    removeButton.addEventListener("click", () => {
      modalSubtasks = modalSubtasks.filter((item) => item.id !== subtask.id);
      renderModalSubtasks();
    });

    item.append(checkbox, title, removeButton);
    subtaskList.append(item);
  });
}

function addModalSubtask() {
  const subtaskInput = document.getElementById("subtask-title");
  const title = subtaskInput.value.trim();

  if (!title) {
    return;
  }

  modalSubtasks.push({
    id: generateId(),
    title,
    completed: false,
  });
  subtaskInput.value = "";
  renderModalSubtasks();
}

function resetTaskModal() {
  document.getElementById("task-form").reset();
  document.getElementById("task-modal-title").textContent = "Новая задача";
  document.getElementById("delete-task-button").hidden = true;
  editingTaskId = null;
  modalSubtasks = [];
  setModalError("");
  fillCategorySelect();
  renderModalSubtasks();
}

function openTaskModal(taskId = null, defaults = {}) {
  resetTaskModal();

  if (taskId) {
    const task = appData.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    editingTaskId = taskId;
    document.getElementById("task-modal-title").textContent = "Редактирование задачи";
    document.getElementById("delete-task-button").hidden = false;
    document.getElementById("task-title").value = task.title || "";
    document.getElementById("task-description").value = task.description || "";
    document.getElementById("task-date").value = task.dueDate || "";
    document.getElementById("task-time").value = task.dueTime || "";
    document.getElementById("task-priority").value = task.priority || "none";
    document.getElementById("task-repeat").value = task.repeat || "none";
    document.getElementById("task-main-focus").checked = Boolean(task.isMainFocus);
    modalSubtasks = Array.isArray(task.subtasks) ? task.subtasks.map(normalizeSubtask) : [];
    fillCategorySelect(task.categoryId);
    renderModalSubtasks();
  }

  if (!taskId && defaults.dueDate) {
    document.getElementById("task-date").value = defaults.dueDate;
  }

  document.getElementById("task-modal").hidden = false;
  document.getElementById("task-title").focus();
}

function closeTaskModal() {
  document.getElementById("task-modal").hidden = true;
}

function buildTaskFromModal(existingTask = null) {
  const now = new Date().toISOString();

  return {
    id: existingTask ? existingTask.id : generateId(),
    title: document.getElementById("task-title").value.trim(),
    description: document.getElementById("task-description").value.trim(),
    categoryId: document.getElementById("task-category").value,
    dueDate: document.getElementById("task-date").value,
    dueTime: document.getElementById("task-time").value,
    priority: document.getElementById("task-priority").value,
    status: existingTask ? existingTask.status : "active",
    isMainFocus: document.getElementById("task-main-focus").checked,
    repeat: document.getElementById("task-repeat").value,
    reminder: existingTask ? existingTask.reminder : null,
    subtasks: modalSubtasks.map(normalizeSubtask),
    createdAt: existingTask ? existingTask.createdAt : now,
    updatedAt: now,
    completedAt: existingTask ? existingTask.completedAt : null,
  };
}

function saveTaskFromModal() {
  const title = document.getElementById("task-title").value.trim();
  const dueDate = document.getElementById("task-date").value;
  const dueTime = document.getElementById("task-time").value;
  const wantsMainFocus = document.getElementById("task-main-focus").checked;

  if (!title) {
    setModalError("Введите название задачи.");
    return;
  }

  if (dueTime && !dueDate) {
    setModalError("Время можно указать только вместе с датой.");
    return;
  }

  if (wantsMainFocus && !canMarkMainFocus(editingTaskId)) {
    setModalError("Можно выбрать не больше 3 главных задач дня.");
    showLimitMessage();
    return;
  }

  const existingTask = editingTaskId ? appData.tasks.find((task) => task.id === editingTaskId) : null;
  const task = buildTaskFromModal(existingTask);

  if (editingTaskId) {
    updateTask(editingTaskId, task);
  } else {
    createTask(task);
  }

  closeTaskModal();
  showToast("Задача сохранена");
}

function initTaskModal() {
  document.querySelectorAll("[data-open-task-modal]").forEach((button) => {
    button.addEventListener("click", () => openTaskModal());
  });

  document.querySelectorAll("[data-close-task-modal]").forEach((button) => {
    button.addEventListener("click", closeTaskModal);
  });

  document.getElementById("task-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveTaskFromModal();
  });

  document.getElementById("delete-task-button").addEventListener("click", () => {
    if (!editingTaskId) {
      return;
    }

    deleteTask(editingTaskId);
    closeTaskModal();
  });

  document.getElementById("add-subtask-button").addEventListener("click", addModalSubtask);
  document.getElementById("subtask-title").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addModalSubtask();
    }
  });
}

function initTodayView() {
  document.getElementById("quick-add-button").addEventListener("click", quickAddTask);
  document.getElementById("quick-task-title").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      quickAddTask();
    }
  });
  document.getElementById("today-search").addEventListener("input", renderTodayView);
}

function initCalendarView() {
  calendarState.currentDate = getTodayDateString();

  document.querySelectorAll("[data-calendar-view]").forEach((button) => {
    button.addEventListener("click", () => {
      calendarState.view = button.dataset.calendarView;
      renderCalendarView();
    });
  });

  document.getElementById("calendar-prev").addEventListener("click", () => {
    calendarState.currentDate = calendarState.view === "week"
      ? addDays(calendarState.currentDate, -7)
      : addMonths(getMonthStart(calendarState.currentDate), -1);
    renderCalendarView();
  });

  document.getElementById("calendar-today").addEventListener("click", () => {
    calendarState.currentDate = getTodayDateString();
    renderCalendarView();
  });

  document.getElementById("calendar-next").addEventListener("click", () => {
    calendarState.currentDate = calendarState.view === "week"
      ? addDays(calendarState.currentDate, 7)
      : addMonths(getMonthStart(calendarState.currentDate), 1);
    renderCalendarView();
  });
}

function initAllTasksView() {
  fillAllTasksCategoryFilter();

  [
    "all-tasks-status-filter",
    "all-tasks-category-filter",
    "all-tasks-priority-filter",
    "all-tasks-repeat-filter",
    "all-tasks-sort",
  ].forEach((id) => {
    document.getElementById(id).addEventListener("change", renderAllTasksView);
  });

  document.getElementById("all-tasks-search").addEventListener("input", () => {
    window.clearTimeout(allTasksSearchTimer);
    allTasksSearchTimer = window.setTimeout(renderAllTasksView, 200);
  });
}

function initCategoriesView() {
  document.getElementById("create-category-button").addEventListener("click", () => {
    const nameInput = document.getElementById("category-name-input");
    const colorInput = document.getElementById("category-color-input");
    const category = createCategory(nameInput.value, colorInput.value);

    if (category) {
      nameInput.value = "";
      colorInput.value = "#4F46E5";
    }
  });

  document.getElementById("category-name-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("create-category-button").click();
    }
  });
}

function initSettingsView() {
  document.getElementById("settings-theme").addEventListener("change", (event) => {
    updateSettings({ theme: event.target.value });
  });

  document.getElementById("settings-accent").addEventListener("input", (event) => {
    updateSettings({ accentColor: event.target.value });
  });

  document.getElementById("settings-card-size").addEventListener("change", (event) => {
    updateSettings({ cardSize: event.target.value });
  });

  document.getElementById("export-json-button").addEventListener("click", exportJson);

  document.getElementById("import-json-input").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (file) {
      importJson(file);
      event.target.value = "";
    }
  });

  document.getElementById("clear-data-button").addEventListener("click", clearAllData);
}

document.addEventListener("DOMContentLoaded", () => {
  appData = loadData();
  applySettings();
  initNavigation();
  initTaskModal();
  initTodayView();
  initCalendarView();
  initAllTasksView();
  initCategoriesView();
  initSettingsView();
  setActiveScreen("today");
  renderTasks();
});

window.loadData = loadData;
window.saveData = saveData;
window.initDefaultData = initDefaultData;
window.generateId = generateId;
window.openTaskModal = openTaskModal;
window.closeTaskModal = closeTaskModal;
window.saveTaskFromModal = saveTaskFromModal;
window.createTask = createTask;
window.updateTask = updateTask;
window.deleteTask = deleteTask;
window.cancelTask = cancelTask;
window.completeTask = completeTask;
window.renderTaskCard = renderTaskCard;
window.renderTodayView = renderTodayView;
window.getTodayTasks = getTodayTasks;
window.getOverdueTasks = getOverdueTasks;
window.getUpcomingTasks = getUpcomingTasks;
window.getUndatedTasks = getUndatedTasks;
window.getCompletedTodayTasks = getCompletedTodayTasks;
window.createNextRecurringTask = createNextRecurringTask;
window.getNextRecurringDate = getNextRecurringDate;
window.renderCalendarView = renderCalendarView;
window.getFilteredTasks = getFilteredTasks;
window.renderCategoriesView = renderCategoriesView;
window.renderSettingsView = renderSettingsView;
window.createCategory = createCategory;
window.updateCategory = updateCategory;
window.deleteCategory = deleteCategory;
window.validateImportedData = validateImportedData;
