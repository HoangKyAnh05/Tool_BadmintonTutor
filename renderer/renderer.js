// Check if running in Electron environment or web browser
const isElectron = typeof window.api !== 'undefined';

if (!isElectron) {
  console.log("Running in Web Browser mode. All data will be saved to LocalStorage.");
  
  // Mock window.api for standard web browser environment
  window.api = {
    loadData: async () => {
      const dataStr = localStorage.getItem('badminton_tutor_data');
      if (dataStr) {
        try {
          const parsed = JSON.parse(dataStr);
          if (!parsed.settings) parsed.settings = {};
          if (!parsed.settings.apiKey) parsed.settings.apiKey = '';
          if (parsed.settings.aiModel === 'gemini-1.5-flash') {
            parsed.settings.aiModel = 'gemini-2.5-flash';
          }
          return parsed;
        } catch (e) {
          console.error("Error parsing localStorage data:", e);
        }
      }
      return {
        settings: {
          apiKey: '',
          apiProvider: 'gemini',
          aiModel: 'gemini-2.5-flash',
          defaultTasks: []
        },
        coachAvailability: {},
        students: []
      };
    },
    saveData: async (data) => {
      try {
        localStorage.setItem('badminton_tutor_data', JSON.stringify(data));
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    callAI: async ({ provider, apiKey, model, prompt }) => {
      try {
        const key = apiKey || '';
        
        if (provider === 'gemini') {
          const selectedModel = model || 'gemini-2.5-flash';
          const url = `https://generativelanguage.googleapis.com/v1/models/${selectedModel}:generateContent`;
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': key
            },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: prompt }]
              }]
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API Error (${response.status}): ${errText}`);
          }

          const json = await response.json();
          if (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts[0]) {
            return { success: true, text: json.candidates[0].content.parts[0].text };
          } else {
            throw new Error("Invalid structure returned from Gemini API");
          }
        } else if (provider === 'openai') {
          const selectedModel = model || 'gpt-4o-mini';
          const url = 'https://api.openai.com/v1/chat/completions';
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify({
              model: selectedModel,
              messages: [{ role: 'user', content: prompt }]
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
          }

          const json = await response.json();
          if (json.choices && json.choices[0] && json.choices[0].message) {
            return { success: true, text: json.choices[0].message.content };
          } else {
            throw new Error("Invalid structure returned from OpenAI API");
          }
        } else {
          throw new Error(`Unknown AI Provider: ${provider}`);
        }
      } catch (error) {
        console.error("Browser AI Request Failed:", error);
        return { success: false, error: error.message };
      }
    }
  };
}

// State
let state = {
  settings: {
    apiKey: '',
    apiProvider: 'gemini',
    aiModel: 'gemini-2.5-flash',
    defaultTasks: []
  },
  coachAvailability: {}, // { "Mon-08:00": true }
  students: [],
  preparedLessons: [],
  quickNotes: []
};

// Default Tasks list
const DEFAULT_TASKS_LIST = [
  "Tập di chuyển bước chân cơ bản (Footwork)",
  "Kỹ thuật giao cầu ngắn và dài (Serve)",
  "Kỹ thuật phông cầu cao sâu (Clear)",
  "Kỹ thuật đập cầu tấn công (Smash)",
  "Kỹ thuật bỏ nhỏ sát lưới (Drop shot)",
  "Kỹ thuật thủ cầu/cứu cầu hai bên (Defense)",
  "Kỹ thuật ve cầu/backhand cơ bản",
  "Chiến thuật di chuyển sân đơn (Singles)",
  "Chiến thuật di chuyển sân đôi (Doubles)",
  "Rèn luyện thể lực và sức bền 90 phút"
];

// Presets templates for different student types
const TASK_TEMPLATES = {
  basic: [
    "Tập di chuyển bước chân cơ bản (Footwork)",
    "Kỹ thuật giao cầu ngắn và dài (Serve)",
    "Kỹ thuật phông cầu cao sâu (Clear)",
    "Kỹ thuật bỏ nhỏ sát lưới (Drop shot)",
    "Học luật thi đấu cầu lông cơ bản",
    "Tập phản xạ đỡ cầu thẳng người",
    "Rèn luyện thể lực cơ bản 45 phút"
  ],
  advanced: [
    "Kỹ thuật đập cầu tấn công mạnh (Smash)",
    "Kỹ thuật ve cầu/backhand cao sâu",
    "Chiến thuật di chuyển và bọc lót sân đôi",
    "Chiến thuật điều cầu ép góc sân đơn",
    "Kỹ thuật đẩy cầu/tạt cầu nhanh trên lưới",
    "Kỹ thuật chặn lưới/bỏ nhỏ hiểm hóc",
    "Thể lực chuyên sâu di chuyển đa hướng"
  ],
  fitness: [
    "Bài tập chạy bền sức bền tim mạch 30 phút",
    "Bài tập di chuyển footwork tốc độ cao",
    "Bài tập bật nhảy dây 1000 lượt",
    "Các bài tập HIIT bổ trợ cơ đùi và vai",
    "Tập tạ bổ trợ lực cổ tay và vai",
    "Rèn luyện thể lực và sức bền 90 phút"
  ],
  kids: [
    "Trò chơi khởi động vui nhộn với cầu",
    "Tập phản xạ đón cầu bằng vợt",
    "Tập các bước chạy cơ bản vui vẻ",
    "Học cách cầm vợt đúng (Forehand/Backhand)",
    "Tập giao cầu tự do qua lưới",
    "Bài tập thể thao phối hợp phát triển chiều cao"
  ]
};

let modalActiveTasks = [];

// Constants for Schedule Grid
const DAYS_OF_WEEK = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
const DAYS_ENG = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const START_HOUR = 5;
const END_HOUR = 22; // 5:00 AM to 10:00 PM

// DOM Elements
const pageTitle = document.getElementById('page-title');
const navButtons = document.querySelectorAll('.nav-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Dashboard Elements
const statTotalStudents = document.getElementById('stat-total-students');
const statPaidStudents = document.getElementById('stat-paid-students');
const statPendingTuition = document.getElementById('stat-pending-tuition');
const statAvgProgress = document.getElementById('stat-avg-progress');
const dashboardStudentsTable = document.getElementById('dashboard-students-table').getElementsByTagName('tbody')[0];
const dashboardRecommendedSlots = document.getElementById('dashboard-recommended-slots');

// Students Tab Elements
const studentSearchInput = document.getElementById('student-search-input');
const btnOpenAddStudentModal = document.getElementById('btn-open-add-student-modal');
const studentsGridContainer = document.getElementById('students-grid-container');

// Schedule Tab Elements
const scheduleTargetList = document.getElementById('schedule-target-list');
const scheduleGridTitle = document.getElementById('schedule-grid-title');
const interactiveScheduleGrid = document.getElementById('interactive-schedule-grid');
let currentScheduleTarget = 'coach'; // 'coach' or student ID

// Optimizer Elements
const optimizerRankingsList = document.getElementById('optimizer-rankings-list');
const optimizerSlotDetails = document.getElementById('optimizer-slot-details');

// AI Assistant Elements
const aiStudentSelect = document.getElementById('ai-student-select');
const aiStudentMiniProfile = document.getElementById('ai-student-mini-profile');
const btnGenerateAI = document.getElementById('btn-generate-ai');
const btnCopyAIOutput = document.getElementById('btn-copy-ai-output');
const btnCondenseAiOutput = document.getElementById('btn-condense-ai-output');
const btnSaveAiOutput = document.getElementById('btn-save-ai-output');
const aiOutputContainer = document.getElementById('ai-output-container');
const aiCustomPrompt = document.getElementById('ai-custom-prompt');
const aiHistoryContainer = document.getElementById('ai-history-container');

// Settings Elements
const settingsApiProvider = document.getElementById('settings-api-provider');
const settingsApiKey = document.getElementById('settings-api-key');
const settingsApiModel = document.getElementById('settings-api-model');
const settingsDefaultTasks = document.getElementById('settings-default-tasks');
const btnSaveAiSettings = document.getElementById('btn-save-ai-settings');
const btnSaveTasksSettings = document.getElementById('btn-save-tasks-settings');

// Modal Elements
const studentModal = document.getElementById('student-modal');
const btnCloseStudentModal = document.getElementById('btn-close-student-modal');
const btnCancelStudent = document.getElementById('btn-cancel-student');
const btnSaveStudent = document.getElementById('btn-save-student');
const studentForm = document.getElementById('student-form');
const modalStudentTasksContainer = document.getElementById('modal-student-tasks-container');
const studentTaskTemplate = document.getElementById('student-task-template');
const btnApplyTaskTemplate = document.getElementById('btn-apply-task-template');
const newTaskInput = document.getElementById('new-task-input');
const btnAddModalTask = document.getElementById('btn-add-modal-task');

// Lesson Prep DOM Elements
const prepSubject = document.getElementById('prep-subject');
const prepCustomPrompt = document.getElementById('prep-custom-prompt');
const btnGeneratePrep = document.getElementById('btn-generate-prep');
const btnCopyPrepOutput = document.getElementById('btn-copy-prep-output');
const btnSavePrepHistory = document.getElementById('btn-save-prep-history');
const btnDownloadPrepOutput = document.getElementById('btn-download-prep-output');
const prepOutputContainer = document.getElementById('prep-output-container');
const prepOutputTitle = document.getElementById('prep-output-title');
const prepHistoryContainer = document.getElementById('prep-history-container');

// Quick Notes DOM Elements
const btnAddQuickNote = document.getElementById('btn-add-quick-note');
const notesSearchInput = document.getElementById('notes-search-input');
const notesGridContainer = document.getElementById('notes-grid-container');
const noteModal = document.getElementById('note-modal');
const btnCloseNoteModal = document.getElementById('btn-close-note-modal');
const btnCancelNote = document.getElementById('btn-cancel-note');
const btnSaveNote = document.getElementById('btn-save-note');
const noteForm = document.getElementById('note-form');
const noteId = document.getElementById('note-id');
const noteTitle = document.getElementById('note-title');
const noteUrl = document.getElementById('note-url');
const noteContent = document.getElementById('note-content');

// Mouse Drag State for Schedule Grid
let isMouseDown = false;
let dragAction = true; // true = select/available, false = deselect/unavailable

// Timetable state variables
let calendarCurrentDate = new Date();
let calendarSelectedDate = new Date();

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  
  if (!isElectron) {
    const statusText = document.querySelector('.status-text');
    if (statusText) {
      statusText.innerText = "Đã kết nối LocalStorage (Trình duyệt)";
    }
  }
  
  setupNav();
  setupModals();
  setupStudentsEvents();
  setupScheduleEvents();
  setupOptimizerEvents();
  setupAIEvents();
  setupSettingsEvents();
  setupLessonPrepEvents();
  setupQuickNotesEvents();
  setupFriendsEvents();
  setupCaptainEvents();
  setupTrendPredictionEvents();

  setupGlobalChat();

  // Render initial tab
  renderDashboard();
});

// Load & Save handlers
async function loadData() {
  const loaded = await window.api.loadData();
  state = loaded;

  if (state.settings && state.settings.aiModel === 'gemini-1.5-flash') {
    state.settings.aiModel = 'gemini-2.5-flash';
  }

  // Backwards compatibility/defaults check
  if (!state.settings.defaultTasks || state.settings.defaultTasks.length === 0) {
    state.settings.defaultTasks = [...DEFAULT_TASKS_LIST];
  }
  if (!state.coachAvailability) state.coachAvailability = {};
  if (!state.students) state.students = [];
  if (!state.preparedLessons) state.preparedLessons = [];
  if (!state.aiLessonHistory) state.aiLessonHistory = [];
  if (!state.quickNotes) state.quickNotes = [];
  if (!state.friends) state.friends = [];
  if (!state.captainHistory) state.captainHistory = [];
  if (!state.trendHistory) state.trendHistory = [];
  if (!state.friendsHistory) state.friendsHistory = [];
  if (!state.friendsAiOutput) state.friendsAiOutput = "";

  // Timetable State Initialization
  if (!state.timetableEvents) state.timetableEvents = [];
  if (!state.timetableGoals) state.timetableGoals = [];
  if (!state.timetableTransactions) state.timetableTransactions = [];
  if (!state.futurePlans) state.futurePlans = { days10: [], year1: [], years10: [] };
  if (!state.futurePlans.days10) state.futurePlans.days10 = [];
  if (!state.futurePlans.year1) state.futurePlans.year1 = [];
  if (!state.futurePlans.years10) state.futurePlans.years10 = [];
  if (!state.defaultScheduleEvents) state.defaultScheduleEvents = [];

  // Pre-fill settings inputs
  settingsApiProvider.value = state.settings.apiProvider || 'gemini';
  settingsApiKey.value = state.settings.apiKey || '';
  updateModelOptions();
  settingsApiModel.value = state.settings.aiModel || 'gemini-2.5-flash';
  settingsDefaultTasks.value = state.settings.defaultTasks.join('\n');
}

async function saveData() {
  const res = await window.api.saveData(state);
  if (!res.success) {
    showToast("Không thể lưu dữ liệu: " + res.error, "error");
  }
}

// Navigation controller
function setupNav() {
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');

      // Update active nav button
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update visible tab pane
      tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `tab-${tab}`) {
          pane.classList.add('active');
        }
      });

      // Update page title & render target tab
      switch (tab) {
        case 'dashboard':
          pageTitle.innerText = "Tổng Quan Dashboard";
          renderDashboard();
          break;
        case 'students':
          pageTitle.innerText = "Danh Sách Học Viên";
          renderStudents();
          break;
        case 'schedules':
          pageTitle.innerText = "Cài Đặt Lịch Rảnh";
          renderSchedulesTab();
          break;
        case 'timetable':
          pageTitle.innerText = "Quản Lý Thời Khóa Biểu";
          renderTimetableTab();
          break;
        case 'optimizer':
          pageTitle.innerText = "Phân Tích & Tối Ưu Lịch Học";
          renderOptimizer();
          break;
        case 'ai-assistant':
          pageTitle.innerText = "Trợ Lý Giáo Án AI";
          renderAIAssistantTab();
          break;
        case 'lesson-prep':
          pageTitle.innerText = "Chuẩn Bị Bài Học";
          renderLessonPrepTab();
          break;
        case 'quick-notes':
          pageTitle.innerText = "Sổ Tay Ghi Nhớ & Link";
          renderQuickNotes();
          break;
        case 'friends':
          pageTitle.innerText = "Quản Lý Bạn Bè & Gợi Ý AI";
          renderFriendsList();
          renderFriendsTab();
          break;
        case 'captain':
          pageTitle.innerText = "Luyện Tập Đội Trưởng AI";
          renderCaptainTab();
          break;
        case 'trend-prediction':
          pageTitle.innerText = "Dự Đoán Content Phản Xạ Trước";
          renderTrendPredictionTab();
          break;
        case 'settings':
          pageTitle.innerText = "Cấu Hình Hệ Thống";
          break;
      }
    });
  });
}

// Model Selection Options depending on Provider
function updateModelOptions() {
  const provider = settingsApiProvider.value;
  settingsApiModel.innerHTML = '';

  if (provider === 'gemini') {
    const models = [
      { value: 'gemini-2.5-flash', text: 'Gemini 2.5 Flash (Mới nhất)' },
      { value: 'gemini-2.5-pro', text: 'Gemini 2.5 Pro (Thông minh)' },
      { value: 'gemini-2.0-flash', text: 'Gemini 2.0 Flash (Tốc độ cao)' }
    ];
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.innerText = m.text;
      settingsApiModel.appendChild(opt);
    });
  } else if (provider === 'openai') {
    const models = [
      { value: 'gpt-4o-mini', text: 'GPT-4o Mini (Nhanh & Rẻ)' },
      { value: 'gpt-4o', text: 'GPT-4o (Thông minh nhất)' }
    ];
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.innerText = m.text;
      settingsApiModel.appendChild(opt);
    });
  } else if (provider === 'openrouter') {
    const models = [
      { value: 'openrouter/free', text: 'Tự động chọn model miễn phí (Khuyên dùng)' },
      { value: 'meta-llama/llama-3.2-3b-instruct:free', text: 'Llama 3.2 3B (Free)' },
      { value: 'meta-llama/llama-3.1-8b-instruct:free', text: 'Llama 3.1 8B (Free)' },
      { value: 'qwen/qwen-2-7b-instruct:free', text: 'Qwen 2 7B (Free)' },
      { value: 'google/gemini-2.5-pro', text: 'Gemini 2.5 Pro (Paid)' }
    ];
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.innerText = m.text;
      settingsApiModel.appendChild(opt);
    });
  }
}

// Settings Events
function setupSettingsEvents() {
  settingsApiProvider.addEventListener('change', () => {
    updateModelOptions();
  });

  btnSaveAiSettings.addEventListener('click', async () => {
    state.settings.apiProvider = settingsApiProvider.value;
    state.settings.apiKey = settingsApiKey.value.trim();
    state.settings.aiModel = settingsApiModel.value;

    await saveData();
    showToast("Cấu hình AI đã được lưu thành công!", "success");
  });

  btnSaveTasksSettings.addEventListener('click', async () => {
    const lines = settingsDefaultTasks.value.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      showToast("Vui lòng nhập ít nhất một nhiệm vụ!", "warning");
      return;
    }

    state.settings.defaultTasks = lines;
    await saveData();
    showToast("Đã cập nhật danh sách mục tiêu 30 ngày mặc định!", "success");
  });
}

// Toast Notifications Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const textSpan = document.createElement('span');
  textSpan.innerText = message;
  toast.appendChild(textSpan);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => toast.remove();
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideIn 0.25s reverse ease-out';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

// Formatting helpers
function formatMoney(num) {
  if (!num) return '0đ';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "đ";
}

// --- DASHBOARD RENDERER ---
function renderDashboard() {
  // Update Cards
  statTotalStudents.innerText = state.students.length;

  let paidCount = 0;
  let totalDebt = 0;
  let totalProgress = 0;

  state.students.forEach(st => {
    if (st.status === 'Đã đóng') {
      paidCount++;
    } else {
      const debt = (st.tuition || 0) - (st.paid || 0);
      if (debt > 0) totalDebt += debt;
    }

    // Progress calculation
    if (st.tasks && st.tasks.length > 0) {
      const completed = st.tasks.filter(t => t.completed).length;
      totalProgress += (completed / st.tasks.length);
    }
  });

  statPaidStudents.innerText = paidCount;
  statPendingTuition.innerText = formatMoney(totalDebt);

  const avgProgPercent = state.students.length > 0
    ? Math.round((totalProgress / state.students.length) * 100)
    : 0;
  statAvgProgress.innerText = `${avgProgPercent}%`;

  // Render Students Table
  dashboardStudentsTable.innerHTML = '';
  if (state.students.length === 0) {
    const row = dashboardStudentsTable.insertRow();
    const cell = row.insertCell(0);
    cell.colSpan = 6;
    cell.className = 'empty-msg';
    cell.innerText = 'Chưa có học viên nào. Hãy thêm học viên ở mục Học Viên.';
  } else {
    state.students.slice(0, 10).forEach(st => {
      const row = dashboardStudentsTable.insertRow();

      // Name
      row.insertCell(0).innerText = st.name;

      // Gender
      row.insertCell(1).innerHTML = `<span class="gender-tag">${st.gender}</span>`;

      // Sessions remaining
      const remaining = (st.totalSessions || 12) - (st.usedSessions || 0);
      const remainingClass = remaining <= 2 ? 'badge danger' : (remaining <= 4 ? 'badge warning' : 'badge success');
      row.insertCell(2).innerHTML = `<span class="${remainingClass}">${st.usedSessions}/${st.totalSessions} (Còn ${remaining})</span>`;

      // Unexcused absences
      const abs = st.unexcusedAbsences || 0;
      const absClass = abs > 0 ? 'badge danger' : 'badge info';
      row.insertCell(3).innerHTML = `<span class="${absClass}">${abs} buổi</span>`;

      // Tuition Status Badge
      let tuitionBadgeClass = 'badge success';
      if (st.status === 'Nợ') tuitionBadgeClass = 'badge danger';
      if (st.status === 'Cọc') tuitionBadgeClass = 'badge warning';

      const debtText = st.status !== 'Đã đóng' ? ` (${formatMoney(st.tuition - st.paid)})` : '';
      row.insertCell(4).innerHTML = `<span class="${tuitionBadgeClass}">${st.status}${debtText}</span>`;

      // Progress
      let pct = 0;
      if (st.tasks && st.tasks.length > 0) {
        pct = Math.round((st.tasks.filter(t => t.completed).length / st.tasks.length) * 100);
      }
      row.insertCell(5).innerHTML = `
        <div class="mini-progress">
          <div class="progress-track"><div class="progress-fill" style="width: ${pct}%"></div></div>
          <span class="progress-num">${pct}%</span>
        </div>
      `;
    });
  }

  // Render Dashboard Schedule Recommendations
  renderDashboardRecommendations();
}

function renderDashboardRecommendations() {
  dashboardRecommendedSlots.innerHTML = '';

  if (state.students.length === 0) {
    dashboardRecommendedSlots.innerHTML = '<p class="empty-msg">Chưa có đủ dữ liệu học viên để phân tích.</p>';
    return;
  }

  const recommendations = getOptimizedSlots(3);
  if (recommendations.length === 0) {
    dashboardRecommendedSlots.innerHTML = '<p class="empty-msg">Chưa tìm thấy khung giờ trùng khớp với lịch rảnh của Coach.</p>';
    return;
  }

  recommendations.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'slot-item';
    item.innerHTML = `
      <div class="slot-time">
        <strong>${rec.dayName} ${rec.hourStr}</strong>
        <span>Có ${rec.studentsCount} học viên có thể tham gia</span>
      </div>
      <div class="slot-badge">${rec.studentsCount} học viên</div>
    `;
    dashboardRecommendedSlots.appendChild(item);
  });
}

// Calculation Algorithm: Optimize Slots
function getOptimizedSlots(limit = 10) {
  const results = [];

  // Loop through days and hours
  for (let d = 0; d < 7; d++) {
    const dayEng = DAYS_ENG[d];
    const dayName = DAYS_OF_WEEK[d];

    for (let h = START_HOUR; h <= END_HOUR; h++) {
      const hourStr = `${h.toString().padStart(2, '0')}:00`;
      const slotId = `${dayEng}-${hourStr}`;

      // If coach is not available, we skip this slot
      if (!state.coachAvailability[slotId]) continue;

      // Calculate how many students are available
      let studentsCount = 0;
      const availableStudents = [];

      state.students.forEach(st => {
        if (st.availability && st.availability[slotId]) {
          studentsCount++;
          availableStudents.push(st);
        }
      });

      if (studentsCount > 0) {
        results.push({
          slotId,
          dayName,
          hourStr,
          studentsCount,
          students: availableStudents
        });
      }
    }
  }

  // Sort descending by student count
  results.sort((a, b) => b.studentsCount - a.studentsCount);

  return results.slice(0, limit);
}

// --- STUDENTS TAB RENDERER ---
function renderStudents() {
  studentsGridContainer.innerHTML = '';
  const searchVal = studentSearchInput.value.toLowerCase().trim();

  const filtered = state.students.filter(st => {
    if (!searchVal) return true;
    return st.name.toLowerCase().includes(searchVal) ||
      st.strengths.toLowerCase().includes(searchVal) ||
      st.weaknesses.toLowerCase().includes(searchVal) ||
      st.highlights.toLowerCase().includes(searchVal) ||
      st.phone.includes(searchVal);
  });

  if (filtered.length === 0) {
    studentsGridContainer.innerHTML = `
      <div class="ai-empty-state" style="grid-column: 1 / -1; margin-top: 50px;">
        <h3>Không tìm thấy học viên</h3>
        <p>Không tìm thấy học viên nào khớp với từ khóa tìm kiếm của bạn.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(st => {
    const card = document.createElement('div');
    card.className = 'student-card';

    // Progress calculation
    let pct = 0;
    if (st.tasks && st.tasks.length > 0) {
      pct = Math.round((st.tasks.filter(t => t.completed).length / st.tasks.length) * 100);
    }

    let tuitionBadgeClass = 'badge success';
    if (st.status === 'Nợ') tuitionBadgeClass = 'badge danger';
    if (st.status === 'Cọc') tuitionBadgeClass = 'badge warning';

    card.innerHTML = `
      <div class="student-card-header">
        <div>
          <h3>${st.name}</h3>
          <span class="gender-tag">${st.gender}</span>
        </div>
        <span class="${tuitionBadgeClass}">${st.status}</span>
      </div>
      
      <div class="student-card-body">
        <div class="student-info-row">
          <span>Thông tin liên hệ</span>
          <p>${st.phone || 'Chưa cập nhật'}</p>
        </div>
        
        <div class="student-info-row">
          <span>Điểm mạnh</span>
          <p>${st.strengths || 'Chưa cập nhật'}</p>
        </div>
        
        <div class="student-info-row">
          <span>Điểm yếu</span>
          <p>${st.weaknesses || 'Chưa cập nhật'}</p>
        </div>

        <div class="student-info-row">
          <span>Mục tiêu 30 ngày (${pct}%)</span>
          <div class="mini-progress" style="margin-top: 4px;">
            <div class="progress-track" style="width: 100%;"><div class="progress-fill" style="width: ${pct}%"></div></div>
            <span class="progress-num">${pct}%</span>
          </div>
        </div>

        <div class="student-financials">
          <div class="fin-block">
            <span>Tiền học</span>
            <strong>${formatMoney(st.tuition)}</strong>
          </div>
          <div class="fin-block">
            <span>Đã đóng</span>
            <strong>${formatMoney(st.paid)}</strong>
          </div>
        </div>

        <div class="student-attendance">
          <div class="att-item">
            <span>Đã học</span>
            <strong>${st.usedSessions || 0}/${st.totalSessions || 12}</strong>
          </div>
          <div class="att-item">
            <span>Nghỉ không phép</span>
            <strong class="${st.unexcusedAbsences > 0 ? 'text-danger' : ''}">${st.unexcusedAbsences || 0}</strong>
          </div>
          <div class="att-item">
            <span>Còn lại</span>
            <strong>${Math.max(0, (st.totalSessions || 12) - (st.usedSessions || 0))}</strong>
          </div>
        </div>
      </div>
      



      <div class="student-card-footer">
        <button class="btn btn-secondary btn-sm btn-edit-student" data-id="${st.id}">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Sửa
        </button>
        <button class="btn btn-secondary btn-sm btn-add-to-friends" data-id="${st.id}" style="color: var(--accent-secondary); border-color: rgba(0, 240, 255, 0.2);">
          + Bạn bè
        </button>
        <button class="btn btn-danger-outline btn-sm btn-delete-student" data-id="${st.id}">
          Xóa
        </button>
      </div>
    `;

    // Wire button events
    card.querySelector('.btn-edit-student').addEventListener('click', () => openStudentModal(st.id));
    card.querySelector('.btn-add-to-friends').addEventListener('click', () => copyStudentToFriend(st.id));
    card.querySelector('.btn-delete-student').addEventListener('click', () => deleteStudent(st.id));

    studentsGridContainer.appendChild(card);
  });
}

function setupStudentsEvents() {
  btnOpenAddStudentModal.addEventListener('click', () => openStudentModal());
  
  let searchTimeout;
  studentSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      renderStudents();
    }, 150);
  });
}

