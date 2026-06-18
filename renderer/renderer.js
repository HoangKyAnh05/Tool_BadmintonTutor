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
const aiOutputContainer = document.getElementById('ai-output-container');
const aiCustomPrompt = document.getElementById('ai-custom-prompt');

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
  if (!state.quickNotes) state.quickNotes = [];

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
        <button class="btn btn-danger-outline btn-sm btn-delete-student" data-id="${st.id}">
          Xóa
        </button>
      </div>
    `;

    // Wire button events
    card.querySelector('.btn-edit-student').addEventListener('click', () => openStudentModal(st.id));
    card.querySelector('.btn-delete-student').addEventListener('click', () => deleteStudent(st.id));

    studentsGridContainer.appendChild(card);
  });
}

function setupStudentsEvents() {
  btnOpenAddStudentModal.addEventListener('click', () => openStudentModal());
  studentSearchInput.addEventListener('input', () => renderStudents());
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

  // Global mouseup release listener
  window.addEventListener('mouseup', () => {
    if (isMouseDown) {
      isMouseDown = false;
      saveData(); // Save updates to file when user releases click
    }
  });

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
  // Already bound inside builder
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
  notesSearchInput.addEventListener('input', (e) => {
    renderQuickNotes(e.target.value);
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

