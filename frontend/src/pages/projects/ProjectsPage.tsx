// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — Main List / Dashboard Page
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { projectsApi } from './api';
import {
  Project, ProjectFilters, ProjectStatus, ProjectPriority, DashboardData
} from './types';
import {
  STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate, formatCurrency, formatRelativeTime, getProgressColor,
} from './utils';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectCard from "./components/ProjectCard";

// ── Status Badge ──────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: ProjectStatus }> = ({ status }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status]}`}>
    {STATUS_LABELS[status]}
  </span>
);

// ── Priority Dot ──────────────────────────────────────────────────────────────

const PriorityDot: React.FC<{ priority: ProjectPriority }> = ({ priority }) => (
  <span className="flex items-center gap-1 text-xs">
    <span className={`w-2 h-2 rounded-full ${PRIORITY_COLORS[priority]}`} />
    {PRIORITY_LABELS[priority]}
  </span>
);

// ── Stat Card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string; value: number | string; icon: React.ReactNode;
  color: string; sub?: string;
}> = ({ label, value, icon, color, sub }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm flex items-center gap-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Filter Bar ────────────────────────────────────────────────────────────────

const FilterBar: React.FC<{
  filters: ProjectFilters;
  onChange: (f: ProjectFilters) => void;
  view: 'grid' | 'list';
  onViewChange: (v: 'grid' | 'list') => void;
  onNew: () => void;
}> = ({ filters, onChange, view, onViewChange, onNew }) => (
  <div className="flex flex-wrap items-center gap-3 mb-6">
    <div className="relative flex-1 min-w-[200px]">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        placeholder="Search projects..."
        value={filters.search || ''}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>

    <select
      value={filters.status || ''}
      onChange={e => onChange({ ...filters, status: (e.target.value || undefined) as ProjectStatus })}
      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">All Status</option>
      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>

    <select
      value={filters.priority || ''}
      onChange={e => onChange({ ...filters, priority: (e.target.value || undefined) as ProjectPriority })}
      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">All Priority</option>
      {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
    </select>

    <select
      value={filters.ordering || '-created_at'}
      onChange={e => onChange({ ...filters, ordering: e.target.value })}
      className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="-created_at">Newest First</option>
      <option value="created_at">Oldest First</option>
      <option value="name">Name A-Z</option>
      <option value="-name">Name Z-A</option>
      <option value="-progress_percent">Progress High-Low</option>
      <option value="end_date">Due Date</option>
    </select>

    <div className="flex border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => onViewChange('grid')}
        className={`px-3 py-2 ${view === 'grid' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>
      <button
        onClick={() => onViewChange('list')}
        className={`px-3 py-2 ${view === 'list' ? 'bg-indigo-50 text-indigo-600' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      </button>
    </div>

    <button
      onClick={onNew}
      className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      New Project
    </button>
  </div>
);

// ── List Row ──────────────────────────────────────────────────────────────────

const ProjectListRow: React.FC<{ project: Project; onDuplicate: (id: string) => void }> = ({ project, onDuplicate }) => (
  <Link to={`/projects/${project.id}`} className="block group">
    <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-indigo-200 hover:shadow-sm transition-all">
      <div
        className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
        style={{ backgroundColor: project.cover_color }}
      >
        {project.code.slice(0, 3)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
            {project.name}
          </p>
          <span className="text-xs text-gray-400 font-mono">{project.code}</span>
          {project.is_confidential && (
            <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">Confidential</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{project.description}</p>
      </div>
      <div className="hidden md:flex items-center gap-6 text-sm text-gray-500">
        <StatusBadge status={project.status} />
        <PriorityDot priority={project.priority} />
        <div className="flex items-center gap-2 min-w-[120px]">
          <div className="flex-1 bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full ${getProgressColor(project.progress_percent)}`}
              style={{ width: `${project.progress_percent}%` }}
            />
          </div>
          <span className="text-xs text-gray-500 w-8">{project.progress_percent}%</span>
        </div>
        <span>{formatDate(project.end_date)}</span>
        <div className="flex -space-x-1">
          {project.members?.slice(0, 3).map(m => (
            <div key={m.id} className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-xs font-medium text-indigo-600">
              {m.user.full_name.charAt(0)}
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={e => { e.preventDefault(); onDuplicate(project.id); }}
        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
        title="Duplicate"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
    </div>
  </Link>
);

// ── Empty State ───────────────────────────────────────────────────────────────

const EmptyState: React.FC<{ filtered: boolean; onNew: () => void }> = ({ filtered, onNew }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-4">
      <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    </div>
    <h3 className="text-lg font-semibold text-gray-900 mb-1">
      {filtered ? 'No projects match your filters' : 'No projects yet'}
    </h3>
    <p className="text-gray-500 text-sm mb-6">
      {filtered ? 'Try adjusting your search or filters.' : 'Create your first project to get started.'}
    </p>
    {!filtered && (
      <button
        onClick={onNew}
        className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
      >
        Create Project
      </button>
    )}
  </div>
);

// ── Dashboard Summary ─────────────────────────────────────────────────────────

const DashboardSummary: React.FC<{ data: DashboardData }> = ({ data }) => (
  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
    <StatCard
      label="Active Projects" value={data.summary.active_projects}
      icon={<svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
      color="bg-indigo-50"
    />
    <StatCard
      label="Total Projects" value={data.summary.total_projects}
      icon={<svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
      color="bg-blue-50"
    />
    <StatCard
      label="My Open Tasks" value={data.summary.my_open_tasks}
      icon={<svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
      color="bg-violet-50"
    />
    <StatCard
      label="Overdue Tasks" value={data.summary.overdue_tasks}
      icon={<svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
      color="bg-red-50"
    />
    <StatCard
      label="Due This Week" value={data.summary.due_this_week}
      icon={<svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
      color="bg-amber-50"
    />
  </div>
);

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();

  const [projects, setProjects]     = useState<Project[]>([]);
  const [dashboard, setDashboard]   = useState<DashboardData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filters, setFilters]       = useState<ProjectFilters>({ ordering: '-created_at' });
  const [view, setView]             = useState<'grid' | 'list'>('grid');
  const [showCreate, setShowCreate] = useState(false);
  const [total, setTotal]           = useState(0);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, dash] = await Promise.all([
        projectsApi.list(filters),
        projectsApi.dashboard(),
      ]);
      setProjects(res.results);
      setTotal(res.count);
      setDashboard(dash);
    } catch (e) {
      setError('Failed to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await projectsApi.duplicate(id);
      navigate(`/projects/${copy.id}`);
    } catch {
      alert('Failed to duplicate project.');
    }
  };

  const handleCreated = (project: Project) => {
    setShowCreate(false);
    navigate(`/projects/${project.id}`);
  };

  const isFiltered = !!(filters.search || filters.status || filters.priority);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="text-gray-500 text-sm mt-1">
              {total > 0 ? `${total} project${total !== 1 ? 's' : ''}` : 'Manage and track all projects'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/projects/archived"
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Archived
            </Link>
          </div>
        </div>

        {/* Dashboard Summary */}
        {dashboard && <DashboardSummary data={dashboard} />}

        {/* Quick Access — Overdue & Due Soon */}
        {dashboard && dashboard.my_overdue_tasks.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-red-700">
                {dashboard.my_overdue_tasks.length} Overdue Task{dashboard.my_overdue_tasks.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {dashboard.my_overdue_tasks.slice(0, 5).map(t => (
                <Link
                  key={t.id}
                  to={`/projects/${t.project}/tasks/${t.id}`}
                  className="text-xs bg-white border border-red-200 rounded-lg px-3 py-1.5 text-red-700 hover:bg-red-100 transition-colors"
                >
                  [{t.reference}] {t.title.slice(0, 40)}{t.title.length > 40 ? '…' : ''}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          view={view}
          onViewChange={setView}
          onNew={() => setShowCreate(true)}
        />

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-red-700">{error}</span>
            <button onClick={fetchProjects} className="ml-auto text-sm text-red-600 underline">Retry</button>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className={view === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
            : 'space-y-3'
          }>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-2 bg-gray-100 rounded mb-4" />
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-100 rounded-full w-16" />
                  <div className="h-6 bg-gray-100 rounded-full w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState filtered={isFiltered} onNew={() => setShowCreate(true)} />
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map(p => (
              <ProjectCard key={p.id} project={p} onDuplicate={handleDuplicate} />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {/* List header */}
            <div className="hidden md:flex items-center gap-4 px-5 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
              <span className="w-10" />
              <span className="flex-1">Project</span>
              <span className="w-24">Status</span>
              <span className="w-16">Priority</span>
              <span className="w-36">Progress</span>
              <span className="w-24">Due Date</span>
              <span className="w-20">Team</span>
              <span className="w-8" />
            </div>
            {projects.map(p => (
              <ProjectListRow key={p.id} project={p} onDuplicate={handleDuplicate} />
            ))}
          </div>
        )}

        {/* Load More */}
        {!loading && projects.length > 0 && projects.length < total && (
          <div className="text-center mt-8">
            <button
              onClick={() => {/* implement pagination */}}
              className="bg-white border border-gray-200 text-gray-600 px-6 py-2.5 rounded-lg text-sm hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              Load more projects
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreated}
        />
      )}
    </div>
  );
};

export default ProjectsPage;