// Student Modal logic
function setupModals() {
  btnCloseStudentModal.addEventListener('click', closeStudentModal);
  btnCancelStudent.addEventListener('click', closeStudentModal);
  btnSaveStudent.addEventListener('click', saveStudentForm);

  // Apply template event
  btnApplyTaskTemplate.addEventListener('click', () => {
    const templateKey = studentTaskTemplate.value;
    if (!templateKey) {
      showToast("Vui lòng chọn một giáo án mẫu!", "warning");
      return;
    }
    const templateTasks = TASK_TEMPLATES[templateKey];
    if (templateTasks) {
      modalActiveTasks = templateTasks.map(t => ({ text: t, completed: false }));
      renderModalTasksChecklist();
      showToast("Đã áp dụng giáo án mẫu thành công!", "success");
    }
  });

  // Add custom task event
  btnAddModalTask.addEventListener('click', () => {
    const text = newTaskInput.value.trim();
    if (!text) {
      showToast("Vui lòng nhập mục tiêu mới!", "warning");
      return;
    }
    if (modalActiveTasks.some(t => t.text.toLowerCase() === text.toLowerCase())) {
      showToast("Mục tiêu này đã tồn tại!", "warning");
      return;
    }
    modalActiveTasks.push({ text: text, completed: false });
    newTaskInput.value = '';
    renderModalTasksChecklist();
  });

  // Trigger add task on Enter key
  newTaskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      btnAddModalTask.click();
    }
  });
}

function openStudentModal(studentId = null) {
  studentForm.reset();
  modalStudentTasksContainer.innerHTML = '';
  studentTaskTemplate.value = ''; // Reset template selector
  newTaskInput.value = '';

  if (studentId) {
    // Edit Mode
    const st = state.students.find(s => s.id === studentId);
    if (!st) return;

    document.getElementById('student-modal-title').innerText = "Chỉnh sửa học viên: " + st.name;
    document.getElementById('student-id').value = st.id;
    document.getElementById('student-name').value = st.name;
    document.getElementById('student-gender').value = st.gender;
    document.getElementById('student-phone').value = st.phone || '';
    document.getElementById('student-tuition').value = st.tuition || 0;
    document.getElementById('student-paid').value = st.paid || 0;
    document.getElementById('student-status').value = st.status || 'Đã đóng';
    document.getElementById('student-total-sessions').value = st.totalSessions || 12;
    document.getElementById('student-used-sessions').value = st.usedSessions || 0;
    document.getElementById('student-unexcused-absences').value = st.unexcusedAbsences || 0;
    document.getElementById('student-strengths').value = st.strengths || '';
    document.getElementById('student-weaknesses').value = st.weaknesses || '';
    document.getElementById('student-highlights').value = st.highlights || '';

    // Populate Tasks Checklist
    modalActiveTasks = st.tasks && st.tasks.length > 0 ? [...st.tasks] : state.settings.defaultTasks.map(t => ({ text: t, completed: false }));
    renderModalTasksChecklist();
  } else {
    // Create Mode
    document.getElementById('student-modal-title').innerText = "Thêm Học Viên Mới";
    document.getElementById('student-id').value = '';

    // Default values
    document.getElementById('student-total-sessions').value = 12;
    document.getElementById('student-used-sessions').value = 0;
    document.getElementById('student-unexcused-absences').value = 0;

    // Populate default task list
    modalActiveTasks = state.settings.defaultTasks.map(t => ({ text: t, completed: false }));
    renderModalTasksChecklist();
  }

  studentModal.style.display = 'flex';
}

function renderModalTasksChecklist() {
  modalStudentTasksContainer.innerHTML = '';
  modalActiveTasks.forEach((task, idx) => {
    const div = document.createElement('div');
    div.className = 'modal-task-item';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '10px';
    div.style.marginBottom = '6px';

    const id = `modal-task-${idx}`;
    div.innerHTML = `
      <input type="checkbox" id="${id}" ${task.completed ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--accent-primary); cursor:pointer;">
      <label for="${id}" style="font-size:13.5px; color:var(--text-secondary); cursor:pointer; flex: 1; margin:0;">${task.text}</label>
      <button type="button" class="btn-delete-task" style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-size:18px; padding:0 6px; line-height:1; font-weight:bold; transition: color var(--transition-fast);">&times;</button>
    `;

    // Handle checkbox change
    div.querySelector('input').addEventListener('change', (e) => {
      modalActiveTasks[idx].completed = e.target.checked;
    });

    // Handle delete button click
    div.querySelector('.btn-delete-task').addEventListener('click', () => {
      modalActiveTasks.splice(idx, 1);
      renderModalTasksChecklist();
    });

    modalStudentTasksContainer.appendChild(div);
  });

  if (modalActiveTasks.length === 0) {
    modalStudentTasksContainer.innerHTML = '<p class="empty-msg" style="padding: 10px 0;">Chưa có mục tiêu nào được thêm. Hãy chọn mẫu hoặc thêm thủ công.</p>';
  }
}

function closeStudentModal() {
  studentModal.style.display = 'none';
}

async function saveStudentForm() {
  const name = document.getElementById('student-name').value.trim();
  if (!name) {
    showToast("Vui lòng nhập tên học viên!", "warning");
    return;
  }

  const idVal = document.getElementById('student-id').value;
  const gender = document.getElementById('student-gender').value;
  const phone = document.getElementById('student-phone').value.trim();
  const tuition = parseInt(document.getElementById('student-tuition').value) || 0;
  const paid = parseInt(document.getElementById('student-paid').value) || 0;
  const totalSessions = parseInt(document.getElementById('student-total-sessions').value) || 12;
  const usedSessions = parseInt(document.getElementById('student-used-sessions').value) || 0;
  const unexcusedAbsences = parseInt(document.getElementById('student-unexcused-absences').value) || 0;
  const strengths = document.getElementById('student-strengths').value.trim();
  const weaknesses = document.getElementById('student-weaknesses').value.trim();
  const highlights = document.getElementById('student-highlights').value.trim();

  // Calculate default Status if paid equals or exceeds tuition
  let status = document.getElementById('student-status').value;
  if (idVal) {
    // If updating, check status logic
    if (paid >= tuition) status = 'Đã đóng';
    else if (paid > 0 && paid < tuition) status = 'Cọc';
    else status = 'Nợ';
  } else {
    // New student status automatic suggestion
    if (paid >= tuition && tuition > 0) status = 'Đã đóng';
    else if (paid > 0) status = 'Cọc';
    else status = 'Nợ';
  }

  // Get Tasks checklist
  const tasks = [...modalActiveTasks];

  if (idVal) {
    // Edit existing
    const idx = state.students.findIndex(s => s.id === idVal);
    if (idx !== -1) {
      state.students[idx] = {
        ...state.students[idx],
        name, gender, phone, tuition, paid, status,
        totalSessions, usedSessions, unexcusedAbsences,
        strengths, weaknesses, highlights, tasks
      };
    }
    showToast("Đã cập nhật thông tin học viên!", "success");
  } else {
    // Create new
    const newStudent = {
      id: Date.now().toString(),
      name, gender, phone, tuition, paid, status,
      totalSessions, usedSessions, unexcusedAbsences,
      strengths, weaknesses, highlights, tasks,
      availability: {} // Empty schedule availability initially
    };
    state.students.push(newStudent);
    showToast("Thêm thành công học viên mới!", "success");
  }

  await saveData();
  closeStudentModal();
  renderStudents();
}

async function deleteStudent(studentId) {
  if (confirm("Bạn có chắc chắn muốn xóa học viên này? Lịch rảnh và tiến độ tập luyện của học viên cũng sẽ bị xóa.")) {
    state.students = state.students.filter(s => s.id !== studentId);
    await saveData();
    showToast("Đã xóa học viên.", "info");
    renderStudents();
  }
}

// --- SCHEDULES TAB RENDERER ---
function renderSchedulesTab() {
  // Render Target Sidebar list
  scheduleTargetList.innerHTML = '';

  // Coach Item
  const coachBtn = document.createElement('button');
  coachBtn.className = `list-group-item ${currentScheduleTarget === 'coach' ? 'active' : ''}`;
  coachBtn.setAttribute('data-schedule-target', 'coach');
  coachBtn.innerHTML = `<div class="target-title">Lịch rảnh của Coach (Tôi)</div>`;
  coachBtn.addEventListener('click', () => selectScheduleTarget('coach'));
  scheduleTargetList.appendChild(coachBtn);

  // Student Items
  state.students.forEach(st => {
    const btn = document.createElement('button');
    btn.className = `list-group-item ${currentScheduleTarget === st.id ? 'active' : ''}`;
    btn.setAttribute('data-schedule-target', st.id);
    btn.innerHTML = `<div class="target-title">${st.name}</div>`;
    btn.addEventListener('click', () => selectScheduleTarget(st.id));
    scheduleTargetList.appendChild(btn);
  });

  // Render Interactive Calendar Grid
  renderScheduleInteractiveGrid();
}

function selectScheduleTarget(target) {
  currentScheduleTarget = target;

  // Update UI Sidebar selection
  const items = scheduleTargetList.querySelectorAll('.list-group-item');
  items.forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-schedule-target') === target) {
      item.classList.add('active');
    }
  });

  // Update Grid Title
  if (target === 'coach') {
    scheduleGridTitle.innerText = "Thời gian biểu rảnh của Coach";
  } else {
    const st = state.students.find(s => s.id === target);
    scheduleGridTitle.innerText = `Thời gian biểu rảnh của: ${st ? st.name : ''}`;
  }

  // Re-render grid cells values
  updateScheduleGridCellsStatus();
}

function renderScheduleInteractiveGrid() {
  interactiveScheduleGrid.innerHTML = '';

  // 1. Column Headers: Time, Mon, Tue, Wed...
  const firstHeader = document.createElement('div');
  firstHeader.className = 'grid-cell header-cell';
  firstHeader.innerText = 'Giờ';
  interactiveScheduleGrid.appendChild(firstHeader);

  DAYS_OF_WEEK.forEach(day => {
    const h = document.createElement('div');
    h.className = 'grid-cell header-cell';
    h.innerText = day;
    interactiveScheduleGrid.appendChild(h);
  });

  // 2. Rows: 05:00 to 22:00
  for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
    const hourStr = `${hour.toString().padStart(2, '0')}:00`;

    // Time Column
    const timeCell = document.createElement('div');
    timeCell.className = 'grid-cell time-cell';
    timeCell.innerText = hourStr;
    interactiveScheduleGrid.appendChild(timeCell);

    // Days columns
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const dayEng = DAYS_ENG[dayIdx];
      const slotId = `${dayEng}-${hourStr}`;

      const cell = document.createElement('div');
      cell.className = 'grid-cell slot-cell';
      cell.setAttribute('data-slot-id', slotId);

      // Events for dragging selection
      cell.addEventListener('mousedown', (e) => {
        isMouseDown = true;
        const isAvail = cell.classList.contains('available');
        dragAction = !isAvail; // If it is already green, we toggle it to white, and vice versa
        toggleSlotAvailability(cell, slotId, dragAction);
        e.preventDefault();
      });

      cell.addEventListener('mouseenter', () => {
        if (isMouseDown) {
          toggleSlotAvailability(cell, slotId, dragAction);
        }
      });

      interactiveScheduleGrid.appendChild(cell);
    }
  }

  updateScheduleGridCellsStatus();
}

function updateScheduleGridCellsStatus() {
  const cells = interactiveScheduleGrid.querySelectorAll('.slot-cell');
  const targetAvailability = getTargetAvailability(currentScheduleTarget);

  cells.forEach(cell => {
    const slotId = cell.getAttribute('data-slot-id');
    if (targetAvailability[slotId]) {
      cell.classList.add('available');
    } else {
      cell.classList.remove('available');
    }
  });
}

function getTargetAvailability(target) {
  if (target === 'coach') {
    return state.coachAvailability;
  } else {
    const st = state.students.find(s => s.id === target);
    if (st) {
      if (!st.availability) st.availability = {};
      return st.availability;
    }
  }
  return {};
}

function toggleSlotAvailability(cell, slotId, isAvailable) {
  const targetAvailability = getTargetAvailability(currentScheduleTarget);

  if (isAvailable) {
    cell.classList.add('available');
    targetAvailability[slotId] = true;
  } else {
    cell.classList.remove('available');
    delete targetAvailability[slotId];
  }
}

function setupScheduleEvents() {
  // Global mouseup release listener
  window.addEventListener('mouseup', () => {
    if (isMouseDown) {
      isMouseDown = false;
      saveData(); // Save updates to file when user releases click
    }
  });
}

// --- OPTIMIZER TAB ---
let optimizedList = [];

function renderOptimizer() {
  optimizerRankingsList.innerHTML = '';
  optimizerSlotDetails.innerHTML = '<p class="empty-msg">Chọn một khung giờ ở cột bên trái để xem danh sách chi tiết học viên.</p>';

  if (state.students.length === 0) {
    optimizerRankingsList.innerHTML = '<p class="empty-msg">Chưa có đủ dữ liệu học viên để phân tích.</p>';
    return;
  }

  optimizedList = getOptimizedSlots(15);

  if (optimizedList.length === 0) {
    optimizerRankingsList.innerHTML = '<p class="empty-msg">Không tìm thấy khung giờ trùng lịch nào giữa Coach và học viên.</p>';
    return;
  }

  optimizedList.forEach((item, index) => {
    const rankBtn = document.createElement('div');
    rankBtn.className = 'opt-rank-item';
    rankBtn.setAttribute('data-index', index);
    rankBtn.innerHTML = `
      <div class="rank-badge">${index + 1}</div>
      <div class="opt-rank-info">
        <strong>${item.dayName} ${item.hourStr}</strong>
        <span>Có ${item.studentsCount} học viên học được</span>
      </div>
      <span class="student-count-pill">${item.studentsCount} học viên</span>
    `;

    rankBtn.addEventListener('click', () => {
      // Toggle active status
      const items = optimizerRankingsList.querySelectorAll('.opt-rank-item');
      items.forEach(it => it.classList.remove('active'));
      rankBtn.classList.add('active');

      renderOptimizerSlotDetail(index);
    });

    optimizerRankingsList.appendChild(rankBtn);
  });
}

function renderOptimizerSlotDetail(index) {
  const item = optimizedList[index];
  if (!item) return;

  optimizerSlotDetails.innerHTML = `
    <div class="opt-details-header">
      <h4>Chi tiết lớp: ${item.dayName} (${item.hourStr})</h4>
      <p>Tổng số học viên rảnh vào giờ này và trùng lịch rảnh của Coach.</p>
    </div>
    <div class="opt-student-list">
      <!-- Filled in loop -->
    </div>
  `;

  const listContainer = optimizerSlotDetails.querySelector('.opt-student-list');
  item.students.forEach(st => {
    const div = document.createElement('div');
    div.className = 'opt-student-item';
    div.innerHTML = `
      <div class="opt-student-info">
        <h5>${st.name}</h5>
        <p>Giới tính: ${st.gender} | Số điện thoại: ${st.phone || 'Chưa có'}</p>
      </div>
      <div>
        <span class="badge info">${st.status}</span>
      </div>
    `;
    listContainer.appendChild(div);
  });
}

function setupOptimizerEvents() {
  // Triggers during render
}

// --- AI ASSISTANT TAB ---
let currentAiResult = null;
let activeAiHistoryId = null;

function renderAIAssistantTab() {
  // Populate student selector
  aiStudentSelect.innerHTML = '<option value="">-- Chọn học viên --</option>';

  state.students.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.innerText = st.name;
    aiStudentSelect.appendChild(opt);
  });

  aiStudentMiniProfile.style.display = 'none';
  renderAiHistoryList();
  if (!activeAiHistoryId) {
    showAiEmptyState();
  }
}

