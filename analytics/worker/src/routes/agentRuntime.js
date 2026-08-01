import { corsHeaders, json, methodNotAllowed, requireAdmin, unauthorized } from '../http.js';
import { queryStatsAgentLatencyRuns, queryStatsAgentRuntime } from '../services/analyticsStatsStore.js';
import { getBusinessToday, isValidProjectName, logQueryError, normalizeText, safeStatsRange } from '../utils.js';

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

export async function handleAgentRuntime(request, env, url) {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  if (!requireAdmin(request, env)) {
    return unauthorized();
  }

  const projectName = normalizeText(url.searchParams.get('projectName'), 80);
  const range = safeStatsRange(url.searchParams.get('range') || url.searchParams.get('days'), 'history');

  if (!isValidProjectName(projectName)) {
    return json({ code: 400, message: 'invalid projectName' }, { status: 400 });
  }

  try {
    return json({
      code: 0,
      projectName,
      range,
      source: range === 'history' ? 'd1' : 'analytics_engine',
      agentRuntime: await queryStatsAgentRuntime(env, projectName, range),
    });
  } catch (error) {
    logQueryError('agent-runtime', error);
    return json({ code: 500, message: 'query failed' }, { status: 500 });
  }
}

export async function handleAgentRuntimeExport(request, env, url) {
  if (request.method !== 'GET') {
    return methodNotAllowed();
  }

  if (!requireAdmin(request, env)) {
    return unauthorized();
  }

  const projectName = normalizeText(url.searchParams.get('projectName'), 80);
  const range = safeStatsRange(url.searchParams.get('range') || url.searchParams.get('days'), 'history');
  if (!isValidProjectName(projectName)) {
    return json({ code: 400, message: 'invalid projectName' }, { status: 400 });
  }

  try {
    const rows = await queryStatsAgentLatencyRuns(env, projectName, range);
    const header = ['北京时间', '事件类型', '客户端版本', '平台', '架构', '客户端ID', '原始阶段', '统计阶段', '状态', '耗时毫秒', '采样间隔'];
    const csv = [
      header,
      ...rows.map((row) => [
        row.occurredAt,
        row.event,
        row.version,
        row.platform,
        row.arch,
        row.clientId,
        row.rawStage,
        row.stage,
        row.status,
        row.durationMs,
        row.sampleInterval,
      ]),
    ].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const fileRange = range === 'history' ? '30d' : range === 'today' ? 'today' : `${range}d`;
    return new Response(`\uFEFF${csv}\r\n`, {
      headers: {
        ...corsHeaders,
        'Access-Control-Expose-Headers': 'Content-Disposition',
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': `attachment; filename="agent-latency-${projectName}-${fileRange}-${getBusinessToday()}.csv"`,
      },
    });
  } catch (error) {
    logQueryError('agent-runtime-export', error);
    return json({ code: 500, message: 'query failed' }, { status: 500 });
  }
}
