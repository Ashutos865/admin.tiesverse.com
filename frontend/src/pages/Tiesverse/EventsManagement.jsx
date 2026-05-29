import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';

const API_URL = 'http://localhost:8000/api/tiesverse/events/';

const EventsManagement = () => {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await axios.get(API_URL);
      setEvents(response.data);
    } catch (error) {
      console.error("Error fetching events:", error);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Events Management</h1>
        <button className="btn btn-primary">
          <Plus size={18} />
          Create Event
        </button>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Date</th>
                <th>Location</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                    No events found.
                  </td>
                </tr>
              ) : (
                events.map(event => (
                  <tr key={event.id}>
                    <td><strong>{event.title}</strong></td>
                    <td>{new Date(event.date).toLocaleDateString()}</td>
                    <td>{event.location}</td>
                    <td>
                      {event.is_active ? (
                        <span style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={14} /> Active
                        </span>
                      ) : (
                        <span style={{ color: '#EF4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={14} /> Inactive
                        </span>
                      )}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default EventsManagement;
