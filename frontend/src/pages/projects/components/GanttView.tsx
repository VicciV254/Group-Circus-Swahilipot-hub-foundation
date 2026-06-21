// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — Gantt Chart View
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { projectsApi } from '../api';
import { GanttData, GanttTask, Milestone, UUID } from '../types';
import { TASK_STATUS_COLORS, TASK_PRIORITY_COLORS, formatDate, clsx, Avatar } from '../utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_WIDTH   = 28;       // px per day
const ROW_HEIGHT  = 44;       // px per row
const LEFT_WIDTH  = 300;      // sidebar width in px
const HEADER_H    = 60;       // header height

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  return new Date(s);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Status color for bar ──────────────────────────────────────────────────────

function barColor(status: string): string {
  const map: Record<string, string> = {
    done:        'bg-emerald-500',
    approved:    'bg-emerald-600',
    in_progress: 'bg-indigo-500',
    in_review:   'bg-violet-500',
    submitted:   'bg-amber-400',
    pending:     'bg-slate-300',
    backlog:     'bg-gray-300',
    rejected:    'bg-red-400',
    overdue:     'bg-red-500',
  };
  return map[status] || 'bg-gray-300';
}

// ── Gantt Row (sidebar + bar) ─────────────────────────────────────────────────

interface RowProps {
  task: GanttTask;
  index: number;
  startDate: Date;
  totalDays: number;
  isChild: boolean;
}

