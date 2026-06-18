// Core JS controller for BolashaqQR Attendance System

// --- STATE VARIABLES ---
let employees = [];
let logs = [];
let settings = {};
let currentViewMode = "terminal"; // terminal | employee | admin
let currentAdminTab = "dashboard"; // dashboard | employees | logs | settings
let currentEmployeeTab = "scan"; // scan | schedule | duty | attendance
let adminLoggedIn = false;
let adminAccessRole = null; // admin | owner
let currentAdminOrganization = null; // university | pedcollege | medcollege
const EMPLOYEE_SESSION_STORAGE_KEY = "bolashaq_current_employee";
let currentEmployeeId = sessionStorage.getItem(EMPLOYEE_SESSION_STORAGE_KEY) || null;
let mockTime = {
  date: "2026-06-01",
  time: "08:30",
  day: 1, // Monday
  timerId: null
};

// Web Audio Context for generating scan sounds
let audioCtx = null;

// html5Qrcode instance
let html5QrcodeScanner = null;
let scannerProcessing = false;
let terminalQrcodeScanner = null;
let terminalScannerProcessing = false;
let qrRefreshTimer = null;
let activeQrModalEmployeeId = null;

// Chart.js instance
let attendanceChart = null;

const QR_REFRESH_MS = 30000;
const QR_SLOT_TOLERANCE = 4;
const API_TIMEOUT_MS = 5000;
const SETTINGS_VERSION = 2;
const DEFAULT_GEOFENCE_ENABLED = false;

const EMPLOYEE_EXCEL_HEADERS = [
  "ФИО",
  "Роль",
  "Организация",
  "Департамент",
  "Логин",
  "Пароль",
  "Фото URL",
  "VIP"
];

const ORGANIZATIONS = {
  university: "Университет",
  pedcollege: "Педколледж",
  medcollege: "Медколледж"
};

function getDefaultAdminAccounts() {
  return [
    { organization: "university", username: "univer", password: "univer1" },
    { organization: "pedcollege", username: "ped", password: "ped1" },
    { organization: "medcollege", username: "med", password: "med1" }
  ];
}

function getOrganizationByAdminLogin(login) {
  const normalizedLogin = String(login || "").trim().toLowerCase();
  if (normalizedLogin === "univer") return "university";
  if (normalizedLogin === "ped") return "pedcollege";
  if (normalizedLogin === "med") return "medcollege";
  return null;
}

function normalizeAdminAccounts(accounts) {
  const oldDefaultLogins = ["admin-univer", "admin-ped", "admin-med"];
  const oldDefaultPasswords = ["admin123", "ped123", "med123"];
  const hasOldDefaults = (accounts || []).some(account =>
    oldDefaultLogins.includes(String(account.username || "").toLowerCase()) ||
    oldDefaultPasswords.includes(String(account.password || ""))
  );

  if (!Array.isArray(accounts) || accounts.length < 3 || hasOldDefaults) {
    return getDefaultAdminAccounts();
  }

  const byOrg = new Map(accounts.map(account => [account.organization, account]));
  return getDefaultAdminAccounts().map(defaultAccount => ({
    ...defaultAccount,
    ...(byOrg.get(defaultAccount.organization) || {})
  }));
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  initData();
  syncBackendBootstrap();
  initMockTime();
  generateEntranceQR();
  const requestedView = new URLSearchParams(window.location.search).get("view") || getViewFromPageName();
  const initialView = ["terminal", "employee", "admin", "owner"].includes(requestedView) ? requestedView : "terminal";
  switchViewMode(initialView);
  renderEmployeeAuthState();
  startRealtimeQrRefresh();
  document.getElementById("settings-geofence-enabled")?.addEventListener("change", updateGeoFenceFieldsState);
  lucide.createIcons();
});

function getApiBaseUrl() {
  const configured = window.BOLASHAQ_API_BASE || localStorage.getItem("bolashaq_api_base") || "";
  if (configured) return configured.replace(/\/$/, "");
  if (window.location.protocol.startsWith("http")) {
    return `${window.location.origin}/api`;
  }
  return "http://localhost:5173/api";
}

function getAdminApiKey() {
  return window.BOLASHAQ_ADMIN_API_KEY || localStorage.getItem("bolashaq_admin_api_key") || "";
}

async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const adminApiKey = getAdminApiKey();

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(adminApiKey ? { "X-Bolashaq-Admin-Key": adminApiKey } : {}),
        ...(options.headers || {})
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.detail || `API error ${response.status}`;
      throw new Error(message);
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

function upsertEmployeeFromApi(apiEmployee) {
  if (!apiEmployee || !apiEmployee.id) return null;

  const normalized = {
    id: apiEmployee.id,
    uid: apiEmployee.uid,
    name: apiEmployee.name,
    role: apiEmployee.role,
    organization: apiEmployee.organization,
    department: apiEmployee.department || apiEmployee.studentGroup || "",
    studentGroup: apiEmployee.studentGroup || "",
    username: apiEmployee.username,
    avatar: apiEmployee.avatar || "",
    isVip: Boolean(apiEmployee.isVip),
    schedules: apiEmployee.schedules || []
  };

  const index = employees.findIndex(item => item.id === normalized.id);
  if (index >= 0) {
    employees[index] = { ...employees[index], ...normalized };
  } else {
    employees.push(normalized);
  }

  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  return normalized;
}

function upsertLogFromApi(apiLog) {
  if (!apiLog || !apiLog.id) return null;

  const index = logs.findIndex(item => item.id === apiLog.id || (
    item.employeeId === apiLog.employeeId && item.date === apiLog.date
  ));

  if (index >= 0) {
    logs[index] = { ...logs[index], ...apiLog };
  } else {
    logs.push(apiLog);
  }

  localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
  return apiLog;
}

async function syncBackendBootstrap() {
  try {
    const [employeesPayload, logsPayload] = await Promise.all([
      apiRequest("/employees/"),
      apiRequest("/logs/")
    ]);

    if (Array.isArray(employeesPayload.employees)) {
      employees = employeesPayload.employees.map(item => ({
        id: item.id,
        uid: item.uid,
        name: item.name,
        role: item.role,
        organization: item.organization,
        department: item.department || item.studentGroup || "",
        studentGroup: item.studentGroup || "",
        username: item.username,
        avatar: item.avatar || "",
        isVip: Boolean(item.isVip),
        schedules: item.schedules || []
      }));
      localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
    }

    if (Array.isArray(logsPayload.logs)) {
      logs = logsPayload.logs;
      localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
    }

    renderEmployeeAuthState();
    if (currentViewMode === "terminal") renderTerminalFeed();
    if (adminLoggedIn) updateAdminDashboard();
  } catch (err) {
    console.info("Backend API is not available, using local data.", err.message);
  }
}

// Initialize database from localStorage or mockData
function initData() {
  // Load settings
  const savedSettings = localStorage.getItem("bolashaq_settings");
  if (savedSettings) {
    settings = JSON.parse(savedSettings);
    if (!settings.settingsVersion || settings.settingsVersion < SETTINGS_VERSION) {
      settings.geoFenceEnabled = DEFAULT_GEOFENCE_ENABLED;
      settings.settingsVersion = SETTINGS_VERSION;
    }
  } else {
    settings = {
      settingsVersion: SETTINGS_VERSION,
      workdayStart: "09:00",
      accumulateThreshold: 5,
      violatorThreshold: 3,
      adminPin: "1234",
      adminAccounts: getDefaultAdminAccounts(),
      ownerUsername: "owner",
      ownerPassword: "owner123",
      geoFenceEnabled: DEFAULT_GEOFENCE_ENABLED,
      geoFenceLat: 44.8488,
      geoFenceLng: 65.4823,
      geoFenceRadius: 150
    };
    localStorage.setItem("bolashaq_settings", JSON.stringify(settings));
  }

  settings = {
    settingsVersion: SETTINGS_VERSION,
    geoFenceEnabled: DEFAULT_GEOFENCE_ENABLED,
    geoFenceLat: 44.8488,
    geoFenceLng: 65.4823,
    geoFenceRadius: 150,
    adminAccounts: getDefaultAdminAccounts(),
    ownerUsername: "owner",
    ownerPassword: "owner123",
    ...settings
  };
  settings.adminAccounts = normalizeAdminAccounts(settings.adminAccounts);
  localStorage.setItem("bolashaq_settings", JSON.stringify(settings));

  // Load employees
  const savedEmployees = localStorage.getItem("bolashaq_employees");
  if (savedEmployees) {
    employees = JSON.parse(savedEmployees);
    if (employees.length === 0 && window.DEFAULT_EMPLOYEES && window.DEFAULT_EMPLOYEES.length > 0) {
      employees = window.DEFAULT_EMPLOYEES;
    }
  } else {
    employees = window.DEFAULT_EMPLOYEES || [];
  }

  // Load logs
  const savedLogs = localStorage.getItem("bolashaq_logs");
  if (savedLogs) {
    logs = JSON.parse(savedLogs);
    if (logs.length === 0 && window.DEFAULT_LOGS && window.DEFAULT_LOGS.length > 0) {
      logs = window.DEFAULT_LOGS;
    }
  } else {
    logs = window.DEFAULT_LOGS || [];
  }

  ensureEmployeeAccounts();
  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
}

function ensureEmployeeAccounts() {
  employees.forEach(emp => {
    if (!emp.username) {
      emp.username = String(emp.id || "").toLowerCase();
    }
    if (!emp.password) {
      emp.password = String(emp.id || "").toLowerCase();
    }
    if (!emp.organization) {
      emp.organization = inferOrganization(emp);
    }
  });

  logs.forEach(log => {
    if (!log.organization) {
      const emp = employees.find(e => e.id === log.employeeId);
      log.organization = emp ? emp.organization : "university";
    }
  });
}

function inferOrganization(emp) {
  const text = `${emp.department || ""} ${emp.name || ""}`.toLowerCase();
  if (text.includes("мед") || text.includes("med")) return "medcollege";
  if (text.includes("пед") || text.includes("ped")) return "pedcollege";
  return "university";
}

function getOrganizationName(org) {
  return ORGANIZATIONS[org] || ORGANIZATIONS.university;
}

function getRoleLabel(role) {
  if (role === "teacher") return "Преподаватель";
  if (role === "student") return "Студент";
  return "Администрация";
}

function isStudentAccount(account) {
  return account && account.role === "student";
}

function getStudentOwnerStudents(ownerId) {
  return employees
    .filter(item => item.role === "student" && item.ownerEmployeeId === ownerId)
    .sort((a, b) => String(a.studentGroup || "").localeCompare(String(b.studentGroup || "")) || a.name.localeCompare(b.name));
}