function showAiEmptyState() {
  aiOutputContainer.innerHTML = `
    <div class="ai-empty-state">
      <div class="ai-empty-icon">
        <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline></svg>
      </div>
      <h3>Sẵn sàng tạo nội dung</h3>
      <p>Chọn học viên và bấm nút "Bắt đầu tạo giáo án AI". Hệ thống sẽ cá nhân hóa bài tập dựa trên điểm mạnh, điểm yếu, giới tính và đặc điểm của học viên đó.</p>
    </div>
  `;
  btnCopyAIOutput.style.display = 'none';
  btnCondenseAiOutput.style.display = 'none';
  btnSaveAiOutput.style.display = 'none';
}

function renderAiHistoryList() {
  aiHistoryContainer.innerHTML = '';
  if (!state.aiLessonHistory || state.aiLessonHistory.length === 0) {
    aiHistoryContainer.innerHTML = '<p class="empty-msg" style="padding: 10px 0; color: var(--text-muted); font-size: 13px; text-align: center;">Chưa có giáo án nào được lưu.</p>';
    return;
  }

  // Sort descending by ID/timestamp
  const sortedHistory = [...state.aiLessonHistory].sort((a, b) => b.id.localeCompare(a.id));

  sortedHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = `ai-history-item ${activeAiHistoryId === item.id ? 'active' : ''}`;
    
    let typeLabel = "Bài tập 90p";
    if (item.aiType === '1month') typeLabel = "Giáo án 1 tháng";
    else if (item.aiType === 'teambuilding') typeLabel = "Teambuilding";

    div.innerHTML = `
      <div class="ai-history-info">
        <strong>${item.studentName} - ${typeLabel}</strong>
        <span>${item.date}</span>
      </div>
      <div class="ai-history-actions">
        <button type="button" class="btn-delete-ai-history" title="Xóa">&times;</button>
      </div>
    `;

    // Click to load
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-ai-history')) return;
      selectAiHistoryItem(item.id);
    });

    // Click to delete
    div.querySelector('.btn-delete-ai-history').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteAiHistoryItem(item.id);
    });

    aiHistoryContainer.appendChild(div);
  });
}

function selectAiHistoryItem(id) {
  activeAiHistoryId = id;
  const item = state.aiLessonHistory.find(p => p.id === id);
  if (!item) return;

  // Refresh list to update active styling
  renderAiHistoryList();

  // Fill inputs
  aiStudentSelect.value = item.studentId;
  
  // Trigger student select change to show mini profile
  const changeEvent = new Event('change');
  aiStudentSelect.dispatchEvent(changeEvent);

  // Set radio option for ai type
  const radio = document.querySelector(`input[name="ai-type"][value="${item.aiType}"]`);
  if (radio) radio.checked = true;

  // Set custom prompt
  aiCustomPrompt.value = item.customRequest || '';

  // Render contents
  aiOutputContainer.innerHTML = parseMarkdownToHTML(item.content);

  // Show actions
  currentAiResult = {
    studentId: item.studentId,
    studentName: item.studentName,
    aiType: item.aiType,
    customRequest: item.customRequest,
    content: item.content
  };

  btnCopyAIOutput.style.display = 'inline-flex';
  btnCondenseAiOutput.style.display = 'inline-flex';
  btnSaveAiOutput.style.display = 'none'; // Already saved

  // Bind copy
  btnCopyAIOutput.onclick = () => {
    navigator.clipboard.writeText(item.content);
    showToast("Đã sao chép nội dung giáo án vào Clipboard!", "success");
  };
}

async function deleteAiHistoryItem(id) {
  if (confirm("Bạn có chắc chắn muốn xóa giáo án lịch sử này?")) {
    state.aiLessonHistory = state.aiLessonHistory.filter(p => p.id !== id);
    if (activeAiHistoryId === id) {
      activeAiHistoryId = null;
      currentAiResult = null;
      showAiEmptyState();
    }
    await saveData();
    showToast("Đã xóa giáo án khỏi lịch sử.", "info");
    renderAiHistoryList();
  }
}

function setupAIEvents() {
  aiStudentSelect.addEventListener('change', () => {
    const studentId = aiStudentSelect.value;
    if (!studentId) {
      aiStudentMiniProfile.style.display = 'none';
      return;
    }

    const st = state.students.find(s => s.id === studentId);
    if (!st) return;

    aiStudentMiniProfile.innerHTML = `
      <h4>Hồ sơ tóm tắt: ${st.name} (${st.gender})</h4>
      <p><strong>Điểm mạnh:</strong> ${st.strengths || 'Chưa cập nhật'}</p>
      <p><strong>Điểm yếu:</strong> ${st.weaknesses || 'Chưa cập nhật'}</p>
      <p><strong>Đặc điểm khác:</strong> ${st.highlights || 'Chưa cập nhật'}</p>
    `;
    aiStudentMiniProfile.style.display = 'block';
  });

  btnSaveAiOutput.addEventListener('click', async () => {
    if (!currentAiResult) return;
    const newLesson = {
      id: Date.now().toString(),
      studentId: currentAiResult.studentId,
      studentName: currentAiResult.studentName,
      aiType: currentAiResult.aiType,
      customRequest: currentAiResult.customRequest,
      content: currentAiResult.content,
      date: new Date().toLocaleString('vi-VN')
    };
    if (!state.aiLessonHistory) state.aiLessonHistory = [];
    state.aiLessonHistory.push(newLesson);
    activeAiHistoryId = newLesson.id;
    await saveData();
    showToast("Đã lưu giáo án vào lịch sử thành công!", "success");
    renderAiHistoryList();
    btnSaveAiOutput.style.display = 'none'; // Saved, hide save button
  });

  btnCondenseAiOutput.addEventListener('click', async () => {
    if (!currentAiResult || !currentAiResult.content) return;

    // Show loading state for condensing
    aiOutputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon">
          <svg class="spinner" viewBox="0 0 24 24" width="48" height="48" stroke="var(--accent-secondary)" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        </div>
        <h3>Đang cô đọng nội dung giáo án...</h3>
        <p>Hệ thống AI đang rút gọn giáo án, chỉ giữ lại tiêu đề và các ý chính. Vui lòng chờ trong giây lát.</p>
      </div>
    `;
    btnCopyAIOutput.style.display = 'none';
    btnSaveAiOutput.style.display = 'none';
    btnCondenseAiOutput.style.display = 'none';

    const summarizePrompt = `
Hãy đóng vai là một Huấn luyện viên/Giáo viên Cầu lông chuyên nghiệp hàng đầu. Hãy cô đọng lại nội dung giáo án/lộ trình/team building dưới đây thành một bản tóm tắt cực kỳ ngắn gọn, súc tích.

**Yêu cầu cô đọng:**
1. Chỉ giữ lại tiêu đề, các giai đoạn/phần chính và các ý chính (bullet points) cực kỳ ngắn gọn.
2. Lược bỏ hoàn toàn các câu giải thích dài dòng, lý thuyết chung chung, hay lời khuyên chi tiết rườm rà.
3. Tập trung làm nổi bật: Tên bài tập/hoạt động, thời gian/khối lượng (set/rep nếu có) và mục tiêu cốt lõi.
4. Giữ nguyên cấu trúc/phân loại của bài gốc (ví dụ: các phần của bài 90 phút, hoặc các tuần của bài 1 tháng, hoặc danh sách 3 trò chơi).

Đầu ra viết bằng tiếng Việt, định dạng Markdown đẹp mắt, rõ ràng và cô đọng nhất có thể.

**Nội dung cần cô đọng:**
${currentAiResult.content}
`;

    try {
      const result = await window.api.callAI({
        provider: state.settings.apiProvider,
        apiKey: state.settings.apiKey,
        model: state.settings.aiModel,
        prompt: summarizePrompt
      });

      if (result.success) {
        // Update content
        aiOutputContainer.innerHTML = parseMarkdownToHTML(result.text);
        
        // Update state
        currentAiResult.content = result.text;
        
        // Show buttons
        btnCopyAIOutput.style.display = 'inline-flex';
        btnSaveAiOutput.style.display = 'inline-flex'; // Show save button so they can save this condensed version
        btnCondenseAiOutput.style.display = 'inline-flex';

        // Re-bind copy with new text
        btnCopyAIOutput.onclick = () => {
          navigator.clipboard.writeText(result.text);
          showToast("Đã sao chép nội dung giáo án cô đọng vào Clipboard!", "success");
        };
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error(err);
      showToast("Lỗi khi cô đọng giáo án: " + err.message, "error");
      
      // Restore previous state
      aiOutputContainer.innerHTML = parseMarkdownToHTML(currentAiResult.content);
      btnCopyAIOutput.style.display = 'inline-flex';
      btnCondenseAiOutput.style.display = 'inline-flex';
      
      const isSaved = state.aiLessonHistory && state.aiLessonHistory.some(item => item.id === activeAiHistoryId);
      btnSaveAiOutput.style.display = isSaved ? 'none' : 'inline-flex';
    }
  });

  btnGenerateAI.addEventListener('click', async () => {
    const studentId = aiStudentSelect.value;
    if (!studentId) {
      showToast("Vui lòng chọn học viên mục tiêu!", "warning");
      return;
    }

    const st = state.students.find(s => s.id === studentId);
    if (!st) return;

    const aiType = document.querySelector('input[name="ai-type"]:checked').value;
    const customRequest = aiCustomPrompt.value.trim();

    let typeName = '';
    let detailedPrompt = '';

    if (aiType === '90min') {
      typeName = "Bài tập cầu lông 90 phút cá nhân hóa";
      detailedPrompt = `
Hãy đóng vai là một Huấn luyện viên/Giáo viên Cầu lông chuyên nghiệp hàng đầu. Hãy tạo một **GIÁO ÁN LUYỆN TẬP CẦU LÔNG 90 PHÚT** chi tiết dành riêng cho học viên sau:

**Thông tin học viên:**
- Tên: ${st.name}
- Giới tính: ${st.gender}
- Điểm mạnh: ${st.strengths || 'Bình thường'}
- Điểm yếu: ${st.weaknesses || 'Không rõ'}
- Đặc điểm nổi bật: ${st.highlights || 'Không rõ'}

**Yêu cầu buổi tập:**
1. Thời gian tổng cộng: Đúng 90 phút.
2. Phân chia rõ ràng các phần (Warm-up khởi động 15 phút, Các bài tập kỹ thuật chính 60 phút, Đánh trận cọ xát/Thả lỏng phục hồi 15 phút).
3. ĐẶC BIỆT chú trọng khắc phục điểm yếu và phát huy thế mạnh của học viên này. Lời khuyên tập luyện phù hợp giới tính ${st.gender}.
4. Nội dung chi tiết, mô tả cách thực hiện động tác và số set/rep hoặc thời gian cho từng bài tập nhỏ.
${customRequest ? `- Yêu cầu bổ sung của huấn luyện viên: ${customRequest}` : ''}

Đầu ra viết bằng tiếng Việt, định dạng Markdown đẹp, chuyên nghiệp, không viết dài dòng lý thuyết chung chung, tập trung vào bài tập thực chiến.
`;
    } else if (aiType === '1month') {
      typeName = "Giáo án cầu lông 1 tháng (4 tuần) định hướng mục tiêu 30 ngày";

      const goalsList = st.tasks ? st.tasks.map(t => `- ${t.text}`).join('\n') : '';

      detailedPrompt = `
Hãy đóng vai là một Huấn luyện viên Cầu lông chuyên nghiệp. Hãy xây dựng một **GIÁO ÁN TẬP LUYỆN CẦU LÔNG 1 THÁNG (4 TUẦN)** cá nhân hóa để học viên đạt được mục tiêu tập luyện 30 ngày.

**Thông tin học viên:**
- Tên: ${st.name}
- Giới tính: ${st.gender}
- Điểm mạnh: ${st.strengths || 'Chưa xác định'}
- Điểm yếu: ${st.weaknesses || 'Chưa xác định'}
- Đặc điểm nổi bật: ${st.highlights || 'Không rõ'}
- Danh sách mục tiêu tập luyện 30 ngày cần hoàn thành:
${goalsList}

**Yêu cầu giáo án:**
1. Chia làm 4 tuần rõ rệt. Mỗi tuần cần có mục tiêu trọng tâm cụ thể.
2. Thiết kế bài tập hàng tuần nhằm giúp học viên học được và tích vào các mục tiêu 30 ngày ở trên, khắc phục các điểm yếu của họ.
3. Điều chỉnh cường độ tập phù hợp với giới tính ${st.gender} và các đặc điểm đặc thù của học viên.
${customRequest ? `- Yêu cầu bổ sung của huấn luyện viên: ${customRequest}` : ''}

Đầu ra viết bằng tiếng Việt, định dạng Markdown rõ ràng, dễ nhìn, chia các mục Tuần 1, 2, 3, 4 chuyên nghiệp.
`;
    } else {
      typeName = "Gợi ý trò chơi Teambuilding hoạt náo lớp học";
      detailedPrompt = `
Hãy đóng vai là một Huấn luyện viên cầu lông năng động và sáng tạo. Hãy thiết kế **3 TRÒ CHƠI HOẠT NÁO / TEAMBUILDING** lồng ghép trên sân cầu lông giúp lớp học trở nên vui nhộn, đỡ nhàm chán và tăng tính gắn kết giữa các thành viên.

**Bối cảnh lớp học:**
- Học viên tiêu biểu: ${st.name} (${st.gender})
- Điểm mạnh học viên: ${st.strengths || 'Năng nổ'}
- Điểm yếu học viên: ${st.weaknesses || 'Không có'}
- Đặc điểm nổi bật học viên: ${st.highlights || 'Vui vẻ'}
${customRequest ? `- Yêu cầu thêm: ${customRequest}` : ''}

**Yêu cầu cho mỗi trò chơi:**
1. Tên trò chơi nghe hấp dẫn, vui nhộn.
2. Dụng cụ cần thiết (vợt, cầu, rổ đựng cầu, hoặc dụng cụ đơn giản trên sân cầu).
3. Cách chơi và luật chơi rõ ràng.
4. Tác dụng bổ trợ kỹ năng cầu lông (ví dụ: bổ trợ bước chân phản xạ nhanh, độ khéo léo cổ tay, sự tập trung...).
5. Cách tính điểm hoặc hình phạt vui cho đội thua cuộc.

Đầu ra viết bằng tiếng Việt, định dạng Markdown đẹp mắt, sinh động.
`;
    }

    // Call AI Backend via Electron IPC
    aiOutputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon">
          <svg class="spinner" viewBox="0 0 24 24" width="48" height="48" stroke="var(--accent-secondary)" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        </div>
        <h3>Đang xử lý dữ liệu với AI...</h3>
        <p>Hệ thống đang gửi yêu cầu và phân tích thông tin học viên. Quá trình này có thể mất từ 5 - 15 giây.</p>
      </div>
    `;
    btnCopyAIOutput.style.display = 'none';
    btnCondenseAiOutput.style.display = 'none';
    btnSaveAiOutput.style.display = 'none';
    activeAiHistoryId = null;
    currentAiResult = null;
    renderAiHistoryList();

    // Add CSS spinner animation dynamically
    if (!document.getElementById('spinner-style')) {
      const style = document.createElement('style');
      style.id = 'spinner-style';
      style.innerText = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    try {
      const result = await window.api.callAI({
        provider: state.settings.apiProvider,
        apiKey: state.settings.apiKey,
        model: state.settings.aiModel,
        prompt: detailedPrompt
      });

      if (result.success) {
        // Render generated text formatted as HTML Markdown
        aiOutputContainer.innerHTML = parseMarkdownToHTML(result.text);
        btnCopyAIOutput.style.display = 'inline-flex';
        btnCondenseAiOutput.style.display = 'inline-flex';
        btnSaveAiOutput.style.display = 'inline-flex';

        currentAiResult = {
          studentId: studentId,
          studentName: st.name,
          aiType: aiType,
          customRequest: customRequest,
          content: result.text
        };

        // Copy event listener configuration
        btnCopyAIOutput.onclick = () => {
          navigator.clipboard.writeText(result.text);
          showToast("Đã sao chép nội dung giáo án vào Clipboard!", "success");
        };
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error(err);
      aiOutputContainer.innerHTML = `
        <div class="ai-empty-state">
          <div class="ai-empty-icon" style="color: var(--accent-red)">
            <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h3>Lỗi kết nối AI</h3>
          <p>${err.message || "Đã xảy ra lỗi không xác định khi kết nối với máy chủ AI. Vui lòng kiểm tra khóa API và kết nối Internet của bạn tại phần Cấu Hình."}</p>
        </div>
      `;
    }
  });
}

// Simple Markdown Parser to avoid using third-party heavy packages
function parseMarkdownToHTML(md) {
  if (!md) return '';

  let html = md;

  // Escape HTML entities to avoid issues but keep markdown intact
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Re-allow blockquotes since they use >
  html = html.replace(/^&gt; (.*?)$/gm, '<blockquote>$1</blockquote>');

  // Headers
  html = html.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*?)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Markdown Links: [Link text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (match, text, url) => {
    const cleanUrl = url.replace(/&amp;/g, '&');
    return `<a href="${cleanUrl}" target="_blank">${text}</a>`;
  });

  // Bullet Lists
  html = html.replace(/^\- (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/^\* (.*?)$/gm, '<li>$1</li>');

  // Wrap li elements in ul
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  // Linebreaks
  html = html.replace(/\n\n/g, '<br>');
  html = html.replace(/\n/g, '<br>');

  return html;
}

// Lesson Prep feature state & logic
let currentPrepResult = null;
let activePrepHistoryId = null;

function renderLessonPrepTab() {
  renderPrepHistoryList();
  if (!activePrepHistoryId) {
    showPrepEmptyState();
  }
}

function showPrepEmptyState() {
  prepOutputContainer.innerHTML = `
    <div class="ai-empty-state">
      <div class="ai-empty-icon">
        <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
      </div>
      <h3>Sẵn sàng chuẩn bị bài học</h3>
      <p>Nhập môn học/chủ đề và yêu cầu chuẩn bị của bạn ở cột trái, sau đó bấm nút "Chuẩn Bị Ngay". Hệ thống sẽ tạo đầy đủ tài liệu, slide dạng chữ, kịch bản thuyết trình, các liên kết tự học và YouTube liên quan.</p>
    </div>
  `;
  prepOutputTitle.innerText = "Tài Liệu Bài Học Chuẩn Bị";
  btnCopyPrepOutput.style.display = 'none';
  btnSavePrepHistory.style.display = 'none';
  btnDownloadPrepOutput.style.display = 'none';
}

function renderPrepHistoryList() {
  prepHistoryContainer.innerHTML = '';
  if (!state.preparedLessons || state.preparedLessons.length === 0) {
    prepHistoryContainer.innerHTML = '<p class="empty-msg" style="padding: 10px 0; color: var(--text-muted); font-size: 13px; text-align: center;">Chưa có bài học nào được chuẩn bị.</p>';
    return;
  }

  state.preparedLessons.forEach(item => {
    const div = document.createElement('div');
    div.className = `prep-history-item ${activePrepHistoryId === item.id ? 'active' : ''}`;
    
    div.innerHTML = `
      <div class="prep-history-info">
        <strong>${item.subject}</strong>
        <span>${item.date}</span>
      </div>
      <div class="prep-history-actions">
        <button type="button" class="btn-delete-prep" title="Xóa">&times;</button>
      </div>
    `;

    // Click to load
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-prep')) return;
      selectPrepHistoryItem(item.id);
    });

    // Click to delete
    div.querySelector('.btn-delete-prep').addEventListener('click', (e) => {
      e.stopPropagation();
      deletePrepHistoryItem(item.id);
    });

    prepHistoryContainer.appendChild(div);
  });
}

function selectPrepHistoryItem(id) {
  activePrepHistoryId = id;
  const item = state.preparedLessons.find(p => p.id === id);
  if (!item) return;

  // Refresh list to update active styling
  renderPrepHistoryList();

  // Fill inputs
  prepSubject.value = item.subject;
  prepCustomPrompt.value = item.query;

  // Render contents
  prepOutputTitle.innerText = `Bài Chuẩn Bị: ${item.subject}`;
  prepOutputContainer.innerHTML = parseMarkdownToHTML(item.content);

  // Show actions
  currentPrepResult = {
    subject: item.subject,
    query: item.query,
    content: item.content
  };

  btnCopyPrepOutput.style.display = 'inline-flex';
  btnSavePrepHistory.style.display = 'none'; // Already saved
  btnDownloadPrepOutput.style.display = 'inline-flex';

  // Bind actions
  btnCopyPrepOutput.onclick = () => {
    navigator.clipboard.writeText(item.content);
    showToast("Đã sao chép nội dung bài chuẩn bị vào Clipboard!", "success");
  };

  btnDownloadPrepOutput.onclick = () => {
    downloadPrepFile(item.subject, item.content);
  };
}

async function deletePrepHistoryItem(id) {
  if (confirm("Bạn có chắc chắn muốn xóa bài chuẩn bị này?")) {
    state.preparedLessons = state.preparedLessons.filter(p => p.id !== id);
    if (activePrepHistoryId === id) {
      activePrepHistoryId = null;
      currentPrepResult = null;
      showPrepEmptyState();
    }
    await saveData();
    showToast("Đã xóa bài chuẩn bị.", "info");
    renderPrepHistoryList();
  }
}

