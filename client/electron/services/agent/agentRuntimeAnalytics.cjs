const { buildServiceUrl } = require('../serviceEndpoints.cjs');

const ANALYTICS_ENDPOINT = buildServiceUrl('/track');
const ANALYTICS_PROJECT_NAME = 'yibiao-client';
const MAX_RETRY_COUNT = 3;
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

const TASK_STAGE_RULES = [
  { stage: 'tender-analysis', pattern: /招标|评分.*解析|需求.*解析/ },
  { stage: 'outline-generation', pattern: /旧目录.*(?:提取|补漏)|原方案.*目录/ },
  { stage: 'outline-generation', pattern: /(?:目录|提纲).*(?:生成|构建)/ },
  { stage: 'outline-refinement', pattern: /目录|提纲/ },
  { stage: 'fact-extraction', pattern: /事实/ },
  { stage: 'image-planning', pattern: /图片.*(?:编排|规划)/ },
  { stage: 'image-generation', pattern: /图片.*生成|配图|生图/ },
  { stage: 'content-refinement', pattern: /一致性|覆盖|还原|优化|修复|校正|矫正/ },
  { stage: 'content-generation', pattern: /正文|章节.*生成|内容生成/ },
];

function normalizeEndpointHost(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const candidates = text.includes('://') ? [text] : [`https://${text}`];
  for (const candidate of candidates) {
    try {
      return new URL(candidate).hostname.toLowerCase();
    } catch {}
  }
  return text.replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
}

function normalizeDurationMs(value) {
  const durationMs = Math.floor(Number(value || 0));
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  return Math.min(MAX_DURATION_MS, durationMs);
}

// 只将应用内固定任务标题映射为受控枚举，原始标题和任务内容不会上报。
function classifyTaskStage(title) {
  const normalizedTitle = String(title || '').trim().slice(0, 160);
  return TASK_STAGE_RULES.find((rule) => rule.pattern.test(normalizedTitle))?.stage || 'other';
}

// 上报最终 Agent 执行状态，不包含任务内容、路径或错误详情。
function trackAgentRuntime(app, configStore, runtimeId, status, meta = {}) {
  const runtimeStatus = status === 'success' ? 'success' : 'failed';
  const retryCount = Math.max(0, Math.min(MAX_RETRY_COUNT, Math.floor(Number(meta.retryCount || 0) || 0)));
  void Promise.resolve()
    .then(() => {
      const config = configStore.load();
      return fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: ANALYTICS_PROJECT_NAME,
          event: 'agent_runtime',
          version: typeof app?.getVersion === 'function' ? app.getVersion() : '',
          platform: process.platform,
          arch: process.arch,
          client_id: config.analytics_client_id || '',
          client_created_at: config.analytics_created_at || '',
          agent_runtime_kind: runtimeId,
          agent_runtime_status: runtimeStatus,
          agent_runtime_retry_count: retryCount,
          agent_task_stage: classifyTaskStage(meta.taskTitle),
          agent_runtime_duration_ms: normalizeDurationMs(meta.durationMs),
          ai_model_provider: config.text_model_provider || '',
          ai_model_base_url: normalizeEndpointHost(config.base_url || ''),
          ai_model_name: config.model_name || '',
        }),
      });
    })
    .catch(() => undefined);
}

module.exports = {
  trackAgentRuntime,
};