function getOwnerStudentGroups(owner) {
  if (!owner) return [];
  const storedGroups = Array.isArray(owner.studentGroups) ? owner.studentGroups : [];
  const groupsFromStudents = getStudentOwnerStudents(owner.id)
    .map(student => student.studentGroup || student.department)
    .filter(Boolean);
  return [...new Set([...storedGroups, ...groupsFromStudents])]
    .map(group => String(group).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function getQrTimeSlot() {
  return Math.floor(Date.now() / QR_REFRESH_MS);
}

function buildGateQrPayload() {
  return "BOLASHAQ-MAIN-GATE-01";
}

function buildEmployeeQrPayload(emp) {
  return `BOLASHAQ-EMPLOYEE:${emp.id}:${getQrTimeSlot()}`;
}

function renderQrCode(container, text, size) {
  if (!container || typeof QRCode === "undefined") return;
  container.innerHTML = "";
  new QRCode(container, {
    text,
    width: size,
    height: size,
    colorDark : "#0f172a",
    colorLight : "#ffffff",
    correctLevel : QRCode.CorrectLevel.H
  });
}

function isFreshQrSlot(slotText) {
  const slot = Number(slotText);
  if (!Number.isFinite(slot)) return true;
  return Math.abs(getQrTimeSlot() - slot) <= QR_SLOT_TOLERANCE;
}

function isGateQrPayload(decodedText) {
  const text = String(decodedText || "").trim();
  if (!text) return false;

  const gatePayloads = new Set([
    "BOLASHAQ-MAIN-GATE",
    "BOLASHAQ-MAIN-GATE-01"
  ]);

  if (gatePayloads.has(text)) return true;
  if (text.startsWith("BOLASHAQ-MAIN-GATE:")) {
    const parts = text.split(":");
    return isFreshQrSlot(parts[1]);
  }

  try {
    const url = new URL(text);
    const qrValue = url.searchParams.get("gateQr")
      || url.searchParams.get("qr")
      || url.searchParams.get("gate")
      || url.searchParams.get("token");

    if (qrValue) {
      return isGateQrPayload(qrValue);
    }

    return url.pathname === "/" && url.hostname === window.location.hostname;
  } catch (err) {
    return false;
  }
}

function refreshRealtimeQRCodes() {
  generateEntranceQR();
  const emp = employees.find(e => e.id === currentEmployeeId);
  if (emp) generateEmployeeMobileQR(emp);
  const modalEmp = employees.find(e => e.id === activeQrModalEmployeeId);
  if (modalEmp && document.getElementById("qr-modal")?.classList.contains("active")) {
    generateAdminQrModalCode(modalEmp);
  }
}

function startRealtimeQrRefresh() {
  if (qrRefreshTimer) clearInterval(qrRefreshTimer);
  qrRefreshTimer = setInterval(refreshRealtimeQRCodes, QR_REFRESH_MS);
}

// Generate real-time entrance QR on the terminal screen
function generateEntranceQR() {
  const qrContainer = document.getElementById("entrance-static-qr");
  if (qrContainer) {
    renderQrCode(qrContainer, buildGateQrPayload(), 220);
  }
}

// --- MOCK TIME CONTROLLER ---
function initMockTime() {
  // Read initial values from DOM
  const daySelect = document.getElementById("mock-day-select");
  const timeInput = document.getElementById("mock-time-input");
  const dateInput = document.getElementById("mock-date-input");
  const tickCheckbox = document.getElementById("mock-tick-checkbox");

  if (tickCheckbox?.checked) {
    syncMockTimeToRealTime();
    toggleTimeTicking();
    return;
  }

  mockTime.day = parseInt(daySelect.value);
  mockTime.time = timeInput.value;
  mockTime.date = dateInput.value;

  updateClockDisplay();
  toggleTimeTicking();
}

function updateMockTimeSettings() {
  const daySelect = document.getElementById("mock-day-select");
  const timeInput = document.getElementById("mock-time-input");
  const dateInput = document.getElementById("mock-date-input");

  mockTime.day = parseInt(daySelect.value);
  mockTime.time = timeInput.value;
  mockTime.date = dateInput.value;

  updateClockDisplay();
  refreshEmployeeMobileView();
  if (adminLoggedIn) {
    updateAdminDashboard();
  }
}

function formatLocalDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRealTimeSnapshot() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return {
    date: formatLocalDateInput(now),
    day: now.getDay(),
    time: `${hours}:${minutes}`,
    displayTime: `${hours}:${minutes}:${seconds}`
  };
}

function refreshTimeSensitiveViews() {
  refreshEmployeeMobileView();
  if (currentViewMode === "terminal") {
    renderTerminalFeed();
  }
  if (adminLoggedIn) {
    updateAdminDashboard();
  }
}

function syncMockTimeToRealTime({ refreshViews = false } = {}) {
  const previousKey = `${mockTime.date}|${mockTime.day}|${mockTime.time}`;
  const snapshot = getRealTimeSnapshot();

  mockTime.date = snapshot.date;
  mockTime.day = snapshot.day;
  mockTime.time = snapshot.time;

  const daySelect = document.getElementById("mock-day-select");
  const timeInput = document.getElementById("mock-time-input");
  const dateInput = document.getElementById("mock-date-input");

  if (daySelect) daySelect.value = String(mockTime.day);
  if (timeInput) timeInput.value = mockTime.time;
  if (dateInput) dateInput.value = mockTime.date;

  updateClockDisplay(snapshot.displayTime);

  const nextKey = `${mockTime.date}|${mockTime.day}|${mockTime.time}`;
  if (refreshViews && previousKey !== nextKey) {
    refreshTimeSensitiveViews();
  }
}

function updateClockDisplay(displayTime = mockTime.time) {
  const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const dayName = dayNames[mockTime.day];
  
  // Format date nicely
  const dateObj = new Date(mockTime.date);
  const formattedDate = dateObj.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  
  // System display
  const systemTimeText = ["employee", "terminal"].includes(currentViewMode)
    ? `${dayName}, ${displayTime}`
    : `${dayName}, ${displayTime} (${formattedDate})`;
  document.getElementById("system-time-display").innerText = systemTimeText;
  
  // Mobile phone display
  document.getElementById("mobile-bar-time").innerText = mockTime.time;
  
  // Terminal live feed header date
  document.getElementById("feed-date").innerText = dateObj.toLocaleDateString("ru-RU");
}

function toggleTimeTicking() {
  const isTicking = document.getElementById("mock-tick-checkbox").checked;
  
  if (mockTime.timerId) {
    clearInterval(mockTime.timerId);
    mockTime.timerId = null;
  }

  if (isTicking) {
    syncMockTimeToRealTime({ refreshViews: true });
    mockTime.timerId = setInterval(() => {
      syncMockTimeToRealTime({ refreshViews: true });
    }, 1000);
  }
}

// --- AUDIO FEEDBACK GENERATOR (Web Audio API) ---
function playSound(type) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === "success") {
      // Pleasant high double beep
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();
      
      setTimeout(() => {
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime); // High pitch beep
      }, 80);
      
      setTimeout(() => {
        osc.stop();
      }, 200);
    } else if (type === "warning") {
      // Medium buzzer beep
      osc.type = "triangle";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
      gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
      osc.start();
      setTimeout(() => {
        osc.stop();
      }, 300);
    } else if (type === "error") {
      // Low buzz warning
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(150, audioCtx.currentTime); // Low buzz
      gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
      osc.start();
      
      setTimeout(() => {
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
      }, 150);
      
      setTimeout(() => {
        osc.stop();
      }, 400);
    }
  } catch (e) {
    console.error("Audio generation failed: ", e);
  }
}

// --- VIEW CONTROLLER ---
function getViewFromPageName() {
  const page = window.location.pathname.split("/").filter(Boolean).pop()?.toLowerCase() || "";
  if (page === "employee" || page === "employee.html") return "employee";
  if (page === "admin" || page === "admin.html") return "admin";
  if (page === "owner" || page === "owner.html") return "owner";
  if (page === "terminal" || page === "terminal.html") return "terminal";
  return "terminal";
}

function openViewWindow(mode) {
  const normalizedMode = ["terminal", "employee", "admin", "owner"].includes(mode) ? mode : "terminal";
  window.location.href = `/${normalizedMode}`;
}

function switchViewMode(mode) {
  currentViewMode = mode;
  document.body.dataset.viewMode = mode;
  updateClockDisplay();
  
  // Update nav buttons active states
  document.querySelectorAll(".mode-btn").forEach(btn => btn.classList.remove("active"));
  
  // Hide all screens
  document.getElementById("terminal-view").classList.remove("active");
  document.getElementById("employee-view").classList.remove("active");
  document.getElementById("admin-view-parent").classList.remove("active");
  
  if (mode === "terminal") {
    document.getElementById("btn-mode-terminal").classList.add("active");
    document.getElementById("terminal-view").classList.add("active");
    renderTerminalFeed();
  } else if (mode === "employee") {
    document.getElementById("btn-mode-employee").classList.add("active");
    document.getElementById("employee-view").classList.add("active");
    refreshEmployeeMobileView();
  } else if (mode === "admin") {
    document.getElementById("btn-mode-admin").classList.add("active");
    document.getElementById("admin-view-parent").classList.add("active");
    configureAuthScreen("admin");
    
    // Check if already authenticated in this session
    if (adminLoggedIn && adminAccessRole === "admin") {
      document.getElementById("admin-auth-screen").style.display = "none";
      document.getElementById("admin-main-panel").style.display = "flex";
      configureAdminAccessView();
      switchAdminTab(currentAdminTab);
    } else {
      adminLoggedIn = false;
      adminAccessRole = null;
      currentAdminOrganization = null;
      document.getElementById("admin-auth-screen").style.display = "flex";
      document.getElementById("admin-main-panel").style.display = "none";
      document.getElementById("admin-login-input").value = "";
      document.getElementById("admin-password-input").value = "";
      document.getElementById("admin-login-input").focus();
    }
  } else if (mode === "owner") {
    const ownerBtn = document.getElementById("btn-mode-owner");
    if (ownerBtn) ownerBtn.classList.add("active");
    document.getElementById("admin-view-parent").classList.add("active");
    configureAuthScreen("owner");
    if (adminLoggedIn && adminAccessRole === "owner") {
      document.getElementById("admin-auth-screen").style.display = "none";
      document.getElementById("admin-main-panel").style.display = "flex";
      configureAdminAccessView();
      switchAdminTab("dashboard");
    } else {
      adminLoggedIn = false;
      adminAccessRole = "owner";
      document.getElementById("admin-auth-screen").style.display = "flex";
      document.getElementById("admin-main-panel").style.display = "none";
      document.getElementById("owner-login-input").value = "";
      document.getElementById("owner-password-input").value = "";
      document.getElementById("owner-login-input").focus();
    }
  }
  
  // Cancel active scanning camera if we switch screens
  closeMobileScanner();
  if (mode !== "terminal") {
    closeTerminalScanner();
  }
}

function configureAuthScreen(role) {
  const isOwner = role === "owner";
  const title = document.getElementById("admin-auth-title");
  const note = document.getElementById("admin-auth-note");
  const adminBlock = document.getElementById("admin-login-block");
  const ownerBlock = document.getElementById("owner-login-block");

  if (title) title.textContent = isOwner ? "Вход для владельца" : "Вход для администратора";
  if (note) {
    note.textContent = isOwner
      ? "Введите логин и пароль владельца."
      : "Введите логин и пароль администратора организации.";
  }
  if (adminBlock) adminBlock.style.display = isOwner ? "none" : "flex";
  if (ownerBlock) ownerBlock.style.display = isOwner ? "flex" : "none";
}

// --- EMPLOYEE ACCOUNT AUTH ---
function renderEmployeeAuthState() {
  const loginCard = document.getElementById("employee-login-card");
  const appContent = document.getElementById("employee-app-content");
  const emp = employees.find(e => e.id === currentEmployeeId);

  if (!loginCard || !appContent) return;

  if (emp) {
    localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    loginCard.style.display = "none";
    appContent.style.display = "flex";
    refreshEmployeeMobileView();
  } else {
    currentEmployeeId = null;
    sessionStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    loginCard.style.display = "flex";
    appContent.style.display = "none";
  }
}

async function loginEmployeeAccount() {
  const usernameInput = document.getElementById("employee-login-username");
  const passwordInput = document.getElementById("employee-login-password");
  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!username || !password) {
    showToast("Введите логин и пароль", "error");
    return;
  }

  let emp = null;
  let apiRejectedLogin = false;

  try {
    const payload = await apiRequest("/auth/employee/", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    emp = upsertEmployeeFromApi(payload.employee);
  } catch (err) {
    apiRejectedLogin = !["Failed to fetch", "The operation was aborted."].includes(err.message);
    console.info("Employee API login unavailable or rejected:", err.message);
  }

  if (!emp && !apiRejectedLogin) {
    emp = employees.find(e => String(e.username || "").toLowerCase() === username && String(e.password || "") === password);
  }

  if (!emp) {
    showToast("Неверный логин или пароль", "error");
    playSound("error");
    passwordInput.value = "";
    passwordInput.focus();
    return;
  }

  currentEmployeeId = emp.id;
  sessionStorage.setItem(EMPLOYEE_SESSION_STORAGE_KEY, currentEmployeeId);
  localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
  usernameInput.value = "";
  passwordInput.value = "";
  renderEmployeeAuthState();
  showToast(`Вход выполнен: ${emp.name}`, "success");
}

function logoutEmployeeAccount() {
  currentEmployeeId = null;
  sessionStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
  localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
  closeMobileScanner();
  renderEmployeeAuthState();
  showToast("Вы вышли из аккаунта сотрудника", "info");
}

function getAuthenticatedEmployee() {
  if (!currentEmployeeId) return null;
  return employees.find(e => e.id === currentEmployeeId) || null;
}