function downloadPrepFile(subject, content) {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeSubject = subject.replace(/[^a-zA-Z0-9 Vietnamese_]/g, "").replace(/\s+/g, "_");
    link.setAttribute("href", url);
    link.setAttribute("download", `Lesson_Prep_${safeSubject}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Tải file Markdown thành công!", "success");
  } catch (e) {
    showToast("Không thể tải file: " + e.message, "error");
  }
}

function setupLessonPrepEvents() {
  // Quick prompt buttons
  const quickButtons = document.querySelectorAll('.prep-quick-btn');
  quickButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      prepCustomPrompt.value = btn.getAttribute('data-query');
    });
  });

  // Generate button
  btnGeneratePrep.addEventListener('click', async () => {
    const subject = prepSubject.value.trim();
    let query = prepCustomPrompt.value.trim();
    
    if (!subject) {
      showToast("Vui lòng nhập môn học hoặc chủ đề!", "warning");
      return;
    }

    if (!query) {
      query = "Ngày mai tôi cần học gì, cần chuẩn bị gì cho bài học này?";
      prepCustomPrompt.value = query;
    }

    // Show loader
    prepOutputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon">
          <svg class="spinner" viewBox="0 0 24 24" width="48" height="48" stroke="var(--accent-secondary)" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
            <circle cx="12" cy="12" r="10"></circle>
          </svg>
        </div>
        <h3>Đang lập đề cương & chuẩn bị bài học...</h3>
        <p>Hệ thống AI đang tổng hợp slide bài giảng, kịch bản thuyết trình, tài liệu tham khảo và tìm kiếm video YouTube hữu ích cho bạn.</p>
      </div>
    `;
    btnCopyPrepOutput.style.display = 'none';
    btnSavePrepHistory.style.display = 'none';
    btnDownloadPrepOutput.style.display = 'none';

    // Build Prompt
    const detailedPrompt = `
Hãy đóng vai là một Trợ lý Giáo vụ/Giảng viên chuyên nghiệp và thông minh. Hãy giúp tôi chuẩn bị bài học đầy đủ và chi tiết cho môn học/chủ đề sau.
Môn học/Chủ đề: ${subject}
Yêu cầu cụ thể: ${query}

Hãy tạo ra một bộ tài liệu chuẩn bị bài học hoàn chỉnh bao gồm các mục sau (sử dụng định dạng Markdown đẹp, rõ ràng):
1. **📘 Tài liệu học tập (Study Documents):** Tóm tắt lý thuyết, nội dung cốt lõi của bài học cần nắm vững, kèm định nghĩa và các tài liệu tham khảo chính.
2. **📊 Slide bài giảng (bằng chữ) (Lecture Slides):** Thiết kế chi tiết từng slide bài giảng (từ 5-8 slide) dưới dạng text, mỗi slide ghi rõ tiêu đề và các ý chính (bullet points) để giảng dạy hoặc thuyết trình.
3. **📜 Kịch bản nói/Giảng dạy (Scripts):** Kịch bản nói chi tiết cho giảng viên hoặc học viên để thuyết trình/trình bày/học tập phần kiến thức này một cách tự nhiên.
4. **🌐 Link học trước (Pre-study links):** Gợi ý các từ khóa chất lượng để tìm kiếm tự học kèm liên kết tìm kiếm trực tiếp trên Google dạng Markdown (ví dụ: [Tìm hiểu trên Google](https://www.google.com/search?q=${encodeURIComponent(subject + ' ' + query)})) để học trước phần kiến thức đó.
5. **🎥 Link video YouTube (Youtube Videos):** Cung cấp từ khóa tìm kiếm YouTube và liên kết tìm kiếm trực tiếp trên YouTube dạng Markdown để xem video bài giảng/thực hành liên quan (ví dụ: [Xem video YouTube](https://www.youtube.com/results?search_query=${encodeURIComponent(subject + ' ' + query)})) để đảm bảo link luôn hoạt động và cập nhật các video chất lượng mới nhất.
6. **ℹ️ Thông tin liên quan bài học (Related Information):** Các lưu ý quan trọng, bài tập tự luyện thêm, hoặc mẹo ghi nhớ nhanh phần kiến thức đó.

Đầu ra viết bằng tiếng Việt, định dạng Markdown chuyên nghiệp, rõ ràng, không viết các câu mở đầu/kết thúc thừa thãi.
`;

    try {
      const result = await window.api.callAI({
        provider: state.settings.apiProvider,
        apiKey: state.settings.apiKey,
        model: state.settings.aiModel,
        prompt: detailedPrompt
      });

      if (result.success) {
        prepOutputTitle.innerText = `Bài Chuẩn Bị: ${subject}`;
        prepOutputContainer.innerHTML = parseMarkdownToHTML(result.text);

        currentPrepResult = {
          subject: subject,
          query: query,
          content: result.text
        };

        // Show action buttons
        btnCopyPrepOutput.style.display = 'inline-flex';
        btnSavePrepHistory.style.display = 'inline-flex';
        btnDownloadPrepOutput.style.display = 'inline-flex';

        // Bind Copy
        btnCopyPrepOutput.onclick = () => {
          navigator.clipboard.writeText(result.text);
          showToast("Đã sao chép nội dung bài chuẩn bị vào Clipboard!", "success");
        };

        // Bind Save
        btnSavePrepHistory.onclick = async () => {
          if (!currentPrepResult) return;
          const newPrep = {
            id: Date.now().toString(),
            subject: currentPrepResult.subject,
            query: currentPrepResult.query,
            content: currentPrepResult.content,
            date: new Date().toLocaleString('vi-VN')
          };
          state.preparedLessons.push(newPrep);
          activePrepHistoryId = newPrep.id;
          await saveData();
          showToast("Đã lưu bài chuẩn bị thành công!", "success");
          renderPrepHistoryList();
          btnSavePrepHistory.style.display = 'none'; // Saved, hide save button
        };

        // Bind Download
        btnDownloadPrepOutput.onclick = () => {
          downloadPrepFile(subject, result.text);
        };

      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      console.error(err);
      prepOutputContainer.innerHTML = `
        <div class="ai-empty-state">
          <div class="ai-empty-icon" style="color: var(--accent-red)">
            <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h3>Lỗi kết nối AI</h3>
          <p>${err.message || "Đã xảy ra lỗi không xác định khi kết nối với máy chủ AI. Vui lòng kiểm tra khóa API và kết nối Internet của bạn tại phần Cấu Hình."}</p>
        </div>
      `;
    }
  });
}

// Render Ghi Nhớ & Link Grid
function renderQuickNotes(searchQuery = '') {
  notesGridContainer.innerHTML = '';
  const query = searchQuery.trim().toLowerCase();
  
  const filteredNotes = state.quickNotes.filter(note => {
    return note.title.toLowerCase().includes(query) || 
           (note.content && note.content.toLowerCase().includes(query)) ||
           (note.url && note.url.toLowerCase().includes(query));
  });

  if (filteredNotes.length === 0) {
    notesGridContainer.innerHTML = `
      <div class="ai-empty-state" style="grid-column: 1 / -1; min-height: 250px; display: flex; flex-direction: column; justify-content: center; align-items: center; border: 1px dashed var(--border-color); border-radius: 12px; padding: 30px; margin-top: 10px;">
        <div class="ai-empty-icon" style="margin-bottom: 15px;">
          <svg viewBox="0 0 24 24" width="50" height="50" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <h3>Không tìm thấy ghi nhớ nào</h3>
        <p style="color: var(--text-muted); font-size: 13px; text-align: center; max-width: 400px; margin-top: 5px;">
          ${searchQuery ? "Thử tìm kiếm với từ khóa khác." : "Hãy bấm nút 'Thêm Ghi Nhớ Mới' để lưu trữ các trang web hoặc hướng dẫn/ghi chú quan trọng bạn hay quên."}
        </p>
      </div>
    `;
    return;
  }

  filteredNotes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.setAttribute('data-id', note.id);

    // Header title and actions
    const header = document.createElement('div');
    header.className = 'note-card-header';
    
    const title = document.createElement('h4');
    title.className = 'note-card-title';
    title.innerText = note.title;
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'note-card-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn-note-action edit';
    editBtn.title = 'Sửa';
    editBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditNoteModal(note);
    });
    actions.appendChild(editBtn);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-note-action delete';
    deleteBtn.title = 'Xóa';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(note.id, note.title);
    });
    actions.appendChild(deleteBtn);

    header.appendChild(actions);
    card.appendChild(header);

    // Body content
    const body = document.createElement('div');
    body.className = 'note-card-body';
    body.innerText = note.content || 'Không có ghi chú chi tiết.';
    card.appendChild(body);

    // Footer with link (if exists)
    if (note.url) {
      const footer = document.createElement('div');
      footer.className = 'note-card-footer';

      const linkBtn = document.createElement('a');
      linkBtn.className = 'btn-note-link';
      linkBtn.href = note.url;
      linkBtn.target = '_blank';
      linkBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        <span>Mở Trang Web</span>
      `;
      footer.appendChild(linkBtn);
      card.appendChild(footer);
    }

    notesGridContainer.appendChild(card);
  });
}

// Open Edit Note Modal
function openEditNoteModal(note) {
  document.getElementById('note-modal-title').innerText = "Sửa Ghi Nhớ";
  noteId.value = note.id;
  noteTitle.value = note.title;
  noteUrl.value = note.url || '';
  noteContent.value = note.content || '';
  noteModal.style.display = 'flex';
}

// Delete Note
async function deleteNote(id, title) {
  if (confirm(`Bạn có chắc chắn muốn xóa ghi nhớ "${title}" không?`)) {
    state.quickNotes = state.quickNotes.filter(n => n.id !== id);
    await saveData();
    showToast("Đã xóa ghi nhớ thành công!", "success");
    renderQuickNotes(notesSearchInput.value);
  }
}

// Setup Event Listeners for Quick Notes
function setupQuickNotesEvents() {
  // Live Search
  let notesSearchTimeout;
  notesSearchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    clearTimeout(notesSearchTimeout);
    notesSearchTimeout = setTimeout(() => {
      renderQuickNotes(val);
    }, 150);
  });

  // Open Add Modal
  btnAddQuickNote.addEventListener('click', () => {
    document.getElementById('note-modal-title').innerText = "Thêm Ghi Nhớ Mới";
    noteForm.reset();
    noteId.value = '';
    noteModal.style.display = 'flex';
  });

  // Close Modal triggers
  const closeModal = () => {
    noteModal.style.display = 'none';
  };
  btnCloseNoteModal.addEventListener('click', closeModal);
  btnCancelNote.addEventListener('click', closeModal);

  // Close modal on background click
  noteModal.addEventListener('click', (e) => {
    if (e.target === noteModal) {
      closeModal();
    }
  });

  // Save Note Form Submission
  btnSaveNote.addEventListener('click', async (e) => {
    e.preventDefault();

    const titleVal = noteTitle.value.trim();
    let urlVal = noteUrl.value.trim();
    const contentVal = noteContent.value.trim();

    if (!titleVal) {
      showToast("Vui lòng điền tiêu đề ghi nhớ!", "error");
      noteTitle.focus();
      return;
    }

    // Format URL prefix if missing
    if (urlVal && !urlVal.startsWith('http://') && !urlVal.startsWith('https://')) {
      urlVal = 'https://' + urlVal;
    }

    const idVal = noteId.value;

    if (idVal) {
      // Editing existing note
      const index = state.quickNotes.findIndex(n => n.id === idVal);
      if (index !== -1) {
        state.quickNotes[index] = {
          ...state.quickNotes[index],
          title: titleVal,
          url: urlVal,
          content: contentVal
        };
      }
    } else {
      // Adding new note
      const newNote = {
        id: Date.now().toString(),
        title: titleVal,
        url: urlVal,
        content: contentVal,
        date: new Date().toLocaleString('vi-VN')
      };
      state.quickNotes.push(newNote);
    }

    await saveData();
    showToast("Đã lưu ghi nhớ thành công!", "success");
    closeModal();
    renderQuickNotes(notesSearchInput.value);
  });
}

// ==========================================================================
// TIMETABLE & PLAN MANAGEMENT TAB LOGIC
// ==========================================================================
let isTimetableEventsBound = false;

function renderTimetableTab() {
  if (!calendarSelectedDate) {
    calendarSelectedDate = new Date();
  }
  
  renderCalendar();
  selectDate(calendarSelectedDate);
  
  // Render active sub-tab
  const activeSubBtn = document.querySelector('.sub-nav-btn.active');
  if (activeSubBtn) {
    renderActiveSubTab(activeSubBtn.getAttribute('data-subtab'));
  } else {
    renderActiveSubTab('goals');
  }
  
  if (!isTimetableEventsBound) {
    setupTimetableEvents();
    isTimetableEventsBound = true;
  }
}

function renderCalendar() {
  const year = calendarCurrentDate.getFullYear();
  const month = calendarCurrentDate.getMonth();
  
  const monthYearLabel = document.getElementById('calendar-current-month-year');
  monthYearLabel.innerText = `Tháng ${(month + 1).toString().padStart(2, '0')} / ${year}`;
  
  const daysGrid = document.getElementById('calendar-days-grid');
  daysGrid.innerHTML = '';
  
  // First day of current month
  const firstDayIndex = new Date(year, month, 1).getDay(); // Sun=0, Mon=1...
  // Convert Sun=0 to Sun=6, Mon=1 to Mon=0 for standard Vietnamese calendar (T2-CN)
  let firstDayOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;
  
  // Total days in current month
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Total days in previous month
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  
  // Fill previous month days
  for (let i = firstDayOffset - 1; i >= 0; i--) {
    const prevDay = prevMonthTotalDays - i;
    const prevMonthDate = new Date(year, month - 1, prevDay);
    createDayCell(prevMonthDate, true);
  }
  
  // Fill current month days
  for (let i = 1; i <= totalDays; i++) {
    const currDate = new Date(year, month, i);
    createDayCell(currDate, false);
  }
  
  // Fill next month days to complete a grid of 42 cells (6 rows)
  const cellsRendered = firstDayOffset + totalDays;
  const cellsRemaining = 42 - cellsRendered;
  for (let i = 1; i <= cellsRemaining; i++) {
    const nextMonthDate = new Date(year, month + 1, i);
    createDayCell(nextMonthDate, true);
  }
}

function createDayCell(date, isOtherMonth) {
  const daysGrid = document.getElementById('calendar-days-grid');
  const cell = document.createElement('div');
  cell.className = 'calendar-day';
  if (isOtherMonth) {
    cell.classList.add('other-month');
  }
  
  const dateStr = formatDateISO(date);
  
  // Check if active (selected)
  if (dateStr === formatDateISO(calendarSelectedDate)) {
    cell.classList.add('active');
  }
  
  // Check if today
  const todayStr = formatDateISO(new Date());
  if (dateStr === todayStr) {
    cell.classList.add('today');
  }
  
  // Number label
  const numDiv = document.createElement('div');
  numDiv.className = 'day-num';
  numDiv.innerText = date.getDate();
  cell.appendChild(numDiv);
  
  // Dots container
  const dotsDiv = document.createElement('div');
  dotsDiv.className = 'day-dots';
  
  // Check for events
  const hasEvents = state.timetableEvents.some(e => e.date === dateStr);
  if (hasEvents) {
    const dot = document.createElement('span');
    dot.className = 'dot-event';
    dotsDiv.appendChild(dot);
  }
  
  // Check for transactions
  const dayTransactions = state.timetableTransactions.filter(t => t.date === dateStr);
  if (dayTransactions.length > 0) {
    const hasIncome = dayTransactions.some(t => t.type === 'income');
    const hasExpense = dayTransactions.some(t => t.type === 'expense');
    
    if (hasIncome) {
      const dotIn = document.createElement('span');
      dotIn.className = 'dot-finance-in';
      dotsDiv.appendChild(dotIn);
    }
    if (hasExpense) {
      const dotOut = document.createElement('span');
      dotOut.className = 'dot-finance-out';
      dotsDiv.appendChild(dotOut);
    }
  }
  
  cell.appendChild(dotsDiv);
  
  cell.addEventListener('click', () => {
    selectDate(date);
  });
  
  daysGrid.appendChild(cell);
}

function selectDate(date) {
  calendarSelectedDate = date;
  
  renderCalendar();
  
  const weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayLabel = document.getElementById('timetable-selected-day-label');
  const dayWeekday = document.getElementById('timetable-selected-day-weekday');
  
  dayLabel.innerText = `Ngày ${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
  dayWeekday.innerText = weekdayNames[date.getDay()];
  
  renderDayDetails();
}

function formatDateISO(date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderDayDetails() {
  const dateStr = formatDateISO(calendarSelectedDate);
  
  // 1. Events list
  const eventsList = document.getElementById('timetable-day-events-list');
  eventsList.innerHTML = '';
  
  const dayEvents = state.timetableEvents.filter(e => e.date === dateStr);
  
  if (dayEvents.length === 0) {
    eventsList.innerHTML = '<p class="empty-msg" style="padding:10px 0;">Không có lịch biểu cho ngày này.</p>';
  } else {
    dayEvents.forEach(event => {
      const div = document.createElement('div');
      div.className = `day-event-item ${event.completed ? 'completed' : ''}`;
      
      let goalTag = '';
      if (event.goalId) {
        const goal = state.timetableGoals.find(g => g.id === event.goalId);
        if (goal) {
          goalTag = `<span class="goal-tag">${goal.title}</span>`;
        }
      }
      
      div.innerHTML = `
        <input type="checkbox" ${event.completed ? 'checked' : ''}>
        <div class="event-details">
          <span class="event-title">${event.title}</span>
          ${event.time ? `<span class="time-badge">${event.time}</span>` : ''}
          ${goalTag}
        </div>
        <div class="day-event-actions">
          <button type="button" class="btn-icon-only edit-btn" title="Sửa">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="btn-icon-only delete delete-btn" title="Xóa">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
      
      div.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
        event.completed = e.target.checked;
        if (event.completed) {
          div.classList.add('completed');
        } else {
          div.classList.remove('completed');
        }
        await saveData();
        if (event.goalId) {
          renderTimetableGoals();
        }
        const activeSubBtn = document.querySelector('.sub-nav-btn.active');
        if (activeSubBtn && activeSubBtn.getAttribute('data-subtab') === 'incomplete') {
          renderIncompleteTasks();
        }
      });
      
      div.querySelector('.edit-btn').addEventListener('click', () => {
        openEditEventModal(event);
      });
      
      div.querySelector('.delete-btn').addEventListener('click', async () => {
        if (confirm(`Bạn có chắc chắn muốn xóa lịch biểu "${event.title}"?`)) {
          state.timetableEvents = state.timetableEvents.filter(e => e.id !== event.id);
          await saveData();
          renderCalendar();
          renderDayDetails();
          const activeSubBtn = document.querySelector('.sub-nav-btn.active');
          if (activeSubBtn) {
            renderActiveSubTab(activeSubBtn.getAttribute('data-subtab'));
          }
        }
      });
      
      eventsList.appendChild(div);
    });
  }
  
  // 2. Finance list
  const financeList = document.getElementById('timetable-day-finance-list');
  financeList.innerHTML = '';
  
  const dayFinance = state.timetableTransactions.filter(t => t.date === dateStr);
  
  if (dayFinance.length === 0) {
    financeList.innerHTML = '<p class="empty-msg" style="padding:10px 0;">Không có thu chi nào cho ngày này.</p>';
  } else {
    dayFinance.forEach(trans => {
      const div = document.createElement('div');
      div.className = 'day-finance-item';
      
      const typeLabel = trans.type === 'income' ? 'Thu' : 'Chi';
      const amountPrefix = trans.type === 'income' ? '+' : '-';
      
      div.innerHTML = `
        <div class="finance-info">
          <span class="finance-title">${trans.title}</span>
          <span class="finance-type-badge ${trans.type}">${typeLabel}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="finance-amount ${trans.type}">${amountPrefix}${formatMoney(trans.amount)}</span>
          <button type="button" class="btn-icon-only delete delete-btn" title="Xóa">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
      
      div.querySelector('.delete-btn').addEventListener('click', async () => {
        if (confirm(`Bạn có chắc chắn muốn xóa thu chi "${trans.title}"?`)) {
          state.timetableTransactions = state.timetableTransactions.filter(t => t.id !== trans.id);
          await saveData();
          renderCalendar();
          renderDayDetails();
          const activeSubBtn = document.querySelector('.sub-nav-btn.active');
          if (activeSubBtn) {
            renderActiveSubTab(activeSubBtn.getAttribute('data-subtab'));
          }
        }
      });
      
      financeList.appendChild(div);
    });
  }
}

function renderTimetableGoals() {
  const container = document.getElementById('timetable-goals-list');
  container.innerHTML = '';
  
  if (state.timetableGoals.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="grid-column: 1 / -1; padding: 20px 0;">Chưa có mục tiêu nào. Hãy thêm mục tiêu mới!</p>';
    return;
  }
  
  state.timetableGoals.forEach(goal => {
    const card = document.createElement('div');
    card.className = 'goal-item-card';
    
    const totalLinkedCompleted = state.timetableEvents.filter(e => e.goalId === goal.id && e.completed).length;
    const manualProgress = goal.manualProgress || 0;
    const totalProgress = totalLinkedCompleted + manualProgress;
    const target = goal.targetCount || 10;
    const progressPercent = Math.min(100, Math.round((totalProgress / target) * 100));
    
    card.innerHTML = `
      <div class="goal-item-header">
        <h5>${goal.title}</h5>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="btn-icon-only edit-btn" title="Sửa" style="color: var(--text-secondary); cursor: pointer; background: none; border: none;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="btn-icon-only delete delete-btn" title="Xóa">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
      <div class="goal-item-progress-row" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
        <span style="display: inline-flex; align-items: center; gap: 6px;">
          Tiến độ: ${totalProgress} / ${target}
          ${manualProgress > 0 ? `<small style="opacity: 0.6; font-size: 10px;">(Thủ công +${manualProgress})</small>` : ''}
        </span>
        <div style="display: inline-flex; align-items: center; gap: 4px; margin-left: auto;">
          <button type="button" class="btn-manual-dec" title="Giảm tiến độ" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-secondary); width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold; font-size: 12px; transition: all 0.15s;">-</button>
          <button type="button" class="btn-manual-inc" title="Tăng tiến độ" style="background: rgba(255,255,255,0.06); border: 1px solid var(--border-color); border-radius: 4px; color: var(--accent-primary); width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-weight: bold; font-size: 12px; transition: all 0.15s;">+</button>
        </div>
        <strong>${progressPercent}%</strong>
      </div>
      <div class="progress-track" style="width: 100%; height: 8px; margin-top: 8px;">
        <div class="progress-fill" style="width: ${progressPercent}%"></div>
      </div>
    `;
    
    card.querySelector('.btn-manual-inc').addEventListener('click', async (e) => {
      e.stopPropagation();
      goal.manualProgress = (goal.manualProgress || 0) + 1;
      await saveData();
      renderTimetableGoals();
    });
    
    card.querySelector('.btn-manual-dec').addEventListener('click', async (e) => {
      e.stopPropagation();
      if ((goal.manualProgress || 0) > 0) {
        goal.manualProgress = (goal.manualProgress || 0) - 1;
        await saveData();
        renderTimetableGoals();
      }
    });
    
    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditGoalModal(goal);
    });
    
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Bạn có chắc chắn muốn xóa mục tiêu "${goal.title}"? Các lịch dạy liên kết sẽ không còn thuộc mục tiêu này nữa.`)) {
        state.timetableEvents.forEach(e => {
          if (e.goalId === goal.id) {
            e.goalId = '';
          }
        });
        state.defaultScheduleEvents.forEach(e => {
          if (e.goalId === goal.id) {
            e.goalId = '';
          }
        });
        
        state.timetableGoals = state.timetableGoals.filter(g => g.id !== goal.id);
        await saveData();
        renderTimetableGoals();
        renderDayDetails();
      }
    });
    
    container.appendChild(card);
  });
}

function renderFuturePlans() {
  renderPlanColumn('10days');
  renderPlanColumn('1year');
  renderPlanColumn('10years');
}

function renderPlanColumn(type) {
  const listId = `list-plan-${type}`;
  const listContainer = document.getElementById(listId);
  listContainer.innerHTML = '';
  
  let items = [];
  if (type === '10days') items = state.futurePlans.days10;
  else if (type === '1year') items = state.futurePlans.year1;
  else if (type === '10years') items = state.futurePlans.years10;
  
  if (!items || items.length === 0) {
    listContainer.innerHTML = '<p class="empty-msg" style="padding:10px 0; font-size:12px;">Chưa có kế hoạch nào.</p>';
    return;
  }
  
  items.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = `plan-item ${item.completed ? 'completed' : ''}`;
    
    div.innerHTML = `
      <input type="checkbox" ${item.completed ? 'checked' : ''}>
      <span>${item.text}</span>
      <button class="plan-item-delete">&times;</button>
    `;
    
    div.querySelector('input').addEventListener('change', async (e) => {
      item.completed = e.target.checked;
      if (item.completed) {
        div.classList.add('completed');
      } else {
        div.classList.remove('completed');
      }
      await saveData();
    });
    
    div.querySelector('.plan-item-delete').addEventListener('click', async () => {
      if (type === '10days') state.futurePlans.days10.splice(idx, 1);
      else if (type === '1year') state.futurePlans.year1.splice(idx, 1);
      else if (type === '10years') state.futurePlans.years10.splice(idx, 1);
      await saveData();
      renderPlanColumn(type);
    });
    
    listContainer.appendChild(div);
  });
}

function setupFuturePlansEvents() {
  const addPlan = async (type) => {
    const input = document.getElementById(`input-plan-${type}`);
    const text = input.value.trim();
    if (!text) return;
    
    const newItem = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: text,
      completed: false
    };
    
    if (type === '10days') state.futurePlans.days10.push(newItem);
    else if (type === '1year') state.futurePlans.year1.push(newItem);
    else if (type === '10years') state.futurePlans.years10.push(newItem);
    
    input.value = '';
    await saveData();
    renderPlanColumn(type);
  };
  
  document.getElementById('btn-add-plan-10days').addEventListener('click', () => addPlan('10days'));
  document.getElementById('input-plan-10days').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlan('10days');
  });
  
  document.getElementById('btn-add-plan-1year').addEventListener('click', () => addPlan('1year'));
  document.getElementById('input-plan-1year').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlan('1year');
  });
  
  document.getElementById('btn-add-plan-10years').addEventListener('click', () => addPlan('10years'));
  document.getElementById('input-plan-10years').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addPlan('10years');
  });
}

function renderFinanceSubPane() {
  const year = calendarSelectedDate.getFullYear();
  const month = calendarSelectedDate.getMonth();
  
  const monthTransactions = state.timetableTransactions.filter(t => {
    const tDate = new Date(t.date);
    return tDate.getFullYear() === year && tDate.getMonth() === month;
  });
  
  monthTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  
  let totalIncome = 0;
  let totalExpense = 0;
  
  monthTransactions.forEach(t => {
    if (t.type === 'income') totalIncome += t.amount;
    else totalExpense += t.amount;
  });
  
  const netBalance = totalIncome - totalExpense;
  
  document.getElementById('finance-month-income-total').innerText = formatMoney(totalIncome);
  document.getElementById('finance-month-expense-total').innerText = formatMoney(totalExpense);
  document.getElementById('finance-month-net-total').innerText = (netBalance >= 0 ? '+' : '') + formatMoney(netBalance);
  
  const tbody = document.querySelector('#finance-transactions-table tbody');
  tbody.innerHTML = '';
  
  if (monthTransactions.length === 0) {
    const row = tbody.insertRow();
    const cell = row.insertCell(0);
    cell.colSpan = 5;
    cell.className = 'empty-msg';
    cell.innerText = 'Không có giao dịch nào trong tháng này.';
    return;
  }
  
  monthTransactions.forEach(t => {
    const row = tbody.insertRow();
    
    const d = new Date(t.date);
    const dateFormatted = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    row.insertCell(0).innerText = dateFormatted;
    row.insertCell(1).innerText = t.title;
    
    const typeLabel = t.type === 'income' ? 'Thu' : 'Chi';
    const typeBadgeClass = t.type === 'income' ? 'badge success' : 'badge danger';
    row.insertCell(2).innerHTML = `<span class="${typeBadgeClass}">${typeLabel}</span>`;
    
    const amountVal = (t.type === 'income' ? '+' : '-') + formatMoney(t.amount);
    const amountCell = row.insertCell(3);
    amountCell.innerText = amountVal;
    amountCell.style.fontWeight = '600';
    if (t.type === 'income') amountCell.style.color = 'var(--accent-primary)';
    else amountCell.style.color = 'var(--accent-red)';
    
    const actionsCell = row.insertCell(4);
    actionsCell.style.textAlign = 'center';
    actionsCell.innerHTML = `
      <button type="button" class="btn-icon-only delete delete-btn" title="Xóa" style="padding: 2px;">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;
    
    actionsCell.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Bạn có chắc chắn muốn xóa giao dịch "${t.title}"?`)) {
        state.timetableTransactions = state.timetableTransactions.filter(item => item.id !== t.id);
        await saveData();
        renderCalendar();
        renderDayDetails();
        renderFinanceSubPane();
      }
    });
  });
}

function renderIncompleteTasks() {
  const container = document.getElementById('timetable-incomplete-list');
  container.innerHTML = '';
  
  const incompleteEvents = state.timetableEvents.filter(e => !e.completed);
  incompleteEvents.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (incompleteEvents.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="padding: 20px 0;">Chúc mừng! Bạn không có đầu việc nào chưa hoàn thành.</p>';
    return;
  }
  
  incompleteEvents.forEach(event => {
    const card = document.createElement('div');
    card.className = 'incomplete-item-card';
    
    const d = new Date(event.date);
    const dateFormatted = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth()+1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    
    let goalTag = '';
    if (event.goalId) {
      const goal = state.timetableGoals.find(g => g.id === event.goalId);
      if (goal) {
        goalTag = `<span class="goal-tag">${goal.title}</span>`;
      }
    }
    
    card.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
        <input type="checkbox" style="width: 16px; height: 16px; accent-color: var(--accent-primary); cursor: pointer;">
        <div class="incomplete-item-info">
          <strong>${event.title}</strong>
          <span style="font-size:12px; color:var(--text-muted);">${dateFormatted} ${event.time ? `&bull; ${event.time}` : ''}</span>
          ${goalTag}
        </div>
      </div>
      <button type="button" class="btn-icon-only delete delete-btn" title="Xóa">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;
    
    card.querySelector('input').addEventListener('change', async (e) => {
      event.completed = e.target.checked;
      await saveData();
      showToast("Đã hoàn thành công việc!", "success");
      
      setTimeout(() => {
        renderIncompleteTasks();
        renderCalendar();
        renderDayDetails();
        renderTimetableGoals();
      }, 300);
    });
    
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Bạn có chắc chắn muốn xóa công việc "${event.title}"?`)) {
        state.timetableEvents = state.timetableEvents.filter(e => e.id !== event.id);
        await saveData();
        renderIncompleteTasks();
        renderCalendar();
        renderDayDetails();
      }
    });
    
    container.appendChild(card);
  });
}

