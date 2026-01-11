import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProjectList from './pages/ProjectList';
import ProjectEditor from './pages/ProjectEditor';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectList />} />
        <Route path="/projects/:projectId" element={<ProjectEditor />} />
        <Route path="/projects/:projectId/files/:fileId" element={<ProjectEditor />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