function switchEmployeeTab(tab) {
  const account = getAuthenticatedEmployee();
  const allowedTabs = isStudentAccount(account)
    ? ["scan", "attendance"]
    : ["scan", "schedule", "duty", "groups", "attendance"];
  currentEmployeeTab = allowedTabs.includes(tab) ? tab : "scan";

  document.querySelectorAll(".employee-tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelectorAll(".employee-tab-panel").forEach(panel => panel.classList.remove("active"));

  const btn = document.getElementById(`employee-tab-btn-${currentEmployeeTab}`);
  const panel = document.getElementById(`employee-tab-${currentEmployeeTab}`);
  if (btn) btn.classList.add("active");
  if (panel) panel.classList.add("active");
  lucide.createIcons();
}

function generateEmployeeMobileQR(emp) {
  const qrContainer = document.getElementById("employee-mobile-qr");
  if (!qrContainer || !emp) return;

  renderQrCode(qrContainer, buildEmployeeQrPayload(emp), 168);
}

function generateStudentId() {
  const maxNumber = employees.reduce((max, item) => {
    const match = String(item.id || "").match(/^STU(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `STU${String(maxNumber + 1).padStart(3, "0")}`;
}

function addOwnStudentGroup() {
  const owner = employees.find(e => e.id === currentEmployeeId);
  if (!owner || isStudentAccount(owner)) {
    showToast("Группы студентов доступны только сотрудникам", "error");
    return;
  }

  const groupInput = document.getElementById("student-group-name-input");
  const groupName = groupInput.value.trim();
  if (!groupName) {
    showToast("Введите название группы", "error");
    return;
  }

  const existingGroups = getOwnerStudentGroups(owner).map(group => group.toLowerCase());
  if (existingGroups.includes(groupName.toLowerCase())) {
    showToast("Такая группа уже есть", "error");
    return;
  }

  owner.studentGroups = Array.isArray(owner.studentGroups) ? owner.studentGroups : [];
  owner.studentGroups.push(groupName);
  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  groupInput.value = "";
  renderStudentGroups(owner);
  showToast("Группа создана", "success");
}

function addStudentToOwnGroup() {
  const owner = employees.find(e => e.id === currentEmployeeId);
  if (!owner || isStudentAccount(owner)) {
    showToast("Группы студентов доступны только сотрудникам", "error");
    return;
  }

  const groupInput = document.getElementById("student-group-select");
  const nameInput = document.getElementById("student-name-input");
  const loginInput = document.getElementById("student-login-input");
  const passwordInput = document.getElementById("student-password-input");

  const studentGroup = groupInput.value.trim();
  const name = nameInput.value.trim();
  const username = loginInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!studentGroup || !name || !username || !password) {
    showToast("Заполните группу, ФИО, логин и пароль студента", "error");
    return;
  }

  const duplicateLogin = employees.find(e => String(e.username || "").toLowerCase() === username);
  if (duplicateLogin) {
    showToast("Такой логин уже используется", "error");
    return;
  }

  employees.push({
    id: generateStudentId(),
    name,
    role: "student",
    organization: owner.organization || "university",
    department: studentGroup,
    studentGroup,
    ownerEmployeeId: owner.id,
    ownerEmployeeName: owner.name,
    username,
    password,
    avatar: "",
    isVip: false,
    schedules: []
  });

  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  nameInput.value = "";
  loginInput.value = "";
  passwordInput.value = "";
  renderStudentGroups(owner);
  showToast("Студент добавлен в группу", "success");
}

function deleteOwnStudent(studentId) {
  const owner = employees.find(e => e.id === currentEmployeeId);
  const student = employees.find(e => e.id === studentId && e.role === "student");
  if (!owner || !student || student.ownerEmployeeId !== owner.id) return;

  if (!confirm(`Удалить студента ${student.name}? Его журнал проходов тоже будет удален.`)) return;

  employees = employees.filter(e => e.id !== studentId);
  logs = logs.filter(l => l.employeeId !== studentId);
  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
  renderStudentGroups(owner);
  showToast("Студент удален", "success");
}

function deleteOwnStudentGroup(groupName) {
  const owner = employees.find(e => e.id === currentEmployeeId);
  if (!owner || isStudentAccount(owner)) return;

  const hasStudents = getStudentOwnerStudents(owner.id).some(student => (student.studentGroup || student.department) === groupName);
  if (hasStudents) {
    showToast("Сначала удалите студентов из группы", "error");
    return;
  }

  if (!confirm(`Удалить группу ${groupName}?`)) return;

  owner.studentGroups = getOwnerStudentGroups(owner).filter(group => group !== groupName);
  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  renderStudentGroups(owner);
  showToast("Группа удалена", "success");
}

function renderStudentGroups(owner) {
  const container = document.getElementById("employee-student-groups-list");
  const editor = document.getElementById("employee-student-editor");
  if (!container || !editor) return;

  const groupEditor = document.getElementById("employee-group-editor");
  const groupSelect = document.getElementById("student-group-select");

  if (!owner || isStudentAccount(owner)) {
    container.innerHTML = "";
    editor.style.display = "none";
    if (groupEditor) groupEditor.style.display = "none";
    return;
  }

  if (groupEditor) groupEditor.style.display = "flex";
  const groups = getOwnerStudentGroups(owner);
  editor.style.display = groups.length ? "flex" : "none";
  if (groupSelect) {
    groupSelect.innerHTML = groups.length
      ? groups.map(group => `<option value="${group}">${group}</option>`).join("")
      : `<option value="">Сначала создайте группу</option>`;
  }

  if (groups.length === 0) {
    container.innerHTML = `<div style="text-align:center; color: var(--text-muted); font-size: 0.82rem; padding: 12px;">Сначала создайте группу</div>`;
    return;
  }

  const grouped = groups.reduce((acc, groupName) => {
    acc[groupName] = [];
    return acc;
  }, {});

  getStudentOwnerStudents(owner.id).forEach(student => {
    const groupName = student.studentGroup || student.department || "Без группы";
    if (!grouped[groupName]) grouped[groupName] = [];
    grouped[groupName].push(student);
  });

  container.innerHTML = "";
  Object.keys(grouped).sort().forEach(groupName => {
    const groupStudents = grouped[groupName];
    const group = document.createElement("div");
    group.className = "student-group-card";
    group.innerHTML = `
      <div class="student-group-title">
        <span>${groupName}</span>
        <div class="student-group-actions">
          <span class="student-group-count">${groupStudents.length} студ.</span>
          ${groupStudents.length === 0 ? `<button class="student-group-delete" onclick="deleteOwnStudentGroup('${groupName}')" title="Удалить группу"><i data-lucide="trash-2"></i></button>` : ""}
        </div>
      </div>
      ${groupStudents.length ? groupStudents.map(student => `
        <div class="student-row">
          <div class="student-row-main">
            <span class="student-name">${student.name}</span>
            <span class="student-login">Логин: ${student.username || ""}</span>
          </div>
          <button class="student-delete-btn" onclick="deleteOwnStudent('${student.id}')" title="Удалить студента">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `).join("") : `<div class="student-row student-empty-row"><span class="student-login">В этой группе пока нет студентов</span></div>`}
    `;
    container.appendChild(group);
  });
  lucide.createIcons();
  return;

  {
  if (!owner || isStudentAccount(owner)) {
    container.innerHTML = "";
    editor.style.display = "none";
    return;
  }

  editor.style.display = "flex";
  const students = getStudentOwnerStudents(owner.id);
  if (students.length === 0) {
    container.innerHTML = `<div style="text-align:center; color: var(--text-muted); font-size: 0.82rem; padding: 12px;">Группы студентов пока пустые</div>`;
    return;
  }

  const grouped = students.reduce((acc, student) => {
    const groupName = student.studentGroup || student.department || "Без группы";
    if (!acc[groupName]) acc[groupName] = [];
    acc[groupName].push(student);
    return acc;
  }, {});

  container.innerHTML = "";
  Object.keys(grouped).sort().forEach(groupName => {
    const group = document.createElement("div");
    group.className = "student-group-card";
    group.innerHTML = `
      <div class="student-group-title">
        <span>${groupName}</span>
        <span class="student-group-count">${grouped[groupName].length} студ.</span>
      </div>
      ${grouped[groupName].map(student => `
        <div class="student-row">
          <div class="student-row-main">
            <span class="student-name">${student.name}</span>
            <span class="student-login">Логин: ${student.username || ""}</span>
          </div>
          <button class="student-delete-btn" onclick="deleteOwnStudent('${student.id}')" title="Удалить студента">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      `).join("")}
    `;
    container.appendChild(group);
  });
  lucide.createIcons();
  }
}

function addOwnScheduleItem() {
  const emp = employees.find(e => e.id === currentEmployeeId);
  if (!emp || emp.role !== "teacher") {
    showToast("Расписание уроков доступно только преподавателям", "error");
    return;
  }

  const subjectInput = document.getElementById("employee-sched-subject");
  const groupInput = document.getElementById("employee-sched-group");
  const dayInput = document.getElementById("employee-sched-day");
  const startInput = document.getElementById("employee-sched-start");
  const endInput = document.getElementById("employee-sched-end");

  const subject = subjectInput.value.trim();
  const group = groupInput.value.trim();
  const day = parseInt(dayInput.value);
  const startTime = startInput.value;
  const endTime = endInput.value;

  if (!subject || !group || !startTime || !endTime) {
    showToast("Заполните предмет, группу, начало и конец пары", "error");
    return;
  }

  if (startTime >= endTime) {
    showToast("Время начала должно быть раньше времени окончания", "error");
    return;
  }

  emp.schedules = emp.schedules || [];
  emp.schedules.push({ day, subject, group, startTime, endTime });
  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));

  subjectInput.value = "";
  groupInput.value = "";
  startInput.value = "09:00";
  endInput.value = "10:30";

  refreshEmployeeMobileView();
  if (adminLoggedIn) {
    renderEmployeesList();
  }
  showToast("Пара добавлена в расписание", "success");
}

function deleteOwnScheduleItem(index) {
  const emp = employees.find(e => e.id === currentEmployeeId);
  if (!emp || emp.role !== "teacher" || !emp.schedules || !emp.schedules[index]) return;

  if (!confirm("Удалить эту пару из вашего расписания?")) return;

  emp.schedules.splice(index, 1);
  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  refreshEmployeeMobileView();
  if (adminLoggedIn) {
    renderEmployeesList();
  }
  showToast("Пара удалена из расписания", "success");
}

function renderEmployeeDuty(emp) {
  const title = document.getElementById("emp-duty-title");
  const text = document.getElementById("emp-duty-text");
  const note = document.getElementById("emp-duty-note");
  if (!title || !text || !note || !emp) return;

  const todaySchedule = (emp.schedules || [])
    .filter(item => item.day === mockTime.day)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  title.innerText = "Дежурство на сегодня";
  if (emp.dutyToday || emp.isOnDuty) {
    text.innerText = `Вы назначены дежурным: ${getOrganizationName(emp.organization)}`;
    note.innerText = "Проверьте входную зону и отмечайте присутствие через QR как обычно.";
  } else if (todaySchedule.length > 0) {
    const firstClass = todaySchedule[0];
    text.innerText = `Назначений нет. Сегодня первая пара: ${firstClass.startTime} · ${firstClass.subject}`;
    note.innerText = "Если админ назначит дежурство, оно будет отображаться здесь.";
  } else {
    text.innerText = `Назначений нет · ${getOrganizationName(emp.organization)}`;
    note.innerText = "Если сотрудник назначен дежурным, админ может указать это в примечании или расписании.";
  }
}

function refreshEmployeeMobileView() {
  const emp = employees.find(e => e.id === currentEmployeeId);
  if (!emp) {
    renderEmployeeAuthState();
    return;
  }

  // Profile
  document.getElementById("emp-mobile-name").innerText = emp.name;
  document.getElementById("emp-mobile-role").innerText = emp.role === "teacher" ? "Преподаватель" : "Администрация";
  document.getElementById("emp-mobile-org").innerText = getOrganizationName(emp.organization);
  document.getElementById("emp-mobile-dept").innerText = emp.department;
  document.getElementById("emp-mobile-avatar").src = emp.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(emp.name)}`;
  generateEmployeeMobileQR(emp);
  document.getElementById("emp-mobile-role").innerText = getRoleLabel(emp.role);
  const studentMode = isStudentAccount(emp);
  if (studentMode) {
    document.getElementById("emp-mobile-dept").innerText = `${emp.studentGroup || emp.department || "Группа"} · куратор: ${emp.ownerEmployeeName || "сотрудник"}`;
  }
  ["schedule", "duty", "groups"].forEach(tab => {
    const btn = document.getElementById(`employee-tab-btn-${tab}`);
    if (btn) btn.style.display = studentMode ? "none" : "flex";
  });
  if (studentMode && !["scan", "attendance"].includes(currentEmployeeTab)) {
    currentEmployeeTab = "scan";
  }
  
  if (emp.isVip) {
    document.getElementById("emp-mobile-vip-badge").style.display = "flex";
  } else {
    document.getElementById("emp-mobile-vip-badge").style.display = "none";
  }

  // Lateness stats calculation
  const stats = calculateEmployeeStats(emp.id);
  document.getElementById("emp-mobile-ontime-count").innerText = stats.onTimeCount;
  document.getElementById("emp-mobile-late-count").innerText = stats.regularUnexcused;
  document.getElementById("emp-mobile-crit-count").innerText = stats.criticalTotal;

  // Render Warning Alert if critical counts are high
  const warningCard = document.getElementById("emp-mobile-warning-card");
  const warningText = document.getElementById("emp-mobile-warning-text");
  const statsGrid = document.querySelector(".mobile-stats-grid");
  if (statsGrid) statsGrid.style.display = studentMode ? "none" : "grid";
  
  const K = settings.accumulateThreshold;
  const violatorThreshold = settings.violatorThreshold;
  
  // Calculate remaining regular latenesses until next critical
  const leftToNextCrit = K - (stats.regularUnexcused % K);
  
  if (studentMode) {
    warningCard.style.display = "none";
  } else if (stats.criticalTotal >= violatorThreshold) {
    warningCard.style.display = "block";
    warningCard.style.borderLeft = "4px solid var(--status-critical)";
    warningText.innerHTML = `<span class="bold-alert">Внимание!</span> Вы в папке критических нарушителей (${stats.criticalTotal} крит. нарушений).`;
  } else if (stats.criticalTotal > 0 || stats.regularUnexcused >= 3) {
    warningCard.style.display = "block";
    warningCard.style.borderLeft = "4px solid var(--status-late)";
    warningText.innerHTML = `Вам начислено ${stats.criticalTotal} критических опозданий. Опозданий до следующего критического: <strong>${leftToNextCrit}</strong>.`;
  } else {
    warningCard.style.display = "none";
  }

  renderStudentGroups(emp);

  // Load Schedule Today
  const scheduleList = document.getElementById("emp-mobile-schedule-list");
  const scheduleEditor = document.getElementById("employee-schedule-editor");
  scheduleList.innerHTML = "";
  
  if (studentMode) {
    if (scheduleEditor) scheduleEditor.style.display = "none";
  } else if (emp.role === "staff") {
    if (scheduleEditor) scheduleEditor.style.display = "none";
    const item = document.createElement("div");
    item.className = "mobile-schedule-item";
    item.innerHTML = `
      <div class="mobile-schedule-info">
        <span class="mobile-schedule-subj">Рабочее время</span>
        <span class="mobile-schedule-time">Начало дня: ${settings.workdayStart}</span>
      </div>
      <span class="mobile-schedule-badge" style="background: rgba(16, 185, 129, 0.1); color: var(--status-ok);">Стандарт</span>
    `;
    scheduleList.appendChild(item);
  } else {
    if (scheduleEditor) scheduleEditor.style.display = "flex";
    const allClasses = [...(emp.schedules || [])].sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));
    if (allClasses.length === 0) {
      const item = document.createElement("div");
      item.className = "mobile-schedule-item";
      item.innerHTML = `
        <div class="mobile-schedule-info">
          <span class="mobile-schedule-subj" style="color: var(--text-muted);">Расписание пока пустое</span>
        </div>
      `;
      scheduleList.appendChild(item);
    } else {
      // Determine if a class is active right now
      const mockMins = timeToMins(mockTime.time);
      const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
      
      allClasses.forEach(cls => {
        const originalIndex = emp.schedules.indexOf(cls);
        const startMins = timeToMins(cls.startTime);
        const endMins = timeToMins(cls.endTime);
        const isToday = cls.day === mockTime.day;
        const isActive = isToday && mockMins >= startMins && mockMins <= endMins;
        
        const item = document.createElement("div");
        item.className = `mobile-schedule-item ${isActive ? "active" : ""}`;
        item.innerHTML = `
          <div class="mobile-schedule-info">
            <span class="mobile-schedule-subj">${cls.subject}</span>
            <span class="mobile-schedule-time">${dayNames[cls.day]}, ${cls.startTime} - ${cls.endTime}${cls.group ? ` · ${cls.group}` : ""}</span>
          </div>
          <div class="mobile-schedule-actions">
            ${isActive ? '<span class="mobile-schedule-badge">Пара идет</span>' : isToday ? '<span class="mobile-schedule-badge muted">Сегодня</span>' : ""}
            <button class="mobile-schedule-delete" onclick="deleteOwnScheduleItem(${originalIndex})" title="Удалить пару">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        `;
        scheduleList.appendChild(item);
      });
    }
  }

  renderEmployeeDuty(emp);

  // Load Recent Logs for Employee
  const historyList = document.getElementById("emp-mobile-history-list");
  historyList.innerHTML = "";
  const empLogs = logs
    .filter(l => l.employeeId === emp.id)
    .sort((a, b) => `${b.date} ${b.checkInTime}`.localeCompare(`${a.date} ${a.checkInTime}`));
  
  if (empLogs.length === 0) {
    historyList.innerHTML = `<div style="text-align: center; font-size: 0.8rem; color: var(--text-muted); padding: 12px;">Отметок нет</div>`;
  } else {
    empLogs.slice(0, 15).forEach(l => {
      const item = document.createElement("div");
      item.className = "mobile-history-item";
      
      let badgeClass = "normal";
      let statusText = "Вовремя";
      
      if (l.status === "late") { badgeClass = "late"; statusText = "Опоздание"; }
      else if (l.status === "critical") { badgeClass = "critical"; statusText = "Критичное"; }
      else if (l.status === "excused") { badgeClass = "excused"; statusText = "Оправдано"; }
      else if (l.status === "vip") { badgeClass = "vip"; statusText = "VIP"; }
      
      item.innerHTML = `
        <div class="mobile-history-info">
          <span class="mobile-history-date">${formatDateRu(l.date)}</span>
          <span class="mobile-history-time">Вход: ${l.checkInTime} ${l.checkOutTime ? `| Выход: ${l.checkOutTime}` : "(На работе)"}</span>
        </div>
        <span class="status-badge ${badgeClass}">${statusText}</span>
      `;
      historyList.appendChild(item);
    });
  }

  switchEmployeeTab(currentEmployeeTab);
}

// --- EVALUATOR LOGIC ---
function calculateLateness(emp, checkInTimeStr, dayOfWeek, dateStr) {
  if (isStudentAccount(emp)) {
    return { status: "normal", details: `Студент ${emp.studentGroup || emp.department || ""}: проход зафиксирован.` };
  }

  if (emp.isVip) {
    return { status: "vip", details: "Прибытие по VIP-статусу. Опоздания не фиксируются." };
  }

  const checkInMins = timeToMins(checkInTimeStr);
  
  if (emp.role === "teacher") {
    const todayClasses = emp.schedules.filter(c => c.day === dayOfWeek);
    
    if (todayClasses.length === 0) {
      // If no classes today, check standard workday start
      const startMins = timeToMins(settings.workdayStart);
      if (checkInMins > startMins) {
        const diff = checkInMins - startMins;
        return { 
          status: "late", 
          details: `Опоздание на ${diff} мин. относительно начала дня (${settings.workdayStart}) при отсутствии пар.` 
        };
      }
      return { status: "normal", details: "Прибыл вовремя в день без пар." };
    }
    
    // Check if arriving DURING any class
    for (let cls of todayClasses) {
      const startMins = timeToMins(cls.startTime);
      const endMins = timeToMins(cls.endTime);
      
      if (checkInMins > startMins && checkInMins <= endMins) {
        const diff = checkInMins - startMins;
        return {
          status: "critical",
          details: `Критическое опоздание во время пары: предмет "${cls.subject}" начался в ${cls.startTime} (опоздание на ${diff} мин.).`
        };
      }
    }
    
    // If not during a class, let's look at chronological classes today
    // Sort classes
    const sortedClasses = [...todayClasses].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const earliestClass = sortedClasses[0];
    const earliestClassStartMins = timeToMins(earliestClass.startTime);
    
    // If check-in is after the first class finished (or after class started, but not during it - which means they arrived after class ended)
    if (checkInMins > earliestClassStartMins) {
      // Missed class entirely!
      return {
        status: "critical",
        details: `Критическое опоздание: прибыл в ${checkInTimeStr}, когда первая пара "${earliestClass.subject}" (${earliestClass.startTime}-${earliestClass.endTime}) уже завершилась.`
      };
    }
    
    // If checking in before first class
    // Is it late relative to standard start but still before class? E.g. class is at 11:00, checking in at 10:00.
    // They are on time for their class! So it is "normal".
    return { status: "normal", details: `Прибыл вовремя перед первой парой "${earliestClass.subject}" (${earliestClass.startTime}).` };
  } 
  
  if (emp.role === "staff") {
    const startMins = timeToMins(settings.workdayStart);
    if (checkInMins > startMins) {
      const diff = checkInMins - startMins;
      return { 
        status: "late", 
        details: `Опоздание на ${diff} мин. относительно начала рабочего дня (${settings.workdayStart}).` 
      };
    }
    return { status: "normal", details: "Прибыл вовремя к началу рабочего дня." };
  }

  return { status: "normal", details: "Приход зафиксирован." };
}

// Helper: Calculate statistics for a single employee (including unexcused latenesses and accumulations)
function calculateEmployeeStats(empId) {
  const empLogs = logs.filter(l => l.employeeId === empId);
  
  let regularUnexcused = 0;
  let criticalDirect = 0;
  let excusedCount = 0;
  let vipCount = 0;
  let onTimeCount = 0;

  empLogs.forEach(l => {
    if (l.status === "late") {
      regularUnexcused++;
    } else if (l.status === "critical") {
      criticalDirect++;
    } else if (l.status === "excused") {
      excusedCount++;
    } else if (l.status === "vip") {
      vipCount++;
    } else if (l.status === "normal") {
      onTimeCount++;
    }
  });

  const K = settings.accumulateThreshold;
  const criticalAccumulated = Math.floor(regularUnexcused / K);
  const criticalTotal = criticalDirect + criticalAccumulated;

  return {
    regularUnexcused,
    criticalDirect,
    criticalAccumulated,
    criticalTotal,
    excusedCount,
    vipCount,
    onTimeCount,
    totalLogs: empLogs.length
  };
}

// --- ATTENDANCE SCAN LOGIC ---
async function syncAttendanceScanWithBackend(empId, qrPayload) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return null;

  try {
    const payload = await apiRequest("/attendance/scan/", {
      method: "POST",
      body: JSON.stringify({
        employeeId: emp.id,
        employeeUid: emp.uid || "",
        qrPayload: qrPayload || "BOLASHAQ-MAIN-GATE-01",
        scannedAt: new Date().toISOString()
      })
    });

    if (payload.employee) upsertEmployeeFromApi(payload.employee);
    if (payload.log) upsertLogFromApi(payload.log);
    return payload;
  } catch (err) {
    console.info("Attendance API scan unavailable:", err.message);
    return null;
  }
}

function executeCheckInOrOut(empId, qrPayload = "BOLASHAQ-MAIN-GATE-01") {
  const emp = employees.find(e => e.id === empId);
  if (!emp) {
    showToast("Сотрудник не найден!", "error");
    playSound("error");
    return;
  }

  syncAttendanceScanWithBackend(empId, qrPayload);

  const currentDateStr = mockTime.date;
  const currentTimeStr = mockTime.time;
  const currentDayOfWeek = mockTime.day;
  const studentMode = isStudentAccount(emp);

  // Search if log exists for today
  const todayLog = logs.find(l => l.employeeId === empId && l.date === currentDateStr);
  
  const overlay = document.getElementById("mobile-feedback-overlay");
  const card = document.getElementById("feedback-card-status");
  const iconBox = document.getElementById("feedback-icon-box");
  const iconGraphic = document.getElementById("feedback-icon-graphic");
  const title = document.getElementById("feedback-title");
  const msg = document.getElementById("feedback-msg");
  const durationLabel = document.getElementById("feedback-work-duration");

  // Reset classes
  card.className = "feedback-card";
  iconBox.className = "feedback-icon";
  durationLabel.style.display = "none";

  if (studentMode) {
    if (!todayLog) {
      const newLog = {
        id: "LOG_" + Date.now() + "_" + Math.floor(Math.random()*1000),
        employeeId: emp.id,
        employeeName: emp.name,
        role: emp.role,
        organization: emp.organization,
        date: currentDateStr,
        checkInTime: currentTimeStr,
        checkOutTime: "",
        workDuration: "",
        status: "normal",
        details: `Студент ${emp.studentGroup || emp.department || ""}: вход зафиксирован.`
      };

      logs.push(newLog);
      localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
      title.innerText = "Вход студента зафиксирован";
      msg.innerText = `${emp.name} · ${emp.studentGroup || emp.department || "Группа"}`;
      iconGraphic.setAttribute("data-lucide", "check");
      card.classList.add("status-normal");
      iconBox.classList.add("status-normal");
      addToTerminalFeed(newLog, "in");
      showToast(`Вход студента: ${emp.name}`, "success");
      playSound("success");
    } else if (!todayLog.checkOutTime) {
      todayLog.checkOutTime = currentTimeStr;
      todayLog.details = `${todayLog.details || ""} Выход зафиксирован.`;
      localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
      title.innerText = "Выход студента зафиксирован";
      msg.innerText = `${emp.name}. Проход завершен.`;
      durationLabel.innerText = `Вход: ${todayLog.checkInTime} | Выход: ${todayLog.checkOutTime}`;
      durationLabel.style.display = "block";
      iconGraphic.setAttribute("data-lucide", "log-out");
      card.classList.add("status-normal");
      iconBox.classList.add("status-normal");
      addToTerminalFeed(todayLog, "out");
      showToast(`Выход студента: ${emp.name}`, "success");
      playSound("success");
    } else {
      title.innerText = "Проход уже завершен";
      msg.innerText = `${emp.name}: проход за сегодня уже завершен.`;
      durationLabel.innerText = `Вход: ${todayLog.checkInTime} | Выход: ${todayLog.checkOutTime}`;
      durationLabel.style.display = "block";
      iconGraphic.setAttribute("data-lucide", "info");
      card.classList.add("status-excused");
      iconBox.classList.add("status-excused");
      playSound("warning");
    }

    lucide.createIcons();
    overlay.classList.add("active");
    refreshEmployeeMobileView();
    if (adminLoggedIn) {
      updateAdminDashboard();
      renderEmployeesList();
      renderLogsList();
    }
    setTimeout(() => {
      overlay.classList.remove("active");
    }, 3000);
    return;
  }

  if (!todayLog) {
    // 1st SCAN: CHECK-IN
    const evalResult = calculateLateness(emp, currentTimeStr, currentDayOfWeek, currentDateStr);
    
    const newLog = {
      id: "LOG_" + Date.now() + "_" + Math.floor(Math.random()*1000),
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      organization: emp.organization,
      date: currentDateStr,
      checkInTime: currentTimeStr,
      checkOutTime: "",
      workDuration: "",
      status: evalResult.status,
      details: evalResult.details
    };

    logs.push(newLog);
    localStorage.setItem("bolashaq_logs", JSON.stringify(logs));

    // Show feedback popup
    title.innerText = "Успешный Вход";
    msg.innerText = `${emp.name} (${emp.role === "teacher" ? "Преподаватель" : "Администрация"})`;
    
    let statusClass = "status-normal";
    let statusLabel = "Вовремя";
    let soundType = "success";

    if (evalResult.status === "late") {
      statusClass = "status-late";
      statusLabel = "Опоздание";
      soundType = "warning";
    } else if (evalResult.status === "critical") {
      statusClass = "status-critical";
      statusLabel = "Критическое опоздание!";
      soundType = "error";
    } else if (evalResult.status === "vip") {
      statusClass = "status-vip";
      statusLabel = "VIP вход";
      soundType = "success";
    }

    card.classList.add(statusClass);
    iconBox.classList.add(statusClass);
    
    // Icon graphic change
    if (evalResult.status === "normal" || evalResult.status === "vip") {
      iconGraphic.setAttribute("data-lucide", "check");
    } else if (evalResult.status === "late") {
      iconGraphic.setAttribute("data-lucide", "alert-circle");
    } else {
      iconGraphic.setAttribute("data-lucide", "x");
    }
    
    title.innerHTML = `Вход зафиксирован: <span style="font-weight: 500;">${statusLabel}</span>`;
    
    // Add to Terminal live feed
    addToTerminalFeed(newLog, "in");
    showToast(`Приход: ${emp.name}`, soundType === "error" ? "error" : "success");
    playSound(soundType);

  } else if (!todayLog.checkOutTime) {
    // 2nd SCAN: CHECK-OUT
    todayLog.checkOutTime = currentTimeStr;
    
    // Calculate work duration
    const checkInMins = timeToMins(todayLog.checkInTime);
    const checkOutMins = timeToMins(currentTimeStr);
    let diff = checkOutMins - checkInMins;
    
    if (diff < 0) diff += 24 * 60; // Handle overnight work if mock time rolled over
    
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    todayLog.workDuration = `${hrs} ч. ${mins} мин.`;
    
    localStorage.setItem("bolashaq_logs", JSON.stringify(logs));

    // Show feedback popup
    title.innerText = "Успешный Выход";
    msg.innerText = `${emp.name}. До свидания!`;
    durationLabel.innerText = `Время работы: ${todayLog.workDuration}`;
    durationLabel.style.display = "block";

    card.classList.add("status-normal");
    iconBox.classList.add("status-normal");
    iconGraphic.setAttribute("data-lucide", "log-out");

    addToTerminalFeed(todayLog, "out");
    showToast(`Уход: ${emp.name}`, "success");
    playSound("success");

  } else {
    // 3rd+ SCAN: ALREADY WORKED FOR TODAY
    title.innerText = "Смена завершена";
    msg.innerText = `${emp.name} уже отработал рабочий день.`;
    durationLabel.innerText = `Приход: ${todayLog.checkInTime} | Уход: ${todayLog.checkOutTime}`;
    durationLabel.style.display = "block";
    
    card.classList.add("status-excused");
    iconBox.classList.add("status-excused");
    iconGraphic.setAttribute("data-lucide", "info");
    
    playSound("warning");
  }

  // Update icons inside feedback modal
  lucide.createIcons();

  // Open feedback popup on employee screen
  overlay.classList.add("active");
  
  // Update views
  refreshEmployeeMobileView();
  if (adminLoggedIn) {
    updateAdminDashboard();
    renderEmployeesList();
    renderLogsList();
  }
  
  // Close feedback automatically after 3 seconds
  setTimeout(() => {
    overlay.classList.remove("active");
  }, 3000);
}

// --- TERMINAL FEED ACTIONS ---
function addToTerminalFeed(log, scanType) {
  const feed = document.getElementById("terminal-live-feed");
  if (!feed) return;

  const item = document.createElement("div");
  item.className = "feed-item";
  
  let typeLabel = scanType === "in" ? "Приход" : "Уход";
  let statusText = "Вовремя";
  let statusClass = "normal";

  if (scanType === "in") {
    if (log.status === "late") { statusText = "Опоздание"; statusClass = "late"; }
    else if (log.status === "critical") { statusText = "Критическое"; statusClass = "critical"; }
    else if (log.status === "vip") { statusText = "VIP"; statusClass = "vip"; }
  } else {
    statusText = "Смена завершена";
    statusClass = "normal";
  }

  item.innerHTML = `
    <div class="feed-item-header">
      <span class="feed-name">${log.employeeName}</span>
      <span class="feed-time">${scanType === "in" ? log.checkInTime : log.checkOutTime}</span>
    </div>
    <div class="feed-item-header">
      <span class="feed-details">${getOrganizationName(log.organization)} · ${typeLabel} ${scanType === "out" ? `(Отработано: ${log.workDuration})` : ""}</span>
      <span class="feed-badge ${statusClass}">${statusText}</span>
    </div>
  `;

  // Insert at top
  feed.insertBefore(item, feed.firstChild);
  
  // Cap at 15 items to look clean
  if (feed.children.length > 15) {
    feed.removeChild(feed.lastChild);
  }
}

function renderTerminalFeed() {
  const feed = document.getElementById("terminal-live-feed");
  if (!feed) return;

  feed.innerHTML = "";
  
  // Get logs matching current mock date
  const todayLogs = logs.filter(l => l.date === mockTime.date);
  
  // Sort logs by time (both checkin and checkout events)
  const events = [];
  todayLogs.forEach(l => {
    events.push({
      log: l,
      type: "in",
      time: l.checkInTime
    });
    if (l.checkOutTime) {
      events.push({
        log: l,
        type: "out",
        time: l.checkOutTime
      });
    }
  });

  // Sort events newest first
  events.sort((a, b) => b.time.localeCompare(a.time));

  if (events.length === 0) {
    feed.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem; padding: 32px 0;">Сегодня проходов еще не зарегистрировано</div>`;
  } else {
    events.forEach(ev => {
      addToTerminalFeed(ev.log, ev.type);
    });
  }
}