function renderDefaultSlots() {
  const container = document.getElementById('timetable-default-slots-list');
  container.innerHTML = '';
  
  if (state.defaultScheduleEvents.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="grid-column: 1 / -1; padding: 20px 0;">Chưa cài đặt thời khóa biểu mặc định. Hãy bấm "Thêm lịch mặc định"!</p>';
    return;
  }
  
  const daysLabel = {
    '1': 'Thứ 2',
    '2': 'Thứ 3',
    '3': 'Thứ 4',
    '4': 'Thứ 5',
    '5': 'Thứ 6',
    '6': 'Thứ 7',
    '0': 'Chủ Nhật',
    'all': 'Tất cả các ngày'
  };
  
  const sortedSlots = [...state.defaultScheduleEvents].sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) {
      const getDayVal = (day) => {
        if (day === 'all') return 8;
        if (day === '0') return 7;
        return parseInt(day);
      };
      return getDayVal(a.dayOfWeek) - getDayVal(b.dayOfWeek);
    }
    return a.time.localeCompare(b.time);
  });
  
  sortedSlots.forEach(slot => {
    const card = document.createElement('div');
    card.className = 'default-slot-card';
    
    let goalTag = '';
    if (slot.goalId) {
      const goal = state.timetableGoals.find(g => g.id === slot.goalId);
      if (goal) {
        goalTag = `<span class="goal-tag" style="margin-top:0;">${goal.title}</span>`;
      }
    }
    
    card.innerHTML = `
      <div class="default-slot-info">
        <strong>${slot.title}</strong>
        <span class="day-time">${daysLabel[slot.dayOfWeek]} &bull; ${slot.time}</span>
        ${goalTag}
      </div>
      <button type="button" class="btn-icon-only delete delete-btn" title="Xóa">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;
    
    card.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Bạn có chắc chắn muốn xóa lịch mặc định "${slot.title}"?`)) {
        state.defaultScheduleEvents = state.defaultScheduleEvents.filter(item => item.id !== slot.id);
        await saveData();
        renderDefaultSlots();
      }
    });
    
    container.appendChild(card);
  });
}

async function applyDefaultScheduleToWeek() {
  if (state.defaultScheduleEvents.length === 0) {
    showToast("Bạn chưa cấu hình thời khóa biểu mặc định hàng tuần. Hãy cài đặt trong tab 'Lịch biểu mặc định'!", "warning");
    return;
  }
  
  const date = new Date(calendarSelectedDate);
  const dayIndex = date.getDay();
  const distanceToMon = dayIndex === 0 ? -6 : 1 - dayIndex;
  
  const monday = new Date(date);
  monday.setDate(date.getDate() + distanceToMon);
  
  let insertedCount = 0;
  
  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(monday);
    currentDay.setDate(monday.getDate() + i);
    const dateStr = formatDateISO(currentDay);
    
    const currentDayOfWeekVal = i === 6 ? '0' : (i + 1).toString();
    const daySlots = state.defaultScheduleEvents.filter(s => s.dayOfWeek === currentDayOfWeekVal || s.dayOfWeek === 'all');
    
    daySlots.forEach(slot => {
      const exists = state.timetableEvents.some(e => e.date === dateStr && e.title === slot.title && e.time === slot.time);
      
      if (!exists) {
        state.timetableEvents.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          title: slot.title,
          date: dateStr,
          time: slot.time,
          completed: false,
          goalId: slot.goalId || ''
        });
        insertedCount++;
      }
    });
  }
  
  if (insertedCount > 0) {
    await saveData();
    renderCalendar();
    renderDayDetails();
    const activeSubBtn = document.querySelector('.sub-nav-btn.active');
    if (activeSubBtn && activeSubBtn.getAttribute('data-subtab') === 'incomplete') {
      renderIncompleteTasks();
    }
    showToast(`Đã tự động chèn thành công ${insertedCount} lịch dạy mặc định vào tuần này!`, "success");
  } else {
    showToast("Các lịch dạy mặc định cho tuần này đã có sẵn trên lịch của bạn.", "info");
  }
}

async function applyDefaultScheduleToDay() {
  if (state.defaultScheduleEvents.length === 0) {
    showToast("Bạn chưa cấu hình thời khóa biểu mặc định hàng tuần. Hãy cài đặt trong tab 'Lịch biểu mặc định'!", "warning");
    return;
  }
  
  const dateStr = formatDateISO(calendarSelectedDate);
  const currentDayOfWeekVal = calendarSelectedDate.getDay().toString();
  
  const daySlots = state.defaultScheduleEvents.filter(s => s.dayOfWeek === currentDayOfWeekVal || s.dayOfWeek === 'all');
  
  if (daySlots.length === 0) {
    showToast("Không có lịch dạy mặc định nào cho ngày này.", "info");
    return;
  }
  
  let insertedCount = 0;
  daySlots.forEach(slot => {
    const exists = state.timetableEvents.some(e => e.date === dateStr && e.title === slot.title && e.time === slot.time);
    
    if (!exists) {
      state.timetableEvents.push({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        title: slot.title,
        date: dateStr,
        time: slot.time,
        completed: false,
        goalId: slot.goalId || ''
      });
      insertedCount++;
    }
  });
  
  if (insertedCount > 0) {
    await saveData();
    renderCalendar();
    renderDayDetails();
    const activeSubBtn = document.querySelector('.sub-nav-btn.active');
    if (activeSubBtn && activeSubBtn.getAttribute('data-subtab') === 'incomplete') {
      renderIncompleteTasks();
    }
    const dStr = `${calendarSelectedDate.getDate().toString().padStart(2, '0')}/${(calendarSelectedDate.getMonth()+1).toString().padStart(2, '0')}/${calendarSelectedDate.getFullYear()}`;
    showToast(`Đã tự động chèn thành công ${insertedCount} lịch dạy mặc định vào ngày ${dStr}!`, "success");
  } else {
    showToast("Các lịch dạy mặc định cho ngày này đã có sẵn trên lịch của bạn.", "info");
  }
}

function openApplyDefaultScheduleModal() {
  if (state.defaultScheduleEvents.length === 0) {
    showToast("Bạn chưa cấu hình thời khóa biểu mặc định hàng tuần. Hãy cài đặt trong tab 'Lịch biểu mặc định'!", "warning");
    return;
  }
  
  const weekdayNames = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = weekdayNames[calendarSelectedDate.getDay()];
  const dateFormatted = `${calendarSelectedDate.getDate().toString().padStart(2, '0')}/${(calendarSelectedDate.getMonth() + 1).toString().padStart(2, '0')}/${calendarSelectedDate.getFullYear()}`;
  
  document.getElementById('apply-default-day-name').innerText = `${dayName}, ngày ${dateFormatted}`;
  document.getElementById('apply-default-schedule-modal').style.display = 'flex';
}

function closeApplyDefaultScheduleModal() {
  document.getElementById('apply-default-schedule-modal').style.display = 'none';
}

async function applyDefaultScheduleToMonth() {
  if (state.defaultScheduleEvents.length === 0) {
    showToast("Bạn chưa cấu hình thời khóa biểu mặc định hàng tuần. Hãy cài đặt trong tab 'Lịch biểu mặc định'!", "warning");
    return;
  }
  
  const year = calendarSelectedDate.getFullYear();
  const month = calendarSelectedDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  
  let insertedCount = 0;
  
  for (let d = 1; d <= lastDay; d++) {
    const currentDay = new Date(year, month, d);
    const dateStr = formatDateISO(currentDay);
    const currentDayOfWeekVal = currentDay.getDay().toString();
    
    const daySlots = state.defaultScheduleEvents.filter(s => s.dayOfWeek === currentDayOfWeekVal || s.dayOfWeek === 'all');
    
    daySlots.forEach(slot => {
      const exists = state.timetableEvents.some(e => e.date === dateStr && e.title === slot.title && e.time === slot.time);
      
      if (!exists) {
        state.timetableEvents.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          title: slot.title,
          date: dateStr,
          time: slot.time,
          completed: false,
          goalId: slot.goalId || ''
        });
        insertedCount++;
      }
    });
  }
  
  if (insertedCount > 0) {
    await saveData();
    renderCalendar();
    renderDayDetails();
    const activeSubBtn = document.querySelector('.sub-nav-btn.active');
    if (activeSubBtn && activeSubBtn.getAttribute('data-subtab') === 'incomplete') {
      renderIncompleteTasks();
    }
    showToast(`Đã tự động chèn thành công ${insertedCount} lịch dạy mặc định vào cả tháng ${month + 1}/${year}!`, "success");
  } else {
    showToast("Các lịch dạy mặc định cho tháng này đã có sẵn trên lịch của bạn.", "info");
  }
}

function openAddGoalModal() {
  document.getElementById('timetable-goal-modal-title').innerText = "Thêm mục tiêu mới";
  document.getElementById('timetable-goal-id').value = '';
  document.getElementById('timetable-goal-title').value = '';
  document.getElementById('timetable-goal-target').value = '10';
  document.getElementById('timetable-goal-modal').style.display = 'flex';
}

function openEditGoalModal(goal) {
  document.getElementById('timetable-goal-modal-title').innerText = "Sửa mục tiêu";
  document.getElementById('timetable-goal-id').value = goal.id;
  document.getElementById('timetable-goal-title').value = goal.title;
  document.getElementById('timetable-goal-target').value = goal.targetCount || 10;
  document.getElementById('timetable-goal-modal').style.display = 'flex';
}

function closeGoalModal() {
  document.getElementById('timetable-goal-modal').style.display = 'none';
}

async function saveGoalForm(e) {
  e.preventDefault();
  const id = document.getElementById('timetable-goal-id').value;
  const title = document.getElementById('timetable-goal-title').value.trim();
  const targetCount = parseInt(document.getElementById('timetable-goal-target').value) || 10;
  
  if (!title) {
    showToast("Vui lòng nhập tiêu đề mục tiêu!", "warning");
    return;
  }
  
  if (id) {
    const idx = state.timetableGoals.findIndex(g => g.id === id);
    if (idx !== -1) {
      state.timetableGoals[idx].title = title;
      state.timetableGoals[idx].targetCount = targetCount;
    }
  } else {
    state.timetableGoals.push({
      id: Date.now().toString(),
      title,
      targetCount
    });
  }
  
  await saveData();
  closeGoalModal();
  renderTimetableGoals();
  renderDayDetails();
  renderCalendar();
  showToast("Đã lưu mục tiêu thành công!", "success");
}

function openAddTransactionModal() {
  document.getElementById('timetable-transaction-modal-title').innerText = "Thêm giao dịch thu chi";
  document.getElementById('timetable-transaction-id').value = '';
  document.getElementById('timetable-transaction-title').value = '';
  document.getElementById('timetable-transaction-date').value = formatDateISO(calendarSelectedDate);
  document.getElementById('timetable-transaction-type').value = 'income';
  document.getElementById('timetable-transaction-amount').value = '';
  document.getElementById('timetable-transaction-modal').style.display = 'flex';
}

function closeTransactionModal() {
  document.getElementById('timetable-transaction-modal').style.display = 'none';
}

async function saveTransactionForm(e) {
  e.preventDefault();
  const id = document.getElementById('timetable-transaction-id').value;
  const title = document.getElementById('timetable-transaction-title').value.trim();
  const date = document.getElementById('timetable-transaction-date').value;
  const type = document.getElementById('timetable-transaction-type').value;
  const amount = parseInt(document.getElementById('timetable-transaction-amount').value) || 0;
  
  if (!title || !date || amount <= 0) {
    showToast("Vui lòng nhập đầy đủ thông tin giao dịch hợp lệ!", "warning");
    return;
  }
  
  if (id) {
    const idx = state.timetableTransactions.findIndex(t => t.id === id);
    if (idx !== -1) {
      state.timetableTransactions[idx] = { ...state.timetableTransactions[idx], title, date, type, amount };
    }
  } else {
    state.timetableTransactions.push({
      id: Date.now().toString(),
      title,
      date,
      type,
      amount
    });
  }
  
  await saveData();
  closeTransactionModal();
  renderCalendar();
  renderDayDetails();
  
  const activeSubBtn = document.querySelector('.sub-nav-btn.active');
  if (activeSubBtn && activeSubBtn.getAttribute('data-subtab') === 'finance') {
    renderFinanceSubPane();
  }
  
  showToast("Đã lưu thu chi thành công!", "success");
}

function openAddDefaultSlotModal() {
  document.getElementById('timetable-default-slot-modal-title').innerText = "Thêm lịch mặc định hàng tuần";
  document.getElementById('timetable-default-slot-id').value = '';
  document.getElementById('timetable-default-slot-title').value = '';
  document.getElementById('timetable-default-slot-day').value = '1';
  document.getElementById('timetable-default-slot-time').value = '08:00';
  
  const goalSelect = document.getElementById('timetable-default-slot-goal');
  goalSelect.innerHTML = '<option value="">-- Chọn mục tiêu --</option>';
  state.timetableGoals.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.title;
    goalSelect.appendChild(opt);
  });
  
  document.getElementById('timetable-default-slot-modal').style.display = 'flex';
}

