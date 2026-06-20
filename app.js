// Global State Variables
let windowProjectData = [];
let filteredData = [];
let groupFilterList = [];
let statusChartInstance = null;
let departmentChartInstance = null;

// Sorting State
let currentSortField = 'รหัสโครงการ';
let currentSortOrder = 'asc'; // 'asc' or 'desc'

// Theme Control
const themeToggleBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

// Google Sheet URL (JSONP Format Endpoint)
// We request via JSONP because it completely bypasses CORS and works when opened directly via file://
const SPREADSHEET_ID = '1549_DZM4EcJ-XBeWTvFzMziY1sn4rUz_fqYvpz58DBI';
const SPREADSHEET_JSONP_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:handleGoogleSheetResponse`;

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupEventListeners();
  loadData();
});

// Theme Initialization & Toggle
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);
}

function updateThemeUI(theme) {
  if (theme === 'dark') {
    themeIcon.className = 'fa-solid fa-sun';
    if (themeToggleBtn.childNodes[2]) {
      themeToggleBtn.childNodes[2].nodeValue = ' โหมดกลางวัน';
    }
  } else {
    themeIcon.className = 'fa-solid fa-moon';
    if (themeToggleBtn.childNodes[2]) {
      themeToggleBtn.childNodes[2].nodeValue = ' โหมดกลางคืน';
    }
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeUI(newTheme);
  
  // Re-render charts to apply theme text colors
  if (windowProjectData.length > 0) {
    renderCharts(windowProjectData);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Theme Toggle
  themeToggleBtn.addEventListener('click', toggleTheme);
  
  // Refresh Button
  document.getElementById('refresh-btn').addEventListener('click', loadData);
  
  // Filters and Search Input
  document.getElementById('search-input').addEventListener('input', () => renderTable(windowProjectData));
  document.getElementById('group-filter').addEventListener('change', () => renderTable(windowProjectData));
  document.getElementById('status-filter').addEventListener('change', () => renderTable(windowProjectData));
  
  // Modal Close
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.getElementById('project-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('project-modal')) {
      closeModal();
    }
  });
}

// Load Data from Google Sheet using JSONP
function loadData() {
  const loadingScreen = document.getElementById('loading-screen');
  const dashboardContent = document.getElementById('dashboard-content');
  const syncText = document.getElementById('sync-text');
  const refreshBtn = document.getElementById('refresh-btn');
  const refreshIcon = document.getElementById('refresh-icon');
  
  // Reset Loading Screen layout in case of previous errors
  loadingScreen.innerHTML = `
    <div class="spinner"></div>
    <p style="font-weight: 500;">กำลังดึงข้อมูลโครงการล่าสุดจาก Google Sheet...</p>
  `;
  
  // Set Loading State
  loadingScreen.style.display = 'flex';
  dashboardContent.style.display = 'none';
  refreshBtn.disabled = true;
  refreshIcon.classList.add('spin');
  syncText.innerHTML = '<i class="fa-solid fa-spinner spin"></i> กำลังซิงค์ข้อมูล...';

  // Remove previous script tag if it exists
  const oldScript = document.getElementById('gviz-jsonp-script');
  if (oldScript) {
    oldScript.remove();
  }

  // Define the global JSONP callback handler
  window.handleGoogleSheetResponse = function(response) {
    try {
      if (!response || response.status !== 'ok' || !response.table) {
        throw new Error('โครงสร้างข้อมูล Google Sheet ไม่ถูกต้องหรือไม่พร้อมใช้งานแบบสาธารณะ');
      }
      
      const cols = response.table.cols.map((col, idx) => col.label || col.id || `col_${idx}`);
      const parsedData = response.table.rows.map(row => {
        const item = {};
        response.table.cols.forEach((col, index) => {
          const cell = row.c[index];
          const colName = col.label || col.id || `col_${index}`;
          
          let val = "";
          if (cell && cell.v !== null && cell.v !== undefined) {
            val = cell.v;
          }
          
          // Post-processing and type conversions
          if (colName === 'งบประมาณ' || colName === 'ใช้ไปแล้ว' || colName === 'คงเหลือ') {
            if (typeof val === 'number') {
              item[colName] = val;
            } else {
              item[colName] = parseFloat(val.toString().replace(/,/g, '')) || 0;
            }
          } else if (colName === 'ความคืบหน้า') {
            if (cell && cell.f && cell.f.includes('%')) {
              item[colName] = parseFloat(cell.f.replace(/%/g, '').trim()) || 0;
            } else {
              let pVal = parseFloat(val) || 0;
              // If entered as decimal percentage e.g. 0.1235 in sheet
              if (pVal > 0 && pVal <= 1) {
                pVal = pVal * 100;
              }
              item[colName] = pVal;
            }
          } else {
            item[colName] = val.toString();
          }
        });
        
        // Safety check: if remaining budget is not filled, calculate it
        if (item['คงเหลือ'] === undefined || item['คงเหลือ'] === "") {
          item['คงเหลือ'] = (item['งบประมาณ'] || 0) - (item['ใช้ไปแล้ว'] || 0);
        }
        
        return item;
      });

      windowProjectData = parsedData;
      
      // Update UI elements
      renderKPIs(windowProjectData);
      renderCharts(windowProjectData);
      populateGroupFilter(windowProjectData);
      renderTable(windowProjectData);
      
      // Update last updated timestamp
      const now = new Date();
      const formattedDate = now.toLocaleDateString('th-TH', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }) + ' เวลา ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.';
      document.getElementById('last-updated').textContent = `อัปเดตล่าสุด: ${formattedDate}`;
      
      // Show Dashboard Content
      loadingScreen.style.display = 'none';
      dashboardContent.style.display = 'flex';
      syncText.innerHTML = '<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> เชื่อมต่อข้อมูลสด';
      
    } catch (error) {
      handleError(error);
    } finally {
      cleanup();
    }
  };

  // Create JSONP script element
  const script = document.createElement('script');
  script.id = 'gviz-jsonp-script';
  // Add timestamp cache bust
  script.src = `${SPREADSHEET_JSONP_URL}&cache_bust=${Date.now()}`;
  
  // Script loading error fallback (e.g., offline state)
  script.onerror = function() {
    handleError(new Error('ไม่สามารถดึงข้อมูลจาก Google Sheet ได้ โปรดตรวจสอบการเชื่อมต่ออินเทอร์เน็ต และสถานะการแชร์ของชีต'));
    cleanup();
  };

  document.body.appendChild(script);

  function handleError(error) {
    console.error(error);
    syncText.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i> เชื่อมต่อล้มเหลว';
    
    // Display a beautiful error panel with retry button on the UI
    loadingScreen.innerHTML = `
      <div style="text-align: center; max-width: 480px; padding: 2.5rem; background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 16px; box-shadow: var(--card-shadow);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 3rem; color: var(--danger); margin-bottom: 1.25rem;"></i>
        <h3 style="font-weight: 600; font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text-primary);">ดึงข้อมูลผิดพลาด</h3>
        <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem; line-height: 1.5;">${error.message}</p>
        <button onclick="loadData()" class="btn btn-primary" style="padding: 0.6rem 1.5rem;"><i class="fa-solid fa-arrows-rotate"></i> ลองเชื่อมต่อใหม่อีกครั้ง</button>
      </div>
    `;
  }

  function cleanup() {
    refreshBtn.disabled = false;
    refreshIcon.classList.remove('spin');
  }
}

// Render KPI Cards
function renderKPIs(data) {
  const totalProjects = data.length;
  
  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;
  let totalBudget = 0;
  let totalSpent = 0;
  
  data.forEach(item => {
    const status = item['สถานะ'];
    if (status === 'ดำเนินการแล้ว') completed++;
    else if (status === 'อยู่ระหว่างดำเนินการ') inProgress++;
    else notStarted++;
    
    totalBudget += item['งบประมาณ'];
    totalSpent += item['ใช้ไปแล้ว'];
  });
  
  const totalRemaining = totalBudget - totalSpent;
  const spentPercent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const remainingPercent = totalBudget > 0 ? (totalRemaining / totalBudget) * 100 : 0;
  
  // Format currencies
  const formatCurrency = (val) => '฿' + new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
  
  // Set KPI values in DOM
  document.getElementById('kpi-total-projects').textContent = totalProjects;
  document.getElementById('kpi-project-split').textContent = `เสร็จสิ้น: ${completed} | ดำเนินการอยู่: ${inProgress} | ยังไม่เริ่ม: ${notStarted}`;
  
  document.getElementById('kpi-total-budget').textContent = formatCurrency(totalBudget);
  
  document.getElementById('kpi-total-spent').textContent = formatCurrency(totalSpent);
  document.getElementById('kpi-spent-percent').textContent = `คิดเป็น ${spentPercent.toFixed(2)}% ของงบทั้งหมด`;
  
  document.getElementById('kpi-total-remaining').textContent = formatCurrency(totalRemaining);
  document.getElementById('kpi-remaining-percent').textContent = `คงเหลือ ${remainingPercent.toFixed(2)}% สำหรับดำเนินงาน`;
}

// Render Chart.js
function renderCharts(data) {
  // Check active theme colors
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const labelColor = currentTheme === 'dark' ? '#8fa395' : '#607567';
  const gridColor = currentTheme === 'dark' ? '#27382d' : '#d6e2d7';
  const isDark = currentTheme === 'dark';
  
  // Custom Pastel Green Palette mapping for Charts
  const completedColor = isDark ? '#4dbd7f' : '#2d7a4d'; // Primary Green
  const inProgressColor = isDark ? '#22d3ee' : '#3a8d9b'; // Teal
  const pendingColor = isDark ? '#fbbf24' : '#df8a28'; // Pastel Amber/Orange
  
  // 1. Project Status Chart (Doughnut)
  let statusCounts = { 'ยังไม่ดำเนินการ': 0, 'อยู่ระหว่างดำเนินการ': 0, 'ดำเนินการแล้ว': 0 };
  data.forEach(item => {
    const status = item['สถานะ'];
    if (statusCounts[status] !== undefined) {
      statusCounts[status]++;
    } else {
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  });
  
  const statusCtx = document.getElementById('statusChart').getContext('2d');
  if (statusChartInstance) {
    statusChartInstance.destroy();
  }
  
  statusChartInstance = new Chart(statusCtx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: [
          pendingColor,    // ยังไม่ดำเนินการ
          inProgressColor, // อยู่ระหว่างดำเนินการ
          completedColor   // ดำเนินการแล้ว
        ],
        borderWidth: isDark ? 2 : 1,
        borderColor: isDark ? '#17221b' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Prompt', size: 12 },
            color: labelColor
          }
        }
      }
    }
  });
  
  // 2. Budget by Department Chart (Grouped Bar Chart)
  const deptData = {};
  data.forEach(item => {
    const dept = item['กลุ่มงาน'] || 'ทั่วไป';
    if (!deptData[dept]) {
      deptData[dept] = { budget: 0, spent: 0 };
    }
    deptData[dept].budget += item['งบประมาณ'];
    deptData[dept].spent += item['ใช้ไปแล้ว'];
  });
  
  const departments = Object.keys(deptData);
  const budgets = departments.map(d => deptData[d].budget);
  const spents = departments.map(d => deptData[d].spent);
  
  const deptCtx = document.getElementById('departmentChart').getContext('2d');
  if (departmentChartInstance) {
    departmentChartInstance.destroy();
  }
  
  departmentChartInstance = new Chart(deptCtx, {
    type: 'bar',
    data: {
      labels: departments,
      datasets: [
        {
          label: 'งบประมาณจัดสรร',
          data: budgets,
          backgroundColor: completedColor,
          borderRadius: 4
        },
        {
          label: 'งบประมาณเบิกจ่าย',
          data: spents,
          backgroundColor: pendingColor,
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Prompt', size: 12 },
            color: labelColor
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: { family: 'Prompt', size: 11 },
            color: labelColor
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            font: { family: 'Prompt', size: 11 },
            color: labelColor,
            callback: function(value) {
              return value.toLocaleString('th-TH');
            }
          },
          grid: {
            color: gridColor
          }
        }
      }
    }
  });
}

// Populate Department Filter Dropdown
function populateGroupFilter(data) {
  const groupSelect = document.getElementById('group-filter');
  const selectedVal = groupSelect.value;
  
  // Find unique departments
  const departments = [...new Set(data.map(item => item['กลุ่มงาน']).filter(Boolean))];
  
  // Only recreate if list changed
  if (JSON.stringify(departments.sort()) !== JSON.stringify(groupFilterList.sort())) {
    groupFilterList = departments;
    
    // Clear and restore first option
    groupSelect.innerHTML = '<option value="all">ทุกกลุ่มงาน (ทั้งหมด)</option>';
    
    departments.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept;
      option.textContent = dept;
      groupSelect.appendChild(option);
    });
    
    // Restore selection if it still exists
    if (departments.includes(selectedVal)) {
      groupSelect.value = selectedVal;
    }
  }
}

// Render Table Rows with Search, Filters, and Sorting
function renderTable(data) {
  const searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
  const groupFilter = document.getElementById('group-filter').value;
  const statusFilter = document.getElementById('status-filter').value;
  const tableBody = document.getElementById('projects-table-body');
  
  // Filter Data
  filteredData = data.filter(item => {
    // 1. Search Query
    const id = (item['รหัสโครงการ'] || '').toString().toLowerCase();
    const name = (item['ชื่อโครงการ'] || '').toLowerCase();
    const owner = (item['ผู้รับผิดชอบ'] || '').toLowerCase();
    const matchesSearch = id.includes(searchQuery) || name.includes(searchQuery) || owner.includes(searchQuery);
    
    // 2. Department Filter
    const matchesGroup = groupFilter === 'all' || item['กลุ่มงาน'] === groupFilter;
    
    // 3. Status Filter
    const matchesStatus = statusFilter === 'all' || item['สถานะ'] === statusFilter;
    
    return matchesSearch && matchesGroup && matchesStatus;
  });
  
  // Sort Data
  filteredData.sort((a, b) => {
    let valA = a[currentSortField];
    let valB = b[currentSortField];
    
    // Handle string sorting (case insensitive) vs numeric sorting
    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
      return currentSortOrder === 'asc' ? valA.localeCompare(valB, 'th') : valB.localeCompare(valA, 'th');
    } else {
      // Numbers
      return currentSortOrder === 'asc' ? valA - valB : valB - valA;
    }
  });
  
  // Clear Table
  tableBody.innerHTML = '';
  
  // Check if empty
  if (filteredData.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2.5rem; color: var(--text-secondary);">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 0.5rem; display: block; opacity: 0.5;"></i>
          ไม่พบข้อมูลแผนงานโครงการตามเงื่อนไขที่เลือก
        </td>
      </tr>
    `;
    return;
  }
  
  // Populate Rows
  filteredData.forEach(item => {
    const tr = document.createElement('tr');
    
    // Format Currencies
    const formatCurrency = (val) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0 }).format(val);
    
    // Status Badge
    let statusClass = 'badge-info';
    if (item['สถานะ'] === 'ดำเนินการแล้ว') statusClass = 'badge-success';
    else if (item['สถานะ'] === 'ยังไม่ดำเนินการ') statusClass = 'badge-warning';
    
    // Progress fill colors
    let progressColor = '';
    if (item['ความคืบหน้า'] >= 100) progressColor = 'success';
    else if (item['ความคืบหน้า'] > 0) progressColor = 'warning';
    else progressColor = 'danger';
    
    tr.innerHTML = `
      <td style="font-weight: 600;">${item['รหัสโครงการ']}</td>
      <td style="white-space: normal; min-width: 200px; font-weight: 500;">${item['ชื่อโครงการ']}</td>
      <td>${item['กลุ่มงาน']}</td>
      <td>${item['ผู้รับผิดชอบ']}</td>
      <td style="text-align: right; font-weight: 500;">฿${formatCurrency(item['งบประมาณ'])}</td>
      <td style="text-align: right; color: var(--text-secondary);">฿${formatCurrency(item['ใช้ไปแล้ว'])}</td>
      <td style="text-align: right; font-weight: 500;">฿${formatCurrency(item['คงเหลือ'])}</td>
      <td>
        <div class="progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill ${progressColor}" style="width: ${item['ความคืบหน้า']}%"></div>
          </div>
          <span class="progress-text">${item['ความคืบหน้า']}%</span>
        </div>
      </td>
      <td>
        <span class="badge ${statusClass}">${item['สถานะ']}</span>
      </td>
    `;
    
    // Click row to view details modal
    tr.addEventListener('click', () => openModal(item));
    tableBody.appendChild(tr);
  });
  
  updateSortIcons();
}

