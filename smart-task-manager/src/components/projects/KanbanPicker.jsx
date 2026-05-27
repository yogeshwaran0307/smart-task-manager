import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { projectsAPI } from '../../api/projects';
import { PageHeader, PageLoading } from '../common/ui';
import { FiFolder, FiLayers } from 'react-icons/fi';

export default function KanbanProjectPicker() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectsAPI.list({ status: 'active' })
      .then(r => setProjects(r.data?.results ?? r.data ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoading />;

  return (
    <div>
      <PageHeader title="Kanban Board" subtitle="Select a project to view its kanban board" />
      {projects.length === 0 ? (
        <div className="text-center py-20">
          <FiLayers size={40} className="text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400">No active projects found</p>
          <Link to="/projects/create" className="btn btn-primary mt-4">Create a project</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, i) => (
            <Link key={p.id} to={`/kanban/${p.id}`}
              className="card p-5 hover:border-indigo-500/50 transition-all hover:shadow-lg hover:shadow-indigo-500/10 group">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold text-white"
                  style={{ background: `hsl(${(i * 47 + 200) % 360}deg 60% 35%)` }}>
                  {p.name[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.total_tasks ?? 0} tasks</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-indigo-400 mt-2">
                <FiLayers size={12} /> Open Kanban →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
