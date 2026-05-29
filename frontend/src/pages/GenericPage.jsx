import React from 'react';

const GenericPage = ({ title }) => (
  <div>
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
    </div>
    <div className="card">
      <p style={{ color: 'var(--text-muted)' }}>Management interface for {title} will be implemented here.</p>
    </div>
  </div>
);

export default GenericPage;