function closeDefaultSlotModal() {
  document.getElementById('timetable-default-slot-modal').style.display = 'none';
}

async function saveDefaultSlotForm(e) {
  e.preventDefault();
  const id = document.getElementById('timetable-default-slot-id').value;
  const title = document.getElementById('timetable-default-slot-title').value.trim();
  const dayOfWeek = document.getElementById('timetable-default-slot-day').value;
  const time = document.getElementById('timetable-default-slot-time').value;
  const goalId = document.getElementById('timetable-default-slot-goal').value;
  
  if (!title || !time) {
    showToast("Vui lòng nhập tên lịch biểu và thời gian!", "warning");
    return;
  }
  
  if (id) {
    const idx = state.defaultScheduleEvents.findIndex(s => s.id === id);
    if (idx !== -1) {
      state.defaultScheduleEvents[idx] = { ...state.defaultScheduleEvents[idx], title, dayOfWeek, time, goalId };
    }
  } else {
    state.defaultScheduleEvents.push({
      id: Date.now().toString(),
      title,
      dayOfWeek,
      time,
      goalId
    });
  }
  
  await saveData();
  closeDefaultSlotModal();
  renderDefaultSlots();
  showToast("Đã lưu lịch mặc định!", "success");
}

function openAddEventModal() {
  document.getElementById('timetable-event-modal-title').innerText = "Thêm lịch biểu mới";
  document.getElementById('timetable-event-id').value = '';
  document.getElementById('timetable-event-title').value = '';
  document.getElementById('timetable-event-date').value = formatDateISO(calendarSelectedDate);
  document.getElementById('timetable-event-time').value = '08:00';
  
  const goalSelect = document.getElementById('timetable-event-goal');
  goalSelect.innerHTML = '<option value="">-- Chọn mục tiêu để theo dõi tiến độ --</option>';
  state.timetableGoals.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.title;
    goalSelect.appendChild(opt);
  });
  
  document.getElementById('timetable-event-modal').style.display = 'flex';
}

function openEditEventModal(event) {
  document.getElementById('timetable-event-modal-title').innerText = "Chỉnh sửa lịch biểu";
  document.getElementById('timetable-event-id').value = event.id;
  document.getElementById('timetable-event-title').value = event.title;
  document.getElementById('timetable-event-date').value = event.date;
  document.getElementById('timetable-event-time').value = event.time || '08:00';
  
  const goalSelect = document.getElementById('timetable-event-goal');
  goalSelect.innerHTML = '<option value="">-- Chọn mục tiêu để theo dõi tiến độ --</option>';
  state.timetableGoals.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.innerText = g.title;
    if (g.id === event.goalId) {
      opt.selected = true;
    }
    goalSelect.appendChild(opt);
  });
  
  document.getElementById('timetable-event-modal').style.display = 'flex';
}

function closeEventModal() {
  document.getElementById('timetable-event-modal').style.display = 'none';
}

async function saveEventForm(e) {
  e.preventDefault();
  const id = document.getElementById('timetable-event-id').value;
  const title = document.getElementById('timetable-event-title').value.trim();
  const date = document.getElementById('timetable-event-date').value;
  const time = document.getElementById('timetable-event-time').value;
  const goalId = document.getElementById('timetable-event-goal').value;
  
  if (!title || !date) {
    showToast("Vui lòng điền tiêu đề và ngày thực hiện!", "warning");
    return;
  }
  
  if (id) {
    const idx = state.timetableEvents.findIndex(item => item.id === id);
    if (idx !== -1) {
      const prevGoalId = state.timetableEvents[idx].goalId;
      state.timetableEvents[idx] = {
        ...state.timetableEvents[idx],
        title,
        date,
        time,
        goalId
      };
      if (prevGoalId !== goalId) {
        renderTimetableGoals();
      }
    }
  } else {
    state.timetableEvents.push({
      id: Date.now().toString(),
      title,
      date,
      time,
      completed: false,
      goalId
    });
  }
  
  await saveData();
  closeEventModal();
  renderCalendar();
  
  if (date === formatDateISO(calendarSelectedDate)) {
    renderDayDetails();
  }
  
  const activeSubBtn = document.querySelector('.sub-nav-btn.active');
  if (activeSubBtn) {
    renderActiveSubTab(activeSubBtn.getAttribute('data-subtab'));
  }
  
  showToast("Đã lưu lịch biểu thành công!", "success");
}

function setupTimetableEvents() {
  document.getElementById('calendar-btn-prev').addEventListener('click', () => {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() - 1);
    renderCalendar();
  });
  
  document.getElementById('calendar-btn-next').addEventListener('click', () => {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + 1);
    renderCalendar();
  });
  
  setupTimetableSubTabs();
  setupFuturePlansEvents();
  
  document.getElementById('btn-open-add-event-modal').addEventListener('click', openAddEventModal);
  document.getElementById('btn-open-add-goal-modal').addEventListener('click', openAddGoalModal);
  document.getElementById('btn-open-add-transaction-modal').addEventListener('click', openAddTransactionModal);
  document.getElementById('btn-open-add-default-slot-modal').addEventListener('click', openAddDefaultSlotModal);
  document.getElementById('btn-apply-default-schedule').addEventListener('click', openApplyDefaultScheduleModal);
  
  document.getElementById('btn-apply-default-day').addEventListener('click', async () => {
    closeApplyDefaultScheduleModal();
    await applyDefaultScheduleToDay();
  });
  document.getElementById('btn-apply-default-week').addEventListener('click', async () => {
    closeApplyDefaultScheduleModal();
    await applyDefaultScheduleToWeek();
  });
  document.getElementById('btn-apply-default-month').addEventListener('click', async () => {
    closeApplyDefaultScheduleModal();
    await applyDefaultScheduleToMonth();
  });
  document.getElementById('btn-close-apply-default-modal').addEventListener('click', closeApplyDefaultScheduleModal);
  document.getElementById('btn-cancel-apply-default').addEventListener('click', closeApplyDefaultScheduleModal);
  
  document.getElementById('btn-close-timetable-event-modal').addEventListener('click', closeEventModal);
  document.getElementById('btn-cancel-timetable-event').addEventListener('click', closeEventModal);
  document.getElementById('btn-save-timetable-event').addEventListener('click', saveEventForm);
  
  document.getElementById('btn-close-timetable-goal-modal').addEventListener('click', closeGoalModal);
  document.getElementById('btn-cancel-timetable-goal').addEventListener('click', closeGoalModal);
  document.getElementById('btn-save-timetable-goal').addEventListener('click', saveGoalForm);
  
  document.getElementById('btn-close-timetable-transaction-modal').addEventListener('click', closeTransactionModal);
  document.getElementById('btn-cancel-timetable-transaction').addEventListener('click', closeTransactionModal);
  document.getElementById('btn-save-timetable-transaction').addEventListener('click', saveTransactionForm);
  
  document.getElementById('btn-close-timetable-default-slot-modal').addEventListener('click', closeDefaultSlotModal);
  document.getElementById('btn-cancel-timetable-default-slot').addEventListener('click', closeDefaultSlotModal);
  document.getElementById('btn-save-timetable-default-slot').addEventListener('click', saveDefaultSlotForm);
  
  const addModalBackdropListener = (modalId, closeFn) => {
    const modal = document.getElementById(modalId);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeFn();
      }
    });
  };
  addModalBackdropListener('timetable-event-modal', closeEventModal);
  addModalBackdropListener('timetable-goal-modal', closeGoalModal);
  addModalBackdropListener('timetable-transaction-modal', closeTransactionModal);
  addModalBackdropListener('timetable-default-slot-modal', closeDefaultSlotModal);
  addModalBackdropListener('apply-default-schedule-modal', closeApplyDefaultScheduleModal);
}

function setupTimetableSubTabs() {
  const subNavBtns = document.querySelectorAll('.sub-nav-btn');
  const subPanes = document.querySelectorAll('.timetable-sub-pane');
  
  subNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const subtab = btn.getAttribute('data-subtab');
      
      subNavBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      subPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `subpane-${subtab}`) {
          pane.classList.add('active');
        }
      });
      
      renderActiveSubTab(subtab);
    });
  });
}

function renderActiveSubTab(subtab) {
  switch(subtab) {
    case 'goals':
      renderTimetableGoals();
      break;
    case 'future-plans':
      renderFuturePlans();
      break;
    case 'finance':
      renderFinanceSubPane();
      break;
    case 'incomplete':
      renderIncompleteTasks();
      break;
    case 'default-config':
      renderDefaultSlots();
      break;
  }
}

// ==========================================================================
// FRIENDS MANAGEMENT & AI CONVERSATION SUGGESTIONS
// ==========================================================================
function setupFriendsEvents() {
  const btnOpenAddFriendModal = document.getElementById('btn-open-add-friend-modal');
  const btnCloseFriendModal = document.getElementById('btn-close-friend-modal');
  const btnCancelFriend = document.getElementById('btn-cancel-friend');
  const btnSaveFriend = document.getElementById('btn-save-friend');
  const btnGenerateFriendsAi = document.getElementById('btn-generate-friends-ai');
  const btnCopyFriendsAi = document.getElementById('btn-copy-friends-ai');
  const friendSearchInput = document.getElementById('friend-search-input');
  const friendModal = document.getElementById('friend-modal');

  // Search input live filtering
  if (friendSearchInput) {
    let friendSearchTimeout;
    friendSearchInput.addEventListener('input', () => {
      clearTimeout(friendSearchTimeout);
      friendSearchTimeout = setTimeout(() => {
        renderFriendsList(friendSearchInput.value);
      }, 150);
    });
  }

  // Open add modal
  if (btnOpenAddFriendModal) {
    btnOpenAddFriendModal.addEventListener('click', () => {
      document.getElementById('friend-modal-title').innerText = "Thêm Bạn Mới";
      document.getElementById('friend-form').reset();
      document.getElementById('friend-id').value = '';
      friendModal.style.display = 'flex';
    });
  }

  // Close modals triggers
  const closeFn = () => {
    friendModal.style.display = 'none';
  };
  if (btnCloseFriendModal) btnCloseFriendModal.addEventListener('click', closeFn);
  if (btnCancelFriend) btnCancelFriend.addEventListener('click', closeFn);
  if (friendModal) {
    friendModal.addEventListener('click', (e) => {
      if (e.target === friendModal) closeFn();
    });
  }

  // Save friend
  if (btnSaveFriend) {
    btnSaveFriend.addEventListener('click', async (e) => {
      e.preventDefault();
      await saveFriendForm();
    });
  }

  // Generate conversation suggestions
  if (btnGenerateFriendsAi) {
    btnGenerateFriendsAi.addEventListener('click', generateFriendsAI);
  }

  // Render initial history list
  renderFriendsHistoryList();
}

function renderFriendsList(query = '') {
  const container = document.getElementById('friends-list-container');
  if (!container) return;

  container.innerHTML = '';
  const filtered = state.friends.filter(f => 
    f.name.toLowerCase().includes(query.toLowerCase()) || 
    (f.characteristics && f.characteristics.toLowerCase().includes(query.toLowerCase()))
  );

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-msg" style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px 0;">Chưa có bạn bè nào phù hợp.</p>`;
    return;
  }

  filtered.forEach(f => {
    const card = document.createElement('div');
    card.className = 'note-card'; // Reuses notes design system for consistency
    card.style.padding = '12px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <strong style="color: var(--accent-primary); font-size: 15px;">${f.name}</strong>
        <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(255,255,255,0.05); color: var(--text-muted);">${f.gender}</span>
      </div>
      ${f.phone ? `<div style="font-size: 12px; color: var(--text-muted);">SĐT: ${f.phone}</div>` : ''}
      <div style="font-size: 12px; color: var(--text-color); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.4;">
        ${f.characteristics || 'Chưa cập nhật đặc điểm.'}
      </div>
      <div style="display: flex; gap: 8px; margin-top: 4px;">
        <button class="btn btn-secondary btn-sm btn-edit-friend" data-id="${f.id}" style="padding: 4px 8px; font-size: 11px;">Sửa</button>
        <button class="btn btn-danger-outline btn-sm btn-delete-friend" data-id="${f.id}" style="padding: 4px 8px; font-size: 11px;">Xóa</button>
      </div>
    `;

    card.querySelector('.btn-edit-friend').addEventListener('click', () => openFriendModal(f.id));
    card.querySelector('.btn-delete-friend').addEventListener('click', () => deleteFriend(f.id));

    container.appendChild(card);
  });
}

function openFriendModal(friendId) {
  const friend = state.friends.find(f => f.id === friendId);
  const friendModal = document.getElementById('friend-modal');
  if (!friend || !friendModal) return;

  document.getElementById('friend-modal-title').innerText = "Sửa Thông Tin Bạn Bè";
  document.getElementById('friend-id').value = friend.id;
  document.getElementById('friend-name').value = friend.name;
  document.getElementById('friend-gender').value = friend.gender;
  document.getElementById('friend-phone').value = friend.phone || '';
  document.getElementById('friend-characteristics').value = friend.characteristics || '';
  
  friendModal.style.display = 'flex';
}

async function saveFriendForm() {
  const idVal = document.getElementById('friend-id').value;
  const nameVal = document.getElementById('friend-name').value.trim();
  const genderVal = document.getElementById('friend-gender').value;
  const phoneVal = document.getElementById('friend-phone').value.trim();
  const charVal = document.getElementById('friend-characteristics').value.trim();

  if (!nameVal || !charVal) {
    showToast("Vui lòng điền tên và đặc điểm của bạn bè!", "error");
    return;
  }

  if (idVal) {
    // Edit existing friend
    const index = state.friends.findIndex(f => f.id === idVal);
    if (index !== -1) {
      state.friends[index] = {
        ...state.friends[index],
        name: nameVal,
        gender: genderVal,
        phone: phoneVal,
        characteristics: charVal
      };
    }
  } else {
    // Add new friend
    state.friends.push({
      id: Date.now().toString(),
      name: nameVal,
      gender: genderVal,
      phone: phoneVal,
      characteristics: charVal,
      date: new Date().toLocaleString('vi-VN')
    });
  }

  await saveData();
  showToast("Đã lưu thông tin bạn bè!", "success");
  document.getElementById('friend-modal').style.display = 'none';
  const searchInput = document.getElementById('friend-search-input');
  const query = searchInput ? searchInput.value : '';
  renderFriendsList(query);
}

async function deleteFriend(friendId) {
  const friend = state.friends.find(f => f.id === friendId);
  if (!friend) return;

  if (confirm(`Bạn có chắc chắn muốn xóa bạn bè "${friend.name}" khỏi danh sách?`)) {
    state.friends = state.friends.filter(f => f.id !== friendId);
    await saveData();
    showToast("Đã xóa bạn bè khỏi danh sách!", "success");
    const searchInput = document.getElementById('friend-search-input');
    const query = searchInput ? searchInput.value : '';
    renderFriendsList(query);
  }
}

function copyStudentToFriend(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) {
    showToast("Không tìm thấy học viên!", "error");
    return;
  }

  const exists = state.friends.some(f => f.name.toLowerCase() === student.name.toLowerCase());
  if (exists) {
    showToast(`${student.name} đã có trong danh sách bạn bè!`, "warning");
    return;
  }

  const traits = [];
  if (student.gender) traits.push(`Giới tính: ${student.gender}`);
  if (student.strengths) traits.push(`Điểm mạnh: ${student.strengths}`);
  if (student.weaknesses) traits.push(`Điểm yếu: ${student.weaknesses}`);
  if (student.highlights) traits.push(`Đặc điểm nổi bật: ${student.highlights}`);
  if (student.tasks && student.tasks.length > 0) {
    traits.push(`Mục tiêu 30 ngày: ${student.tasks.map(t => t.text).join(', ')}`);
  }

  state.friends.push({
    id: Date.now().toString(),
    name: student.name,
    gender: student.gender || 'Nam',
    phone: student.phone || '',
    characteristics: traits.join('. '),
    date: new Date().toLocaleString('vi-VN')
  });

  saveData();
  showToast(`Đã thêm ${student.name} sang danh sách bạn bè!`, "success");
  
  if (document.getElementById('tab-friends').classList.contains('active')) {
    renderFriendsList();
  }
}

let activeFriendsHistoryId = null;

async function generateFriendsAI() {
  if (state.friends.length === 0) {
    showToast("Danh sách bạn bè trống! Hãy thêm bạn bè hoặc nhập từ Học viên trước.", "warning");
    return;
  }

  const outputContainer = document.getElementById('friends-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-friends-ai');
  if (!outputContainer) return;

  outputContainer.innerHTML = `
    <div class="ai-empty-state">
      <div class="ai-empty-icon">
        <svg class="spinner" viewBox="0 0 24 24" width="48" height="48" stroke="var(--accent-secondary)" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </div>
      <h3>AI đang phân tích và thiết kế gợi ý nói chuyện...</h3>
      <p>Hệ thống đang lập kịch bản bắt chuyện hàng loạt dựa trên sở thích và trend mới cho ${state.friends.length} người bạn. Quá trình này mất khoảng 5 - 15 giây.</p>
    </div>
  `;
  if (btnCopy) btnCopy.style.display = 'none';

  const friendsString = state.friends.map((f, i) => `${i + 1}. Tên: ${f.name} (${f.gender}) - Đặc điểm/Sở thích: ${f.characteristics}`).join('\n');

  const detailedPrompt = `
Hãy đóng vai là một trợ lý giao tiếp xã hội cực kỳ tâm lý và am hiểu xu hướng (hot trends).
Dưới đây là danh sách bạn bè của tôi:
${friendsString}

Hãy tạo cho TẤT CẢ các bạn này, mỗi người đúng 10 câu hỏi thăm hoặc gợi mở nói chuyện (conversation starters).
Yêu cầu thiết kế:
1. Mỗi người bạn phải có đúng 10 câu gợi chuyện cá nhân hóa hoàn toàn dựa trên đặc điểm, tính cách, giới tính và sở thích của họ.
2. Hãy lồng ghép thông minh các trào lưu hot trend hiện tại một cách phù hợp (ví dụ: các trend thịnh hành trên TikTok/Facebook, các câu nói hài hước, phim/ảnh đang hot, âm nhạc hot, giải đấu thể thao cầu lông/bóng đá đang diễn ra...).
3. Cách nói chuyện tự nhiên, gần gũi, ấm áp hoặc hài hước (tùy theo tính cách của họ), đúng chất bạn bè nói chuyện đời thường ở Việt Nam, tránh kiểu hành văn máy móc, trang trọng.

Đầu ra trả về bằng tiếng Việt, định dạng Markdown thật đẹp mắt. Định dạng cho từng người bạn như sau:
## 🤝 Gợi ý trò chuyện với **[Tên người bạn]**
*(Giải thích ngắn gọn ý tưởng bắt chuyện và hot trend áp dụng cho người bạn này)*
1. [Câu hỏi/mở đầu 1]
2. [Câu hỏi/mở đầu 2]
...
10. [Câu hỏi/mở đầu 10]

---
`;

  try {
    const result = await window.api.callAI({
      provider: state.settings.apiProvider,
      apiKey: state.settings.apiKey,
      model: state.settings.aiModel,
      prompt: detailedPrompt
    });

    if (result.success) {
      const dateStr = new Date().toLocaleString('vi-VN');
      const titleStr = `Gợi ý cho ${state.friends.length} người bạn`;
      const newItem = {
        id: Date.now().toString(),
        title: titleStr,
        content: result.text,
        date: dateStr
      };
      
      if (!state.friendsHistory) state.friendsHistory = [];
      state.friendsHistory.unshift(newItem);
      activeFriendsHistoryId = newItem.id;
      
      state.friendsAiOutput = result.text;
      await saveData();

      renderFriendsHistoryList();
      selectFriendsHistoryItem(newItem.id);
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error(err);
    outputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon" style="color: var(--accent-red)">
          <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h3>Lỗi kết nối AI</h3>
        <p>${err.message || "Không thể kết nối với máy chủ AI. Vui lòng cấu hình khóa API trong mục Cấu Hình."}</p>
      </div>
    `;
  }
}

function renderFriendsTab() {
  renderFriendsHistoryList();
  if (activeFriendsHistoryId) {
    selectFriendsHistoryItem(activeFriendsHistoryId);
  } else if (state.friendsHistory && state.friendsHistory.length > 0) {
    selectFriendsHistoryItem(state.friendsHistory[0].id);
  } else {
    showFriendsEmptyState();
  }
}

function showFriendsEmptyState() {
  const outputContainer = document.getElementById('friends-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-friends-ai');
  if (!outputContainer) return;

  outputContainer.innerHTML = `
    <div class="ai-empty-state">
      <div class="ai-empty-icon">
        <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
      </div>
      <h3>Gợi ý trò chuyện thông minh</h3>
      <p>Thêm bạn bè và nhập đặc điểm của họ ở danh sách bên trái. Bấm nút "AI Gợi Ý Hỏi Thăm (Tất cả)" để hệ thống sinh ra mỗi người 10 câu hỏi thăm/chuyện trò dựa trên sở thích cá nhân kết hợp các hot trend hiện tại.</p>
    </div>
  `;
  if (btnCopy) btnCopy.style.display = 'none';
}

function renderFriendsHistoryList() {
  const container = document.getElementById('friends-history-container');
  if (!container) return;

  container.innerHTML = '';
  if (!state.friendsHistory || state.friendsHistory.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="padding: 10px 0; color: var(--text-muted); font-size: 13px; text-align: center;">Chưa có lịch sử gợi ý.</p>';
    return;
  }

  state.friendsHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = `prep-history-item ${activeFriendsHistoryId === item.id ? 'active' : ''}`;
    
    div.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; flex-grow: 1; padding-right: 8px;">
        <strong style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-color);">${item.title}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${item.date}</span>
      </div>
      <button type="button" class="btn-delete-friends-history-item" style="background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
    `;
    div.addEventListener('click', () => selectFriendsHistoryItem(item.id));
    div.querySelector('.btn-delete-friends-history-item').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFriendsHistoryItem(item.id);
    });
    container.appendChild(div);
  });
}

