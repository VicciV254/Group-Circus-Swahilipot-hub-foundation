// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — Kanban Board View (Drag & Drop)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { projectsApi, tasksApi } from '../api';
import { KanbanData, KanbanColumn, Task, UUID } from '../types';
import {
  TASK_STATUS_COLORS, TASK_STATUS_LABELS, TASK_PRIORITY_COLORS,
  TASK_PRIORITY_LABELS, formatDate, AvatarGroup, clsx, moveBetweenLists, reorderList,
} from '../utils';
import TaskDetailModal from './TaskDetailModal';
import CreateTaskModal from './CreateTaskModal';

// ── Task Card ─────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: Task;
  onDragStart: (e: React.DragEvent, taskId: UUID, colId: UUID) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  onClick: (task: Task) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onDragStart, onDragEnd, isDragging, onClick }) => {
  const overdue = task.is_overdue;
  const daysLeft = task.due_date
    ? Math.ceil((new Date(task.due_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id, task.kanban_column!)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(task)}
      className={clsx(
        'bg-white border rounded-xl p-3.5 cursor-grab active:cursor-grabbing select-none transition-all',
        'hover:border-indigo-200 hover:shadow-md group',
        isDragging ? 'opacity-40 scale-95 border-indigo-300 shadow-lg' : 'border-gray-100 shadow-sm',
        overdue && 'border-l-4 border-l-red-400',
      )}
    >
      {/* Priority + labels */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', TASK_PRIORITY_COLORS[task.priority])}>
            {TASK_PRIORITY_LABELS[task.priority]}
          </span>
          {task.labels?.slice(0, 2).map(label => (
            <span key={label} className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-medium">
              {label}
            </span>
          ))}
        </div>
        <span className="text-xs text-gray-300 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
          {task.reference}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-medium text-gray-800 leading-snug mb-2.5 line-clamp-2">
        {task.title}
      </p>

      {/* Progress bar */}
      {task.progress_percent > 0 && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400">Progress</span>
            <span className="text-xs text-gray-500 font-medium">{task.progress_percent}%</span>
          </div>
          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full"
              style={{ width: `${task.progress_percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          {task.assignees.length > 0 && <AvatarGroup users={task.assignees} max={3} />}
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          {(task.attachment_count || 0) > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {task.attachment_count}
            </span>
          )}
          {(task.comment_count || 0) > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {task.comment_count}
            </span>
          )}
          {(task.subtask_count || 0) > 0 && (
            <span className="flex items-center gap-1 text-xs">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              {task.subtask_count}
            </span>
          )}
          {task.due_date && (
            <span className={clsx('text-xs flex items-center gap-0.5', overdue ? 'text-red-500 font-medium' : daysLeft !== null && daysLeft <= 3 ? 'text-amber-500' : 'text-gray-400')}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDate(task.due_date, { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Column Header ─────────────────────────────────────────────────────────────

const ColumnHeader: React.FC<{
  column: KanbanColumn;
  onAddTask: (colId: UUID) => void;
  isOver: boolean;
}> = ({ column, onAddTask, isOver }) => (
  <div className={clsx(
    'flex items-center justify-between px-3 py-2.5 rounded-xl mb-2 transition-colors',
    isOver ? 'bg-indigo-50' : 'bg-gray-50',
  )}>
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
      <span className="text-sm font-semibold text-gray-700">{column.name}</span>
      <span className="bg-white text-gray-500 text-xs px-2 py-0.5 rounded-full border border-gray-100 font-medium">
        {column.task_count}
      </span>
      {column.wip_limit && column.task_count >= column.wip_limit && (
        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">WIP</span>
      )}
    </div>
    <button
      onClick={() => onAddTask(column.id)}
      className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    </button>
  </div>
);

// ── Drop Zone ─────────────────────────────────────────────────────────────────

const DropZone: React.FC<{
  colId: UUID;
  position: number;
  onDrop: (colId: UUID, position: number) => void;
  isActive: boolean;
}> = ({ colId, position, onDrop, isActive }) => (
  <div
    onDragOver={e => e.preventDefault()}
    onDrop={() => onDrop(colId, position)}
    className={clsx(
      'h-2 rounded-full mx-1 transition-all',
      isActive ? 'bg-indigo-300 h-8' : 'hover:bg-gray-100',
    )}
  />
);

// ── KANBAN VIEW ───────────────────────────────────────────────────────────────

interface KanbanViewProps { projectId: UUID }

const KanbanView: React.FC<KanbanViewProps> = ({ projectId }) => {
  const [data, setData]               = useState<KanbanData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [dragging, setDragging]       = useState<{ taskId: UUID; fromCol: UUID } | null>(null);
  const [overCol, setOverCol]         = useState<UUID | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [addingToCol, setAddingToCol]   = useState<UUID | null>(null);
  const [taskFilter, setTaskFilter]     = useState('');

  const fetchKanban = useCallback(async () => {
    setLoading(true);
    try {
      const d = await projectsApi.kanban(projectId);
      setData(d);
    } catch {
      setError('Failed to load Kanban board.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchKanban(); }, [fetchKanban]);

  const handleDragStart = (e: React.DragEvent, taskId: UUID, fromCol: UUID) => {
    e.dataTransfer.effectAllowed = 'move';
    setDragging({ taskId, fromCol });
  };

  const handleDrop = async (targetColId: UUID, position: number) => {
    if (!dragging || !data) return;
    const { taskId } = dragging;
    setDragging(null);
    setOverCol(null);

    // Optimistic update
    setData(prev => {
      if (!prev) return prev;
      const cols = prev.columns.map(col => {
        const withoutTask = (col.tasks || []).filter(t => t.id !== taskId);
        if (col.id === targetColId) {
          const movingTask = prev.columns.flatMap(c => c.tasks || []).find(t => t.id === taskId);
          if (!movingTask) return { ...col, tasks: withoutTask };
          const newTasks = [...withoutTask];
          newTasks.splice(position, 0, { ...movingTask, kanban_column: targetColId });
          return { ...col, tasks: newTasks, task_count: newTasks.length };
        }
        return { ...col, tasks: withoutTask, task_count: withoutTask.length };
      });
      return { ...prev, columns: cols };
    });

    try {
      await projectsApi.kanbanMove(projectId, taskId, targetColId, position);
    } catch {
      fetchKanban(); // rollback on error
    }
  };

  const handleTaskCreated = (task: Task) => {
    setAddingToCol(null);
    fetchKanban();
  };

  const handleTaskUpdated = (task: Task) => {
    setSelectedTask(task);
    fetchKanban();
  };

  if (loading) return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex-shrink-0 w-72 bg-gray-50 rounded-xl p-3 animate-pulse">
          <div className="h-8 bg-gray-100 rounded-xl mb-3" />
          {[...Array(3)].map((_, j) => (
            <div key={j} className="bg-white rounded-xl p-3 mb-2 h-24" />
          ))}
        </div>
      ))}
    </div>
  );

  if (error || !data) return (
    <div className="text-center py-12 text-red-500">{error}</div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter tasks…"
            value={taskFilter}
            onChange={e => setTaskFilter(e.target.value)}
            className="pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
          />
        </div>
        <span className="text-sm text-gray-400">
          {data.columns.reduce((sum, c) => sum + (c.tasks?.length || 0), 0)} tasks total
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={fetchKanban}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-6 flex-1">
        {data.columns.map(col => {
          const tasks = (col.tasks || []).filter(t =>
            !taskFilter || t.title.toLowerCase().includes(taskFilter.toLowerCase()) || t.reference.toLowerCase().includes(taskFilter.toLowerCase())
          );
          const isOver = overCol === col.id;

          return (
            <div
              key={col.id}
              className={clsx(
                'flex-shrink-0 w-72 flex flex-col rounded-xl transition-colors',
                isOver ? 'bg-indigo-50/50' : 'bg-gray-50/80',
              )}
              onDragOver={e => { e.preventDefault(); setOverCol(col.id); }}
              onDragLeave={() => setOverCol(null)}
            >
              <div className="p-2">
                <ColumnHeader column={col} onAddTask={setAddingToCol} isOver={isOver} />

                {/* Tasks */}
                <div className="space-y-1 min-h-[60px]">
                  <DropZone colId={col.id} position={0} onDrop={handleDrop} isActive={isOver && tasks.length === 0} />
                  {tasks.map((task, idx) => (
                    <React.Fragment key={task.id}>
                      <TaskCard
                        task={task}
                        onDragStart={handleDragStart}
                        onDragEnd={() => setDragging(null)}
                        isDragging={dragging?.taskId === task.id}
                        onClick={setSelectedTask}
                      />
                      <DropZone colId={col.id} position={idx + 1} onDrop={handleDrop} isActive={isOver} />
                    </React.Fragment>
                  ))}
                </div>

                {/* Add task inline */}
                <button
                  onClick={() => setAddingToCol(col.id)}
                  className="w-full mt-2 py-2 flex items-center justify-center gap-1.5 text-sm text-gray-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-colors border-2 border-dashed border-transparent hover:border-indigo-100"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add task
                </button>
              </div>
            </div>
          );
        })}

        {/* Add Column */}
        <div className="flex-shrink-0 w-56 flex items-start">
          <button className="w-full py-3 flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-indigo-600 rounded-xl border-2 border-dashed border-gray-200 hover:border-indigo-200 transition-colors mt-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add column
          </button>
        </div>
      </div>

      {/* Task Detail Modal */}
      {selectedTask && (
        <TaskDetailModal
          projectId={projectId}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdated}
        />
      )}

      {/* Create Task Modal */}
      {addingToCol && (
        <CreateTaskModal
          projectId={projectId}
          defaultColumnId={addingToCol}
          onClose={() => setAddingToCol(null)}
          onCreate={handleTaskCreated}
        />
      )}
    </div>
  );
};

export default KanbanView;
