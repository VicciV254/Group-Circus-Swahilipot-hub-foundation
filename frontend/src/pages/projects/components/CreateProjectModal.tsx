// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects — Create Project Modal
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { projectsApi } from '../api';
import { Project, ProjectStatus, ProjectPriority } from '../types';
import { STATUS_LABELS, PRIORITY_LABELS } from '../utils';

interface Props {
  onClose: () => void;
  onCreate: (project: Project) => void;
}

const COLOR_PRESETS = [
  '#6366F1', '#8B5CF6', '#EC4899', '#EF4444', '#F59E0B',
  '#10B981', '#14B8A6', '#3B82F6', '#6B7280', '#0EA5E9',
];

function generateCode(name: string): string {
  const prefix = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('') || 'PRJ';
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${year}-${rand}`;
}

const CreateProjectModal: React.FC<Props> = ({ onClose, onCreate }) => {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    objectives: '',
    status: 'draft' as ProjectStatus,
    priority: 'medium' as ProjectPriority,
    start_date: '',
    end_date: '',
    budget_allocated: 0,
    cover_color: COLOR_PRESETS[0],
    is_confidential: false,
    is_template: false,
    tags: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const handleNameChange = (name: string) => {
    setForm(f => ({ ...f, name, code: f.code || generateCode(name) }));
  };

  const canProceedStep1 = form.name.trim().length > 0 && form.code.trim().length > 0;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const project = await projectsApi.create({
        ...form,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
      } as any);
      onCreate(project);
    } catch (e: any) {
      setError(e?.data?.detail || e?.data?.code?.[0] || 'Failed to create project. Please check your inputs.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Create New Project</h2>
            <p className="text-xs text-gray-400 mt-0.5">Step {step} of 2</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: step === 1 ? '50%' : '100%' }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Project Name *
                </label>
                <input
                  autoFocus
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="e.g. Q3 Marketing Campaign"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Project Code *
                </label>
                <input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  placeholder="PRJ-2026-001"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-400 mt-1">Unique identifier — auto-generated, but you can customize it.</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="What is this project about?"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Objectives
                </label>
                <textarea
                  value={form.objectives}
                  onChange={e => setForm(f => ({ ...f, objectives: e.target.value }))}
                  rows={2}
                  placeholder="Key objectives and scope"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Cover Color
                </label>
                <div className="flex gap-2">
                  {COLOR_PRESETS.map(color => (
                    <button
                      key={color}
                      onClick={() => setForm(f => ({ ...f, cover_color: color }))}
                      className={`w-8 h-8 rounded-full transition-transform ${form.cover_color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as ProjectStatus }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Priority
                  </label>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as ProjectPriority }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Budget Allocated (USD)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.budget_allocated}
                  onChange={e => setForm(f => ({ ...f, budget_allocated: +e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                  Tags
                </label>
                <input
                  value={form.tags}
                  onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  placeholder="marketing, q3, urgent (comma-separated)"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_confidential}
                    onChange={e => setForm(f => ({ ...f, is_confidential: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Confidential</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_template}
                    onChange={e => setForm(f => ({ ...f, is_template: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Save as Template</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          <button
            onClick={step === 1 ? onClose : () => setStep(1)}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              disabled={!canProceedStep1}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={saving}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create Project'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateProjectModal;
