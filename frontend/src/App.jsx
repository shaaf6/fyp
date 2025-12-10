import { useState, useEffect, createContext, useContext, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:3000/api/auth';

// Helper to safely access localStorage (SSR-safe)
const getStoredToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token');
  }
  return null;
};

// Auth Context
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only access localStorage on the client side
    const storedToken = getStoredToken();
    if (storedToken) {
      setToken(storedToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      // Decode token to get user info
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        setUser({ email: payload.email, role: payload.role });
      } catch (e) {
        localStorage.removeItem('token');
        setToken(null);
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await axios.post(`${API_URL}/login`, { email, password });
    const { token: newToken, user: userData } = response.data;
    localStorage.setItem('token', newToken);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

// Login Page
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <h1>🔐 Policy Manager</h1>
        <p>Secure blockchain-backed policy management with AI-powered analysis and audit logging.</p>
        <ul className="features">
          <li>Blockchain-verified policies</li>
          <li>AI-powered policy comparison</li>
          <li>Complete audit trail</li>
          <li>Role-based access control</li>
        </ul>
      </div>
      <div className="login-right">
        <div className="login-card">
          <h1>Welcome Back</h1>
          <h2>Sign in to your account</h2>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
              />
            </div>
            <button type="submit" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// User Management Page (Owner Only)
function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'compliance_officer'
  });
  const { user, logout, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Owner cannot be created or assigned
  const roles = ['risk_manager', 'compliance_officer', 'system_admin'];
  const userRole = user?.role || 'user';

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API_URL}/users`);
      setUsers(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (editingUser) {
        await axios.put(`${API_URL}/users/${editingUser._id}`, formData);
      } else {
        await axios.post(`${API_URL}/users`, formData);
      }
      setShowModal(false);
      setEditingUser(null);
      setFormData({ email: '', password: '', role: 'compliance_officer' });
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    }
  };

  const handleEdit = (userToEdit) => {
    setEditingUser(userToEdit);
    setFormData({
      email: userToEdit.email,
      password: '',
      role: userToEdit.role
    });
    setShowModal(true);
  };

  const handleDelete = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await axios.delete(`${API_URL}/users/${userId}`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const openAddModal = () => {
    setEditingUser(null);
    setFormData({ email: '', password: '', role: 'compliance_officer' });
    setShowModal(true);
  };

  if (loading) return <div className="loading">Loading users...</div>;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <h1>Policy Management System</h1>
        <div className="nav-right">
          <span className="user-info">
            {user?.email} ({userRole.replace('_', ' ')})
          </span>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="sidebar">
        <ul>
          <li>
            <a href="/dashboard">Dashboard</a>
          </li>
          <li>
            <a href="/users" className="active">User Management</a>
          </li>
        </ul>
      </div>

      <div className="user-management">
        <div className="header">
          <h2>User Management</h2>
          <button className="btn-primary" onClick={openAddModal}>
            + Add User
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="users-table">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                    No users found. Click "Add User" to create one.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u._id}>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>
                        {u.role?.replace('_', ' ') || 'Unknown'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      <button
                        className="btn-edit"
                        onClick={() => handleEdit(u)}
                        disabled={u.email === user?.email}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(u._id)}
                        disabled={u.email === user?.email}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {showModal && (
          <div className="modal-overlay">
            <div className="modal">
              <h3>{editingUser ? 'Edit User' : 'Add New User'}</h3>
              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{editingUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required={!editingUser}
                  />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    disabled={editingUser && editingUser.email === user?.email}
                  >
                    {roles.map((role) => (
                      <option key={role} value={role}>
                        {role.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  {editingUser && editingUser.email === user?.email && (
                    <small style={{ color: '#888', fontSize: '0.85rem', marginTop: '0.5rem', display: 'block' }}>
                      You cannot change your own role
                    </small>
                  )}
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingUser ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}      // Dashboard
function Dashboard() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.role === 'system_admin') {
      navigate('/sysadmin');
    } else if (user?.role === 'owner') {
      navigate('/users');
    } else if (user?.role === 'compliance_officer') {
      navigate('/compliance');
    } else if (user?.role === 'risk_manager') {
      navigate('/riskmgr');
    }
  }, [user, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (loading || !user) {
    return <div className="loading">Loading...</div>;
  }

  const userRole = user.role || 'user';

  return (
    <div className="dashboard">
      <nav className="navbar">
        <h1>Policy Management System</h1>
        <div className="nav-right">
          <span className="user-info">
            {user.email} ({userRole.replace('_', ' ')})
          </span>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="sidebar">
        <ul>
          <li>
            <a href="/dashboard" className="active">Dashboard</a>
          </li>
          {userRole === 'owner' && (
            <li>
              <a href="/users">User Management</a>
            </li>
          )}
        </ul>
      </div>

      <main className="main-content">
        <h2>Welcome, {user.email}!</h2>
        <div className="dashboard-cards">
          <div className="card">
            <h3>Your Role</h3>
            <p className={`role-badge role-${userRole}`}>
              {userRole.replace('_', ' ')}
            </p>
          </div>
          <div className="card">
            <h3>Permissions</h3>
            <ul>
              {userRole === 'owner' && <li>Add new users</li>}
              {userRole === 'owner' && <li>Edit users</li>}
              {userRole === 'owner' && <li>Delete users</li>}
              {userRole === 'risk_manager' && <li>Manage policies</li>}
              {userRole === 'compliance_officer' && <li>View audit logs</li>}
              {userRole === 'system_admin' && <li>System configuration</li>}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}

// Compliance Officer Dashboard
function ComplianceOfficer() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [policies, setPolicies] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const chatMessagesEndRef = useRef(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const COMPLIANCE_API = 'http://localhost:3000/api/compliance';

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (activeTab === 'policies') {
      fetchPolicies();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${COMPLIANCE_API}/policies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setPolicies(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch policies');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${COMPLIANCE_API}/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setAuditLogs(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const toggleAlert = async (policyId, currentAlert) => {
    try {
      const newAlert = currentAlert === 1 ? 0 : 1;
      const reason = newAlert === 1 ? prompt('Reason for setting alert:') : '';
      if (newAlert === 1 && !reason) return;

      const token = localStorage.getItem('token');
      await axios.put(`${COMPLIANCE_API}/policies/${policyId}/alert`,
        { alert: newAlert, reason },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      fetchPolicies();
      alert(`Alert ${newAlert === 1 ? 'set' : 'cleared'} successfully`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update alert');
    }
  };

  const handlePolicySelect = (policy) => {
    setSelectedPolicy(policy);
    setSidePanelOpen(true);
    setChatMessages([]);
  };

  const sendChatMessage = async (customMessage = null) => {
    const messageToSend = customMessage || chatInput;
    if (!messageToSend.trim()) return;

    const userMessage = { role: 'user', content: messageToSend };
    setChatMessages(prev => [...prev, userMessage]);

    if (!customMessage) {
      setChatInput('');
    }
    setChatLoading(true);

    try {
      // Prepare conversation history for context
      const history = chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const token = localStorage.getItem('token');
      const response = await axios.post(`${COMPLIANCE_API}/chatbot`, {
        message: messageToSend,
        conversationHistory: history,
        policyContext: selectedPolicy ? {
          name: selectedPolicy.name,
          description: selectedPolicy.description
        } : null
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const aiMessage = {
        role: 'assistant',
        content: response.data.response,
        truncated: response.data.finish_reason === 'length'
      };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get chatbot response');
    } finally {
      setChatLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userRole = user?.role || 'user';

  return (
    <div className="dashboard">
      <nav className="navbar">
        <h1>Policy Management System</h1>
        <div className="nav-right">
          <span className="user-info">
            {user?.email} ({userRole.replace('_', ' ')})
          </span>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="sidebar">
        <ul>
          <li>
            <a
              onClick={() => setActiveTab('dashboard')}
              className={activeTab === 'dashboard' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              Dashboard
            </a>
          </li>
          <li>
            <a
              onClick={() => setActiveTab('policies')}
              className={activeTab === 'policies' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              View Policies
            </a>
          </li>
          <li>
            <a
              onClick={() => setActiveTab('audit')}
              className={activeTab === 'audit' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              Audit Logs
            </a>
          </li>
          <li>
            <a
              onClick={() => setActiveTab('scraper')}
              className={activeTab === 'scraper' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              Scraper
            </a>
          </li>
        </ul>
      </div>

      <main className="main-content">
        {error && <div className="error-message">{error}</div>}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <h2>Compliance Officer Dashboard</h2>
            <div className="dashboard-cards">
              <div className="card">
                <h3>Your Role</h3>
                <p className={`role-badge role-${userRole}`}>
                  Compliance Officer
                </p>
              </div>
              <div className="card">
                <h3>Managed Policies</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4f46e5' }}>2</p>
                <p style={{ color: '#666' }}>KYC & AML</p>
              </div>
              <div className="card">
                <h3>Permissions</h3>
                <ul>
                  <li>View KYC & AML policies</li>
                  <li>View audit logs</li>
                  <li>Toggle policy alerts</li>
                  <li>Run compliance scraper</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* View Policies Tab */}
        {activeTab === 'policies' && (
          <div style={{ display: 'flex', gap: '1.5rem', minHeight: 'calc(100vh - 140px)', background: '#ffffff', padding: '0', margin: '0' }}>
            {/* Main Policies Table */}
            <div style={{ flex: sidePanelOpen ? '0 0 67%' : '1', background: '#ffffff' }}>
              <h2 style={{ marginBottom: '1.5rem', color: '#1e293b', fontSize: '1.5rem' }}>KYC & AML Policies</h2>
              {loading ? (
                <div className="loading">Loading policies...</div>
              ) : (
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Policy Name</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', width: '40%', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Description</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Alert</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Created</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policies.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                            No policies found
                          </td>
                        </tr>
                      ) : (
                        policies.map((policy) => (
                          <tr key={policy._id} style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                            <td style={{ padding: '16px', background: '#ffffff' }}>
                              <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>{policy.name.toUpperCase()}</strong>
                            </td>
                            <td style={{ padding: '16px', verticalAlign: 'top', background: '#ffffff' }}>
                              <div style={{
                                fontSize: '0.9rem',
                                lineHeight: '1.6',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                color: '#334155'
                              }}>
                                {policy.description}
                              </div>
                            </td>
                            <td style={{ padding: '16px', background: '#ffffff' }}>
                              <span className={`role-badge ${policy.alert === 1 ? 'role-risk_manager' : 'role-compliance_officer'}`} style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
                                {policy.alert === 1 ? '🔔 ON' : '🔕 OFF'}
                              </span>
                            </td>
                            <td style={{ padding: '16px', fontSize: '0.85rem', color: '#64748b', background: '#ffffff' }}>
                              {new Date(policy.createdAt).toLocaleDateString()}
                            </td>
                            <td style={{ padding: '16px', background: '#ffffff' }}>
                              <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                                <button
                                  className={policy.alert === 1 ? 'btn-delete' : 'btn-primary'}
                                  onClick={() => toggleAlert(policy._id, policy.alert)}
                                  style={{ fontSize: '0.85rem', padding: '8px 14px', borderRadius: '6px', fontWeight: '500' }}
                                >
                                  {policy.alert === 1 ? '🔕 Clear Alert' : '🔔 Set Alert'}
                                </button>
                                <button
                                  className="btn-secondary"
                                  onClick={() => handlePolicySelect(policy)}
                                  style={{ fontSize: '0.85rem', padding: '8px 14px', borderRadius: '6px', fontWeight: '500', background: '#8b5cf6', color: '#ffffff', border: 'none' }}
                                >
                                  💬 Ask AI
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Side Panel with Chatbot */}
            {sidePanelOpen && (
              <div style={{
                flex: '0 0 31%',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                height: 'calc(100vh - 140px)',
                position: 'relative'
              }}>
                {/* Side Panel Header */}
                <div style={{
                  padding: '1rem',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#f8fafc'
                }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b' }}>Policy Assistant</h3>
                    {selectedPolicy && (
                      <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                        Discussing: <strong>{selectedPolicy.name.toUpperCase()}</strong>
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setSidePanelOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '1.5rem',
                      cursor: 'pointer',
                      color: '#64748b',
                      padding: '0 0.5rem'
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Policy Selector */}
                <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '0.5rem', display: 'block' }}>
                    Select Policy:
                  </label>
                  <select
                    value={selectedPolicy?._id || ''}
                    onChange={(e) => {
                      const policy = policies.find(p => p._id === e.target.value);
                      setSelectedPolicy(policy);
                      setChatMessages([]);
                    }}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="">-- Select a policy --</option>
                    {policies.map(policy => (
                      <option key={policy._id} value={policy._id}>
                        {policy.name.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Chat Messages */}
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '1rem',
                  background: '#f8fafc',
                  minHeight: 0
                }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                      <p style={{ fontSize: '3rem', margin: 0 }}>💬</p>
                      <p style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
                        Ask me anything about {selectedPolicy ? selectedPolicy.name.toUpperCase() : 'policy'} updates!
                      </p>
                    </div>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div key={idx}>
                        <div
                          style={{
                            marginBottom: '1rem',
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start'
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '85%',
                              padding: '0.75rem 1rem',
                              borderRadius: '8px',
                              background: msg.role === 'user' ? '#4f46e5' : '#ffffff',
                              color: msg.role === 'user' ? '#ffffff' : '#1e293b',
                              border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                              fontSize: '0.88rem',
                              lineHeight: '1.6',
                              whiteSpace: 'pre-wrap',
                              wordWrap: 'break-word',
                              overflowWrap: 'break-word'
                            }}
                          >
                            {msg.content}
                          </div>
                        </div>
                        {msg.truncated && idx === chatMessages.length - 1 && (
                          <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-start' }}>
                            <button
                              onClick={() => sendChatMessage('Please continue your previous response from where you left off.')}
                              className="btn-secondary"
                              style={{
                                fontSize: '0.85rem',
                                padding: '6px 16px',
                                background: '#f59e0b',
                                color: '#ffffff',
                                border: 'none'
                              }}
                            >
                              ⚠️ Response was cut off - Click to continue
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  {chatLoading && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
                      AI is thinking...
                    </div>
                  )}
                  <div ref={chatMessagesEndRef} />
                </div>

                {/* Chat Input */}
                <div style={{
                  padding: '1rem',
                  borderTop: '1px solid #e2e8f0',
                  background: '#ffffff'
                }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                      placeholder="Ask about policy updates..."
                      disabled={!selectedPolicy || chatLoading}
                      style={{
                        flex: 1,
                        padding: '0.75rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        fontSize: '0.9rem'
                      }}
                    />
                    <button
                      onClick={sendChatMessage}
                      disabled={!selectedPolicy || !chatInput.trim() || chatLoading}
                      className="btn-primary"
                      style={{ padding: '0.75rem 1.5rem' }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <div style={{ background: '#ffffff', minHeight: 'calc(100vh - 180px)' }}>
            <h2 style={{ marginBottom: '0.5rem', color: '#1e293b', fontSize: '1.5rem' }}>Policy Modification History</h2>
            <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.95rem' }}>All modifications to KYC & AML policies recorded on blockchain</p>
            {loading ? (
              <div className="loading">Loading audit logs...</div>
            ) : (
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: '#ffffff' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Policy Name</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Modified By</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Block Timestamp</th>
                      <th style={{ padding: '14px 16px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontWeight: '600', fontSize: '0.9rem', color: '#475569' }}>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', background: '#ffffff' }}>
                          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                          <div style={{ fontSize: '1rem', fontWeight: '500' }}>No modification history found</div>
                          <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Update a policy to see audit logs here</div>
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff' }}>
                          <td style={{ padding: '16px', background: '#ffffff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>{log.policyName}</strong>
                              <span className={`role-badge ${log.policyName.toUpperCase() === 'KYC' ? 'role-compliance_officer' : 'role-risk_manager'}`}
                                style={{ fontSize: '0.7rem', padding: '4px 8px' }}>
                                {log.policyName.toUpperCase()}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '16px', color: '#475569', fontSize: '0.9rem', background: '#ffffff' }}>{log.userEmail}</td>
                          <td style={{ padding: '16px', color: '#64748b', fontSize: '0.85rem', fontFamily: 'monospace', background: '#ffffff' }}>{log.timestamp}</td>
                          <td style={{ padding: '16px', color: '#64748b', fontSize: '0.9rem', background: '#ffffff' }}>{log.date}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Risk Manager Dashboard
function RiskManager() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [tamperStatus, setTamperStatus] = useState({});
  const chatMessagesEndRef = useRef(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const RISKMGR_API = 'http://localhost:3000/api/riskmgr';
  const POLICY_API = 'http://localhost:3000/api/policies';

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (activeTab === 'policies' || activeTab === 'dashboard') {
      fetchPolicies();
    }
  }, [activeTab]);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [policiesRes, integrityRes] = await Promise.all([
        axios.get(`${RISKMGR_API}/policies`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        axios.get(`${POLICY_API}/integrity`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      setPolicies(policiesRes.data);

      // Create tamper status map
      const tamperMap = {};
      integrityRes.data.policies.forEach(p => {
        tamperMap[p.policyName.toLowerCase()] = {
          status: p.integrityStatus,
          message: p.message
        };
      });
      setTamperStatus(tamperMap);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch policies');
    } finally {
      setLoading(false);
    }
  };

  const analyzeIntegrity = async (policyId) => {
    setAnalysisLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${RISKMGR_API}/analyze-integrity`,
        { policyId },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setComparison(response.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to analyze integrity');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const toggleAlert = async (policyId, currentAlert, reason = '') => {
    try {
      const token = localStorage.getItem('token');
      const newAlert = currentAlert === 1 ? 0 : 1;
      await axios.put(`${RISKMGR_API}/policies/${policyId}/alert`,
        { alert: newAlert, reason },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      fetchPolicies();
      alert(`Alert ${newAlert === 1 ? 'set' : 'cleared'} successfully`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update alert');
    }
  };

  const handlePolicySelect = (policy) => {
    setSelectedPolicy(policy);
    setSidePanelOpen(true);
    setChatMessages([]);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${RISKMGR_API}/chatbot`, {
        message: chatInput,
        policyContext: selectedPolicy,
        conversationHistory: chatMessages
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const aiMessage = { role: 'assistant', content: response.data.response };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      const errorMessage = { role: 'assistant', content: 'Error: Failed to get response' };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getIntegrityColor = (status) => {
    switch (status) {
      case 'good': return '#28a745';
      case 'caution': return '#ffc107';
      case 'warning': return '#dc3545';
      case 'new': return '#17a2b8';
      default: return '#6c757d';
    }
  };

  const userRole = user?.role || 'user';

  return (
    <div className="dashboard">
      <nav className="navbar">
        <h1>Policy Risk Management</h1>
        <div className="nav-right">
          <span className="user-info">
            {user?.email} ({userRole.replace('_', ' ')})
          </span>
          <button onClick={handleLogout} className="btn-logout">Logout</button>
        </div>
      </nav>

      <div className="dashboard-container">
        <aside className="sidebar">
          <ul>
            <li className={activeTab === 'dashboard' ? 'active' : ''} onClick={() => setActiveTab('dashboard')}>
              📊 Dashboard
            </li>
            <li className={activeTab === 'policies' ? 'active' : ''} onClick={() => setActiveTab('policies')}>
              📋 Policy Integrity
            </li>
            <li className={activeTab === 'comparison' ? 'active' : ''} onClick={() => setActiveTab('comparison')}>
              🔍 Compare Versions
            </li>
          </ul>
        </aside>

        <main className="main-content">
          {error && <div className="error-message">{error}</div>}

          {activeTab === 'dashboard' && (
            <div>
              <h2>Risk Analysis Overview</h2>
              <div className="dashboard-cards">
                {loading ? (
                  <div className="loading">Loading...</div>
                ) : (
                  policies.map(policy => (
                    <div className="card" key={policy._id} style={{
                      border: `3px solid ${getIntegrityColor(policy.integrityStatus)}`,
                      position: 'relative'
                    }}>
                      <h3 style={{ textTransform: 'uppercase', marginBottom: '10px', fontSize: '1.2rem' }}>{policy.name}</h3>
                      <div style={{
                        display: 'inline-block',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        backgroundColor: getIntegrityColor(policy.integrityStatus),
                        color: 'white',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        marginBottom: '12px'
                      }}>
                        {policy.integrityStatus.toUpperCase()}
                      </div>
                      <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px', lineHeight: '1.5' }}>
                        {policy.integrityMessage}
                      </p>
                      {policy.hasHistory && (
                        <p style={{ fontSize: '15px', color: '#333', marginBottom: '10px' }}>
                          Change: <strong style={{ fontSize: '18px', color: getIntegrityColor(policy.integrityStatus) }}>{policy.changePercentage}%</strong>
                        </p>
                      )}
                      {policy.alert === 1 && (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px',
                          backgroundColor: '#fff3cd',
                          borderLeft: '4px solid #ffc107',
                          fontSize: '13px',
                          borderRadius: '4px'
                        }}>
                          🚨 Alert Active
                        </div>
                      )}
                      {tamperStatus[policy.name.toLowerCase()] && (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px',
                          backgroundColor: tamperStatus[policy.name.toLowerCase()].status === 'VALID' ? '#d4edda' : '#f8d7da',
                          borderLeft: `4px solid ${tamperStatus[policy.name.toLowerCase()].status === 'VALID' ? '#28a745' : '#dc3545'}`,
                          fontSize: '13px',
                          borderRadius: '4px',
                          color: tamperStatus[policy.name.toLowerCase()].status === 'VALID' ? '#155724' : '#721c24'
                        }}>
                          {tamperStatus[policy.name.toLowerCase()].status === 'VALID' ? '✅ Blockchain Verified' : '⚠️ Tampered Detected'}
                        </div>
                      )}
                      <button
                        onClick={() => handlePolicySelect(policy)}
                        className="btn-primary"
                        style={{
                          marginTop: '15px',
                          width: '100%'
                        }}
                      >
                        Analyze Policy
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'policies' && (
            <div className="policies-tab">
              <h2>Policy Integrity Analysis</h2>
              {loading ? (
                <p>Loading...</p>
              ) : (
                <table className="policy-table" style={{ marginTop: '20px', width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Policy</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Integrity Status</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Change %</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Blockchain</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Alert</th>
                      <th style={{ padding: '12px', textAlign: 'left' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map(policy => (
                      <tr key={policy._id} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                          {policy.name}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 12px',
                            borderRadius: '12px',
                            backgroundColor: getIntegrityColor(policy.integrityStatus),
                            color: 'white',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            {policy.integrityStatus}
                          </span>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                            {policy.integrityMessage}
                          </div>
                        </td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>
                          {policy.changePercentage}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {tamperStatus[policy.name.toLowerCase()] ? (
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              backgroundColor: tamperStatus[policy.name.toLowerCase()].status === 'VALID' ? '#d4edda' : '#f8d7da',
                              color: tamperStatus[policy.name.toLowerCase()].status === 'VALID' ? '#155724' : '#721c24'
                            }}>
                              {tamperStatus[policy.name.toLowerCase()].status === 'VALID' ? '✅ VALID' : '⚠️ TAMPERED'}
                            </span>
                          ) : (
                            <span style={{ fontSize: '11px', color: '#999' }}>Checking...</span>
                          )}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {policy.alert === 1 ? '🚨 Active' : '✅ Clear'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          <button
                            onClick={() => analyzeIntegrity(policy._id)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#17a2b8',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              marginRight: '8px',
                              fontSize: '13px'
                            }}
                          >
                            🔍 AI Analysis
                          </button>
                          <button
                            onClick={() => {
                              const reason = policy.alert === 0 ? prompt('Reason for setting alert:') : '';
                              if (policy.alert === 0 && !reason) return;
                              toggleAlert(policy._id, policy.alert, reason);
                            }}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: policy.alert === 1 ? '#28a745' : '#ffc107',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              marginRight: '8px',
                              fontSize: '13px'
                            }}
                          >
                            {policy.alert === 1 ? '✓ Clear Alert' : '🚨 Set Alert'}
                          </button>
                          <button
                            onClick={() => handlePolicySelect(policy)}
                            style={{
                              padding: '6px 12px',
                              backgroundColor: '#6c757d',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            💬 Chat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {analysisLoading && (
                <div style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2000
                }}>
                  <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px' }}>
                    <p>Analyzing policy integrity with AI...</p>
                  </div>
                </div>
              )}

            </div>
          )}
          <div className="comparison-tab">
            <h2>Policy Version Comparison</h2>
            <p style={{ color: '#666', marginBottom: '20px' }}>
              Select a policy from the "Policy Integrity" tab to view detailed version comparison and analysis.
            </p>
            {selectedPolicy ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div style={{
                  padding: '20px',
                  border: '2px solid #6c757d',
                  borderRadius: '8px',
                  backgroundColor: '#f8f9fa'
                }}>
                  <h3 style={{ marginBottom: '15px', color: '#dc3545' }}>Previous Version</h3>
                  <div style={{
                    padding: '15px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    minHeight: '200px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedPolicy.prev || 'No previous version available'}
                  </div>
                </div>
                <div style={{
                  padding: '20px',
                  border: '2px solid #28a745',
                  borderRadius: '8px',
                  backgroundColor: '#f8f9fa'
                }}>
                  <h3 style={{ marginBottom: '15px', color: '#28a745' }}>Current Version</h3>
                  <div style={{
                    padding: '15px',
                    backgroundColor: 'white',
                    borderRadius: '4px',
                    minHeight: '200px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedPolicy.description}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                  <button
                    onClick={() => analyzeIntegrity(selectedPolicy._id)}
                    disabled={analysisLoading}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '16px',
                      width: '100%'
                    }}
                  >
                    {analysisLoading ? 'Analyzing...' : '🤖 Get AI Analysis of Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>
                No policy selected. Select a policy from the dashboard or policy list.
              </p>
            )}
          </div>

        </main>

        {/* Loading Modal - Shows on all tabs */}
        {analysisLoading && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000
          }}>
            <div style={{ backgroundColor: 'white', padding: '30px', borderRadius: '8px' }}>
              <p>Analyzing policy integrity with AI...</p>
            </div>
          </div>
        )}

        {/* AI Analysis Result Modal - Shows on all tabs */}
        {comparison && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '30px',
              borderRadius: '8px',
              maxWidth: '800px',
              maxHeight: '80vh',
              overflow: 'auto',
              position: 'relative'
            }}>
              <button
                onClick={() => setComparison(null)}
                style={{
                  position: 'absolute',
                  top: '15px',
                  right: '15px',
                  padding: '8px 16px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <h3 style={{ marginBottom: '20px', textTransform: 'uppercase' }}>
                AI Integrity Analysis: {comparison.policyName}
              </h3>
              <div style={{
                whiteSpace: 'pre-wrap',
                lineHeight: '1.6',
                fontSize: '14px',
                color: '#333'
              }}>
                {comparison.analysis}
              </div>
            </div>
          </div>
        )}

        {sidePanelOpen && selectedPolicy && (
          <aside className="side-panel" style={{
            position: 'fixed',
            top: '60px',
            right: 0,
            width: '400px',
            height: 'calc(100vh - 60px)',
            borderLeft: '1px solid #ddd',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            zIndex: 1000,
            overflowY: 'auto',
            boxShadow: '-2px 0 5px rgba(0,0,0,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Policy Analysis Chat</h3>
              <button
                onClick={() => setSidePanelOpen(false)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>

            <div style={{
              padding: '15px',
              backgroundColor: '#e7f3ff',
              borderRadius: '8px',
              marginBottom: '15px',
              border: '1px solid #b3d9ff'
            }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase' }}>
                {selectedPolicy.name}
              </h4>
              <div style={{
                padding: '8px',
                backgroundColor: getIntegrityColor(selectedPolicy.integrityStatus),
                color: 'white',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 'bold',
                display: 'inline-block',
                marginBottom: '8px'
              }}>
                {selectedPolicy.integrityStatus.toUpperCase()}
              </div>
              <p style={{ fontSize: '12px', color: '#666', margin: '8px 0 0 0' }}>
                {selectedPolicy.integrityMessage}
              </p>
            </div>

            <div style={{
              height: '400px',
              overflowY: 'auto',
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '8px',
              marginBottom: '15px',
              border: '1px solid #ddd'
            }}>
              {chatMessages.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', marginTop: '20px' }}>
                  Ask me about policy changes, risks, or integrity concerns...
                </p>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: '15px',
                      padding: '12px',
                      backgroundColor: msg.role === 'user' ? '#007bff' : '#f1f1f1',
                      color: msg.role === 'user' ? 'white' : 'black',
                      borderRadius: '8px',
                      maxWidth: '85%',
                      marginLeft: msg.role === 'user' ? 'auto' : '0',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: '14px',
                      lineHeight: '1.5'
                    }}
                  >
                    <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong>
                    <div style={{ marginTop: '5px' }}>{msg.content}</div>
                  </div>
                ))
              )}
              <div ref={chatMessagesEndRef} />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !chatLoading && sendChatMessage()}
                placeholder="Ask about policy integrity..."
                disabled={chatLoading}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              <button
                onClick={sendChatMessage}
                disabled={chatLoading || !chatInput.trim()}
                style={{
                  padding: '10px 20px',
                  backgroundColor: chatLoading ? '#ccc' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: chatLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                {chatLoading ? '...' : 'Send'}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// System Admin Dashboard
function SystemAdmin() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [policies, setPolicies] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [scraperResults, setScraperResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [newDescription, setNewDescription] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const SYSADMIN_API = 'http://localhost:3000/api/sysadmin';

  useEffect(() => {
    if (activeTab === 'policies') {
      fetchPolicies();
    } else if (activeTab === 'audit') {
      fetchAuditLogs();
    }
  }, [activeTab]);

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${SYSADMIN_API}/policies`);
      setPolicies(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch policies');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${SYSADMIN_API}/audit-logs`);
      setAuditLogs(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const toggleAlert = async (policyId, currentAlert) => {
    try {
      const newAlert = currentAlert === 1 ? 0 : 1;
      await axios.put(`${SYSADMIN_API}/policies/${policyId}/alert`, { alert: newAlert });
      fetchPolicies();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update alert');
    }
  };

  const startEditPolicy = (policy) => {
    setEditingPolicy(policy);
    setNewDescription(policy.description);
  };

  const saveEditPolicy = async () => {
    if (!editingPolicy || !newDescription.trim()) return;

    try {
      const token = localStorage.getItem('token');
      await axios.put(`${SYSADMIN_API}/policies/${editingPolicy._id}`, {
        description: newDescription
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      setEditingPolicy(null);
      setNewDescription('');
      fetchPolicies();
      alert('Policy updated successfully! Previous version saved to history.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update policy');
    }
  };

  const handlePolicySelect = (policy) => {
    setSelectedPolicy(policy);
    setSidePanelOpen(true);
    setChatMessages([]);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !selectedPolicy) return;

    const userMessage = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${SYSADMIN_API}/chatbot`,
        {
          message: chatInput,
          policyContext: {
            name: selectedPolicy.name,
            description: selectedPolicy.description,
            prev: selectedPolicy.prev,
            alert: selectedPolicy.alert
          }
        },
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const aiMessage = { role: 'assistant', content: response.data.response };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setChatLoading(false);
    }
  };

  const runScraper = async () => {
    setLoading(true);
    setError('');
    setScraperResults(null); // Clear previous results
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${SYSADMIN_API}/scraper/run`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Poll for completion (check every 5 seconds for 5 minutes max)
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes
      const pollInterval = setInterval(async () => {
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          setLoading(false);
          setScraperResults({
            status: 'completed',
            message: 'Scraper is still running in background. Check backend logs for progress.',
            timestamp: new Date().toISOString()
          });
          return;
        }

        // For now, we'll just show completion after response
        // In future, you can add a status endpoint to check scraper progress
      }, 5000);

      // Since scraper runs in background, show immediate success
      setTimeout(() => {
        clearInterval(pollInterval);
        setLoading(false);
        setScraperResults({
          status: 'completed',
          message: 'Scraper completed successfully! Check the Scraper UI or backend logs for details.',
          summary: {
            totalSources: 6,
            updatesFound: 'Check JSON files'
          },
          results: [
            { source: 'BPRD', updates: 'See bprd_results_structure_aware.json', lastChecked: new Date().toISOString() },
            { source: 'BSD', updates: 'See bsd_results_structure_aware.json', lastChecked: new Date().toISOString() },
            { source: 'EPD', updates: 'See epd_results_structure_aware.json', lastChecked: new Date().toISOString() },
            { source: 'FID', updates: 'See fid_results_structure_aware.json', lastChecked: new Date().toISOString() },
            { source: 'AMLC', updates: 'See amlc_results_structure_aware.json', lastChecked: new Date().toISOString() },
            { source: 'AGRI', updates: 'See agri_results_structure_aware.json', lastChecked: new Date().toISOString() }
          ],
          timestamp: new Date().toISOString()
        });
      }, 3000); // Show completion after 3 seconds

    } catch (err) {
      setError(err.response?.data?.error || 'Failed to run scraper');
      console.error('Scraper error:', err);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const userRole = user?.role || 'user';

  return (
    <div className="dashboard">
      <nav className="navbar">
        <h1>Policy Management System</h1>
        <div className="nav-right">
          <span className="user-info">
            {user?.email} ({userRole.replace('_', ' ')})
          </span>
          <button className="btn-logout" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="sidebar">
        <ul>
          <li>
            <a
              onClick={() => setActiveTab('dashboard')}
              className={activeTab === 'dashboard' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              Dashboard
            </a>
          </li>
          <li>
            <a
              onClick={() => setActiveTab('policies')}
              className={activeTab === 'policies' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              View Policies
            </a>
          </li>
          <li>
            <a
              onClick={() => setActiveTab('audit')}
              className={activeTab === 'audit' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              Audit Logs
            </a>
          </li>
          <li>
            <a
              onClick={() => setActiveTab('scraper')}
              className={activeTab === 'scraper' ? 'active' : ''}
              style={{ cursor: 'pointer' }}
            >
              Scraper
            </a>
          </li>
        </ul>
      </div>

      <main className="main-content">
        {error && <div className="error-message">{error}</div>}

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div>
            <h2>System Admin Dashboard</h2>
            <div className="dashboard-cards">
              <div className="card">
                <h3>Your Role</h3>
                <p className={`role-badge role-${userRole}`}>
                  System Administrator
                </p>
              </div>
              <div className="card">
                <h3>Managed Policies</h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4f46e5' }}>2</p>
                <p style={{ color: '#666' }}>KYC & AML</p>
              </div>
              <div className="card">
                <h3>Permissions</h3>
                <ul>
                  <li>View KYC & AML policies</li>
                  <li>View audit logs</li>
                  <li>Toggle policy alerts</li>
                  <li>Run compliance scraper</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* View Policies Tab */}
        {activeTab === 'policies' && (
          <div>
            <h2>KYC & AML Policies</h2>
            {loading ? (
              <div className="loading">Loading policies...</div>
            ) : (
              <div className="users-table">
                <table style={{ width: '100%', tableLayout: 'auto' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '10%' }}>Policy Name</th>
                      <th style={{ width: '30%' }}>Description</th>
                      <th style={{ width: '30%' }}>Previous Version</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Alert Status</th>
                      <th style={{ width: '8%', textAlign: 'center' }}>Created At</th>
                      <th style={{ width: '14%', textAlign: 'center' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.length === 0 ? (
                      <tr>
                        <td colSpan="6" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                          No policies found
                        </td>
                      </tr>
                    ) : (
                      policies.map((policy) => (
                        <tr key={policy._id}>
                          <td style={{ verticalAlign: 'top', padding: '12px' }}>
                            <strong>{policy.name}</strong>
                          </td>
                          <td
                            style={{
                              whiteSpace: 'pre-wrap',
                              wordWrap: 'break-word',
                              backgroundColor: editingPolicy?._id === policy._id ? '#fffacd' : 'transparent',
                              padding: '12px',
                              border: editingPolicy?._id === policy._id ? '2px solid #4a90e2' : 'none',
                              cursor: editingPolicy?._id === policy._id ? 'text' : 'default',
                              verticalAlign: 'top'
                            }}
                            contentEditable={editingPolicy?._id === policy._id}
                            suppressContentEditableWarning={true}
                            onInput={(e) => {
                              if (editingPolicy?._id === policy._id) {
                                setNewDescription(e.target.textContent);
                              }
                            }}
                          >
                            {editingPolicy?._id === policy._id ? newDescription : policy.description}
                          </td>
                          <td style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontSize: '0.9em', color: '#666', padding: '12px', verticalAlign: 'top' }}>
                            {policy.prev ? policy.prev : <em>No previous version</em>}
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'top', padding: '12px' }}>
                            <span className={`role-badge ${policy.alert === 1 ? 'role-risk_manager' : 'role-compliance_officer'}`}>
                              {policy.alert === 1 ? '🔔 Alert ON' : '🔕 Alert OFF'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', verticalAlign: 'top', padding: '12px' }}>
                            {new Date(policy.createdAt).toLocaleDateString()}
                          </td>
                          <td className="actions-cell" style={{ verticalAlign: 'top', padding: '12px', textAlign: 'center' }}>
                            {editingPolicy?._id === policy._id ? (
                              <>
                                <button className="btn-edit" onClick={saveEditPolicy}>
                                  💾 Save
                                </button>
                                <button
                                  className="btn-delete"
                                  onClick={() => {
                                    setEditingPolicy(null);
                                    setNewDescription('');
                                  }}
                                  style={{ marginLeft: '5px' }}
                                >
                                  ❌ Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button className="btn-edit" onClick={() => startEditPolicy(policy)}>
                                  ✏️ Edit
                                </button>
                                <button
                                  className={policy.alert === 1 ? 'btn-delete' : 'btn-edit'}
                                  onClick={() => toggleAlert(policy._id, policy.alert)}
                                  style={{ marginLeft: '5px' }}
                                >
                                  {policy.alert === 1 ? '🔕 Disable Alert' : '🔔 Enable Alert'}
                                </button>
                                <button
                                  className="btn-edit"
                                  onClick={() => handlePolicySelect(policy)}
                                  style={{ marginLeft: '5px' }}
                                >
                                  💬 Ask AI
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}        {/* Side Chat Panel */}
        {sidePanelOpen && selectedPolicy && (
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: '60px',
              width: '400px',
              height: 'calc(100vh - 60px)',
              backgroundColor: 'white',
              boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ padding: '1rem', borderBottom: '1px solid #ddd' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem' }}>AI Assistant for</div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#333' }}>{selectedPolicy.name}</h3>
                </div>
                <button
                  onClick={() => {
                    setSidePanelOpen(false);
                    setSelectedPolicy(null);
                    setChatMessages([]);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#666',
                    padding: '0',
                    marginLeft: '1rem'
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', backgroundColor: '#f9f9f9' }}>
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#888', marginTop: '2rem' }}>
                  <p>💬 Ask me anything about this policy!</p>
                  <p style={{ fontSize: '0.9em' }}>I can help you understand the policy details, changes, and implications.</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      marginBottom: '1rem',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      backgroundColor: msg.role === 'user' ? '#4a90e2' : 'white',
                      color: msg.role === 'user' ? 'white' : '#333',
                      marginLeft: msg.role === 'user' ? '2rem' : '0',
                      marginRight: msg.role === 'user' ? '0' : '2rem',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                  >
                    <div style={{ fontSize: '0.85em', marginBottom: '0.25rem', opacity: 0.8 }}>
                      {msg.role === 'user' ? '👤 You' : '🤖 AI Assistant'}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div style={{ textAlign: 'center', color: '#4a90e2', marginTop: '1rem' }}>
                  <span>AI is thinking...</span>
                </div>
              )}
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid #ddd', backgroundColor: 'white' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !chatLoading && sendChatMessage()}
                  placeholder="Ask about this policy..."
                  disabled={chatLoading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '0.95rem'
                  }}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!chatInput.trim() || chatLoading}
                  className="btn-edit"
                  style={{ padding: '0.75rem 1.5rem' }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Audit Logs Tab */}
        {activeTab === 'audit' && (
          <div>
            <h2>Policy Change Audit Logs</h2>
            {loading ? (
              <div className="loading">Loading audit logs...</div>
            ) : (
              <div className="users-table">
                <table>
                  <thead>
                    <tr>
                      <th>Policy Name</th>
                      <th>User Email</th>
                      <th>Timestamp</th>
                      <th>Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
                          No audit logs found
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log, index) => (
                        <tr key={index}>
                          <td><strong>{log.policyName}</strong></td>
                          <td>{log.userEmail}</td>
                          <td>{log.timestamp}</td>
                          <td>{log.date}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Scraper Tab */}
        {activeTab === 'scraper' && (
          <div>
            <h2>Compliance Scraper</h2>
            <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem' }}>
              <button
                className="btn-primary"
                onClick={runScraper}
                disabled={loading}
              >
                {loading ? 'Running Scraper...' : '🔍 Run Scraper'}
              </button>
              <button
                className="btn-edit"
                onClick={() => window.open('/scrape/ui/index.html', '_blank')}
                style={{ padding: '0.75rem 1.5rem' }}
              >
                📊 Open Scraper UI
              </button>
            </div>

            {scraperResults && (
              <div>
                <div className="dashboard-cards">
                  <div className="card">
                    <h3>Status</h3>
                    <p className="role-badge role-system_admin">{scraperResults.status}</p>
                  </div>
                  <div className="card">
                    <h3>Total Sources</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4f46e5' }}>
                      {scraperResults.summary?.totalSources}
                    </p>
                  </div>
                  <div className="card">
                    <h3>Updates Found</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a' }}>
                      {scraperResults.summary?.updatesFound}
                    </p>
                  </div>
                </div>

                <h3 style={{ marginTop: '2rem', marginBottom: '1rem' }}>Scraper Results</h3>
                <div className="users-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Updates</th>
                        <th>Last Checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scraperResults.results.map((result, index) => (
                        <tr key={index}>
                          <td><strong>{result.source}</strong></td>
                          <td>{result.updates}</td>
                          <td>{new Date(result.lastChecked).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ marginTop: '1rem', color: '#666', fontSize: '0.9rem' }}>
                  Last run: {new Date(scraperResults.timestamp).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Main App
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={['owner']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sysadmin"
          element={
            <ProtectedRoute allowedRoles={['system_admin']}>
              <SystemAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/compliance"
          element={
            <ProtectedRoute allowedRoles={['compliance_officer']}>
              <ComplianceOfficer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/riskmgr"
          element={
            <ProtectedRoute allowedRoles={['risk_manager']}>
              <RiskManager />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