function selectFriendsHistoryItem(id) {
  const item = state.friendsHistory.find(h => h.id === id);
  if (!item) return;

  activeFriendsHistoryId = id;
  renderFriendsHistoryList();

  const outputContainer = document.getElementById('friends-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-friends-ai');
  if (!outputContainer) return;

  outputContainer.innerHTML = parseMarkdownToHTML(item.content);
  if (btnCopy) {
    btnCopy.style.display = 'inline-flex';
    btnCopy.onclick = () => {
      navigator.clipboard.writeText(item.content);
      showToast("Đã sao chép toàn bộ gợi ý hội thoại!", "success");
    };
  }
}

async function deleteFriendsHistoryItem(id) {
  if (!confirm("Bạn có chắc chắn muốn xóa lịch sử gợi ý này?")) return;

  state.friendsHistory = state.friendsHistory.filter(h => h.id !== id);
  if (activeFriendsHistoryId === id) {
    activeFriendsHistoryId = null;
  }

  await saveData();
  renderFriendsHistoryList();
  
  if (activeFriendsHistoryId) {
    selectFriendsHistoryItem(activeFriendsHistoryId);
  } else if (state.friendsHistory && state.friendsHistory.length > 0) {
    selectFriendsHistoryItem(state.friendsHistory[0].id);
  } else {
    showFriendsEmptyState();
  }
  showToast("Đã xóa lịch sử gợi ý thành công!", "success");
}

// ==========================================================================
// CAPTAIN ROLEPLAY SIMULATOR LOGIC
// ==========================================================================
let activeCaptainHistoryId = null;

function setupCaptainEvents() {
  const btnGenerateCaptain = document.getElementById('btn-generate-captain-ai');
  const quickBtns = document.querySelectorAll('.captain-quick-btn');

  if (btnGenerateCaptain) {
    btnGenerateCaptain.addEventListener('click', generateCaptainAI);
  }

  // Quick prompt buttons
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const goalText = btn.getAttribute('data-goal');
      const textarea = document.getElementById('captain-goal');
      if (textarea && goalText) {
        textarea.value = goalText;
      }
    });
  });

  // Render initial list
  renderCaptainHistoryList();
}

function renderCaptainTab() {
  renderCaptainHistoryList();
  if (activeCaptainHistoryId) {
    selectCaptainHistoryItem(activeCaptainHistoryId);
  } else {
    showCaptainEmptyState();
  }
}

function showCaptainEmptyState() {
  const outputContainer = document.getElementById('captain-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-captain-ai');
  if (outputContainer) {
    outputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon">
          <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        </div>
        <h3>Trở thành Đội Trưởng tài ba</h3>
        <p>Nhập tình huống của đội ở bảng bên trái. AI sẽ phân tích và lập tức tạo ra toàn bộ thoại hội ý, lời thúc giục, phương pháp lãnh đạo và các khẩu hiệu chiến thắng kiêu hãnh hô to khi đạt goal để bạn luyện tập.</p>
      </div>
    `;
  }
  if (btnCopy) btnCopy.style.display = 'none';
}

function renderCaptainHistoryList() {
  const container = document.getElementById('captain-history-container');
  if (!container) return;

  container.innerHTML = '';
  if (!state.captainHistory || state.captainHistory.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="padding: 10px 0; color: var(--text-muted); font-size: 13px; text-align: center;">Chưa có kịch bản đội trưởng nào.</p>';
    return;
  }

  state.captainHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = `prep-history-item ${activeCaptainHistoryId === item.id ? 'active' : ''}`;
    div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 6px; background: rgba(255,255,255,0.03); margin-bottom: 6px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;";
    if (activeCaptainHistoryId === item.id) {
      div.style.background = "rgba(168, 85, 247, 0.1)";
      div.style.borderColor = "rgba(168, 85, 247, 0.3)";
    }

    div.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; flex-grow: 1; padding-right: 8px;">
        <strong style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-color);">${item.goal}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${item.date}</span>
      </div>
      <button type="button" class="btn-delete-captain-item" style="background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-captain-item')) return;
      selectCaptainHistoryItem(item.id);
    });

    div.querySelector('.btn-delete-captain-item').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCaptainHistoryItem(item.id);
    });

    container.appendChild(div);
  });
}

function selectCaptainHistoryItem(id) {
  activeCaptainHistoryId = id;
  const item = state.captainHistory.find(c => c.id === id);
  if (!item) return;

  renderCaptainHistoryList();

  document.getElementById('captain-goal').value = item.goal;
  document.getElementById('captain-style').value = item.style;
  document.getElementById('captain-team-desc').value = item.teamDesc;

  const outputContainer = document.getElementById('captain-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-captain-ai');

  if (outputContainer) {
    outputContainer.innerHTML = parseMarkdownToHTML(item.content);
  }
  if (btnCopy) {
    btnCopy.style.display = 'inline-flex';
    btnCopy.onclick = () => {
      navigator.clipboard.writeText(item.content);
      showToast("Đã sao chép kịch bản phát ngôn đội trưởng!", "success");
    };
  }
}

async function deleteCaptainHistoryItem(id) {
  if (confirm("Bạn có chắc chắn muốn xóa lịch sử kịch bản này?")) {
    state.captainHistory = state.captainHistory.filter(c => c.id !== id);
    if (activeCaptainHistoryId === id) {
      activeCaptainHistoryId = null;
      showCaptainEmptyState();
    }
    await saveData();
    renderCaptainHistoryList();
  }
}

async function generateCaptainAI() {
  const goalVal = document.getElementById('captain-goal').value.trim();
  const styleVal = document.getElementById('captain-style').value;
  const teamDescVal = document.getElementById('captain-team-desc').value.trim();
  const outputContainer = document.getElementById('captain-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-captain-ai');

  if (!goalVal) {
    showToast("Vui lòng nhập tình huống & mục tiêu của đội!", "warning");
    return;
  }

  if (!outputContainer) return;

  outputContainer.innerHTML = `
    <div class="ai-empty-state">
      <div class="ai-empty-icon">
        <svg class="spinner" viewBox="0 0 24 24" width="48" height="48" stroke="var(--accent-secondary)" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </div>
      <h3>AI đang xây dựng chiến thuật và kịch bản thoại đội trưởng...</h3>
      <p>Đang chuẩn bị lời dặn dò, động viên và khẩu hiệu chiến thắng. Quá trình này mất khoảng 5 - 15 giây.</p>
    </div>
  `;
  if (btnCopy) btnCopy.style.display = 'none';

  const detailedPrompt = `
Hãy đóng vai là một người Đội trưởng (Captain) tài ba, truyền cảm hứng mạnh mẽ, có tư duy chiến thuật nhạy bén và khả năng dẫn dắt xuất sắc.
Tôi đang cần huấn luyện để trở thành một đội trưởng tốt trong bối cảnh sau:

**Tình huống & Mục tiêu của đội:**
${goalVal}

**Phong cách của Đội trưởng:**
${styleVal}

**Đặc điểm thành viên trong đội:**
${teamDescVal || 'Các thành viên bình thường.'}

Hãy thiết kế cho tôi một kịch bản phát ngôn và phương án hành động chi tiết để dẫn dắt đội tốt nhất nhằm đạt mục tiêu. Định dạng Markdown đẹp mắt, bao gồm các phần chính sau:

1. **📢 Lời thoại Hội ý / Khích lệ tinh thần (Team Talk - Trước giờ G hoặc giữa giờ):**
   - Viết lời thoại đầy đủ dưới dạng ngôi thứ nhất ("Tôi" - người đội trưởng nói trực tiếp).
   - Lời thoại phải giải tỏa tâm lý căng thẳng, tiếp thêm động lực mạnh mẽ, làm cho các thành viên khao khát cống hiến hết mình.
   - Thể hiện đúng phong cách: "${styleVal}".

2. **📋 Chỉ đạo Chiến thuật & Phân công nhiệm vụ (Tactical & Action Plan):**
   - Hướng dẫn cụ thể cách tổ chức đội hình, cách phối hợp ăn ý nhất.
   - Lời dặn dò ngắn gọn, dễ nhớ nhưng thực chiến để tăng tối đa tính đồng đội.

3. **⚡ Lời thoại chấn chỉnh khi team lục đục (Conflict Resolution & Admonishment):**
   - Thiết kế kịch bản thoại khi nội bộ xảy ra mâu thuẫn, đổ lỗi lẫn nhau, hoặc mất tinh thần chiến đấu giữa chừng.
   - Lời thoại ngôi thứ nhất ("Tôi" - người đội trưởng) mắng, nhắc nhở hoặc cảnh báo nghiêm khắc, đánh thẳng vào lòng tự trọng và trách nhiệm của từng người để chấn chỉnh kỷ luật tức thì.

4. **🔥 Khẩu hiệu & Lời thoại Ăn mừng kiêu hãnh (Goal Celebration Shoutouts):**
   - Các khẩu hiệu ngắn, hào hùng hoặc các lời thoại hô vang thể hiện sự tự hào, sung sướng vỡ òa khi đội chính thức đạt được mục tiêu/goal.
   - Giúp nâng tầm tinh thần đồng đội lên cao nhất và tạo kỷ niệm đáng nhớ.

5. **💡 Bài học lãnh đạo rút ra (Captain's Lesson):**
   - 3 lưu ý cốt lõi dành cho tôi để làm gương và chỉ huy đội tốt hơn trong tình huống này.

Đầu ra viết bằng tiếng Việt, định dạng Markdown thật chuyên nghiệp và truyền cảm hứng.
`;

  try {
    const result = await window.api.callAI({
      provider: state.settings.apiProvider,
      apiKey: state.settings.apiKey,
      model: state.settings.aiModel,
      prompt: detailedPrompt
    });

    if (result.success) {
      const newItem = {
        id: Date.now().toString(),
        goal: goalVal,
        style: styleVal,
        teamDesc: teamDescVal,
        content: result.text,
        date: new Date().toLocaleString('vi-VN')
      };

      state.captainHistory.unshift(newItem);
      activeCaptainHistoryId = newItem.id;
      await saveData();
      renderCaptainHistoryList();

      outputContainer.innerHTML = parseMarkdownToHTML(result.text);
      if (btnCopy) {
        btnCopy.style.display = 'inline-flex';
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(result.text);
          showToast("Đã sao chép kịch bản phát ngôn đội trưởng!", "success");
        };
      }
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error(err);
    outputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon" style="color: var(--accent-red)">
          <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h3>Lỗi kết nối AI</h3>
        <p>${err.message || "Không thể kết nối với máy chủ AI. Vui lòng cấu hình khóa API trong mục Cấu Hình."}</p>
      </div>
    `;
  }
}

// ==========================================================================
// PREDICTIVE FORESIGHT / TREND PREDICTION LOGIC
// ==========================================================================
let activeTrendHistoryId = null;

function setupTrendPredictionEvents() {
  const btnGenerate = document.getElementById('btn-generate-trend-prediction-ai');
  const quickBtns = document.querySelectorAll('.trend-quick-btn');

  if (btnGenerate) {
    btnGenerate.addEventListener('click', generateTrendPredictionAI);
  }

  // Quick topics buttons
  quickBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const topicText = btn.getAttribute('data-topic');
      const textarea = document.getElementById('trend-topic');
      if (textarea && topicText) {
        textarea.value = topicText;
      }
    });
  });

  // Render initial list
  renderTrendHistoryList();
}

function renderTrendPredictionTab() {
  renderTrendHistoryList();
  if (activeTrendHistoryId) {
    selectTrendHistoryItem(activeTrendHistoryId);
  } else {
    showTrendEmptyState();
  }
}

function showTrendEmptyState() {
  const outputContainer = document.getElementById('trend-prediction-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-trend-prediction-ai');
  if (outputContainer) {
    outputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon">
          <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        </div>
        <h3>Dự đoán trước & Wow người xem</h3>
        <p>Nhập kỹ năng/chủ đề ở cột trái. AI sẽ phân tích góc quay, dự đoán trước phản xạ vật lý, tư thế, vị trí rơi cầu và phản ứng của đối thủ để tạo ra một kịch bản content cực xịn, đảm bảo lên xu hướng và khiến người xem trầm trồ kinh ngạc.</p>
      </div>
    `;
  }
  if (btnCopy) btnCopy.style.display = 'none';
}

function renderTrendHistoryList() {
  const container = document.getElementById('trend-history-container');
  if (!container) return;

  container.innerHTML = '';
  if (!state.trendHistory || state.trendHistory.length === 0) {
    container.innerHTML = '<p class="empty-msg" style="padding: 10px 0; color: var(--text-muted); font-size: 13px; text-align: center;">Chưa có kịch bản phản xạ nào.</p>';
    return;
  }

  state.trendHistory.forEach(item => {
    const div = document.createElement('div');
    div.className = `prep-history-item ${activeTrendHistoryId === item.id ? 'active' : ''}`;
    div.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 6px; background: rgba(255,255,255,0.03); margin-bottom: 6px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s;";
    if (activeTrendHistoryId === item.id) {
      div.style.background = "rgba(139, 92, 246, 0.1)";
      div.style.borderColor = "rgba(139, 92, 246, 0.3)";
    }

    div.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden; flex-grow: 1; padding-right: 8px;">
        <strong style="font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-color);">${item.topic}</strong>
        <span style="font-size: 11px; color: var(--text-muted);">${item.date}</span>
      </div>
      <button type="button" class="btn-delete-trend-item" style="background: none; border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; padding: 0 4px; line-height: 1;">&times;</button>
    `;

    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('btn-delete-trend-item')) return;
      selectTrendHistoryItem(item.id);
    });

    div.querySelector('.btn-delete-trend-item').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTrendHistoryItem(item.id);
    });

    container.appendChild(div);
  });
}

function selectTrendHistoryItem(id) {
  activeTrendHistoryId = id;
  const item = state.trendHistory.find(t => t.id === id);
  if (!item) return;

  renderTrendHistoryList();

  document.getElementById('trend-topic').value = item.topic;
  document.getElementById('trend-platform').value = item.platform;

  const outputContainer = document.getElementById('trend-prediction-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-trend-prediction-ai');

  if (outputContainer) {
    outputContainer.innerHTML = parseMarkdownToHTML(item.content);
  }
  if (btnCopy) {
    btnCopy.style.display = 'inline-flex';
    btnCopy.onclick = () => {
      navigator.clipboard.writeText(item.content);
      showToast("Đã sao chép kịch bản phản xạ trước!", "success");
    };
  }
}

async function deleteTrendHistoryItem(id) {
  if (confirm("Bạn có chắc chắn muốn xóa lịch sử kịch bản này?")) {
    state.trendHistory = state.trendHistory.filter(t => t.id !== id);
    if (activeTrendHistoryId === id) {
      activeTrendHistoryId = null;
      showTrendEmptyState();
    }
    await saveData();
    renderTrendHistoryList();
  }
}

async function generateTrendPredictionAI() {
  const topicVal = document.getElementById('trend-topic').value.trim();
  const platformVal = document.getElementById('trend-platform').value;
  const outputContainer = document.getElementById('trend-prediction-ai-output-container');
  const btnCopy = document.getElementById('btn-copy-trend-prediction-ai');

  if (!topicVal) {
    showToast("Vui lòng nhập chủ đề hoặc kỹ năng!", "warning");
    return;
  }

  if (!outputContainer) return;

  outputContainer.innerHTML = `
    <div class="ai-empty-state">
      <div class="ai-empty-icon">
        <svg class="spinner" viewBox="0 0 24 24" width="48" height="48" stroke="var(--accent-secondary)" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </div>
      <h3>AI đang phân tích góc máy, tính toán quỹ đạo vật lý và kết quả của skill xịn...</h3>
      <p>Đang lập kịch bản content độc quyền "Phản Xạ Trước" để làm người xem trầm trồ kinh ngạc. Quá trình này mất khoảng 5 - 15 giây.</p>
    </div>
  `;
  if (btnCopy) btnCopy.style.display = 'none';

  const detailedPrompt = `
Hãy đóng vai là một nhà sáng tạo nội dung triệu view xuất chúng, một bậc thầy marketing có khả năng "nhìn thấu tương lai" và hiểu rõ tâm lý người xem mạng xã hội Việt Nam. 
Tôi muốn tạo một nội dung đột phá về chủ đề/kỹ năng sau:

**Chủ đề hoặc Kỹ năng được nhập:**
${topicVal}

**Định dạng/Nền tảng mong muốn:**
${platformVal}

Hãy sáng tạo một kịch bản content mang tính chất **PHẢN XẠ TRƯỚC (Predictive Foresight / Outcomes of a great skill)** theo các nguyên tắc cốt lõi sau:
1. **Dự đoán trước kết quả chính xác tuyệt đối (Predicting the exact outcome of a trick/action):**
   - Viết phần nội dung mà người làm content dự đoán chính xác trước 100% kết quả vật lý, phản ứng, hoặc chuyển động của đối thủ/quả cầu khi thực hiện skill xịn này (Ví dụ: "Tôi biết trước khi tôi vung vợt chéo góc 45 độ sát lưới, quả cầu sẽ xoáy lật lưới 3 vòng, và chân trái đối thủ sẽ bị trượt sang phải 15cm do mất đà...").
   - Sự dự đoán chính xác này sẽ khiến người xem cảm thấy "Wow" vì ta nắm rõ mọi kết quả vật lý/sinh lý của skill xịn trước cả khi nó diễn ra.
2. **Nội dung chưa từng ai làm (Unexplored & Unique):**
   - Đưa ra một góc nhìn sáng tạo độc nhất vô nhị, chưa có bất kỳ video hay bài viết nào trên mạng làm tương tự. Tránh các lối mòn hướng dẫn kỹ thuật thông thường.
   - Thể hiện sự tinh tế, "độc lạ" trong cách kể chuyện.
3. **Chắc chắn thắng (High-converting/Viral blueprint):**
   - Thiết kế nhịp điệu (Hook giữ chân 3 giây đầu, Body cao trào chứng minh, và Outro kêu gọi hành động ấn tượng).
   - Đảm bảo tỷ lệ giữ chân người xem cực cao.

Hãy trả về kết quả bằng tiếng Việt, định dạng Markdown chuyên nghiệp gồm các mục sau:
- ## 🚀 KHÁI NIỆM & GÓC NHÌN ĐỘC LẠ (Unexplored Angle)
  *(Giải thích vì sao ý tưởng này chưa ai làm và tại sao nó chắc chắn sẽ tạo xu hướng)*
- ## 🎯 DỰ ĐOÁN WOW-FACTOR (Predictive Outcome)
  *(Mô tả chi tiết những kết quả vật lý, tư thế, vị trí hoặc phản ứng mà ta phán đoán trước chính xác 100% để người xem kinh ngạc)*
- ## 🎬 CHI TIẾT KỊCH BẢN CONTENT (Detailed Content Script)
  *(Nếu là video, chia rõ phân cảnh, góc máy quay, lời thoại/lời bình và phụ đề. Nếu là bài viết, chia rõ tiêu đề giật gân, thân bài lôi cuốn và lời kêu gọi)*
- ## 💡 MẸO TRIỂN KHAI THỰC TẾ
  *(Lưu ý về góc quay camera, ánh sáng, âm thanh hoặc đạo cụ để làm nổi bật kết quả dự đoán trước này)*
`;

  try {
    const result = await window.api.callAI({
      provider: state.settings.apiProvider,
      apiKey: state.settings.apiKey,
      model: state.settings.aiModel,
      prompt: detailedPrompt
    });

    if (result.success) {
      const newItem = {
        id: Date.now().toString(),
        topic: topicVal,
        platform: platformVal,
        content: result.text,
        date: new Date().toLocaleString('vi-VN')
      };

      state.trendHistory.unshift(newItem);
      activeTrendHistoryId = newItem.id;
      await saveData();
      renderTrendHistoryList();

      outputContainer.innerHTML = parseMarkdownToHTML(result.text);
      if (btnCopy) {
        btnCopy.style.display = 'inline-flex';
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(result.text);
          showToast("Đã sao chép kịch bản phản xạ trước!", "success");
        };
      }
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error(err);
    outputContainer.innerHTML = `
      <div class="ai-empty-state">
        <div class="ai-empty-icon" style="color: var(--accent-red)">
          <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        </div>
        <h3>Lỗi kết nối AI</h3>
        <p>${err.message || "Không thể kết nối với máy chủ AI. Vui lòng cấu hình khóa API trong mục Cấu Hình."}</p>
      </div>
    `;
  }
}