// --- TERMINAL CAMERA SCANNING CONTROLLER ---
function getEmployeeIdFromQrPayload(decodedText) {
  const text = String(decodedText || "").trim();
  if (text.startsWith("BOLASHAQ-EMPLOYEE:")) {
    const parts = text.split(":");
    if (parts.length >= 3 && !isFreshQrSlot(parts[2])) return null;
    return parts[1] || null;
  }
  if (employees.some(emp => emp.id === text)) {
    return text;
  }
  return null;
}

function openTerminalScanner() {
  const panel = document.getElementById("terminal-camera-panel");
  if (!panel) return;

  panel.classList.add("active");
  terminalScannerProcessing = false;

  if (terminalQrcodeScanner) return;

  terminalQrcodeScanner = new Html5Qrcode("terminal-webcam-reader");
  terminalQrcodeScanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 240, height: 240 }
    },
    (decodedText) => {
      if (terminalScannerProcessing) return;
      terminalScannerProcessing = true;

      const empId = getEmployeeIdFromQrPayload(decodedText);
      if (!empId) {
        showToast("Это не QR сотрудника", "error");
        playSound("error");
        terminalScannerProcessing = false;
        return;
      }

      const emp = employees.find(e => e.id === empId);
      if (!emp) {
        showToast("Сотрудник по QR не найден", "error");
        playSound("error");
        terminalScannerProcessing = false;
        return;
      }

      executeCheckInOrOut(emp.id);
      closeTerminalScanner();
    },
    () => {}
  ).catch(err => {
    console.error("Terminal camera start failed:", err);
    showToast("Не удалось запустить камеру терминала", "error");
    closeTerminalScanner();
  });
}

