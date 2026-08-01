import { assertReady, buildRangeQuery, getEncodedProjectAndDays, loadProjectOptions, requestJson, saveSettings } from '../api.js';
import { escapeHtml, formatNumber, formatPercent } from '../render.js';
import { state } from '../state.js';

const AGENT_STAGE_META = {
  'tender-analysis': { label: '招标文件解析', color: '#6366f1', order: 10 },
  'outline-generation': { label: '目录生成', color: '#0891b2', order: 20 },
  'outline-refinement': { label: '目录矫正', color: '#7c3aed', order: 30 },
  'fact-extraction': { label: '关键事实解析', color: '#d97706', order: 40 },
  'content-generation': { label: '正文生成', color: '#16a34a', order: 50 },
  'content-refinement': { label: '正文矫正', color: '#059669', order: 60 },
  'image-planning': { label: '图片编排', color: '#db2777', order: 70 },
  'image-generation': { label: '图片生成', color: '#ea580c', order: 80 },
  other: { label: '其他 Agent 任务', color: '#64748b', order: 100 },
};

const PIPELINE_STAGE_IDS = [
  'tender-analysis',
  'outline-generation',
  'outline-refinement',
  'fact-extraction',
  'content-generation',
  'content-refinement',
  'image-planning',
  'image-generation',
];

function getStageMeta(stage) {
  return AGENT_STAGE_META[stage] || {
    label: String(stage || '未知阶段').replaceAll('-', ' '),
    color: '#64748b',
    order: 999,
  };
}

