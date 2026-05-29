import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from '../../context/AuthContext';
import { Plus, Edit2, Trash2, Shield, User as UserIcon } from 'lucide-react';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const { authTokens } = useContext(AuthContext);

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

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">User & Staff Management</h1>
        <button className="btn btn-primary">
          <Plus size={18} />
          Add Staff Member
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
                    <button className="btn" style={{ padding: '0.25rem', color: 'var(--text-muted)', background: 'transparent' }}>
                      <Edit2 size={16} />
                    </button>
                    <button className="btn" style={{ padding: '0.25rem', color: '#EF4444', background: 'transparent' }}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
