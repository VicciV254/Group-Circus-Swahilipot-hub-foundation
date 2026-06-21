// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — Project Card (Grid View)
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Link } from 'react-router-dom';
import { Project } from '../types';
import {
  STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate, getProgressColor, AvatarGroup, clsx,
} from '../utils';

interface Props {
  project: Project;
  onDuplicate: (id: string) => void;
}

const ProjectCard: React.FC<Props> = ({ project, onDuplicate }) => {
  const daysLeft = project.end_date
    ? Math.ceil((new Date(project.end_date).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <Link to={`/projects/${project.id}`} className="block group">
      <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all h-full flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: project.cover_color }}
            >
              {project.code.slice(0, 3)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors leading-snug">
                {project.name}
              </p>
              <p className="text-xs text-gray-400 font-mono">{project.code}</p>
            </div>
          </div>
          <button
            onClick={e => { e.preventDefault(); onDuplicate(project.id); }}
            className="p-1.5 text-gray-300 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
            title="Duplicate"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        {/* Description */}
        <p className="text-sm text-gray-500 line-clamp-2 mb-4 flex-1">
          {project.description || 'No description provided.'}
        </p>

        {/* Badges */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className={clsx('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[project.status])}>
            {STATUS_LABELS[project.status]}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className={clsx('w-2 h-2 rounded-full', PRIORITY_COLORS[project.priority])} />
            {PRIORITY_LABELS[project.priority]}
          </span>
          {project.is_confidential && (
            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">Confidential</span>
          )}
          {project.is_overdue && (
            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">Overdue</span>
          )}
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400">Progress</span>
            <span className="text-xs font-medium text-gray-600">{project.progress_percent}%</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={clsx('h-full rounded-full transition-all', getProgressColor(project.progress_percent))}
              style={{ width: `${project.progress_percent}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-50">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {project.task_count || 0}
            </span>
            {(project.open_risks || 0) > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                {project.open_risks}
              </span>
            )}
            {project.end_date && (
              <span className={clsx(daysLeft !== null && daysLeft < 0 ? 'text-red-500' : '')}>
                {formatDate(project.end_date)}
              </span>
            )}
          </div>
          {project.members && project.members.length > 0 && (
            <AvatarGroup users={project.members.filter(m => m.is_active).map(m => m.user)} max={3} />
          )}
        </div>
      </div>
    </Link>
  );
};

export default ProjectCard;
