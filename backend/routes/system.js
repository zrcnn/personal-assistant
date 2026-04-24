const express = require('express');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();

// CPU usage sampling (need two readings)
let cpuSample = null;
setInterval(() => {
  try {
    const stat = fs.readFileSync('/proc/stat', 'utf8');
    const line = stat.match(/^cpu\s+(.+)/)[1].split(/\s+/).map(Number);
    const idle = line[3];
    const total = line.reduce((a, b) => a + b, 0);
    if (cpuSample) {
      const idleDiff = idle - cpuSample.idle;
      const totalDiff = total - cpuSample.total;
      cpuSample.usage = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
    }
    cpuSample = { idle, total, usage: cpuSample?.usage || 0 };
  } catch {}
}, 2000);

function getCpuInfo() {
  try {
    const cpuinfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
    const modelMatch = cpuinfo.match(/model name\s*:\s*(.+)/);
    const model = modelMatch ? modelMatch[1].trim() : 'Unknown CPU';
    const cpuCount = os.cpus().length;
    return { model, cores: cpuCount, usage: cpuSample?.usage || 0 };
  } catch {
    return { model: 'Unknown', cores: os.cpus().length, usage: 0 };
  }
}

function getMemoryInfo() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
    
    const total = totalMatch ? parseInt(totalMatch[1]) : 0;
    const available = availMatch ? parseInt(availMatch[1]) : 0;
    const used = total - available;
    
    return {
      total: Math.round(total / 1024),      // MB
      used: Math.round(used / 1024),
      available: Math.round(available / 1024),
      usagePercent: total > 0 ? Math.round((used / total) * 100) : 0
    };
  } catch {
    return { total: 0, used: 0, available: 0, usagePercent: 0 };
  }
}

function getDiskInfo() {
  try {
    const df = execSync("df -h --output=size,used,avail,target -x tmpfs -x devtmpfs 2>/dev/null | tail -n +2").toString().trim();
    const disks = [];
    
    for (const line of df.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const mount = parts[3];
        if (mount === '/' || mount.startsWith('/mnt') || mount.startsWith('/media') || mount.startsWith('/home')) {
          disks.push({
            mount,
            total: parts[0],
            used: parts[1],
            available: parts[2],
            // Parse percentage from raw df
            mountPath: mount
          });
        }
      }
    }
    
    // Get more accurate usage with percentages
    const dfPct = execSync("df --output=target,pcent -x tmpfs -x devtmpfs 2>/dev/null | tail -n +2").toString().trim();
    const pctMap = {};
    for (const line of dfPct.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        pctMap[parts[0]] = parseInt(parts[1]);
      }
    }
    
    return disks.map(d => ({
      mount: d.mount,
      total: d.total,
      used: d.used,
      available: d.available,
      usagePercent: pctMap[d.mount] || 0
    }));
  } catch {
    return [];
  }
}

function getTemperature() {
  try {
    // Try thermal zone files
    const thermalZones = fs.readdirSync('/sys/class/thermal').filter(f => f.startsWith('thermal_zone'));
    const temps = [];
    
    for (const zone of thermalZones.slice(0, 4)) {
      const typeFile = `/sys/class/thermal/${zone}/type`;
      const tempFile = `/sys/class/thermal/${zone}/temp`;
      
      if (fs.existsSync(typeFile) && fs.existsSync(tempFile)) {
        const type = fs.readFileSync(typeFile, 'utf8').trim();
        const rawTemp = parseInt(fs.readFileSync(tempFile, 'utf8').trim());
        
        if (!isNaN(rawTemp) && rawTemp > 0) {
          temps.push({
            name: type,
            temp: Math.round(rawTemp / 1000), // Convert millidegree to degree
            tempRaw: rawTemp
          });
        }
      }
    }
    
    // If no thermal zones, try sensors command
    if (temps.length === 0) {
      try {
        const sensors = execSync('sensors -j 2>/dev/null', { timeout: 3000 });
        const data = JSON.parse(sensors.toString());
        for (const [chip, readings] of Object.entries(data)) {
          for (const [key, val] of Object.entries(readings)) {
            if (val.temp1_input !== undefined) {
              temps.push({
                name: key,
                temp: Math.round(val.temp1_input)
              });
            }
          }
        }
      } catch {}
    }
    
    // Get overall temp
    const overall = temps.length > 0
      ? Math.max(...temps.map(t => t.temp))
      : null;
    
    return { sensors: temps, overall };
  } catch {
    return { sensors: [], overall: null };
  }
}

function getUptime() {
  return os.uptime();
}

