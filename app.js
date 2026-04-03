// Supabase 配置
const SUPABASE_URL = 'https://ejcndbhqzxblbiclnpcp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4B8ZfjuDcEs9NX6hxdYUbA_qHafIkF3';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 机台类型标签
const MACHINE_TYPES = {
  three_zone: '三箱式恒温恒湿箱',
  constant: '恒温恒湿箱',
  thermal_shock: '冷热冲击箱',
  rapid_temp: '快速温变箱',
  xenon: '氙灯老化试验箱',
  qsun: 'Q-SUN氙灯实验箱'
};

// 状态标签
const STATUS_LABELS = {
  running: '运行中',
  idle: '空闲',
  completed: '已完成',
  alert: '告警'
};

// 全局数据
let machines = [];
let refreshInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 导航切换
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const page = item.dataset.page;
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`${page}-page`).classList.add('active');
    });
  });
  
  // 加载数据
  loadMachines();
  refreshInterval = setInterval(loadMachines, 10000);
});

// 加载机台列表
async function loadMachines() {
  try {
    const { data, error } = await supabase
      .from('machines')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    machines = data || [];
    
    // 获取每个机台的当前试验
    for (const machine of machines) {
      const { data: exp } = await supabase
        .from('experiments')
        .select('*')
        .eq('machine_id', machine.id)
        .eq('status', 'running')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      machine.currentExperiment = exp;
    }
    
    updateStats();
    renderMachineGrid();
    renderMachineTable();
  } catch (error) {
    console.error('加载机台失败:', error);
    showToast('加载失败: ' + error.message);
  }
}

// 更新统计
function updateStats() {
  const now = new Date();
  document.getElementById('stat-total').textContent = machines.length;
  document.getElementById('stat-running').textContent = machines.filter(m => 
    m.currentExperiment && m.currentExperiment.status === 'running' && 
    now < new Date(m.currentExperiment.end_time)
  ).length;
  document.getElementById('stat-idle').textContent = machines.filter(m => 
    !m.currentExperiment
  ).length;
  document.getElementById('stat-completed').textContent = machines.filter(m => 
    m.currentExperiment && m.currentExperiment.status === 'running' && 
    now >= new Date(m.currentExperiment.end_time)
  ).length;
}