// ==========================================================================
// GLOBAL CHAT & COMMAND CENTER LOGIC
// ==========================================================================
function setupGlobalChat() {
  const trigger = document.getElementById('global-chat-trigger');
  const windowEl = document.getElementById('global-chat-window');
  const closeBtn = document.getElementById('btn-close-global-chat');
  const chatBody = document.getElementById('global-chat-body');
  const chatInput = document.getElementById('global-chat-input');
  const sendBtn = document.getElementById('btn-send-global-chat');

  if (!trigger || !windowEl) return;

  trigger.addEventListener('click', () => {
    const isOpen = windowEl.style.display !== 'none';
    if (isOpen) {
      windowEl.style.display = 'none';
    } else {
      windowEl.style.display = 'flex';
      const pulseBadge = trigger.querySelector('.chat-badge-pulse');
      if (pulseBadge) pulseBadge.style.display = 'none';
      chatInput.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    windowEl.style.display = 'none';
  });

  // Example prompts click
  document.querySelectorAll('.chat-example-item').forEach(item => {
    item.addEventListener('click', () => {
      const text = item.getAttribute('data-text');
      chatInput.value = text;
      chatInput.focus();
    });
  });

  function appendMessage(sender, text, isHtml = false) {
    const div = document.createElement('div');
    div.className = `chat-msg ${sender}`;
    if (isHtml) {
      div.innerHTML = text;
    } else {
      div.innerText = text;
    }
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  async function handleSend() {
    const query = chatInput.value.trim();
    if (!query) return;

    appendMessage('user', query);
    chatInput.value = '';

    // Show system loader message
    const loaderId = 'chat-loader-' + Date.now();
    const loaderDiv = document.createElement('div');
    loaderDiv.className = 'chat-msg ai';
    loaderDiv.id = loaderId;
    loaderDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <svg class="spinner" viewBox="0 0 24 24" width="16" height="16" stroke="var(--accent-secondary)" stroke-width="3" fill="none" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        <span>Đang xử lý yêu cầu...</span>
      </div>
    `;
    chatBody.appendChild(loaderDiv);
    chatBody.scrollTop = chatBody.scrollHeight;

    try {
      const response = await processChatCommand(query);
      
      // Remove loader
      const loader = document.getElementById(loaderId);
      if (loader) loader.remove();

      if (response && response.reply) {
        appendMessage('ai', response.reply, true);
      }

      if (response && response.feedback) {
        appendMessage('system-feedback', response.feedback, true);
      }
    } catch (err) {
      console.error(err);
      const loader = document.getElementById(loaderId);
      if (loader) loader.remove();
      appendMessage('ai', "Đã xảy ra lỗi khi kết nối với AI hoặc thực thi lệnh: " + err.message);
    }
  }

  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  });
}

function findStudentFuzzy(name) {
  if (!name) return null;
  const cleanName = name.toLowerCase().trim();
  
  // Try exact match
  let match = state.students.find(s => s.name.toLowerCase().trim() === cleanName);
  if (match) return match;
  
  // Try includes match
  match = state.students.find(s => s.name.toLowerCase().includes(cleanName) || cleanName.includes(s.name.toLowerCase()));
  if (match) return match;
  
  // Try word-by-word intersection match
  const words = cleanName.split(/\s+/);
  match = state.students.find(s => {
    const sWords = s.name.toLowerCase().split(/\s+/);
    return words.every(w => sWords.some(sw => sw.includes(w) || w.includes(sw)));
  });
  return match || null;
}

function switchTabProgrammatically(tab) {
  const btn = Array.from(navButtons).find(b => b.getAttribute('data-tab') === tab);
  if (btn) {
    btn.click();
    return true;
  }
  return false;
}

async function processChatCommand(query) {
  let geminiFailed = false;
  let geminiErrorMsg = "";

  if (!state.settings.apiKey) {
    geminiFailed = true;
    geminiErrorMsg = "API Key trống";
  } else {
    try {
      const systemPrompt = `
Hãy đóng vai là Trợ lý Điều khiển AI thông minh của ứng dụng quản lý dạy học cầu lông "Badminton Coach Assistant".
Bạn có nhiệm vụ phân tích tin nhắn tự nhiên của huấn luyện viên (người dùng) và chuyển đổi nó thành danh sách các hành động điều khiển ứng dụng dạng JSON.

**Danh sách học viên hiện tại trong hệ thống:**
${JSON.stringify(state.students.map(s => ({ id: s.id, name: s.name, gender: s.gender, paid: s.paid, totalSessions: s.totalSessions, usedSessions: s.usedSessions, unexcusedAbsences: s.unexcusedAbsences })))}

**Đầu ra bắt buộc:**
Bạn CHỈ được phép trả về định dạng JSON thuần túy, không có thẻ Codeblock markdown (\`\`\`json ... \`\`\`), không có bất kỳ văn bản giải thích nào ngoài JSON. Cấu trúc JSON phải là:
{
  "reply": "Lời hồi đáp thân thiện bằng tiếng Việt, thông báo những việc bạn sẽ thực hiện.",
  "actions": [
     // Mảng các hành động cần thực thi (có thể chứa 1 hoặc nhiều hành động)
  ]
}

**Các loại hành động (actions) được hỗ trợ:**
1. Chuyển tab:
   {"type": "switch_tab", "tab": "dashboard" | "students" | "schedules" | "timetable" | "optimizer" | "ai-assistant" | "lesson-prep" | "quick-notes" | "settings"}
   
2. Thêm học viên mới:
   {"type": "add_student", "name": "Tên học viên", "gender": "Nam" | "Nữ" (mặc định Nam), "phone": "SĐT", "tuition": Số_tiền (mặc định 1000000), "strengths": "Điểm mạnh", "weaknesses": "Điểm yếu", "highlights": "Đặc điểm khác"}
   
3. Cập nhật thông tin học viên (học phí, buổi học, chuyên cần, kịch bản, đặc điểm):
   {"type": "update_student", "name": "Tên học viên cần cập nhật", "paid_add": Số_tiền_đóng_thêm_nếu_có, "sessions_add": Số_buổi_học_thêm_nếu_có (ví dụ: "học thêm 1 buổi"), "sessions_set": Số_buổi_đã_học_nếu_có (ví dụ: "học được 7 buổi"), "absences_add": Số_buổi_vắng_không_phép_thêm_nếu_có, "strengths": "Điểm mạnh mới", "weaknesses": "Điểm yếu mới", "highlights": "Đặc điểm mới"}
   
4. Sinh giáo án AI:
   {"type": "generate_lesson", "name": "Tên học viên", "aiType": "90min" | "1month" | "teambuilding", "customRequest": "Yêu cầu bổ sung"}
   
5. Thêm ghi nhớ/ghi chú nhanh:
   {"type": "add_quick_note", "title": "Tiêu đề ghi nhớ", "content": "Nội dung chi tiết"}

6. Thêm mục tiêu tập luyện chung:
   {"type": "add_goal", "text": "Nội dung mục tiêu"}

**Ví dụ phân tích:**
- "học viên Nguyễn Khánh Huy, nay học phông cầu, đã nộp 1 triệu, nghỉ không phép" -> Trả về hành động cập nhật học viên:
  {"type": "update_student", "name": "Nguyễn Khánh Huy", "paid_add": 1000000, "absences_add": 1, "weaknesses": "nay học phông cầu (cần cải thiện)"}
- "Tạo giáo án 1 tháng cho Hoàng Kỳ Anh, tập trung thể lực" -> Trả về hành động:
  {"type": "generate_lesson", "name": "Hoàng Kỳ Anh", "aiType": "1month", "customRequest": "Tập trung thể lực"}
- "Thêm ghi chú: Nhắc đóng học phí cho Đức Anh" -> Trả về hành động:
  {"type": "add_quick_note", "title": "Nhắc đóng học phí", "content": "Nhắc đóng học phí cho học viên Đức Anh"}

Hãy xử lý tin nhắn của huấn luyện viên sau đây:
"${query}"
`;

      const result = await window.api.callAI({
        provider: state.settings.apiProvider,
        apiKey: state.settings.apiKey,
        model: state.settings.aiModel,
        prompt: systemPrompt
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      let data;
      let cleanText = result.text.trim();
      if (cleanText.startsWith('```')) {
        cleanText = cleanText.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      }
      data = JSON.parse(cleanText);

      return await executeChatActions(data.actions, data.reply);
    } catch (err) {
      console.warn("Gemini API failed, using local fallback parser:", err);
      geminiFailed = true;
      geminiErrorMsg = err.message || "Lỗi dịch vụ";
    }
  }

  if (geminiFailed) {
    const fallback = tryLocalFallback(query);
    if (fallback) {
      return await executeChatActions(fallback.actions, fallback.reply);
    } else {
      return {
        reply: `Trợ lý AI tạm thời gián đoạn do quá tải hoặc chưa cấu hình API Key (Lỗi: ${geminiErrorMsg}). Vui lòng nhập câu lệnh đầy đủ rõ tên học viên và tác vụ để hệ thống nhận diện nội bộ.`,
        feedback: null
      };
    }
  }
}

function tryLocalFallback(query) {
  const queryLower = query.toLowerCase().trim();
  const actions = [];
  let reply = "";

  // 1. Tab switching
  const tabKeywords = {
    'dashboard': ['dashboard', 'tổng quan', 'trang chủ'],
    'students': ['học viên', 'học sinh', 'danh sách lớp', 'students'],
    'schedules': ['lịch rảnh', 'schedules', 'rảnh'],
    'timetable': ['thời khóa biểu', 'timetable', 'lịch biểu', 'lịch dạy'],
    'optimizer': ['tối ưu', 'optimizer', 'sắp xếp'],
    'ai-assistant': ['giáo án', 'trợ lý', 'ai assistant'],
    'lesson-prep': ['chuẩn bị', 'bài học', 'prep'],
    'quick-notes': ['ghi chú', 'ghi nhớ', 'sổ tay', 'link'],
    'settings': ['cấu hình', 'cài đặt', 'settings', 'api']
  };

  if (queryLower.includes('chuyển') || queryLower.includes('sang tab') || queryLower.includes('mở tab') || queryLower.includes('mở màn hình')) {
    for (const [tab, keywords] of Object.entries(tabKeywords)) {
      if (keywords.some(kw => queryLower.includes(kw))) {
        actions.push({ type: 'switch_tab', tab });
        reply = `[Ngoại tuyến] Đã chuyển sang tab **${tab.toUpperCase()}**.`;
        return { reply, actions };
      }
    }
  }

  // 2. Find student
  let foundStudent = null;
  const sortedStudents = [...state.students].sort((a, b) => b.name.length - a.name.length);
  for (const st of sortedStudents) {
    if (queryLower.includes(st.name.toLowerCase())) {
      foundStudent = st;
      break;
    }
  }

  // Try sub-part name matching if no full name match
  if (!foundStudent) {
    for (const st of sortedStudents) {
      const parts = st.name.toLowerCase().split(/\s+/).filter(p => p.length > 2);
      if (parts.length > 0 && parts.every(part => queryLower.includes(part))) {
        foundStudent = st;
        break;
      }
    }
  }

  // Try extracting new student if add is requested
  if (!foundStudent) {
    const addMatch = query.match(/(?:thêm học viên|thêm học sinh|học viên mới|add)\s+([^,.\n]+)/i);
    if (addMatch) {
      const name = addMatch[1].trim();
      actions.push({
        type: 'add_student',
        name: name,
        gender: queryLower.includes('nữ') ? 'Nữ' : 'Nam'
      });
      reply = `[Ngoại tuyến] Đã tự động tạo học viên mới **${name}**.`;
      return { reply, actions };
    }
  }

  if (foundStudent) {
    const updateAction = { type: 'update_student', name: foundStudent.name };
    let hasUpdate = false;
    let updateDesc = [];

    // Tuition payment
    const payMatch = queryLower.match(/(?:nộp|đóng|nộp thêm|đóng thêm|chuyển|nộp cọc)\s*([\d.,\s]+)\s*(triệu|tr|k|đ|nghìn|ngàn|vnd)?/i);
    if (payMatch) {
      let valStr = payMatch[1].replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '');
      let amount = parseFloat(valStr);
      if (!isNaN(amount)) {
        const unit = payMatch[2];
        if (unit === 'triệu' || unit === 'tr') {
          amount = amount * 1000000;
        } else if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') {
          amount = amount * 1000;
        } else if (amount < 5000) {
          if (amount < 20) amount = amount * 1000000;
          else amount = amount * 1000;
        }
        updateAction.paid_add = amount;
        hasUpdate = true;
        updateDesc.push(`Đóng thêm ${amount.toLocaleString('vi-VN')}đ`);
      }
    }

    // Sessions set/add
    const sessionSetMatch = queryLower.match(/(?:học được|học|đã học|tổng)\s*(\d+)\s*buổi/i);
    if (sessionSetMatch) {
      updateAction.sessions_set = parseInt(sessionSetMatch[1]);
      hasUpdate = true;
      updateDesc.push(`Cập nhật tổng số buổi đã học: ${sessionSetMatch[1]} buổi`);
    } else {
      const sessionAddMatch = queryLower.match(/(?:học thêm|thêm)\s*(\d+)\s*buổi/i);
      if (sessionAddMatch) {
        updateAction.sessions_add = parseInt(sessionAddMatch[1]);
        hasUpdate = true;
        updateDesc.push(`Học thêm ${sessionAddMatch[1]} buổi`);
      }
    }

    // Unexcused absences
    if (queryLower.includes('nghỉ không phép') || queryLower.includes('vắng không phép') || queryLower.includes('nghỉ học') || queryLower.includes('vắng học')) {
      updateAction.absences_add = 1;
      hasUpdate = true;
      updateDesc.push(`Ghi nhận nghỉ không phép (+1)`);
    }

    // Nghỉ hẳn
    if (queryLower.includes('nghỉ hẳn') || queryLower.includes('nghỉ luôn') || queryLower.includes('xóa học viên') || queryLower.includes('nghỉ hẳn học')) {
      actions.push({ type: 'delete_student', name: foundStudent.name });
      reply = `[Ngoại tuyến] Xử lý học viên **${foundStudent.name}** nghỉ hẳn (Đã xóa hồ sơ khỏi danh sách lớp).`;
      return { reply, actions };
    }

    // Weaknesses / Skills practice
    const skillMatch = queryLower.match(/(?:học|tập|yếu|luyện)\s+([^,.\n]+)/i);
    if (skillMatch && !skillMatch[0].includes('buổi') && !skillMatch[0].includes('học viên') && !skillMatch[0].includes('học sinh')) {
      const skillText = skillMatch[1].trim();
      updateAction.weaknesses = skillText;
      hasUpdate = true;
      updateDesc.push(`Ghi nhận bài học hôm nay: "${skillText}"`);
    }

    // AI Lesson generation
    if (queryLower.includes('giáo án') || queryLower.includes('bài học') || queryLower.includes('lộ trình')) {
      let aiType = '90min';
      if (queryLower.includes('1 tháng') || queryLower.includes('tháng')) aiType = '1month';
      if (queryLower.includes('team building') || queryLower.includes('teambuilding')) aiType = 'teambuilding';
      actions.push({
        type: 'generate_lesson',
        name: foundStudent.name,
        aiType,
        customRequest: query
      });
      reply = `[Ngoại tuyến] Đã kích hoạt soạn giáo án cho **${foundStudent.name}** (Loại: ${aiType === '90min' ? '90 phút' : (aiType === '1month' ? '1 tháng' : 'Team building')}).`;
      return { reply, actions };
    }

    if (hasUpdate) {
      actions.push(updateAction);
      reply = `[Ngoại tuyến] Đã cập nhật hồ sơ học viên **${foundStudent.name}**:\n- ` + updateDesc.join('\n- ');
      return { reply, actions };
    }
  }

  // 3. Add quick note
  if (queryLower.includes('ghi chú') || queryLower.includes('ghi nhớ') || queryLower.includes('nhắc nhở')) {
    const titleMatch = query.match(/(?:ghi chú|ghi nhớ|nhắc nhở|sổ tay)\s*(?::|-)?\s*([^,.\n]+)/i);
    const title = titleMatch ? titleMatch[1].trim() : "Ghi chú nhanh";
    actions.push({
      type: 'add_quick_note',
      title: title,
      content: query
    });
    reply = `[Ngoại tuyến] Đã tạo ghi nhớ mới: **${title}**.`;
    return { reply, actions };
  }

  return null;
}

async function executeChatActions(actions, reply) {
  let feedbackMsgs = [];

  if (actions && Array.isArray(actions)) {
    for (const action of actions) {
      switch (action.type) {
        case 'switch_tab':
          const switched = switchTabProgrammatically(action.tab);
          if (switched) {
            feedbackMsgs.push(`Đã chuyển sang tab **${action.tab.toUpperCase()}**`);
          } else {
            feedbackMsgs.push(`Không thể chuyển sang tab **${action.tab}** (tab không hợp lệ)`);
          }
          break;

        case 'add_student':
          if (!action.name) break;
          const newStudent = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            name: action.name,
            gender: action.gender || 'Nam',
            phone: action.phone || '',
            tuition: Number(action.tuition) || 1000000,
            paid: 0,
            status: 'Nợ',
            totalSessions: 12,
            usedSessions: 0,
            unexcusedAbsences: 0,
            strengths: action.strengths || '',
            weaknesses: action.weaknesses || '',
            highlights: action.highlights || '',
            tasks: [...state.settings.defaultTasks.map(t => ({ text: t, completed: false }))],
            availability: {}
          };
          state.students.push(newStudent);
          await saveData();
          renderDashboard();
          renderStudents();
          feedbackMsgs.push(`Đã thêm học viên mới **${action.name}**`);
          break;

        case 'update_student':
          if (!action.name) break;
          const st = findStudentFuzzy(action.name);
          if (!st) {
            feedbackMsgs.push(`Không tìm thấy học viên **${action.name}** trong danh sách để cập nhật`);
            break;
          }
          let updates = [];
          if (action.paid_add) {
            st.paid = (st.paid || 0) + Number(action.paid_add);
            if (st.paid >= (st.tuition || 1000000)) {
              st.status = 'Đã đóng';
            } else if (st.paid > 0) {
              st.status = 'Cọc';
            } else {
              st.status = 'Nợ';
            }
            updates.push(`đóng thêm ${formatMoney(action.paid_add)} (Tổng đã đóng: ${formatMoney(st.paid)}, trạng thái: ${st.status})`);
          }
          if (action.sessions_add) {
            st.usedSessions = (st.usedSessions || 0) + Number(action.sessions_add);
            updates.push(`học thêm ${action.sessions_add} buổi (Tổng: ${st.usedSessions}/${st.totalSessions || 12} buổi)`);
          }
          if (action.sessions_set !== undefined) {
            st.usedSessions = Number(action.sessions_set);
            updates.push(`đặt số buổi đã học thành ${st.usedSessions}/${st.totalSessions || 12}`);
          }
          if (action.absences_add) {
            st.unexcusedAbsences = (st.unexcusedAbsences || 0) + Number(action.absences_add);
            updates.push(`nghỉ không phép thêm ${action.absences_add} buổi (Tổng vắng: ${st.unexcusedAbsences})`);
          }
          if (action.strengths) {
            st.strengths = st.strengths ? `${st.strengths}, ${action.strengths}` : action.strengths;
            updates.push(`cập nhật điểm mạnh: "${action.strengths}"`);
          }
          if (action.weaknesses) {
            st.weaknesses = st.weaknesses ? `${st.weaknesses}, ${action.weaknesses}` : action.weaknesses;
            updates.push(`cập nhật điểm yếu: "${action.weaknesses}"`);
          }
          if (action.highlights) {
            st.highlights = st.highlights ? `${st.highlights}, ${action.highlights}` : action.highlights;
            updates.push(`cập nhật đặc điểm khác: "${action.highlights}"`);
          }
          
          if (updates.length > 0) {
            await saveData();
            renderDashboard();
            renderStudents();
            feedbackMsgs.push(`Cập nhật cho **${st.name}**: ${updates.join(', ')}`);
          } else {
            feedbackMsgs.push(`Không có thông tin cập nhật hợp lệ cho học viên **${st.name}**`);
          }
          break;

        case 'delete_student':
          if (!action.name) break;
          const delSt = findStudentFuzzy(action.name);
          if (delSt) {
            state.students = state.students.filter(s => s.id !== delSt.id);
            await saveData();
            renderDashboard();
            renderStudents();
            feedbackMsgs.push(`Đã xóa học viên **${delSt.name}** khỏi hệ thống (nghỉ hẳn)`);
          }
          break;

        case 'generate_lesson':
          if (!action.name) break;
          const targetSt = findStudentFuzzy(action.name);
          if (!targetSt) {
            feedbackMsgs.push(`Không thể tạo giáo án vì không tìm thấy học viên **${action.name}**`);
            break;
          }
          switchTabProgrammatically('ai-assistant');
          aiStudentSelect.value = targetSt.id;
          aiStudentSelect.dispatchEvent(new Event('change'));
          
          const type = action.aiType || '90min';
          const radio = document.querySelector(`input[name="ai-type"][value="${type}"]`);
          if (radio) radio.checked = true;
          
          aiCustomPrompt.value = action.customRequest || '';
          
          setTimeout(() => {
            btnGenerateAI.click();
          }, 200);
          
          feedbackMsgs.push(`Đã chuyển sang tab AI và bắt đầu tự động tạo giáo án **${type}** cho **${targetSt.name}**`);
          break;

        case 'add_quick_note':
          if (!action.title) break;
          const newNote = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            title: action.title,
            url: '',
            content: action.content || '',
            date: new Date().toLocaleString('vi-VN')
          };
          state.quickNotes.unshift(newNote);
          await saveData();
          renderQuickNotes(notesSearchInput.value);
          feedbackMsgs.push(`Đã thêm ghi chú mới: "**${action.title}**"`);
          break;

        case 'add_goal':
          if (!action.text) break;
          const newGoal = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            title: action.text,
            targetCount: 10,
            manualProgress: 0
          };
          state.timetableGoals.push(newGoal);
          await saveData();
          renderTimetableGoals();
          feedbackMsgs.push(`Đã thêm mục tiêu thời khóa biểu: "**${action.text}**"`);
          break;
      }
    }
  }

  const feedbackText = feedbackMsgs.length > 0 
    ? `⚡ **Hệ thống đã thực hiện:**<br>• ${feedbackMsgs.join('<br>• ')}`
    : null;

  return {
    reply,
    feedback: feedbackText
  };
}