function getNetworkInfo() {
  try {
    const content = fs.readFileSync('/proc/net/dev', 'utf8').trim();
    const lines = content.split('\n').slice(2);
    const interfaces = [];
    
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 10) {
        const name = parts[0].replace(':', '');
        if (name === 'lo') continue;
        const rxBytes = parseInt(parts[1]);
        const txBytes = parseInt(parts[9]);
        interfaces.push({
          name,
          rxBytes,
          txBytes,
          rx: formatBytes(rxBytes),
          tx: formatBytes(txBytes)
        });
      }
    }
    return interfaces;
  } catch {
    return [];
  }
}

function getBattery() {
  try {
    const basePath = '/sys/class/power_supply/BAT0';
    if (!fs.existsSync(basePath)) return null;
    
    const capacity = parseInt(fs.readFileSync(`${basePath}/capacity`, 'utf8').trim());
    const status = fs.readFileSync(`${basePath}/status`, 'utf8').trim();
    const energyFull = parseInt(fs.readFileSync(`${basePath}/energy_full_design`, 'utf8').trim()) || 0;
    const energyNow = parseInt(fs.readFileSync(`${basePath}/energy_now`, 'utf8').trim()) || 0;
    const powerNow = parseInt(fs.readFileSync(`${basePath}/power_now`, 'utf8').trim()) || 0;
    const voltageNow = parseInt(fs.readFileSync(`${basePath}/voltage_now`, 'utf8').trim()) || 0;
    
    let health = null;
    if (energyFull > 0 && energyNow > 0) {
      health = Math.round((energyNow / energyFull) * 100);
    }
    
    const statusMap = {
      'Charging': '充电中',
      'Discharging': '放电中',
      'Full': '已充满',
      'Not charging': capacity >= 99 ? '已充满（涓流）' : '未充电',
      'Unknown': '未知'
    };
    
    return {
      capacity,
      status: statusMap[status] || status,
      health,
      power: Math.round(powerNow / 1e6), // microWatts to Watts
      voltage: Math.round(voltageNow / 1e6) // microVolts to Volts
    };
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes < 1024 * 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  return (bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2) + ' TB';
}

function getLoadAverage() {
  return os.loadavg();
}

// GET /api/system/info
router.get('/info', authMiddleware, adminOnly, async (req, res) => {
  try {
    const cpu = getCpuInfo();
    const memory = getMemoryInfo();
    const disk = getDiskInfo();
    const temperature = getTemperature();
    const battery = getBattery();
    const uptime = getUptime();
    const network = getNetworkInfo();
    const loadAvg = getLoadAverage();
    const hostname = os.hostname();
    const platform = `${os.type()} ${os.release()}`;
    const arch = os.arch();

    // Calculate uptime string
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMins = Math.floor((uptime % 3600) / 60);
    const uptimeStr = uptimeHours > 24
      ? `${Math.floor(uptimeHours / 24)}天 ${uptimeHours % 24}小时 ${uptimeMins}分`
      : `${uptimeHours}小时 ${uptimeMins}分`;

    res.json({
      cpu: {
        model: cpu.model,
        cores: cpu.cores,
        usage: cpu.usage,
        loadAvg,
        loadPercent: Math.round((loadAvg[0] / cpu.cores) * 100)
      },
      memory,
      disk,
      temperature,
      battery,
      uptime,
      uptimeStr,
      network,
      system: { hostname, platform, arch, nodeVersion: process.version }
    });
  } catch (err) {
    console.error('[System] Get info error:', err);
    res.status(500).json({ error: '获取系统信息失败' });
  }
});

// GET /api/system/gpu
router.get('/gpu', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { execSync } = require('child_process');
    const output = execSync(
      'nvidia-smi --query-gpu=name,driver_version,memory.used,memory.total,utilization.gpu,temperature.gpu --format=csv,noheader,nounits 2>/dev/null',
      { timeout: 5000 }
    ).toString().trim();

    if (!output) return res.json({ gpu: null });

    const parts = output.split(',').map(s => s.trim());
    const memUsed = parseInt(parts[2]);
    const memTotal = parseInt(parts[3]);

    // Get CUDA version
    let cudaVersion = 'N/A';
    try {
      const cudaOut = execSync('nvidia-smi 2>/dev/null | grep "CUDA Version"', { timeout: 3000 }).toString();
      const m = cudaOut.match(/CUDA Version:\s*([\d.]+)/);
      if (m) cudaVersion = m[1];
    } catch {}

    res.json({
      gpu: {
        name: parts[0],
        driverVersion: parts[1],
        cudaVersion,
        memoryUsed: memUsed,
        memoryTotal: memTotal,
        memoryUsedPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
        utilization: parseInt(parts[4]) || 0,
        temperature: parseInt(parts[5]) || 0
      }
    });
  } catch {
    res.json({ gpu: null });
  }
});

module.exports = router;