// Handle Column Header Sorting
function sortTable(field) {
  if (currentSortField === field) {
    currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortField = field;
    currentSortOrder = 'asc';
  }
  renderTable(windowProjectData);
}

// Update Sort Arrow Icons in Table Headers
function updateSortIcons() {
  const headers = document.querySelectorAll('th');
  const fieldMapping = [
    'รหัสโครงการ', 'ชื่อโครงการ', 'กลุ่มงาน', 'ผู้รับผิดชอบ', 
    'งบประมาณ', 'ใช้ไปแล้ว', 'คงเหลือ', 'ความคืบหน้า', 'สถานะ'
  ];
  
  headers.forEach((th, index) => {
    const icon = th.querySelector('.sort-icon');
    if (!icon) return;
    
    const field = fieldMapping[index];
    if (field === currentSortField) {
      if (currentSortOrder === 'asc') {
        icon.className = 'fa-solid fa-sort-up sort-icon';
        icon.style.color = 'var(--primary)';
      } else {
        icon.className = 'fa-solid fa-sort-down sort-icon';
        icon.style.color = 'var(--primary)';
      }
    } else {
      icon.className = 'fa-solid fa-sort sort-icon';
      icon.style.color = 'var(--text-secondary)';
    }
  });
}

// Open Project Details Modal
function openModal(project) {
  const formatCurrency = (val) => '฿' + new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0 }).format(val);
  
  document.getElementById('modal-project-name').textContent = project['ชื่อโครงการ'];
  document.getElementById('modal-project-id').textContent = project['รหัสโครงการ'];
  document.getElementById('modal-project-group').textContent = project['กลุ่มงาน'];
  document.getElementById('modal-project-owner').textContent = project['ผู้รับผิดชอบ'];
  
  // Status badge inside modal
  const statusSpan = document.getElementById('modal-project-status');
  statusSpan.textContent = project['สถานะ'];
  let statusClass = 'badge badge-info';
  if (project['สถานะ'] === 'ดำเนินการแล้ว') statusClass = 'badge badge-success';
  else if (project['สถานะ'] === 'ยังไม่ดำเนินการ') statusClass = 'badge badge-warning';
  statusSpan.className = statusClass;
  
  // Budget and Progress
  document.getElementById('modal-project-budget').textContent = formatCurrency(project['งบประมาณ']);
  document.getElementById('modal-project-progress-text').textContent = project['ความคืบหน้า'].toFixed(2) + '%';
  
  // Set progress bar fill in modal
  const progressFill = document.getElementById('modal-project-progress-fill');
  progressFill.style.width = project['ความคืบหน้า'] + '%';
  if (project['ความคืบหน้า'] >= 100) {
    progressFill.className = 'progress-bar-fill success';
  } else if (project['ความคืบหน้า'] > 0) {
    progressFill.className = 'progress-bar-fill warning';
  } else {
    progressFill.className = 'progress-bar-fill danger';
  }
  
  // Calculate budget splits
  const budget = project['งบประมาณ'];
  const spent = project['ใช้ไปแล้ว'];
  const remaining = project['คงเหลือ'];
  
  const spentPercent = budget > 0 ? (spent / budget) * 100 : 0;
  const remainingPercent = budget > 0 ? (remaining / budget) * 100 : 100;
  
  // Set widths for comparison bar
  const spentBar = document.getElementById('modal-budget-spent');
  const remainBar = document.getElementById('modal-budget-remain');
  
  if (budget === 0) {
    spentBar.style.width = '0%';
    spentBar.textContent = '0%';
    spentBar.style.display = 'none';
    
    remainBar.style.width = '100%';
    remainBar.textContent = '0%';
    remainBar.style.display = 'flex';
  } else {
    spentBar.style.display = spentPercent > 0 ? 'flex' : 'none';
    spentBar.style.width = spentPercent + '%';
    spentBar.textContent = spentPercent.toFixed(0) + '%';
    
    remainBar.style.display = remainingPercent > 0 ? 'flex' : 'none';
    remainBar.style.width = remainingPercent + '%';
    remainBar.textContent = remainingPercent.toFixed(0) + '%';
  }
  
  // Set Legend texts
  document.getElementById('modal-spent-legend-text').textContent = `เบิกจ่ายแล้ว: ${formatCurrency(spent)} (${spentPercent.toFixed(1)}%)`;
  document.getElementById('modal-remain-legend-text').textContent = `งบประมาณคงเหลือ: ${formatCurrency(remaining)} (${remainingPercent.toFixed(1)}%)`;
  
  // Show Modal
  document.getElementById('project-modal').classList.add('active');
}

// Close Project Details Modal
function closeModal() {
  document.getElementById('project-modal').classList.remove('active');
}