function closeTerminalScanner() {
  const panel = document.getElementById("terminal-camera-panel");
  if (panel) {
    panel.classList.remove("active");
  }

  if (terminalQrcodeScanner) {
    terminalQrcodeScanner.stop().then(() => {
      terminalQrcodeScanner = null;
    }).catch(err => {
      console.error("Failed to stop terminal scanner: ", err);
      terminalQrcodeScanner = null;
    });
  }
  terminalScannerProcessing = false;
}

// --- WEBCAM SCANNING CONTROLLER ---
async function openMobileScanner() {
  const authenticatedEmployee = getAuthenticatedEmployee();
  if (!authenticatedEmployee) {
    currentEmployeeId = null;
    sessionStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    renderEmployeeAuthState();
    showToast("Сначала войдите в аккаунт сотрудника", "error");
    return;
  }

  if (!window.isSecureContext) {
    showToast("\u041a\u0430\u043c\u0435\u0440\u0430 \u043d\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0435 \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0442\u043e\u043b\u044c\u043a\u043e \u0447\u0435\u0440\u0435\u0437 HTTPS. \u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u0443\u044e HTTPS-\u0441\u0441\u044b\u043b\u043a\u0443.", "error");
    return;
  }

  if (typeof Html5Qrcode === "undefined") {
    showToast("\u0421\u043a\u0430\u043d\u0435\u0440 QR \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u043b\u0441\u044f. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u043d\u0442\u0435\u0440\u043d\u0435\u0442 \u043d\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0435 \u0438 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u0435 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0443.", "error");
    return;
  }

  const overlay = document.getElementById("mobile-camera-overlay");
  overlay.classList.add("active");
  scannerProcessing = false;

  // Initialize html5-qrcode
  html5QrcodeScanner = new Html5Qrcode("webcam-reader");
  
  html5QrcodeScanner.start(
    { facingMode: "environment" },
    {
      fps: 10,
      qrbox: { width: 200, height: 200 }
    },
    async (decodedText) => {
      if (scannerProcessing) return;
      scannerProcessing = true;

      // On QR code scanned successfully
      console.log("Scanned QR Text:", decodedText);
      
      if (isGateQrPayload(decodedText)) {
        if (!(await ensureInsideGeoFence())) {
          scannerProcessing = false;
          return;
        }

        // Successfully scanned the gate! Execute check in/out for current user
        executeCheckInOrOut(authenticatedEmployee.id, decodedText);
        closeMobileScanner();
      } else {
        // Some other QR scanned
        showToast("Неверный QR-код входа!", "error");
        playSound("error");
        scannerProcessing = false;
      }
    },
    (errorMessage) => {
      // Ignore normal scanning logs
    }
  ).catch(err => {
    console.error("Camera start failed:", err);
    showToast("Не удалось запустить камеру. Используйте Симулятор.", "error");
    closeMobileScanner();
  });
}

function closeMobileScanner() {
  const overlay = document.getElementById("mobile-camera-overlay");
  if (overlay) {
    overlay.classList.remove("active");
  }

  if (html5QrcodeScanner) {
    html5QrcodeScanner.stop().then(() => {
      html5QrcodeScanner = null;
    }).catch(err => {
      console.error("Failed to stop scanner: ", err);
      html5QrcodeScanner = null;
    });
  }
  scannerProcessing = false;
}

async function simulateCheckIn() {
  const authenticatedEmployee = getAuthenticatedEmployee();
  if (!authenticatedEmployee) {
    currentEmployeeId = null;
    sessionStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    renderEmployeeAuthState();
    showToast("Сначала войдите в аккаунт сотрудника", "error");
    return;
  }

  if (!(await ensureInsideGeoFence())) return;

  executeCheckInOrOut(authenticatedEmployee.id);
}

// --- ADMIN SYSTEM PANEL CONTROLS ---

// Login logic
function loginAdmin() {
  const loginInput = document.getElementById("admin-login-input");
  const passwordInput = document.getElementById("admin-password-input");
  const login = loginInput.value.trim().toLowerCase();
  const password = passwordInput.value;
  const account = (settings.adminAccounts || []).find(item =>
    String(item.username || "").toLowerCase() === login && String(item.password || "") === password
  );

  if (account) {
    adminLoggedIn = true;
    adminAccessRole = "admin";
    currentAdminOrganization = getOrganizationByAdminLogin(login) || account.organization || "university";
    document.getElementById("admin-auth-screen").style.display = "none";
    document.getElementById("admin-main-panel").style.display = "flex";
    loginInput.value = "";
    passwordInput.value = "";
    configureAdminAccessView();
    showToast(`Вход выполнен: ${getOrganizationName(currentAdminOrganization)}`, "success");
    switchAdminTab("dashboard");
  } else {
    showToast("Неверный логин или пароль администратора", "error");
    playSound("error");
    passwordInput.value = "";
    passwordInput.focus();
  }
}

function loginOwner() {
  const loginInput = document.getElementById("owner-login-input");
  const passwordInput = document.getElementById("owner-password-input");
  const login = loginInput.value.trim();
  const password = passwordInput.value;

  if (login === settings.ownerUsername && password === settings.ownerPassword) {
    adminLoggedIn = true;
    adminAccessRole = "owner";
    currentAdminOrganization = null;
    document.getElementById("admin-auth-screen").style.display = "none";
    document.getElementById("admin-main-panel").style.display = "flex";
    loginInput.value = "";
    passwordInput.value = "";
    configureAdminAccessView();
    showToast("Вход владельца выполнен", "success");
    switchAdminTab("dashboard");
  } else {
    showToast("Неверный логин или пароль владельца", "error");
    playSound("error");
    passwordInput.value = "";
    passwordInput.focus();
  }
}

function configureAdminAccessView() {
  const isOwner = adminAccessRole === "owner";
  document.body.dataset.accessRole = adminAccessRole || "";
  ["employees", "logs", "settings"].forEach(tab => {
    const btn = document.getElementById(`admin-btn-${tab}`);
    if (btn) btn.style.display = isOwner && tab !== "settings" ? "none" : "flex";
  });

  const orgFilter = document.getElementById("filter-organization");
  if (orgFilter) {
    if (adminAccessRole === "admin" && currentAdminOrganization) {
      orgFilter.value = currentAdminOrganization;
      orgFilter.disabled = true;
    } else {
      orgFilter.disabled = false;
    }
  }

  const label = document.getElementById("admin-access-label");
  if (label) {
    label.innerText = isOwner
      ? "Уровень доступа: Владелец · только итоги"
      : `Уровень доступа: Админ · ${getOrganizationName(currentAdminOrganization)}`;
  }
  if (label && isOwner) {
    label.innerText = "Уровень доступа: Владелец · итоги и аккаунты";
  }
}

function getAdminScopeOrganization() {
  return adminAccessRole === "admin" ? currentAdminOrganization : null;
}

function isInAdminScope(entity) {
  const scope = getAdminScopeOrganization();
  if (!scope) return true;
  return (entity.organization || "university") === scope;
}

function getScopedEmployees() {
  return employees.filter(emp => isInAdminScope(emp));
}

function getScopedLogs(sourceLogs = logs) {
  return sourceLogs.filter(log => isInAdminScope(log));
}

function logoutAdmin() {
  const loginRole = currentViewMode === "owner" || adminAccessRole === "owner" ? "owner" : "admin";
  adminLoggedIn = false;
  adminAccessRole = loginRole === "owner" ? "owner" : null;
  document.body.dataset.accessRole = "";
  currentAdminOrganization = null;
  configureAuthScreen(loginRole);
  document.getElementById("admin-auth-screen").style.display = "flex";
  document.getElementById("admin-main-panel").style.display = "none";
  showToast("Вы вышли из админ-панели", "info");
}

// Tab switcher inside Admin Panel
function switchAdminTab(tab) {
  if (adminAccessRole === "owner" && !["dashboard", "settings"].includes(tab)) {
    showToast("Владельцу доступны итоги и аккаунты администраторов", "info");
    tab = "dashboard";
  }

  currentAdminTab = tab;
  
  // Nav buttons
  document.querySelectorAll(".admin-menu-btn").forEach(btn => btn.classList.remove("active"));
  document.getElementById(`admin-btn-${tab}`).classList.add("active");
  
  // Tab panels
  document.querySelectorAll(".admin-tab-content").forEach(panel => panel.classList.remove("active"));
  document.getElementById(`admin-tab-${tab}`).classList.add("active");
  
  // Trigger loaders
  if (tab === "dashboard") {
    updateAdminDashboard();
  } else if (tab === "employees") {
    renderEmployeesList();
  } else if (tab === "logs") {
    renderLogsList();
  } else if (tab === "settings") {
    loadSettingsInForm();
  }
}

