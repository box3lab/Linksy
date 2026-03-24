'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { Sparkles, ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AgentBar() {
  const { t } = useI18n();
  const { listAgents } = useAgentRegistry();
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
  const setSelectedAgentIds = useSettingsStore((s) => s.setSelectedAgentIds);
  const maxTurns = useSettingsStore((s) => s.maxTurns);
  const setMaxTurns = useSettingsStore((s) => s.setMaxTurns);
  const agentMode = useSettingsStore((s) => s.agentMode);
  const setAgentMode = useSettingsStore((s) => s.setAgentMode);

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allAgents = listAgents();
  // In preset mode, only show default (non-generated) agents
  const agents = allAgents.filter((a) => !a.isGenerated);
  const teacherAgent = agents.find((a) => a.role === 'teacher');
  const selectedAgents = agents.filter((a) => selectedAgentIds.includes(a.id));
  const nonTeacherSelected = selectedAgents.filter((a) => a.role !== 'teacher');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleModeChange = (mode: 'preset' | 'auto') => {
    setAgentMode(mode);
    if (mode === 'preset') {
      // Ensure a teacher is always selected in preset mode
      const hasTeacherSelected = selectedAgentIds.some((id) => {
        const a = agents.find((agent) => agent.id === id);
        return a?.role === 'teacher';
      });
      if (!hasTeacherSelected && teacherAgent) {
        setSelectedAgentIds([teacherAgent.id, ...selectedAgentIds]);
      }
    }
  };

  const toggleAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (agent?.role === 'teacher') return; // teacher is always selected
    if (selectedAgentIds.includes(agentId)) {
      setSelectedAgentIds(selectedAgentIds.filter((id) => id !== agentId));
    } else {
      setSelectedAgentIds([...selectedAgentIds, agentId]);
    }
  };

  const getAgentName = (agent: { id: string; name: string }) => {
    const key = `settings.agentNames.${agent.id}`;
    const translated = t(key);
    return translated !== key ? translated : agent.name;
  };

  const getAgentRole = (agent: { role: string }) => {
    const key = `settings.agentRoles.${agent.role}`;
    const translated = t(key);
    return translated !== key ? translated : agent.role;
  };

  /* ── Shared avatar row — always visible on the right side ── */
  const avatarRow = (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* Teacher avatar — always shown */}
      {teacherAgent && (
        <div className="size-8 rounded-full overflow-hidden ring-2 ring-sky-300/80 shrink-0">
          <img
            src={teacherAgent.avatar}
            alt={getAgentName(teacherAgent)}
            className="size-full object-cover"
          />
        </div>
      )}

      {agentMode === 'auto' ? (
        <>
          {/* In auto mode: show assistant avatar + shuffle indicator */}
          <div className="flex -space-x-2">
            {agents.find((a) => a.role === 'assistant') && (
              <div className="size-6 rounded-full overflow-hidden ring-[1.5px] ring-background">
                <img
                  src={agents.find((a) => a.role === 'assistant')!.avatar}
                  alt=""
                  className="size-full object-cover"
                />
              </div>
            )}
          </div>
          <Shuffle className="size-4 text-orange-500" />
        </>
      ) : (
        <>
          {/* In preset mode: show selected non-teacher agents */}
          {nonTeacherSelected.length > 0 && (
            <div className="flex -space-x-2">
              {nonTeacherSelected.slice(0, 4).map((agent) => (
                <div
                  key={agent.id}
                  className="size-6 rounded-full overflow-hidden ring-[1.5px] ring-background"
                >
                  <img
                    src={agent.avatar}
                    alt={getAgentName(agent)}
                    className="size-full object-cover"
                  />
                </div>
              ))}
              {nonTeacherSelected.length > 4 && (
                <div className="size-6 rounded-full bg-muted ring-[1.5px] ring-background flex items-center justify-center">
                  <span className="text-[9px] font-bold text-muted-foreground">
                    +{nonTeacherSelected.length - 4}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className="relative w-80">
      {/* ── Header row — always in document flow ── */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={cn(
              'group flex items-center gap-2 cursor-pointer rounded-full px-2.5 py-2 transition-colors w-full',
              'border-2 border-sky-200/80 bg-white/90 text-slate-700 hover:border-sky-300 hover:bg-sky-50',
            )}
            onClick={() => setOpen(!open)}
          >
            {/* Left side — text changes based on open/close */}
            <span className="text-xs text-sky-600/90 group-hover:text-sky-700 transition-colors hidden sm:block font-medium flex-1 text-left">
              {open ? t('agentBar.expandedTitle') : t('agentBar.readyToLearn')}
            </span>

            {/* Right side — avatars always visible */}
            {avatarRow}

            {/* Chevron */}
            {open ? (
              <ChevronUp className="size-3 text-sky-500 group-hover:text-sky-600 transition-colors" />
            ) : (
              <ChevronDown className="size-3 text-sky-500 group-hover:text-sky-600 transition-colors" />
            )}
          </button>
        </TooltipTrigger>
        {!open && (
          <TooltipContent side="bottom" sideOffset={4}>
            {t('agentBar.configTooltip')}
          </TooltipContent>
        )}
      </Tooltip>

      {/* ── Expanded panel (absolute, floating below the header) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute right-0 top-full mt-1 z-50 w-80"
          >
            <div className="rounded-2xl bg-white/96 backdrop-blur-sm border-2 border-sky-200/80 px-2.5 py-2">
              {/* Mode tabs — full width, 50/50 */}
              <div className="flex rounded-lg border border-sky-200 bg-sky-50/70 p-0.5 mb-2.5">
                <button
                  onClick={() => handleModeChange('preset')}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-medium rounded-md transition-all text-center',
                    agentMode === 'preset'
                      ? 'bg-white text-slate-800 border border-sky-200'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  {t('settings.agentModePreset')}
                </button>
                <button
                  onClick={() => handleModeChange('auto')}
                  className={cn(
                    'flex-1 py-1.5 text-xs font-medium rounded-md transition-all text-center flex items-center justify-center gap-1',
                    agentMode === 'auto'
                      ? 'bg-white text-slate-800 border border-sky-200'
                      : 'text-slate-500 hover:text-slate-700',
                  )}
                >
                  <Sparkles className="h-3 w-3 text-orange-500" />
                  {t('settings.agentModeAuto')}
                </button>
              </div>

              {agentMode === 'preset' ? (
                /* Agent list — teacher is always selected, no need to show */
                <div className="max-h-72 overflow-y-auto -mx-1">
                  {agents
                    .filter((a) => a.role !== 'teacher')
                    .map((agent, idx) => renderAgentRow(agent, idx + 1, false))}
                </div>
              ) : (
                <div className="flex flex-col items-center pt-6 pb-3 gap-4">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute size-10 rounded-full bg-violet-400/10 dark:bg-violet-400/15 animate-ping [animation-duration:3s]" />
                    <div className="absolute size-12 rounded-full bg-violet-400/5 dark:bg-violet-400/10 animate-pulse [animation-duration:2.5s]" />
                    <Shuffle className="relative size-5 text-violet-400 dark:text-violet-500" />
                  </div>
                  <div className="flex-1" />
                  <div className="text-center space-y-1">
                    <p className="text-[11px] text-muted-foreground/60">
                      {t('settings.agentModeAutoDesc')}
                    </p>
                    <p className="text-[10px] text-muted-foreground/40">
                      {t('agentBar.voiceAutoAssign')}
                    </p>
                  </div>
                </div>
              )}

              {/* Max turns — compact stepper */}
              <div className="flex items-center gap-1.5 px-2 py-1 mt-1 border-t border-border/30">
                <MessageSquare className="size-3 text-muted-foreground/40 shrink-0" />
                <span className="text-[11px] text-muted-foreground/50 flex-1">
                  {t('settings.maxTurns')}
                </span>
                <div className="flex items-center rounded-full bg-muted/50 h-5 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const v = Math.max(1, parseInt(maxTurns || '1') - 1);
                      setMaxTurns(String(v));
                    }}
                    className="size-5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors rounded-full hover:bg-muted"
                  >
                    <Minus className="size-2.5" />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={maxTurns}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, '');
                      if (!raw) {
                        setMaxTurns('');
                        return;
                      }
                      const v = Math.min(20, Math.max(1, parseInt(raw)));
                      setMaxTurns(String(v));
                    }}
                    onBlur={() => {
                      if (!maxTurns || parseInt(maxTurns) < 1) setMaxTurns('1');
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-5 h-5 text-[11px] font-medium tabular-nums text-center bg-transparent outline-none border-none"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const v = Math.min(20, parseInt(maxTurns || '1') + 1);
                      setMaxTurns(String(v));
                    }}
                    className="size-5 flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors rounded-full hover:bg-muted"
                  >
                    <Plus className="size-2.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
