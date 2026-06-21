// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Internship Management System
// Projects Module — Route Configuration
//
// Add this to your main router (e.g. App.tsx or routes/index.tsx):
//
//   import { projectsRoutes } from './pages/projects/routes';
//   ...
//   <Routes>
//     {projectsRoutes}
//     ...other routes
//   </Routes>
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Route } from 'react-router-dom';
import ProjectsPage from './ProjectsPage';
import ProjectDetailPage from './ProjectsPage';

export const projectsRoutes = (
  <>
    <Route path="/projects" element={<ProjectsPage />} />
    <Route path="/projects/archived" element={<ProjectsPage />} />
    <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
  </>
);

export default projectsRoutes;