// 渲染机台卡片
function renderMachineGrid() {
  const grid = document.getElementById('machine-grid');
  
  if (machines.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <p style="font-size:18px;font-weight:500;margin-bottom:12px">暂无机台</p>
        <button class="btn btn-primary" onclick="showAddMachineModal()">添加第一个机台</button>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = machines.map(machine => {
    const exp = machine.currentExperiment;
    let status = 'idle';
    if (exp && exp.status === 'running') {
      status = new Date() >= new Date(exp.end_time) ? 'completed' : 'running';
    }
    
    return `
      <div class="machine-card ${status}">
        <div class="card-header">
          <div>
            <h3>${machine.name}</h3>
            <div class="code">${machine.code} · ${machine.location}</div>
            <div class="type">${MACHINE_TYPES[machine.type]}</div>
          </div>
          <span class="status-badge ${status}">${STATUS_LABELS[status]}</span>
        </div>
        
        ${status === 'running' ? renderRunningCard(machine, exp) : ''}
        ${status === 'idle' ? renderIdleCard(machine) : ''}
        ${status === 'completed' ? renderCompletedCard() : ''}
      </div>
    `;
  }).join('');
}

function renderRunningCard(machine, exp) {
  const remaining = Math.max(0, new Date(exp.end_time) - new Date());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const timeStr = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  const timeClass = remaining <= 60000 ? 'danger' : remaining <= 300000 ? 'warning' : '';
  
  const isThreeZone = machine.type === 'three_zone' && exp.settings && exp.settings.zone1;
  let settingsHtml = '';
  if (isThreeZone) {
    settingsHtml = ['zone1','zone2','zone3'].map((z, i) => 
      `<div class="row"><span class="label">箱${i+1}</span><span>${exp.settings[z].temperature}°C / ${exp.settings[z].humidity}%RH</span></div>`
    ).join('');
  } else {
    settingsHtml = `<div class="row"><span class="label">目标温湿度</span><span>${exp.settings.temperature}°C / ${exp.settings.humidity}%RH</span></div>`;
  }
  
  return `
    <div class="card-body">
      <div class="row"><span class="label">机种</span><span>${exp.product_name}</span></div>
      ${settingsHtml}
      <div class="row"><span class="label">剩余时间</span></div>
      <div class="countdown ${timeClass}">${timeStr}</div>
    </div>
    <div class="card-actions">
      <button class="btn btn-danger btn-sm" onclick="stopExperiment(${exp.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>
        停止试验
      </button>
    </div>
  `;
}

function renderIdleCard(machine) {
  return `
    <div class="card-actions">
      <button class="btn btn-primary btn-sm" onclick="showStartExpModal(${machine.id}, '${machine.type}', '${machine.name}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        启动试验
      </button>
    </div>
  `;
}

function renderCompletedCard() {
  return `
    <div class="card-body" style="text-align:center;padding:16px;background:#fef3c7;border-radius:8px;color:#d97706;font-size:13px">
      试验已完成
    </div>
  `;
}

// 渲染机台表格
function renderMachineTable() {
  const tbody = document.getElementById('machine-table-body');
  
  if (machines.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无机台，请先添加机台</td></tr>';
    return;
  }
  
  tbody.innerHTML = machines.map(m => `
    <tr>
      <td>${m.name}</td>
      <td>${m.code}</td>
      <td>${m.location || '-'}</td>
      <td>${MACHINE_TYPES[m.type]}</td>
      <td style="text-align:right">
        <button class="btn btn-outline btn-sm" onclick="deleteMachine(${m.id})" style="color:var(--status-alert);border-color:var(--status-alert)">
          删除
        </button>
      </td>
    </tr>
  `).join('');
}

// 显示新增机台弹窗
function showAddMachineModal() {
  document.getElementById('add-machine-modal').classList.remove('hidden');
  document.getElementById('add-name').value = '';
  document.getElementById('add-code').value = '';
  document.getElementById('add-location').value = '';
}

// 显示启动试验弹窗
function showStartExpModal(machineId, machineType, machineName) {
  document.getElementById('start-exp-modal').classList.remove('hidden');
  document.getElementById('exp-machine-id').value = machineId;
  document.getElementById('exp-machine-type').value = machineType;
  document.getElementById('exp-machine-name').textContent = machineName;
  document.getElementById('exp-product').value = '';
  document.getElementById('exp-duration').value = '';
  document.getElementById('exp-temp').value = '25';
  document.getElementById('exp-humidity').value = '50';
  
  // 三箱式显示多组设置
  const container = document.getElementById('temp-humidity-settings');
  if (machineType === 'three_zone') {
    container.innerHTML = `
      <div class="zone-settings">
        ${['zone1','zone2','zone3'].map((z, i) => `
          <div class="zone-row">
            <span style="font-size:12px;font-weight:500">箱${i+1}</span>
            <div>
              <label>温度 (°C)</label>
              <input type="number" id="exp-${z}-temp" value="25">
            </div>
            <div>
              <label>湿度 (%RH)</label>
              <input type="number" id="exp-${z}-humidity" value="50">
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="display:flex;gap:12px;">
        <div style="flex:1">
          <label style="font-size:11px;color:var(--text-muted)">温度 (°C)</label>
          <input type="number" id="exp-temp" value="25">
        </div>
        <div style="flex:1">
          <label style="font-size:11px;color:var(--text-muted)">湿度 (%RH)</label>
          <input type="number" id="exp-humidity" value="50">
        </div>
      </div>
    `;
  }
}

// 隐藏弹窗
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// 添加机台
async function addMachine(e) {
  e.preventDefault();
  
  const data = {
    name: document.getElementById('add-name').value,
    code: document.getElementById('add-code').value,
    location: document.getElementById('add-location').value,
    type: document.getElementById('add-type').value
  };
  
  try {
    const { error } = await supabase.from('machines').insert([data]);
    if (error) throw error;
    
    hideModal('add-machine-modal');
    showToast('机台创建成功');
    loadMachines();
  } catch (error) {
    showToast('创建失败: ' + error.message);
  }
}

// 删除机台
async function deleteMachine(id) {
  if (!confirm('确定要删除这个机台吗？')) return;
  
  try {
    const { error } = await supabase.from('machines').delete().eq('id', id);
    if (error) throw error;
    
    showToast('机台删除成功');
    loadMachines();
  } catch (error) {
    showToast('删除失败: ' + error.message);
  }
}

// 启动试验
async function startExperiment(e) {
  e.preventDefault();
  
  const machineId = parseInt(document.getElementById('exp-machine-id').value);
  const machineType = document.getElementById('exp-machine-type').value;
  const productName = document.getElementById('exp-product').value;
  const duration = parseInt(document.getElementById('exp-duration').value);
  
  let settings;
  if (machineType === 'three_zone') {
    settings = {
      zone1: {
        temperature: parseInt(document.getElementById('exp-zone1-temp').value),
        humidity: parseInt(document.getElementById('exp-zone1-humidity').value)
      },
      zone2: {
        temperature: parseInt(document.getElementById('exp-zone2-temp').value),
        humidity: parseInt(document.getElementById('exp-zone2-humidity').value)
      },
      zone3: {
        temperature: parseInt(document.getElementById('exp-zone3-temp').value),
        humidity: parseInt(document.getElementById('exp-zone3-humidity').value)
      }
    };
  } else {
    settings = {
      temperature: parseInt(document.getElementById('exp-temp').value),
      humidity: parseInt(document.getElementById('exp-humidity').value)
    };
  }
  
  const now = new Date();
  const endTime = new Date(now.getTime() + duration * 60000);
  
  try {
    const { error } = await supabase.from('experiments').insert([{
      machine_id: machineId,
      product_name: productName,
      test_duration: duration,
      start_time: now.toISOString(),
      end_time: endTime.toISOString(),
      status: 'running',
      settings: settings
    }]);
    
    if (error) throw error;
    
    hideModal('start-exp-modal');
    showToast('试验启动成功');
    loadMachines();
  } catch (error) {
    showToast('启动失败: ' + error.message);
  }
}

// 停止试验
async function stopExperiment(expId) {
  if (!confirm('确定要停止当前试验吗？')) return;
  
  try {
    const { error } = await supabase.from('experiments').update({ status: 'stopped' }).eq('id', expId);
    if (error) throw error;
    
    showToast('试验已停止');
    loadMachines();
  } catch (error) {
    showToast('停止失败: ' + error.message);
  }
}

// 显示提示
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}