function formatDurationMs(value) {
  const durationMs = Math.max(0, Number(value || 0));
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  if (durationMs < 60_000) {
    const seconds = durationMs / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0)}s`;
  }
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function latencyWindowLabel(range) {
  if (range === 'today') return '今天';
  if (range === '7') return '最近 7 天';
  return '最近 30 天';
}

function renderLatencyTrend(stage, color) {
  const trend = Array.isArray(stage.trend) ? stage.trend : [];
  if (!trend.length) {
    return '<div class="agent-latency-trend-empty">当前窗口暂无每日趋势</div>';
  }
  const maxDuration = Math.max(...trend.map((item) => Number(item.avgDurationMs || 0)), 1);
  return `
    <div class="agent-latency-trend" aria-label="每日平均耗时趋势">
      ${trend.map((item) => {
        const durationMs = Number(item.avgDurationMs || 0);
        const height = Math.max(8, Math.round((durationMs / maxDuration) * 100));
        return `
          <div class="agent-latency-trend-item" title="${escapeHtml(item.day)}：${escapeHtml(formatDurationMs(durationMs))}">
            <span style="height:${height}%;background:${color}"></span>
            <small>${escapeHtml(String(item.day || '').slice(5))}</small>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLatencySection(latency = {}) {
  const observedStages = Array.isArray(latency.stages) ? latency.stages : [];
  const observedByStage = new Map(observedStages.map((stage) => [stage.stage, stage]));
  const stages = PIPELINE_STAGE_IDS.map((stage) => observedByStage.get(stage) || {
    stage,
    runCount: 0,
    failedCount: 0,
    errorRate: 0,
    avgDurationMs: 0,
    p50DurationMs: 0,
    p95DurationMs: 0,
    p99DurationMs: 0,
    trend: [],
  });
  const windowLabel = latencyWindowLabel(latency.windowRange);

  const totalAverageDuration = stages.reduce((sum, stage) => sum + Number(stage.avgDurationMs || 0), 0);
  const recentRuns = Array.isArray(latency.recentRuns) ? latency.recentRuns : [];
  const maxRecentDuration = Math.max(...recentRuns.map((run) => Number(run.durationMs || 0)), 1);

  return `
    <section class="agent-latency-panel panel">
      <div class="agent-latency-head">
        <div>
          <h3>Agent 任务时延分析</h3>
          <p>真实任务耗时、分位数和阶段占比 · ${escapeHtml(windowLabel)}</p>
        </div>
        <div class="agent-latency-total">阶段均值合计 <strong>${totalAverageDuration > 0 ? escapeHtml(formatDurationMs(totalAverageDuration)) : '暂无数据'}</strong></div>
      </div>

      <div class="agent-latency-stage-grid">
        ${stages.map((stage) => {
          const meta = getStageMeta(stage.stage);
          const hasData = Number(stage.avgDurationMs || 0) > 0;
          const share = totalAverageDuration > 0 ? Number(stage.avgDurationMs || 0) / totalAverageDuration : 0;
          return `
            <button class="agent-latency-stage${hasData ? '' : ' is-empty'}" type="button" data-agent-latency-stage="${escapeHtml(stage.stage)}" aria-expanded="false" style="--stage-color:${meta.color};--stage-share:${hasData ? Math.max(2, share * 100).toFixed(1) : 0}%">
              <span class="agent-latency-stage-name"><i></i>${escapeHtml(meta.label)}</span>
              <strong>${hasData ? escapeHtml(formatDurationMs(stage.avgDurationMs)) : '—'}</strong>
              <span class="agent-latency-share"><i></i></span>
              <small>${hasData ? `<span>${(share * 100).toFixed(1)}% 占比</span><span class="${Number(stage.errorRate || 0) >= 0.02 ? 'is-danger' : ''}">失败 ${escapeHtml(formatPercent(stage.errorRate))}</span>` : '<span>暂无数据</span>'}</small>
            </button>
          `;
        }).join('')}
      </div>

      <div class="agent-latency-details">
        ${stages.map((stage) => {
          const meta = getStageMeta(stage.stage);
          const hasData = Number(stage.avgDurationMs || 0) > 0;
          return `
            <section class="agent-latency-detail" data-agent-latency-detail="${escapeHtml(stage.stage)}" style="--stage-color:${meta.color}" hidden>
              <h4><i></i>${escapeHtml(meta.label)} · 详细分位数</h4>
              ${hasData ? '' : '<div class="agent-latency-detail-empty">当前时间范围暂无该阶段的时延记录。</div>'}
              <div class="agent-latency-percentiles">
                <div><span>均值 AVG</span><strong>${hasData ? escapeHtml(formatDurationMs(stage.avgDurationMs)) : '—'}</strong></div>
                <div><span>P50 中位数</span><strong>${hasData ? escapeHtml(formatDurationMs(stage.p50DurationMs)) : '—'}</strong></div>
                <div><span>P95</span><strong>${hasData ? escapeHtml(formatDurationMs(stage.p95DurationMs)) : '—'}</strong></div>
                <div><span>P99</span><strong>${hasData ? escapeHtml(formatDurationMs(stage.p99DurationMs)) : '—'}</strong></div>
                <div><span>失败率</span><strong class="${hasData && Number(stage.errorRate || 0) >= 0.02 ? 'is-danger' : ''}">${hasData ? escapeHtml(formatPercent(stage.errorRate)) : '—'}</strong></div>
              </div>
              <div class="agent-latency-trend-label">每日平均耗时趋势</div>
              ${renderLatencyTrend(stage, meta.color)}
            </section>
          `;
        }).join('')}
      </div>

      <div class="agent-latency-distribution">
        <span>阶段均值耗时占比</span>
        <div class="agent-latency-stack">
          ${stages.filter((stage) => Number(stage.avgDurationMs || 0) > 0).map((stage) => {
            const meta = getStageMeta(stage.stage);
            return `<button type="button" data-agent-latency-stage="${escapeHtml(stage.stage)}" title="${escapeHtml(meta.label)}：${escapeHtml(formatDurationMs(stage.avgDurationMs))}" style="flex:${Number(stage.avgDurationMs || 0)};background:${meta.color}"></button>`;
          }).join('') || '<span class="agent-latency-stack-empty">暂无可计算的阶段耗时</span>'}
        </div>
        <div class="agent-latency-legend">
          ${stages.map((stage) => {
            const meta = getStageMeta(stage.stage);
            const hasData = Number(stage.avgDurationMs || 0) > 0;
            return `<button type="button" data-agent-latency-stage="${escapeHtml(stage.stage)}"><i style="background:${meta.color}"></i>${escapeHtml(meta.label)} <small>${hasData ? escapeHtml(formatDurationMs(stage.avgDurationMs)) : '—'}</small></button>`;
          }).join('')}
        </div>
      </div>
    </section>

    <section class="agent-latency-recent panel">
      <div class="agent-latency-head">
        <div>
          <h3>近期阶段耗时明细</h3>
          <p>每条记录对应一次真实业务阶段或 Agent 任务</p>
        </div>
      </div>
      ${recentRuns.length ? `
        <div class="agent-latency-recent-table">
          <table>
            <thead><tr><th>时间</th><th>执行来源</th><th>任务阶段</th><th>耗时</th><th>状态</th></tr></thead>
            <tbody>${recentRuns.map((run) => {
              const meta = getStageMeta(run.stage);
              const width = Math.max(3, (Number(run.durationMs || 0) / maxRecentDuration) * 100);
              return `
                <tr>
                  <td><code>${escapeHtml(run.occurredAt || '-')}</code></td>
                  <td><code>${escapeHtml(run.runtime === 'workflow' ? '业务流程' : run.runtime || '-')}</code></td>
                  <td><span class="agent-latency-stage-label"><i style="background:${meta.color}"></i>${escapeHtml(meta.label)}</span></td>
                  <td><div class="agent-latency-run-bar"><i style="width:${width.toFixed(1)}%;background:${meta.color}"></i><strong>${escapeHtml(formatDurationMs(run.durationMs))}</strong></div></td>
                  <td><span class="agent-latency-status ${run.status === 'success' ? 'is-success' : 'is-failed'}">${run.status === 'success' ? '成功' : '失败'}</span></td>
                </tr>
              `;
            }).join('')}</tbody>
          </table>
        </div>
      ` : `<div class="empty">${latency.recentRunsQueryFailed ? '近期任务明细查询失败，请刷新后重试。' : '当前窗口暂无近期任务记录。'}</div>`}
    </section>
  `;
}

function bindLatencyStageInteractions(stats) {
  const buttons = Array.from(state.agentRuntime.querySelectorAll('[data-agent-latency-stage]'));
  const details = Array.from(state.agentRuntime.querySelectorAll('[data-agent-latency-detail]'));
  const runtimeHeading = state.agentRuntime.querySelector('[data-agent-runtime-heading]');
  const runtimeTable = state.agentRuntime.querySelector('[data-agent-runtime-table]');
  const modelHeading = state.agentRuntimeModels.previousElementSibling;
  let activeStage = '';

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const stage = button.dataset.agentLatencyStage || '';
      activeStage = activeStage === stage ? '' : stage;
      for (const candidate of buttons) {
        const active = candidate.dataset.agentLatencyStage === activeStage;
        candidate.classList.toggle('active', active);
        if (candidate.hasAttribute('aria-expanded')) candidate.setAttribute('aria-expanded', String(active));
      }
      for (const detail of details) {
        detail.hidden = detail.dataset.agentLatencyDetail !== activeStage;
      }
      const selectedStats = activeStage ? stats.stageBreakdowns?.[activeStage] || {} : stats;
      const selectedLabel = activeStage ? getStageMeta(activeStage).label : '';
      const selectedWindow = activeStage ? latencyWindowLabel(stats.latency?.windowRange) : '';
      runtimeHeading.textContent = selectedLabel ? `运行时维度 · ${selectedLabel} · ${selectedWindow}` : '运行时维度';
      runtimeTable.innerHTML = renderRuntimeRows(selectedStats.runtimes || []);
      modelHeading.textContent = selectedLabel ? `模型维度 · ${selectedLabel} · ${selectedWindow}` : '模型维度';
      state.agentRuntimeModels.innerHTML = renderModelRows(selectedStats.models || []);
    });
  }
}

function renderModelRows(models = []) {
  if (!models.length) {
    return '<div class="empty">暂无模型维度数据</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>运行时</th>
          <th>服务商</th>
          <th>域名</th>
          <th>模型</th>
          <th>成功</th>
          <th>失败</th>
          <th>总数</th>
          <th>重试次数</th>
          <th>最终成功率</th>
          <th>失败率</th>
          <th>重试率</th>
          <th>重试成功率</th>
        </tr>
      </thead>
      <tbody>${models.map((row) => `
        <tr>
          <td><code>${escapeHtml(row.runtime || '-')}</code></td>
          <td><code>${escapeHtml(row.provider || '-')}</code></td>
          <td><code>${escapeHtml(row.endpointHost || row.endpoint_host || '-')}</code></td>
          <td><code>${escapeHtml(row.model || '-')}</code></td>
          <td>${formatNumber(row.successCount)}</td>
          <td>${formatNumber(row.failedCount)}</td>
          <td>${formatNumber(row.totalCount)}</td>
          <td>${formatNumber(row.retryCount)}</td>
          <td>${formatPercent(row.successRate)}</td>
          <td>${formatPercent(row.failureRate)}</td>
          <td>${formatPercent(row.retryRate)}</td>
          <td>${formatPercent(row.retrySuccessRate)}</td>
        </tr>
      `).join('')}</tbody>
    </table>
  `;
}

function renderRuntimeRows(runtimes = []) {
  if (!runtimes.length) {
    return '<div class="empty">暂无运行时维度数据</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>运行时</th>
          <th>成功</th>
          <th>失败</th>
          <th>总数</th>
          <th>重试次数</th>
          <th>最终成功率</th>
          <th>失败率</th>
          <th>重试率</th>
          <th>重试成功率</th>
        </tr>
      </thead>
      <tbody>${runtimes.map((row) => `
        <tr>
          <td><code>${escapeHtml(row.runtime || '-')}</code></td>
          <td>${formatNumber(row.successCount)}</td>
          <td>${formatNumber(row.failedCount)}</td>
          <td>${formatNumber(row.totalCount)}</td>
          <td>${formatNumber(row.retryCount)}</td>
          <td>${formatPercent(row.successRate)}</td>
          <td>${formatPercent(row.failureRate)}</td>
          <td>${formatPercent(row.retryRate)}</td>
          <td>${formatPercent(row.retrySuccessRate)}</td>
        </tr>
      `).join('')}</tbody>
    </table>
  `;
}

function renderAgentRuntime(stats = {}) {
  const totalCount = Number(stats.totalCount || 0);
  const successRate = Number(stats.successRate || 0);
  const retriedRunCount = Number(stats.retriedRunCount || 0);
  const retrySuccessRate = Number(stats.retrySuccessRate || 0);
  const runtimes = Array.isArray(stats.runtimes) ? stats.runtimes : [];
  const models = Array.isArray(stats.models) ? stats.models : [];

  state.agentRuntime.innerHTML = `
    <div class="agent-runtime-layout">
      <section class="cards agent-runtime-summary-cards">
        <div class="panel card"><span>总运行次数</span><strong>${formatNumber(totalCount)}</strong></div>
        <div class="panel card"><span>最终成功率</span><strong>${formatPercent(successRate)}</strong></div>
        <div class="panel card"><span>重试任务数</span><strong>${formatNumber(retriedRunCount)}</strong></div>
        <div class="panel card"><span>重试成功率</span><strong>${formatPercent(retrySuccessRate)}</strong></div>
      </section>
      ${renderLatencySection(stats.latency || {})}
      <div class="agent-runtime-breakdown panel">
        <h3 data-agent-runtime-heading>运行时维度</h3>
        <div data-agent-runtime-table>${renderRuntimeRows(runtimes)}</div>
      </div>
    </div>
  `;
  state.agentRuntimeModels.innerHTML = renderModelRows(models);
  bindLatencyStageInteractions(stats);
}

export async function loadAgentRuntime() {
  assertReady();
  await loadProjectOptions();
  saveSettings();

  const range = String(state.agentRange.value || 'history');
  const { projectName } = getEncodedProjectAndDays();
  const data = await requestJson(`/api/agent-runtime?projectName=${projectName}&${buildRangeQuery(range)}`);
  renderAgentRuntime(data.agentRuntime || {});
}
