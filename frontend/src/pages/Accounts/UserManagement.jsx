import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, Shield, User as UserIcon, X } from 'lucide-react';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const { authTokens } = useContext(AuthContext);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    id: null,
    username: '',
    email: '',
    password: '',
    role: 'regular',
    is_active: true
  });
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/accounts/users/', {
        headers: {
          'Authorization': `Bearer ${authTokens?.access}`
        }
      });
      setUsers(response.data);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const handleOpenModal = (user = null) => {
    if (user) {
      setIsEditing(true);
      setFormData({
        id: user.id,
        username: user.username,
        email: user.email || '',
        password: '',
        role: user.is_superuser ? 'superuser' : user.is_staff ? 'staff' : 'regular',
        is_active: user.is_active
      });
    } else {
      setIsEditing(false);
      setFormData({
        id: null,
        username: '',
        email: '',
        password: '',
        role: 'regular',
        is_active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormData({ id: null, username: '', email: '', password: '', role: 'regular', is_active: true });
    setIsEditing(false);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      username: formData.username,
      email: formData.email,
      is_staff: formData.role === 'staff' || formData.role === 'superuser',
      is_superuser: formData.role === 'superuser',
      is_active: formData.is_active
    };
    if (formData.password) {
      payload.password = formData.password;
    }

    try {
      if (isEditing) {
        await axios.patch(`http://localhost:8000/api/accounts/users/${formData.id}/`, payload, {
          headers: { 'Authorization': `Bearer ${authTokens?.access}` }
        });
      } else {
        await axios.post('http://localhost:8000/api/accounts/users/', payload, {
          headers: { 'Authorization': `Bearer ${authTokens?.access}` }
        });
      }
      fetchUsers();
      handleCloseModal();
    } catch (error) {
      console.error("Error saving user:", error);
      alert("Error saving user. Please check the console for details.");
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      try {
        await axios.delete(`http://localhost:8000/api/accounts/users/${id}/`, {
          headers: { 'Authorization': `Bearer ${authTokens?.access}` }
        });
        fetchUsers();
      } catch (error) {
        console.error("Error deleting user:", error);
      }
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">User & Staff Management</h1>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={18} />
          Add User
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td><strong>{user.username}</strong></td>
                  <td>{user.email || 'N/A'}</td>
                  <td>
                    {user.is_superuser ? (
                      <span style={{ color: '#8B5CF6', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Shield size={14} /> Superuser
                      </span>
                    ) : user.is_staff ? (
                      <span style={{ color: '#3B82F6', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <UserIcon size={14} /> Staff
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Regular User</span>
                    )}
                  </td>
                  <td>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </td>
                  <td>
                    <button className="btn" onClick={() => handleOpenModal(user)} style={{ padding: '0.25rem', color: 'var(--text-muted)', background: 'transparent' }}>
                      <Edit2 size={16} />
                    </button>
                    <button className="btn" onClick={() => handleDelete(user.id)} style={{ padding: '0.25rem', color: '#EF4444', background: 'transparent' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2>{isEditing ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={handleCloseModal} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={labelStyle}>Username</label>
                <input type="text" name="username" value={formData.username} onChange={handleChange} style={inputStyle} required />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>{isEditing ? 'Password (leave blank to keep current)' : 'Password'}</label>
                <input type="password" name="password" value={formData.password} onChange={handleChange} style={inputStyle} required={!isEditing} />
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <select name="role" value={formData.role} onChange={handleChange} style={inputStyle}>
                  <option value="regular">Regular User</option>
                  <option value="staff">Staff</option>
                  <option value="superuser">Superuser</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} id="isActive" />
                <label htmlFor="isActive" style={{ margin: 0 }}>Active Account</label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                <button type="button" onClick={handleCloseModal} className="btn">Cancel</button>
                <button type="submit" className="btn btn-primary">{isEditing ? 'Save Changes' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
  backdropFilter: 'blur(4px)'
};
const modalContentStyle = {
  backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius)', width: '100%', maxWidth: '500px',
  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)', color: 'var(--text-main)', border: '1px solid var(--border)'
};
const labelStyle = { display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: 'var(--text-muted)' };
const inputStyle = { width: '100%', padding: '0.75rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', backgroundColor: 'var(--bg-color)', color: 'var(--text-main)' };

export default UserManagement;
