'use client';

import { Stage } from '@/components/stage';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import { loadImageMapping } from '@/lib/utils/image-storage';
import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { useSceneGenerator } from '@/lib/hooks/use-scene-generator';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { useWhiteboardHistoryStore } from '@/lib/store/whiteboard-history';
import { createLogger } from '@/lib/logger';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { generateMediaForOutlines } from '@/lib/media/media-orchestrator';
import { Copy, Check } from 'lucide-react';

const log = createLogger('Classroom');

export default function ClassroomDetailPage() {
  const params = useParams();
  const classroomId = params?.id as string;

  const { loadFromStorage } = useStageStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [classroomLogs, setClassroomLogs] = useState<string[]>([]);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [showClassroomLogs, setShowClassroomLogs] = useState(false);
  const mediaStatusRef = useRef<Record<string, string>>({});

  const generationStartedRef = useRef(false);

  const pushClassroomLog = useCallback(
    (scope: string, message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
      const timestamp = new Date().toISOString();
      setClassroomLogs((prev) => {
        const next = [`[${timestamp}] [${level}] [${scope}] ${message}`, ...prev];
        return next.slice(0, 180);
      });
    },
    [],
  );

  const handleCopyLogs = useCallback(async () => {
    if (!classroomLogs.length) return;
    try {
      await navigator.clipboard.writeText(classroomLogs.join('\n'));
      setCopiedLogs(true);
      setTimeout(() => setCopiedLogs(false), 1500);
    } catch {
      setCopiedLogs(false);
    }
  }, [classroomLogs]);

  const formatDuration = useCallback((durationMs: number) => {
    if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
    return `${(durationMs / 1000).toFixed(1)}s`;
  }, []);

  const pushNextApiLine = useCallback(
    (method: 'GET' | 'POST', path: string, status: number | 'ERR', durationMs: number) => {
      const renderDuration = formatDuration(durationMs);
      setClassroomLogs((prev) => {
        const next = [
          `${method} ${path} ${status} in ${renderDuration} (compile: n/a, render: ${renderDuration})`,
          ...prev,
        ];
        return next.slice(0, 180);
      });
    },
    [formatDuration],
  );

  const renderTokenizedText = useCallback((line: string) => {
    const tokenRegex =
      /(\b(?:200|201|204|400|401|403|404|429|500|502|503|ERR)\b|\b(?:INFO|WARN|ERROR|POST|GET|failed|error|warning)\b)/gi;

    return line.split(tokenRegex).map((chunk, idx) => {
      if (!chunk) return null;
      const token = chunk.toLowerCase();

      let cls = '';
      if (/^20\d$/.test(chunk)) cls = 'text-emerald-700 font-semibold';
      else if (/^[45]\d\d$/.test(chunk) || token === 'err') cls = 'text-red-600 font-semibold';
      else if (token === 'error' || token === 'failed') cls = 'text-red-600 font-semibold';
      else if (token === 'warn' || token === 'warning') cls = 'text-amber-600 font-semibold';
      else if (token === 'info') cls = 'text-sky-700 font-semibold';
      else if (token === 'post' || token === 'get') cls = 'text-violet-700 font-semibold';

      return (
        <span key={`${chunk}-${idx}`} className={cls}>
          {chunk}
        </span>
      );
    });
  }, []);

  const renderJsonSegment = useCallback((jsonText: string) => {
    let pretty = jsonText;
    try {
      const parsed = JSON.parse(jsonText);
      pretty = JSON.stringify(parsed, null, 2);
    } catch {
      return <span className="text-red-600">{jsonText}</span>;
    }

    const jsonTokenRegex =
      /(\"(?:\\.|[^\"])*\"(?=\s*:))|(\"(?:\\.|[^\"])*\")|\b(true|false|null)\b|\b-?\d+(?:\.\d+)?\b|([{}\[\],:])/g;
    const segments: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let index = 0;

    while ((match = jsonTokenRegex.exec(pretty)) !== null) {
      if (match.index > lastIndex) {
        segments.push(<span key={`t-${index++}`}>{pretty.slice(lastIndex, match.index)}</span>);
      }

      const token = match[0];
      let cls = 'text-slate-700';
      if (match[1]) cls = 'text-blue-700 font-semibold';
      else if (match[2]) cls = 'text-emerald-700';
      else if (match[3]) cls = 'text-violet-700 font-semibold';
      else if (/^-?\d/.test(token)) cls = 'text-amber-700 font-semibold';
      else if (match[4]) cls = 'text-slate-500';

      segments.push(
        <span key={`m-${index++}`} className={cls}>
          {token}
        </span>,
      );
      lastIndex = jsonTokenRegex.lastIndex;
    }

    if (lastIndex < pretty.length) {
      segments.push(<span key={`t-${index++}`}>{pretty.slice(lastIndex)}</span>);
    }

    return (
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-slate-100 px-2 py-1 text-[10px] leading-4 text-slate-700">
        {segments}
      </pre>
    );
  }, []);

  const renderHighlightedLogLine = useCallback(
    (line: string) => {
      const jsonStart = line.indexOf('{');
      const jsonEnd = line.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd <= jsonStart) {
        return renderTokenizedText(line);
      }

      const prefix = line.slice(0, jsonStart);
      const jsonText = line.slice(jsonStart, jsonEnd + 1);
      const suffix = line.slice(jsonEnd + 1);

      return (
        <>
          <span>{renderTokenizedText(prefix)}</span>
          {renderJsonSegment(jsonText)}
          {suffix ? <span>{renderTokenizedText(suffix)}</span> : null}
        </>
      );
    },
    [renderJsonSegment, renderTokenizedText],
  );

  const { generateRemaining, retrySingleOutline, stop } = useSceneGenerator({
    onPhaseChange: (phase, outline) => {
      pushClassroomLog(
        'Scene Generator',
        `${phase === 'content' ? 'Generating content' : 'Generating actions'}: "${outline.title}" (${outline.type})`,
      );
    },
    onSceneGenerated: (scene, index) => {
      pushClassroomLog('Scene Generator', `Scene generated #${index}: "${scene.title}"`);
    },
    onSceneFailed: (outline, sceneError) => {
      pushClassroomLog(
        'Scene Generator',
        `Scene failed: "${outline.title}" — ${sceneError}`,
        'ERROR',
      );
    },
    onComplete: () => {
      log.info('[Classroom] All scenes generated');
      pushClassroomLog('Scene Generator', 'All scenes generated');
    },
    onLog: (scope, message, level = 'INFO') => {
      pushClassroomLog(scope, message, level);
    },
    onApiTiming: (method, path, status, durationMs) => {
      pushNextApiLine(method, path, status, durationMs);
    },
  });

  const loadClassroom = useCallback(async () => {
    try {
      pushClassroomLog('Classroom', `Loading classroom: ${classroomId}`);
      await loadFromStorage(classroomId);

      // If IndexedDB had no data, try server-side storage (API-generated classrooms)
      if (!useStageStore.getState().stage) {
        log.info('No IndexedDB data, trying server-side storage for:', classroomId);
        try {
          const classroomApiStart = performance.now();
          const res = await fetch(`/api/classroom?id=${encodeURIComponent(classroomId)}`);
          pushNextApiLine(
            'GET',
            '/api/classroom',
            res.status,
            performance.now() - classroomApiStart,
          );
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.classroom) {
              const { stage, scenes } = json.classroom;
              useStageStore.getState().setStage(stage);
              useStageStore.setState({
                scenes,
                currentSceneId: scenes[0]?.id ?? null,
              });
              log.info('Loaded from server-side storage:', classroomId);
              pushClassroomLog('Classroom API', `Loaded from server storage: ${classroomId}`);

              // Hydrate server-generated agents into IndexedDB + registry
              if (stage.generatedAgentConfigs?.length) {
                const { saveGeneratedAgents } = await import('@/lib/orchestration/registry/store');
                const { useSettingsStore } = await import('@/lib/store/settings');
                const agentIds = await saveGeneratedAgents(stage.id, stage.generatedAgentConfigs);
                useSettingsStore.getState().setSelectedAgentIds(agentIds);
                log.info('Hydrated server-generated agents:', agentIds);
                pushClassroomLog(
                  'Classroom',
                  `Hydrated server-generated agents (${agentIds.length})`,
                );
              }
            }
          } else {
            const data = await res
              .json()
              .catch(() => ({ error: `Failed to fetch classroom: HTTP ${res.status}` }));
            pushClassroomLog(
              'Classroom API',
              `Classroom API error payload: ${JSON.stringify(data)}`,
              'ERROR',
            );
          }
        } catch (fetchErr) {
          log.warn('Server-side storage fetch failed:', fetchErr);
          pushClassroomLog(
            'Classroom API',
            `Server-side storage fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
            'WARN',
          );
        }
      }

      // Restore completed media generation tasks from IndexedDB
      await useMediaGenerationStore.getState().restoreFromDB(classroomId);
      // Restore agents for this stage
      const { loadGeneratedAgentsForStage, useAgentRegistry } =
        await import('@/lib/orchestration/registry/store');
      const generatedAgentIds = await loadGeneratedAgentsForStage(classroomId);
      const { useSettingsStore } = await import('@/lib/store/settings');
      if (generatedAgentIds.length > 0) {
        // Auto mode — use generated agents from IndexedDB
        useSettingsStore.getState().setAgentMode('auto');
        useSettingsStore.getState().setSelectedAgentIds(generatedAgentIds);
        pushClassroomLog('Classroom', `Loaded generated agents (${generatedAgentIds.length})`);
      } else {
        // Preset mode — restore agent IDs saved in the stage at creation time.
        // Filter out any stale generated IDs that may have been persisted before
        // the bleed-fix, so they don't resolve against a leftover registry entry.
        const stage = useStageStore.getState().stage;
        const stageAgentIds = stage?.agentIds;
        const registry = useAgentRegistry.getState();
        const cleanIds = stageAgentIds?.filter((id) => {
          const a = registry.getAgent(id);
          return a && !a.isGenerated;
        });
        useSettingsStore.getState().setAgentMode('preset');
        useSettingsStore
          .getState()
          .setSelectedAgentIds(
            cleanIds && cleanIds.length > 0 ? cleanIds : ['default-1', 'default-2', 'default-3'],
          );
        pushClassroomLog('Classroom', 'Using preset agents');
      }
    } catch (error) {
      log.error('Failed to load classroom:', error);
      pushClassroomLog(
        'Classroom',
        `Failed to load classroom: ${error instanceof Error ? error.message : String(error)}`,
        'ERROR',
      );
      setError(error instanceof Error ? error.message : 'Failed to load classroom');
    } finally {
      setLoading(false);
    }
  }, [classroomId, loadFromStorage, pushClassroomLog, pushNextApiLine]);

  useEffect(() => {
    // Reset loading state on course switch to unmount Stage during transition,
    // preventing stale data from syncing back to the new course
    setLoading(true);
    setError(null);
    setClassroomLogs([]);
    setShowClassroomLogs(false);
    mediaStatusRef.current = {};
    generationStartedRef.current = false;

    // Clear previous classroom's media tasks to prevent cross-classroom contamination.
    // Placeholder IDs (gen_img_1, gen_vid_1) are NOT globally unique across stages,
    // so stale tasks from a previous classroom would shadow the new one's.
    const mediaStore = useMediaGenerationStore.getState();
    mediaStore.revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    // Clear whiteboard history to prevent snapshots from a previous course leaking in.
    useWhiteboardHistoryStore.getState().clearHistory();

    loadClassroom();

    // Cancel ongoing generation when classroomId changes or component unmounts
    return () => {
      stop();
    };
  }, [classroomId, loadClassroom, stop]);

  // Auto-resume generation for pending outlines
  useEffect(() => {
    if (loading || error || generationStartedRef.current) return;

    const state = useStageStore.getState();
    const { outlines, scenes, stage } = state;

    // Check if there are pending outlines
    const completedOrders = new Set(scenes.map((s) => s.order));
    const hasPending = outlines.some((o) => !completedOrders.has(o.order));

    if (hasPending && stage) {
      generationStartedRef.current = true;
      pushClassroomLog(
        'Scene Generator',
        `Resuming pending generation (${outlines.length - completedOrders.size} scenes)`,
      );

      // Load generation params from sessionStorage (stored by generation-preview before navigating)
      const genParamsStr = sessionStorage.getItem('generationParams');
      const params = genParamsStr ? JSON.parse(genParamsStr) : {};

      // Reconstruct imageMapping from IndexedDB using pdfImages storageIds
      const storageIds = (params.pdfImages || [])
        .map((img: { storageId?: string }) => img.storageId)
        .filter(Boolean);

      loadImageMapping(storageIds).then((imageMapping) => {
        pushClassroomLog(
          'Scene Generator',
          `Loaded image mapping (${Object.keys(imageMapping).length})`,
        );
        generateRemaining({
          pdfImages: params.pdfImages,
          imageMapping,
          stageInfo: {
            name: stage.name || '',
            description: stage.description,
            language: stage.language,
            style: stage.style,
          },
          agents: params.agents,
          userProfile: params.userProfile,
        });
      });
    } else if (outlines.length > 0 && stage) {
      // All scenes are generated, but some media may not have finished.
      // Resume media generation for any tasks not yet in IndexedDB.
      // generateMediaForOutlines skips already-completed tasks automatically.
      generationStartedRef.current = true;
      pushClassroomLog('Media Generation', 'Resuming media generation for existing outlines');
      generateMediaForOutlines(outlines, stage.id).catch((err) => {
        log.warn('[Classroom] Media generation resume error:', err);
        pushClassroomLog(
          'Media Generation',
          `Media generation resume error: ${err instanceof Error ? err.message : String(err)}`,
          'ERROR',
        );
      });
    }
  }, [loading, error, generateRemaining, pushClassroomLog]);

  const mediaTasks = useMediaGenerationStore((s) => s.tasks);

  useEffect(() => {
    if (loading || error) return;

    for (const [elementId, task] of Object.entries(mediaTasks)) {
      if (task.stageId !== classroomId) continue;

      const prevStatus = mediaStatusRef.current[elementId];
      if (prevStatus === task.status) continue;
      mediaStatusRef.current[elementId] = task.status;

      if (task.status === 'generating') {
        pushClassroomLog(
          task.type === 'image' ? 'ImageGeneration API' : 'VideoGeneration API',
          `Generating ${task.type}: elementId=${elementId}, prompt="${task.prompt.slice(0, 80)}${task.prompt.length > 80 ? '...' : ''}"`,
        );
      } else if (task.status === 'done') {
        pushClassroomLog(
          task.type === 'image' ? 'ImageGeneration API' : 'VideoGeneration API',
          `${task.type} generated successfully: elementId=${elementId}`,
        );
      } else if (task.status === 'failed') {
        pushClassroomLog(
          task.type === 'image' ? 'ImageGeneration API' : 'VideoGeneration API',
          `${task.type} generation error: ${task.error || 'Unknown error'}${task.errorCode ? ` (code=${task.errorCode})` : ''}`,
          'ERROR',
        );
      }
    }
  }, [mediaTasks, loading, error, classroomId, pushClassroomLog]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={classroomId}>
        <div className="relative h-screen flex flex-col overflow-hidden">
          <div className="fixed inset-0 -z-10 bg-[url('/bg.png')] bg-cover bg-center bg-no-repeat pointer-events-none" />
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="rounded-2xl border-2 border-sky-200 bg-white/90 px-6 py-4 text-center text-sky-700">
                <p>Loading classroom...</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center rounded-2xl border-2 border-orange-200 bg-white/92 px-6 py-5">
                <p className="text-orange-600 mb-4">Error: {error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    setLoading(true);
                    loadClassroom();
                  }}
                  className="px-4 py-2 rounded-full border-2 border-orange-300 bg-orange-400 text-white hover:bg-orange-500"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : (
            <>
              <Stage
                onRetryOutline={retrySingleOutline}
                showLogsToggle
                logsVisible={showClassroomLogs}
                onToggleLogs={() => setShowClassroomLogs((prev) => !prev)}
              />

              {showClassroomLogs && (
                <div className="pointer-events-auto fixed bottom-4 right-4 z-[300] w-[min(560px,calc(100vw-1rem))]">
                  <div className="rounded-2xl border-2 border-slate-900/75 bg-white/90 p-3 text-left shadow-[0_2px_0_rgba(15,23,42,0.16)] backdrop-blur-sm">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-xs font-black uppercase tracking-wide text-slate-700">
                        Classroom Logs
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyLogs}
                        disabled={classroomLogs.length === 0}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors ${
                          classroomLogs.length === 0
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                            : copiedLogs
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {copiedLogs ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copiedLogs ? 'Copied' : 'Copy'}
                      </button>
                    </div>

                    <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-600">
                      {classroomLogs.length > 0 ? (
                        classroomLogs.map((line, idx) => (
                          <div key={`${idx}-${line}`}>{renderHighlightedLogLine(line)}</div>
                        ))
                      ) : (
                        <div className="text-slate-400">
                          Waiting for classroom generation logs...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