// Load settings into form fields
function loadSettingsInForm() {
  document.getElementById("settings-workday-start").value = settings.workdayStart;
  document.getElementById("settings-accumulate-threshold").value = settings.accumulateThreshold;
  document.getElementById("settings-violator-threshold").value = settings.violatorThreshold;
  const adminAccounts = settings.adminAccounts || [];
  ["university", "pedcollege", "medcollege"].forEach(org => {
    const account = adminAccounts.find(item => item.organization === org) || {};
    document.getElementById(`settings-admin-${org}-login`).value = account.username || "";
    document.getElementById(`settings-admin-${org}-password`).value = account.password || "";
  });
  document.getElementById("settings-owner-login").value = settings.ownerUsername;
  document.getElementById("settings-owner-password").value = settings.ownerPassword;
  document.getElementById("settings-geofence-enabled").checked = Boolean(settings.geoFenceEnabled);
  document.getElementById("settings-geofence-lat").value = settings.geoFenceLat;
  document.getElementById("settings-geofence-lng").value = settings.geoFenceLng;
  document.getElementById("settings-geofence-radius").value = settings.geoFenceRadius;
  updateGeoFenceFieldsState();
}

function updateGeoFenceFieldsState() {
  const enabledInput = document.getElementById("settings-geofence-enabled");
  const geoInputs = [
    document.getElementById("settings-geofence-lat"),
    document.getElementById("settings-geofence-lng"),
    document.getElementById("settings-geofence-radius")
  ].filter(Boolean);
  const isEnabled = Boolean(enabledInput?.checked);

  geoInputs.forEach(input => {
    input.disabled = !isEnabled;
  });
}

function saveSystemSettings() {
  const isOwner = adminAccessRole === "owner";
  const workdayStartVal = document.getElementById("settings-workday-start").value;
  const accumulateVal = parseInt(document.getElementById("settings-accumulate-threshold").value);
  const violatorVal = parseInt(document.getElementById("settings-violator-threshold").value);
  const adminAccounts = ["university", "pedcollege", "medcollege"].map(org => ({
    organization: org,
    username: document.getElementById(`settings-admin-${org}-login`).value.trim().toLowerCase(),
    password: document.getElementById(`settings-admin-${org}-password`).value
  }));
  const ownerLoginVal = document.getElementById("settings-owner-login").value.trim();
  const ownerPasswordVal = document.getElementById("settings-owner-password").value;
  const geoFenceEnabled = document.getElementById("settings-geofence-enabled").checked;
  const geoFenceLat = parseFloat(document.getElementById("settings-geofence-lat").value);
  const geoFenceLng = parseFloat(document.getElementById("settings-geofence-lng").value);
  const geoFenceRadius = parseInt(document.getElementById("settings-geofence-radius").value);

  const adminAccountInvalid = isOwner && adminAccounts.some(account => !account.username || !account.password);
  const geoFenceInvalid = geoFenceEnabled && (isNaN(geoFenceLat) || isNaN(geoFenceLng) || isNaN(geoFenceRadius) || geoFenceRadius < 10);

  if (!workdayStartVal || isNaN(accumulateVal) || isNaN(violatorVal) || adminAccountInvalid || (isOwner && (!ownerLoginVal || !ownerPasswordVal)) || geoFenceInvalid) {
    showToast("Заполните все настройки корректно!", "error");
    return;
  }

  settings.workdayStart = workdayStartVal;
  settings.accumulateThreshold = accumulateVal;
  settings.violatorThreshold = violatorVal;
  if (isOwner) {
    settings.adminAccounts = adminAccounts;
    settings.ownerUsername = ownerLoginVal;
    settings.ownerPassword = ownerPasswordVal;
  }
  settings.settingsVersion = SETTINGS_VERSION;
  settings.geoFenceEnabled = geoFenceEnabled;
  settings.geoFenceLat = geoFenceEnabled ? geoFenceLat : settings.geoFenceLat;
  settings.geoFenceLng = geoFenceEnabled ? geoFenceLng : settings.geoFenceLng;
  settings.geoFenceRadius = geoFenceEnabled ? geoFenceRadius : settings.geoFenceRadius;

  localStorage.setItem("bolashaq_settings", JSON.stringify(settings));
  showToast("Настройки успешно сохранены!", "success");
  
  // Refresh layout
  refreshEmployeeMobileView();
}

function factoryResetData() {
  if (confirm("Вы уверены, что хотите сбросить все данные сотрудников и журналы к исходным заводским настройкам? Все изменения будут удалены!")) {
    localStorage.removeItem("bolashaq_employees");
    localStorage.removeItem("bolashaq_logs");
    localStorage.removeItem("bolashaq_settings");
    initData();
    showToast("Данные успешно сброшены к начальным!", "success");
    location.reload();
  }
}

// --- ADMIN TAB 1: DASHBOARD ---
function updateAdminDashboard() {
  const scopedLogs = getScopedLogs();
  const todayLogs = scopedLogs.filter(l => l.date === mockTime.date);
  
  let checkedInCount = todayLogs.length;
  let onTime = 0;
  let regularLates = 0;
  let criticals = 0;
  let excused = 0;
  let vip = 0;

  todayLogs.forEach(l => {
    if (l.status === "normal") onTime++;
    else if (l.status === "late") regularLates++;
    else if (l.status === "critical") criticals++;
    else if (l.status === "excused") excused++;
    else if (l.status === "vip") vip++;
  });

  // Set counters in DOM
  document.getElementById("stat-total").innerText = checkedInCount;
  document.getElementById("stat-ontime").innerText = onTime + vip; // Include vip into on-time visually or split
  document.getElementById("stat-late").innerText = regularLates;
  document.getElementById("stat-critical").innerText = criticals;
  document.getElementById("stat-excused").innerText = excused;

  // Render Chart
  renderAttendanceChart(onTime + vip, regularLates, criticals, excused);
  renderOrganizationSummary(todayLogs);
  renderOwnerLatenessReport(scopedLogs);
  renderOwnerCriticalFolder(scopedLogs);

  // Render Violators List
  renderViolatorsList();
}

function renderOrganizationSummary(todayLogs) {
  const container = document.getElementById("organization-summary-grid");
  if (!container) return;

  container.innerHTML = "";
  const scope = getAdminScopeOrganization();
  const orgEntries = scope ? [[scope, getOrganizationName(scope)]] : Object.entries(ORGANIZATIONS);
  orgEntries.forEach(([key, label]) => {
    const orgLogs = todayLogs.filter(l => (l.organization || "university") === key);
    const lateCount = orgLogs.filter(l => l.status === "late").length;
    const criticalCount = orgLogs.filter(l => l.status === "critical").length;
    const activeCount = orgLogs.filter(l => !l.checkOutTime).length;

    const item = document.createElement("div");
    item.className = "organization-summary-card";
    item.innerHTML = `
      <span class="organization-summary-name">${label}</span>
      <div class="organization-summary-values">
        <strong>${orgLogs.length}</strong>
        <span>отметок</span>
      </div>
      <div class="organization-summary-meta">
        <span>В здании: ${activeCount}</span>
        <span>Обыч.: ${lateCount}</span>
        <span>Крит.: ${criticalCount}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function renderOwnerLatenessReport(sourceLogs = logs) {
  const container = document.getElementById("owner-lateness-report");
  if (!container) return;

  container.innerHTML = "";
  const scope = getAdminScopeOrganization();
  const orgEntries = scope ? [[scope, getOrganizationName(scope)]] : Object.entries(ORGANIZATIONS);
  orgEntries.forEach(([key, label]) => {
    const orgLogs = sourceLogs.filter(l => (l.organization || "university") === key);
    const regular = orgLogs.filter(l => l.status === "late").length;
    const critical = orgLogs.filter(l => l.status === "critical").length;
    const excused = orgLogs.filter(l => l.status === "excused").length;

    const item = document.createElement("div");
    item.className = "owner-lateness-item";
    item.innerHTML = `
      <span>${label}</span>
      <strong>${regular}</strong>
      <strong class="critical">${critical}</strong>
      <em>${excused}</em>
    `;
    container.appendChild(item);
  });
}

function renderOwnerCriticalFolder(sourceLogs = logs) {
  const container = document.getElementById("owner-critical-folder");
  if (!container) return;

  const criticalLogs = sourceLogs
    .filter(l => l.status === "critical")
    .sort((a, b) => b.date.localeCompare(a.date) || b.checkInTime.localeCompare(a.checkInTime));

  container.innerHTML = "";

  if (criticalLogs.length === 0) {
    container.innerHTML = `<div class="owner-empty-folder">Критических опозданий нет</div>`;
    return;
  }

  criticalLogs.slice(0, 12).forEach(log => {
    const item = document.createElement("div");
    item.className = "owner-critical-item";
    item.innerHTML = `
      <div>
        <strong>${log.employeeName}</strong>
        <span>${getOrganizationName(log.organization)} · ${formatDateRu(log.date)} · ${log.checkInTime}</span>
      </div>
      <span class="status-badge critical">Критично</span>
    `;
    container.appendChild(item);
  });
}

function renderAttendanceChart(onTime, late, critical, excused) {
  const ctx = document.getElementById("attendance-pie-chart").getContext("2d");
  
  if (attendanceChart) {
    attendanceChart.destroy();
  }

  // If no logs today, render a gray empty chart
  const hasData = (onTime + late + critical + excused) > 0;
  
  const chartData = hasData ? [onTime, late, critical, excused] : [0, 0, 0, 0, 1];
  const chartColors = hasData 
    ? ["#10b981", "#f59e0b", "#ef4444", "#06b6d4"] 
    : ["#475569"];
  const labels = hasData 
    ? ["Вовремя / VIP", "Обычные опоздания", "Критические опоздания", "Оправдано"] 
    : ["Нет данных за сегодня"];

  attendanceChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: labels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
        borderWidth: 2,
        borderColor: "#131a2b"
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#f8fafc",
            font: { family: "Outfit", size: 12 }
          }
        }
      },
      cutout: "70%"
    }
  });
}

function renderViolatorsList() {
  const container = document.getElementById("violators-list-box");
  if (!container) return;

  container.innerHTML = "";
  
  const list = [];
  const limit = settings.violatorThreshold;

  getScopedEmployees().forEach(emp => {
    if (emp.isVip) return; // VIPs are never violators
    
    const stats = calculateEmployeeStats(emp.id);
    
    if (stats.criticalTotal >= limit) {
      list.push({
        emp: emp,
        stats: stats
      });
    }
  });

  // Sort violators by highest critical count first
  list.sort((a, b) => b.stats.criticalTotal - a.stats.criticalTotal);

  if (list.length === 0) {
    container.innerHTML = `<div class="empty-violators">Список пуст. Критических нарушителей нет!</div>`;
  } else {
    list.forEach(v => {
      const item = document.createElement("div");
      item.className = "violator-item";
      
      const avatarSrc = v.emp.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(v.emp.name)}`;
      
      item.innerHTML = `
        <img src="${avatarSrc}" class="violator-avatar">
        <div class="violator-info">
          <div class="violator-name">${v.emp.name}</div>
          <div class="violator-count">${getOrganizationName(v.emp.organization)}</div>
          <div class="violator-count">
            Нарушений: ${v.stats.criticalTotal} критических 
            (из них ${v.stats.criticalDirect} прямых, ${v.stats.criticalAccumulated} накоплено)
          </div>
        </div>
      `;
      container.appendChild(item);
    });
  }
}

// --- ADMIN TAB 2: EMPLOYEES BASE ---
function renderEmployeesList() {
  const grid = document.getElementById("admin-employees-grid");
  if (!grid) return;

  grid.innerHTML = "";

  getScopedEmployees().forEach(emp => {
    const card = document.createElement("div");
    card.className = `employee-card ${emp.isVip ? "vip-card" : ""}`;
    
    const avatarSrc = emp.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(emp.name)}`;
    const stats = calculateEmployeeStats(emp.id);

    card.innerHTML = `
      <div class="employee-card-top">
        <img src="${avatarSrc}" class="employee-card-avatar" alt="Avatar">
        <div class="employee-card-details">
          <div class="employee-card-name">
            ${emp.name} 
            ${emp.isVip ? '<i data-lucide="star" style="width: 14px; height: 14px; fill: var(--status-vip); color: var(--status-vip); display: inline-block; vertical-align: text-bottom;"></i>' : ""}
          </div>
          <div class="employee-card-role">${getRoleLabel(emp.role)}</div>
          <div class="employee-card-org">${getOrganizationName(emp.organization)}</div>
          <div class="employee-card-dept">${emp.department}</div>
          <div class="employee-card-login">Логин: ${emp.username || String(emp.id).toLowerCase()}</div>
        </div>
      </div>
      
      <div class="employee-card-stats">
        <div class="employee-card-stat">
          <span class="val">${stats.totalLogs}</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">Дней</span>
        </div>
        <div class="employee-card-stat">
          <span class="val ${stats.regularUnexcused > 0 ? "late" : ""}">${stats.regularUnexcused}</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">Опозданий</span>
        </div>
        <div class="employee-card-stat">
          <span class="val ${stats.criticalTotal > 0 ? "crit" : ""}">${stats.criticalTotal}</span>
          <span style="color: var(--text-muted); font-size: 0.7rem;">Критических</span>
        </div>
      </div>
      
      <div class="employee-card-actions">
        <button class="card-btn" onclick="openQrModal('${emp.id}')" hidden>
          <i data-lucide="qr-code" style="width:12px; height:12px;"></i> QR-пропуск
        </button>
        
        ${emp.role === "teacher" ? `
          <button class="card-btn" onclick="openScheduleModal('${emp.id}')">
            <i data-lucide="calendar" style="width:12px; height:12px;"></i> Расписание
          </button>
        ` : ""}
        
        <button class="card-btn" onclick="openEditEmployeeModal('${emp.id}')">
          <i data-lucide="edit" style="width:12px; height:12px;"></i> Изм.
        </button>
        
        <button class="card-btn delete" onclick="deleteEmployee('${emp.id}')">
          <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
  
  lucide.createIcons();
}

// Delete Employee
async function deleteEmployee(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp || !isInAdminScope(emp)) {
    showToast("Нет доступа к сотруднику другой организации", "error");
    return;
  }

  if (confirm(`Вы действительно хотите удалить сотрудника ${getEmployeeName(empId)}? Все его логи проходов будут стерты!`)) {
    try {
      await apiRequest(`/employees/${encodeURIComponent(empId)}/`, { method: "DELETE" });
    } catch (err) {
      showToast(`Supabase delete failed: ${err.message}`, "error");
      return;
    }

    employees = employees.filter(e => e.id !== empId);
    logs = logs.filter(l => l.employeeId !== empId);
    
    localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
    localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
    
    showToast("Сотрудник успешно удален", "success");
    
    // Refresh lists
    renderEmployeesList();
    if (currentEmployeeId === empId) {
      currentEmployeeId = null;
      sessionStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
      localStorage.removeItem(EMPLOYEE_SESSION_STORAGE_KEY);
    }
    renderEmployeeAuthState();
  }
}

