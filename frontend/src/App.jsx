import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { ApiAccessPage } from './pages/ApiAccessPage';
import { AnalyticsChatPage } from './pages/AnalyticsChatPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { DashboardPage } from './pages/DashboardPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { FlowchartPage } from './pages/FlowchartPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { ToolsPage } from './pages/ToolsPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route
        element={(
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        )}
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/analytics/chat" element={<AnalyticsChatPage />} />
        <Route path="/flowchart" element={<FlowchartPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/developer" element={<ApiAccessPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