const GanttRow: React.FC<RowProps> = ({ task, index, startDate, totalDays, isChild }) => {
  const taskStart = parseDate(task.start_date);
  const taskEnd   = parseDate(task.due_date);
  const today     = new Date();

  const barLeft  = taskStart ? diffDays(startDate, taskStart) * DAY_WIDTH : null;
  const barWidth = (taskStart && taskEnd)
    ? Math.max(diffDays(taskStart, taskEnd) * DAY_WIDTH, DAY_WIDTH)
    : null;

  const isOverdue = taskEnd && taskEnd < today && !['done', 'approved'].includes(task.status);
  const todayPos  = diffDays(startDate, today) * DAY_WIDTH;

  return (
    <div
      className={clsx(
        'flex border-b border-gray-100 transition-colors hover:bg-indigo-50/30',
        index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50',
      )}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Sidebar */}
      <div
        className={clsx(
          'flex items-center gap-2 px-3 border-r border-gray-100 flex-shrink-0',
          isChild && 'pl-8',
        )}
        style={{ width: LEFT_WIDTH }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {isChild && (
            <svg className="w-3 h-3 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 9l3 3-3 3" />
            </svg>
          )}
          <span className="text-xs font-mono text-gray-400 flex-shrink-0">{task.reference}</span>
          <span className="text-sm text-gray-700 truncate font-medium">{task.title}</span>
        </div>
        {task.assignees.length > 0 && (
          <div className="flex -space-x-1 flex-shrink-0">
            {task.assignees.slice(0, 2).map(u => <Avatar key={u.id} user={u} size="xs" />)}
          </div>
        )}
      </div>

      {/* Bar area */}
      <div className="relative flex-1 overflow-hidden" style={{ width: totalDays * DAY_WIDTH }}>
        {/* Today line */}
        {todayPos >= 0 && todayPos <= totalDays * DAY_WIDTH && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400 z-10 opacity-50"
            style={{ left: todayPos }}
          />
        )}

        {/* Bar */}
        {barLeft !== null && barWidth !== null && (
          <div
            className={clsx(
              'absolute top-1/2 -translate-y-1/2 rounded-full flex items-center overflow-hidden',
              barColor(task.status),
              isOverdue && 'opacity-80',
            )}
            style={{ left: barLeft + 2, width: barWidth - 4, height: 20 }}
            title={`${task.title}: ${formatDate(task.start_date)} → ${formatDate(task.due_date)}`}
          >
            {/* Progress fill */}
            <div
              className="h-full bg-black/20 absolute left-0 top-0"
              style={{ width: `${100 - task.progress_percent}%`, left: `${task.progress_percent}%` }}
            />
            {barWidth > 60 && (
              <span className="relative text-white text-xs font-medium px-2 truncate">
                {task.progress_percent}%
              </span>
            )}
          </div>
        )}

        {/* No dates indicator */}
        {(barLeft === null || barWidth === null) && (
          <div className="absolute inset-0 flex items-center">
            <span className="text-xs text-gray-300 ml-4">No dates set</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Milestone Marker ──────────────────────────────────────────────────────────

const MilestoneMarker: React.FC<{ milestone: Milestone; startDate: Date; rowIndex: number }> = ({
  milestone, startDate, rowIndex,
}) => {
  const ms = parseDate(milestone.due_date);
  if (!ms) return null;
  const left = diffDays(startDate, ms) * DAY_WIDTH;

  return (
    <div
      className="absolute z-20 flex flex-col items-center"
      style={{ left, top: rowIndex * ROW_HEIGHT }}
      title={`Milestone: ${milestone.name} (${formatDate(milestone.due_date)})`}
    >
      <div className={clsx(
        'w-3 h-3 rotate-45 border-2',
        milestone.status === 'completed' ? 'bg-emerald-500 border-emerald-600' :
        milestone.is_overdue ? 'bg-red-500 border-red-600' : 'bg-amber-400 border-amber-500',
      )} />
    </div>
  );
};

// ── Timeline Header ───────────────────────────────────────────────────────────

const TimelineHeader: React.FC<{ startDate: Date; totalDays: number }> = ({ startDate, totalDays }) => {
  const months: Array<{ label: string; days: number }> = [];
  let cursor    = new Date(startDate);
  let prevMonth = -1;

  for (let i = 0; i < totalDays; i++) {
    const m = cursor.getMonth();
    if (m !== prevMonth) {
      const remaining = totalDays - i;
      const daysInMonth = new Date(cursor.getFullYear(), m + 1, 0).getDate() - cursor.getDate() + 1;
      months.push({ label: `${MONTH_NAMES[m]} ${cursor.getFullYear()}`, days: Math.min(daysInMonth, remaining) });
      prevMonth = m;
    }
    cursor = addDays(cursor, 1);
  }

  return (
    <div style={{ height: HEADER_H }}>
      {/* Month row */}
      <div className="flex border-b border-gray-100 bg-white" style={{ height: 28 }}>
        <div className="flex-shrink-0 border-r border-gray-100" style={{ width: LEFT_WIDTH }} />
        <div className="flex">
          {months.map(({ label, days }, i) => (
            <div
              key={i}
              className="border-r border-gray-100 px-2 flex items-center"
              style={{ width: days * DAY_WIDTH }}
            >
              <span className="text-xs font-semibold text-gray-600 truncate">{label}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Day row */}
      <div className="flex bg-white" style={{ height: 32 }}>
        <div className="flex-shrink-0 border-r border-gray-100" style={{ width: LEFT_WIDTH }} />
        <div className="flex">
          {Array.from({ length: totalDays }, (_, i) => {
            const d = addDays(startDate, i);
            const isToday   = isSameDay(d, new Date());
            const isWknd    = isWeekend(d);
            return (
              <div
                key={i}
                className={clsx(
                  'flex items-center justify-center border-r border-gray-100 text-xs',
                  isToday   ? 'bg-red-50 text-red-600 font-bold' :
                  isWknd    ? 'bg-gray-50 text-gray-300' : 'text-gray-400',
                )}
                style={{ width: DAY_WIDTH }}
              >
                {d.getDate()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Dependency Lines ──────────────────────────────────────────────────────────

const DependencyLines: React.FC<{
  tasks: GanttTask[];
  startDate: Date;
}> = ({ tasks, startDate }) => {
  const taskMap = useMemo(() => new Map(tasks.map((t, i) => [t.id, { task: t, index: i }])), [tasks]);

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      style={{ width: '100%', height: tasks.length * ROW_HEIGHT }}
    >
      {tasks.flatMap(task =>
        task.dependencies.map(predId => {
          const pred = taskMap.get(predId);
          if (!pred) return null;

          const predEnd = parseDate(pred.task.due_date);
          const succStart = parseDate(task.start_date);
          if (!predEnd || !succStart) return null;

          const x1 = LEFT_WIDTH + diffDays(startDate, predEnd) * DAY_WIDTH;
          const y1 = pred.index * ROW_HEIGHT + ROW_HEIGHT / 2;
          const x2 = LEFT_WIDTH + diffDays(startDate, succStart) * DAY_WIDTH;
          const y2 = taskMap.get(task.id)!.index * ROW_HEIGHT + ROW_HEIGHT / 2;

          const midX = (x1 + x2) / 2;

          return (
            <g key={`${predId}-${task.id}`}>
              <path
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke="#818CF8"
                strokeWidth={1.5}
                strokeDasharray="4 2"
                opacity={0.6}
              />
              <polygon
                points={`${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}`}
                fill="#818CF8"
                opacity={0.6}
              />
            </g>
          );
        })
      )}
    </svg>
  );
};

// ── GANTT VIEW ────────────────────────────────────────────────────────────────

interface GanttViewProps { projectId: UUID }

const GanttView: React.FC<GanttViewProps> = ({ projectId }) => {
  const [data, setData]       = useState<GanttData | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom]       = useState<'week' | 'month' | 'quarter'>('month');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    projectsApi.gantt(projectId).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [projectId]);

  const { startDate, endDate, totalDays } = useMemo(() => {
    if (!data) return { startDate: new Date(), endDate: new Date(), totalDays: 30 };

    const dates: Date[] = [];
    data.tasks.forEach(t => {
      if (t.start_date) dates.push(new Date(t.start_date));
      if (t.due_date)   dates.push(new Date(t.due_date));
    });
    data.milestones.forEach(m => { if (m.due_date) dates.push(new Date(m.due_date)); });

    if (dates.length === 0) {
      const today = new Date();
      return { startDate: addDays(today, -7), endDate: addDays(today, 60), totalDays: 67 };
    }

    const min = addDays(new Date(Math.min(...dates.map(d => d.getTime()))), -7);
    const max = addDays(new Date(Math.max(...dates.map(d => d.getTime()))), 14);
    return { startDate: min, endDate: max, totalDays: diffDays(min, max) };
  }, [data]);

  // Scroll to today
  useEffect(() => {
    if (!scrollRef.current || !data) return;
    const todayOffset = diffDays(startDate, new Date()) * DAY_WIDTH;
    scrollRef.current.scrollLeft = Math.max(0, todayOffset - 200);
  }, [data, startDate]);

  const flatTasks = useMemo(() => {
    if (!data) return [];
    const result: Array<{ task: GanttTask; isChild: boolean }> = [];
    const roots = data.tasks.filter(t => !t.parent);
    const children = data.tasks.filter(t => t.parent);

    roots.forEach(t => {
      result.push({ task: t, isChild: false });
      children.filter(c => c.parent === t.id).forEach(c => result.push({ task: c, isChild: true }));
    });
    return result;
  }, [data]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!data) return <div className="text-center py-12 text-gray-500">No Gantt data available.</div>;

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-800">Gantt Chart</h3>
          <span className="text-xs text-gray-400">{flatTasks.length} tasks · {data.milestones.length} milestones</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Legend */}
          <div className="hidden sm:flex items-center gap-3 mr-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-indigo-500 inline-block" />In Progress</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded-full bg-emerald-500 inline-block" />Done</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rotate-45 bg-amber-400 border border-amber-500 inline-block" />Milestone</span>
          </div>
          {/* Today button */}
          <button
            onClick={() => {
              if (!scrollRef.current) return;
              const offset = diffDays(startDate, new Date()) * DAY_WIDTH;
              scrollRef.current.scrollLeft = Math.max(0, offset - 200);
            }}
            className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600"
          >
            Today
          </button>
        </div>
      </div>

      {/* Scrollable area */}
      <div ref={scrollRef} className="overflow-auto max-h-[70vh]">
        <div className="relative" style={{ minWidth: LEFT_WIDTH + totalDays * DAY_WIDTH }}>
          {/* Header */}
          <div className="sticky top-0 z-20">
            <TimelineHeader startDate={startDate} totalDays={totalDays} />
          </div>

          {/* Rows + dependency overlay */}
          <div className="relative">
            <DependencyLines tasks={flatTasks.map(r => r.task)} startDate={startDate} />

            {flatTasks.map(({ task, isChild }, idx) => (
              <GanttRow
                key={task.id}
                task={task}
                index={idx}
                startDate={startDate}
                totalDays={totalDays}
                isChild={isChild}
              />
            ))}

            {/* Milestone markers */}
            {data.milestones.map(ms => (
              <MilestoneMarker key={ms.id} milestone={ms} startDate={startDate} rowIndex={flatTasks.length} />
            ))}

            {/* Milestone row */}
            {data.milestones.length > 0 && (
              <div className="flex border-t border-gray-200" style={{ height: ROW_HEIGHT }}>
                <div
                  className="flex items-center px-4 border-r border-gray-100 flex-shrink-0 bg-amber-50"
                  style={{ width: LEFT_WIDTH }}
                >
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Milestones</span>
                </div>
                <div
                  className="relative bg-amber-50/30"
                  style={{ width: totalDays * DAY_WIDTH }}
                >
                  {data.milestones.map(ms => {
                    const d = parseDate(ms.due_date);
                    if (!d) return null;
                    const left = diffDays(startDate, d) * DAY_WIDTH;
                    return (
                      <div
                        key={ms.id}
                        className="absolute flex flex-col items-center z-10"
                        style={{ left: left - 6, top: 8 }}
                        title={`${ms.name}: ${formatDate(ms.due_date)}`}
                      >
                        <div className={clsx(
                          'w-5 h-5 rotate-45 border-2 cursor-pointer hover:scale-110 transition-transform',
                          ms.status === 'completed' ? 'bg-emerald-500 border-emerald-600' :
                          ms.is_overdue ? 'bg-red-500 border-red-600' : 'bg-amber-400 border-amber-500',
                        )} />
                        <span className="text-xs text-gray-500 mt-3 whitespace-nowrap font-medium">
                          {ms.name.slice(0, 12)}{ms.name.length > 12 ? '…' : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttView;