function isXlsxReady() {
  if (typeof XLSX !== "undefined") return true;
  showToast("Excel-модуль еще не загрузился. Проверьте интернет и обновите страницу.", "error");
  return false;
}

function normalizeEmployeeRole(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["staff", "admin", "администрация", "административный персонал"].includes(text)) return "staff";
  if (["student", "студент", "обучающийся"].includes(text)) return "student";
  return "teacher";
}

function normalizeEmployeeOrganization(value) {
  const text = String(value || "").trim().toLowerCase();
  if (["pedcollege", "ped", "педколледж", "педагогический колледж"].includes(text)) return "pedcollege";
  if (["medcollege", "med", "медколледж", "медицинский колледж"].includes(text)) return "medcollege";
  if (["university", "univer", "университет"].includes(text)) return "university";
  return currentAdminOrganization || "university";
}

function normalizeExcelBoolean(value) {
  const text = String(value || "").trim().toLowerCase();
  return ["1", "true", "yes", "да", "vip", "v"].includes(text);
}

function getExcelValue(row, aliases) {
  const normalized = {};
  Object.keys(row).forEach(key => {
    normalized[String(key).trim().toLowerCase()] = row[key];
  });

  for (const alias of aliases) {
    const value = normalized[String(alias).trim().toLowerCase()];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function generateNextEmployeeId() {
  const maxNumber = employees.reduce((max, emp) => {
    const match = String(emp.id || "").match(/^EMP(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `EMP${String(maxNumber + 1).padStart(3, "0")}`;
}

function employeeToExcelRow(emp) {
  return {
    "ФИО": emp.name || "",
    "Роль": getRoleLabel(emp.role),
    "Организация": getOrganizationName(emp.organization),
    "Департамент": emp.department || "",
    "Логин": emp.username || String(emp.id || "").toLowerCase(),
    "Пароль": emp.password || "",
    "Фото URL": emp.avatar || "",
    "VIP": emp.isVip ? "Да" : "Нет"
  };
}

function exportRowsToExcel(rows, fileName, sheetName = "Сотрудники") {
  if (!isXlsxReady()) return;

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: EMPLOYEE_EXCEL_HEADERS });
  worksheet["!cols"] = [
    { wch: 30 },
    { wch: 18 },
    { wch: 20 },
    { wch: 26 },
    { wch: 16 },
    { wch: 16 },
    { wch: 32 },
    { wch: 10 }
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
}

function exportEmployeesToExcel() {
  const scopedEmployees = getScopedEmployees();
  const rows = scopedEmployees.length
    ? scopedEmployees.map(employeeToExcelRow)
    : [{
        "ФИО": "Иванов Иван Иванович",
        "Роль": "Преподаватель",
        "Организация": currentAdminOrganization ? getOrganizationName(currentAdminOrganization) : "Университет",
        "Департамент": "Кафедра математики",
        "Логин": "ivanov",
        "Пароль": "ivanov123",
        "Фото URL": "",
        "VIP": "Нет"
      }];

  exportRowsToExcel(rows, "bolashaq-employees.xlsx");
  showToast("Excel-файл сотрудников выгружен", "success");
}

function importEmployeesFromExcel(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!isXlsxReady()) {
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = event => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const result = addEmployeesFromExcelRows(rows);

      input.value = "";
      if (result.added > 0) {
        localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
        renderEmployeesList();
        renderEmployeeAuthState();
      }

      const skippedText = result.skipped ? `, пропущено: ${result.skipped}` : "";
      showToast(`Импорт Excel завершен. Добавлено: ${result.added}${skippedText}`, result.added ? "success" : "info");
    } catch (error) {
      input.value = "";
      console.error(error);
      showToast("Не удалось прочитать Excel-файл. Используйте шаблон из окна добавления.", "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

function addEmployeesFromExcelRows(rows) {
  const existingLogins = new Set(employees.map(emp => String(emp.username || "").trim().toLowerCase()).filter(Boolean));
  let added = 0;
  let skipped = 0;

  rows.forEach(row => {
    const name = getExcelValue(row, ["ФИО", "fio", "name", "employee", "сотрудник"]);
    const department = getExcelValue(row, ["Департамент", "department", "dept", "кафедра", "отдел"]);
    const username = getExcelValue(row, ["Логин", "username", "login"]).toLowerCase();
    const password = getExcelValue(row, ["Пароль", "password"]);

    if (!name || !department || !username || !password || existingLogins.has(username)) {
      skipped += 1;
      return;
    }

    const role = normalizeEmployeeRole(getExcelValue(row, ["Роль", "role", "тип"]));
    const requestedOrganization = normalizeEmployeeOrganization(getExcelValue(row, ["Организация", "organization", "org"]));
    const organization = currentAdminOrganization || requestedOrganization;

    if (currentAdminOrganization && organization !== currentAdminOrganization) {
      skipped += 1;
      return;
    }

    employees.push({
      id: generateNextEmployeeId(),
      name,
      role,
      organization,
      department,
      avatar: getExcelValue(row, ["Фото URL", "avatar", "photo", "фото"]),
      username,
      password,
      isVip: normalizeExcelBoolean(getExcelValue(row, ["VIP", "vip"])),
      schedules: []
    });
    existingLogins.add(username);
    added += 1;
  });

  return { added, skipped };
}

// Add/Edit employee modal open
function openAddEmployeeModal() {
  document.getElementById("employee-modal-title").innerText = "Добавить нового сотрудника";
  document.getElementById("edit-employee-id").value = "";
  
  document.getElementById("employee-name-input").value = "";
  document.getElementById("employee-role-input").value = "teacher";
  document.getElementById("employee-org-input").value = currentAdminOrganization || "university";
  document.getElementById("employee-org-input").disabled = !!currentAdminOrganization;
  document.getElementById("employee-dept-input").value = "";
  document.getElementById("employee-avatar-input").value = "";
  document.getElementById("employee-username-input").value = "";
  document.getElementById("employee-password-input").value = "";
  document.getElementById("employee-vip-input").checked = false;

  document.getElementById("employee-modal").classList.add("active");
}

function openEditEmployeeModal(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  if (!isInAdminScope(emp)) {
    showToast("Нет доступа к сотруднику другой организации", "error");
    return;
  }

  document.getElementById("employee-modal-title").innerText = "Редактировать сотрудника";
  document.getElementById("edit-employee-id").value = emp.id;
  
  document.getElementById("employee-name-input").value = emp.name;
  document.getElementById("employee-role-input").value = emp.role;
  document.getElementById("employee-org-input").value = emp.organization || "university";
  document.getElementById("employee-org-input").disabled = !!currentAdminOrganization;
  document.getElementById("employee-dept-input").value = emp.department;
  document.getElementById("employee-avatar-input").value = emp.avatar || "";
  document.getElementById("employee-username-input").value = emp.username || String(emp.id).toLowerCase();
  document.getElementById("employee-password-input").value = emp.password || String(emp.id).toLowerCase();
  document.getElementById("employee-vip-input").checked = emp.isVip;

  document.getElementById("employee-modal").classList.add("active");
}

function closeEmployeeModal() {
  document.getElementById("employee-modal").classList.remove("active");
  document.getElementById("employee-org-input").disabled = false;
}

async function saveEmployeeData() {
  const editId = document.getElementById("edit-employee-id").value;
  const name = document.getElementById("employee-name-input").value.trim();
  const role = document.getElementById("employee-role-input").value;
  const organization = currentAdminOrganization || document.getElementById("employee-org-input").value;
  const dept = document.getElementById("employee-dept-input").value.trim();
  const avatar = document.getElementById("employee-avatar-input").value.trim();
  const username = document.getElementById("employee-username-input").value.trim().toLowerCase();
  const password = document.getElementById("employee-password-input").value;
  const isVip = document.getElementById("employee-vip-input").checked;

  if (!name || !dept || !username || !password) {
    showToast("ФИО, департамент, логин и пароль обязательны к заполнению!", "error");
    return;
  }

  const duplicateLogin = employees.find(e => e.id !== editId && String(e.username || "").toLowerCase() === username);
  if (duplicateLogin) {
    showToast("Такой логин уже используется другим сотрудником", "error");
    return;
  }

  const payload = {
    id: editId || generateNextEmployeeId(),
    name,
    role,
    organization,
    department: dept,
    avatar,
    username,
    password,
    isVip
  };

  let savedEmployee = null;
  try {
    const response = editId
      ? await apiRequest(`/employees/${encodeURIComponent(editId)}/`, {
          method: "PUT",
          body: JSON.stringify(payload)
        })
      : await apiRequest("/employees/", {
          method: "POST",
          body: JSON.stringify(payload)
        });
    savedEmployee = response.employee || null;
  } catch (err) {
    showToast(`Supabase save failed: ${err.message}`, "error");
    return;
  }

  if (editId) {
    // Editing existing employee
    const emp = employees.find(e => e.id === editId);
    if (emp) {
      if (!isInAdminScope(emp)) {
        showToast("Нет доступа к сотруднику другой организации", "error");
        return;
      }
      emp.name = name;
      emp.role = role;
      emp.organization = organization;
      emp.department = dept;
      emp.avatar = avatar;
      emp.username = username;
      emp.password = password;
      emp.isVip = isVip;
      if (savedEmployee) Object.assign(emp, savedEmployee);
      
      // Update employee name in all logs too
      logs.forEach(l => {
        if (l.employeeId === editId) {
          l.employeeName = name;
          l.role = role;
          l.organization = organization;
        }
      });
    }
    showToast("Карточка сотрудника обновлена", "success");
  } else {
    // Creating new employee
    const newId = generateNextEmployeeId();
    const newEmp = {
      id: newId,
      name: name,
      role: role,
      organization: organization,
      department: dept,
      avatar: avatar,
      username: username,
      password: password,
      isVip: isVip,
      schedules: []
    };
    employees.push(savedEmployee || newEmp);
    showToast("Новый сотрудник успешно создан", "success");
  }

  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
  
  closeEmployeeModal();
  renderEmployeesList();
  renderEmployeeAuthState();
}

function onModalRoleChange() {
  // Can be used to toggle layout fields inside modal if needed
}

// --- ADMIN TAB 3: ATTENDANCE JOURNAL ---
function renderLogsList() {
  const tbody = document.getElementById("admin-logs-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const nameQuery = document.getElementById("filter-search-name").value.toLowerCase();
  const roleQuery = document.getElementById("filter-role").value;
  const organizationQuery = document.getElementById("filter-organization").value;
  const statusQuery = document.getElementById("filter-status").value;
  const dateQuery = document.getElementById("filter-date").value;

  // Filter logs list
  const filteredLogs = getScopedLogs().filter(l => {
    // Search Name
    if (nameQuery && !l.employeeName.toLowerCase().includes(nameQuery)) return false;
    // Filter Role
    if (roleQuery !== "all" && l.role !== roleQuery) return false;
    // Filter Organization
    if (organizationQuery !== "all" && (l.organization || "university") !== organizationQuery) return false;
    // Filter Status
    if (statusQuery !== "all" && l.status !== statusQuery) return false;
    // Filter Date
    if (dateQuery && l.date !== dateQuery) return false;
    
    return true;
  });

  // Sort logs newest first
  filteredLogs.sort((a, b) => b.date.localeCompare(a.date) || b.checkInTime.localeCompare(a.checkInTime));

  if (filteredLogs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color: var(--text-muted); padding: 32px 0;">Записей в журнале не обнаружено</td></tr>`;
  } else {
    filteredLogs.forEach(l => {
      const tr = document.createElement("tr");
      
      let badgeClass = "normal";
      let statusText = "Вовремя";
      
      if (l.status === "late") { badgeClass = "late"; statusText = "Опоздание"; }
      else if (l.status === "critical") { badgeClass = "critical"; statusText = "Критичное"; }
      else if (l.status === "excused") { badgeClass = "excused"; statusText = "Оправдано"; }
      else if (l.status === "vip") { badgeClass = "vip"; statusText = "VIP"; }

      const commentsText = l.status === "excused" 
        ? `<strong>Причина:</strong> ${l.excuseReason} ${l.excuseComment ? `(${l.excuseComment})` : ""}`
        : l.details || "-";

      tr.innerHTML = `
        <td><strong>${l.employeeName}</strong></td>
        <td>${getOrganizationName(l.organization)}</td>
        <td>${getRoleLabel(l.role)}</td>
        <td>${formatDateRu(l.date)}</td>
        <td style="font-variant-numeric: tabular-nums;">${l.checkInTime}</td>
        <td style="font-variant-numeric: tabular-nums;">${l.checkOutTime || '<span style="color: var(--text-muted); font-size: 0.8rem;">не ушел</span>'}</td>
        <td style="font-variant-numeric: tabular-nums;">${l.workDuration || "-"}</td>
        <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
        <td style="max-width: 250px; font-size: 0.85rem; line-height: 1.3;">${commentsText}</td>
        <td>
          <div class="logs-actions">
            ${(l.status === "late" || l.status === "critical") ? `
              <button class="log-btn excuse" title="Оправдать опоздание" onclick="openExcuseModal('${l.id}')">
                <i data-lucide="check-circle" style="width: 12px; height: 12px;"></i> Оправдать
              </button>
            ` : ""}
            
            <button class="log-btn" title="Редактировать время" onclick="openEditLogModal('${l.id}')">
              <i data-lucide="clock" style="width: 12px; height: 12px;"></i> Изм.
            </button>
            
            <button class="log-btn" title="Удалить запись" onclick="deleteLogEntry('${l.id}')" style="color: #f87171; border-color: rgba(239, 68, 68, 0.15);">
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
  
  lucide.createIcons();
}

function applyLogsFilters() {
  renderLogsList();
}

function resetLogsFilters() {
  document.getElementById("filter-search-name").value = "";
  document.getElementById("filter-role").value = "all";
  document.getElementById("filter-organization").value = currentAdminOrganization || "all";
  document.getElementById("filter-status").value = "all";
  document.getElementById("filter-date").value = "";
  renderLogsList();
}

function deleteLogEntry(logId) {
  const log = logs.find(l => l.id === logId);
  if (!log || !isInAdminScope(log)) {
    showToast("Нет доступа к записи другой организации", "error");
    return;
  }

  if (confirm("Вы действительно хотите удалить эту запись из журнала?")) {
    logs = logs.filter(l => l.id !== logId);
    localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
    showToast("Запись успешно удалена", "success");
    
    renderLogsList();
    updateAdminDashboard();
    refreshEmployeeMobileView();
  }
}

// Excuse lateness modals
function openExcuseModal(logId) {
  const log = logs.find(l => l.id === logId);
  if (!log) return;
  if (!isInAdminScope(log)) {
    showToast("Нет доступа к записи другой организации", "error");
    return;
  }

  document.getElementById("excuse-log-id").value = log.id;
  document.getElementById("excuse-emp-name").innerText = log.employeeName;
  document.getElementById("excuse-log-time").innerText = `${formatDateRu(log.date)} в ${log.checkInTime} (${log.status === "late" ? "Обычное опоздание" : "Критическое опоздание"})`;
  document.getElementById("excuse-comment-input").value = "";

  document.getElementById("excuse-modal").classList.add("active");
}

function closeExcuseModal() {
  document.getElementById("excuse-modal").classList.remove("active");
}

function submitLatenessExcuse() {
  const logId = document.getElementById("excuse-log-id").value;
  const reason = document.getElementById("excuse-reason-select").value;
  const comment = document.getElementById("excuse-comment-input").value.trim();

  const log = logs.find(l => l.id === logId);
  if (log) {
    log.status = "excused";
    log.excuseReason = reason;
    log.excuseComment = comment;
    
    localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
    showToast(`Опоздание для ${log.employeeName} успешно оправдано`, "success");
    
    closeExcuseModal();
    renderLogsList();
    updateAdminDashboard();
    refreshEmployeeMobileView();
  }
}

// Edit Log entry times modal
function openEditLogModal(logId) {
  const log = logs.find(l => l.id === logId);
  if (!log) return;
  if (!isInAdminScope(log)) {
    showToast("Нет доступа к записи другой организации", "error");
    return;
  }

  document.getElementById("edit-log-id-input").value = log.id;
  document.getElementById("edit-log-emp-name").innerText = log.employeeName;
  document.getElementById("edit-log-date-label").innerText = formatDateRu(log.date);
  
  document.getElementById("edit-log-checkin").value = log.checkInTime;
  document.getElementById("edit-log-checkout").value = log.checkOutTime || "";

  document.getElementById("edit-log-modal").classList.add("active");
}

function closeEditLogModal() {
  document.getElementById("edit-log-modal").classList.remove("active");
}

function saveEditedLogTime() {
  const logId = document.getElementById("edit-log-id-input").value;
  const newCheckIn = document.getElementById("edit-log-checkin").value;
  const newCheckOut = document.getElementById("edit-log-checkout").value;

  const log = logs.find(l => l.id === logId);
  if (!log) return;
  if (!isInAdminScope(log)) {
    showToast("Нет доступа к записи другой организации", "error");
    return;
  }

  if (!newCheckIn) {
    showToast("Время прихода обязательно!", "error");
    return;
  }

  log.checkInTime = newCheckIn;
  log.checkOutTime = newCheckOut || "";

  // Calculate work duration if checkOut exists
  if (log.checkOutTime) {
    const checkInMins = timeToMins(log.checkInTime);
    const checkOutMins = timeToMins(log.checkOutTime);
    let diff = checkOutMins - checkInMins;
    if (diff < 0) diff += 24 * 60;
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    log.workDuration = `${hrs} ч. ${mins} мин.`;
  } else {
    log.workDuration = "";
  }

  // Recalculate Lateness Status based on newly input times!
  const emp = employees.find(e => e.id === log.employeeId);
  if (emp) {
    // Day of week of the log entry date
    const dateObj = new Date(log.date);
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // If log was excused, do we keep it excused or recalculate?
    // Let's recalculate, but if the new time makes it "normal", set to normal.
    // If it makes it late/critical, let's reset to late/critical so the admin can review/excuse again.
    const reval = calculateLateness(emp, log.checkInTime, dayOfWeek, log.date);
    
    log.status = reval.status;
    log.details = reval.details;
    log.organization = emp.organization;
    
    // Clean excuse detail if status is no longer excused/late
    if (log.status !== "excused" && log.status !== "late" && log.status !== "critical") {
      delete log.excuseReason;
      delete log.excuseComment;
    }
  }

  localStorage.setItem("bolashaq_logs", JSON.stringify(logs));
  showToast("Время посещения успешно изменено", "success");
  
  closeEditLogModal();
  renderLogsList();
  updateAdminDashboard();
  refreshEmployeeMobileView();
}

// Export attendance log to CSV
function exportLogsToCSV() {
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM
  csvContent += "Сотрудник,Организация,Роль,Дата,Время прихода,Время ухода,Отработано времени,Статус,Детали/Причина\n";

  getScopedLogs().forEach(l => {
    const roleText = l.role === "teacher" ? "Преподаватель" : "Администрация";
    let statusText = "Вовремя";
    if (l.status === "late") statusText = "Опоздание";
    else if (l.status === "critical") statusText = "Критичное";
    else if (l.status === "excused") statusText = "Оправдано";
    else if (l.status === "vip") statusText = "VIP";

    const comment = l.status === "excused" 
      ? `Оправдано: ${l.excuseReason} ${l.excuseComment ? `(${l.excuseComment})` : ""}`
      : l.details || "";

    // Escape commas
    const escapedName = `"${l.employeeName.replace(/"/g, '""')}"`;
    const escapedComment = `"${comment.replace(/"/g, '""')}"`;

    csvContent += `${escapedName},${getOrganizationName(l.organization)},${roleText},${l.date},${l.checkInTime},${l.checkOutTime || "-"},${l.workDuration || "-"},${statusText},${escapedComment}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `BolashaqQR_Logs_${mockTime.date}.csv`);
  document.body.appendChild(link);
  
  link.click();
  document.body.removeChild(link);
  
  showToast("CSV Журнал успешно выгружен!", "success");
}

// --- ADMIN TAB: TEACHER SCHEDULE MANAGER ---
let activeScheduleEmployeeId = null;

function openScheduleModal(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  if (!isInAdminScope(emp)) {
    showToast("Нет доступа к сотруднику другой организации", "error");
    return;
  }

  activeScheduleEmployeeId = empId;
  document.getElementById("sched-employee-name").innerText = emp.name;
  
  renderModalScheduleList();
  
  // Clear creator inputs
  document.getElementById("new-sched-subject").value = "";
  document.getElementById("new-sched-group").value = "";
  document.getElementById("new-sched-day").value = "1";
  document.getElementById("new-sched-start").value = "09:00";
  document.getElementById("new-sched-end").value = "10:30";

  document.getElementById("schedule-modal").classList.add("active");
}

function renderModalScheduleList() {
  const container = document.getElementById("sched-list-box");
  if (!container) return;

  container.innerHTML = "";
  const emp = employees.find(e => e.id === activeScheduleEmployeeId);
  if (!emp) return;

  const dayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  
  const schedules = emp.schedules || [];
  
  if (schedules.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">Расписание пар отсутствует</div>`;
  } else {
    // Sort schedules by Day, then Start Time
    schedules.sort((a, b) => a.day - b.day || a.startTime.localeCompare(b.startTime));

    schedules.forEach((cls, index) => {
      const item = document.createElement("div");
      item.className = "modal-sched-item";
      item.innerHTML = `
        <div class="modal-sched-details">
          <span class="modal-sched-subj">${cls.subject}</span>
          <span class="modal-sched-time">${dayNames[cls.day]}, ${cls.startTime} – ${cls.endTime}${cls.group ? ` · ${cls.group}` : ""}</span>
        </div>
        <button class="delete-sched-btn" onclick="deleteScheduleItem(${index})" title="Удалить пару">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      `;
      container.appendChild(item);
    });
  }

  lucide.createIcons();
}

function deleteScheduleItem(index) {
  const emp = employees.find(e => e.id === activeScheduleEmployeeId);
  if (emp) {
    emp.schedules.splice(index, 1);
    localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
    showToast("Пара удалена из расписания", "success");
    
    renderModalScheduleList();
    refreshEmployeeMobileView();
  }
}

function addScheduleItem() {
  const emp = employees.find(e => e.id === activeScheduleEmployeeId);
  if (!emp) return;

  const subject = document.getElementById("new-sched-subject").value.trim();
  const group = document.getElementById("new-sched-group").value.trim();
  const day = parseInt(document.getElementById("new-sched-day").value);
  const start = document.getElementById("new-sched-start").value;
  const end = document.getElementById("new-sched-end").value;

  if (!subject || !group || !start || !end) {
    showToast("Заполните название предмета, группу и время проведения!", "error");
    return;
  }

  // Validate times (start must be before end)
  if (start >= end) {
    showToast("Время начала должно быть раньше времени окончания!", "error");
    return;
  }

  const newClass = {
    day: day,
    subject: subject,
    group: group,
    startTime: start,
    endTime: end
  };

  emp.schedules.push(newClass);
  localStorage.setItem("bolashaq_employees", JSON.stringify(employees));
  showToast("Новая пара успешно добавлена!", "success");

  document.getElementById("new-sched-subject").value = "";
  document.getElementById("new-sched-group").value = "";
  document.getElementById("new-sched-start").value = "09:00";
  document.getElementById("new-sched-end").value = "10:30";

  renderModalScheduleList();
  refreshEmployeeMobileView();
}

function closeScheduleModal() {
  document.getElementById("schedule-modal").classList.remove("active");
  activeScheduleEmployeeId = null;
  renderEmployeesList(); // update employee list card stats
}

// --- ADMIN TAB: VIEW QR CODE PASS ---
function openQrModal(empId) {
  const emp = employees.find(e => e.id === empId);
  if (!emp) return;
  if (!isInAdminScope(emp)) {
    showToast("Нет доступа к сотруднику другой организации", "error");
    return;
  }

  document.getElementById("qr-employee-name-label").innerText = emp.name;
  document.getElementById("qr-employee-id-label").innerText = `ID: ${emp.id}`;
  activeQrModalEmployeeId = emp.id;

  generateAdminQrModalCode(emp);

  document.getElementById("qr-modal").classList.add("active");
}

function closeQrModal() {
  document.getElementById("qr-modal").classList.remove("active");
  activeQrModalEmployeeId = null;
}

function generateAdminQrModalCode(emp) {
  const qrContainer = document.getElementById("employee-qr-canvas");
  if (!qrContainer || !emp) return;
  renderQrCode(qrContainer, buildEmployeeQrPayload(emp), 180);
}

// --- DYNAMIC TOAST NOTIFICATIONS ---
function showToast(text, type = "success") {
  const box = document.getElementById("toast-box");
  if (!box) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let iconName = "check-circle";
  if (type === "error") iconName = "x-circle";
  else if (type === "info") iconName = "info";

  toast.innerHTML = `
    <i data-lucide="${iconName}"></i>
    <span>${text}</span>
  `;

  box.appendChild(toast);
  lucide.createIcons();

  // Slide out and remove toast after 3 seconds
  setTimeout(() => {
    toast.style.animation = "slideInRight 0.3s ease-out reverse forwards";
    setTimeout(() => {
      box.removeChild(toast);
    }, 300);
  }, 3000);
}

// --- DATA HELPERS ---
function getEmployeeName(id) {
  const emp = employees.find(e => e.id === id);
  return emp ? emp.name : "Неизвестный сотрудник";
}

function timeToMins(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GEOLOCATION_UNAVAILABLE"));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });
}

async function ensureInsideGeoFence() {
  if (!settings.geoFenceEnabled) return true;

  try {
    showToast("Проверяем расстояние до точки входа...", "info");
    const position = await getCurrentPosition();
    const distance = calculateDistanceMeters(
      position.coords.latitude,
      position.coords.longitude,
      Number(settings.geoFenceLat),
      Number(settings.geoFenceLng)
    );

    if (distance <= Number(settings.geoFenceRadius)) {
      return true;
    }

    showToast(`Сканирование доступно только в радиусе ${settings.geoFenceRadius} м от точки входа. Сейчас: ${Math.round(distance)} м.`, "error");
    playSound("error");
    return false;
  } catch (err) {
    showToast("Разрешите доступ к геолокации, чтобы подтвердить нахождение у точки входа.", "error");
    playSound("error");
    return false;
  }
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function formatDateRu(dateStr) {
  // YYYY-MM-DD to DD.MM.YYYY
  const [y, m, d] = dateStr.split("-");
  return `${d}.${m}.${y}`;
}
