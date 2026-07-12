import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, Lock, Download } from 'lucide-react';
import { getMyLearning } from '../../apiClient';
import './Learn.css';

/* inline LinkedIn glyph (avoids depending on a lucide icon name) */
const LinkedInIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M4.98 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C21.4 8.65 22 11 22 14.1V21h-4v-6.1c0-1.45-.03-3.32-2.02-3.32-2.02 0-2.33 1.58-2.33 3.21V21h-4z" />
  </svg>
);

/* LinkedIn "Add to Profile" deep link. Prefills the certification on the member's
   LinkedIn profile; certUrl points back at the verifiable certificate. */
function linkedInUrl(name) {
  const p = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: `${name} Certificate`,
    organizationName: 'TIESVERSE',
    certUrl: `${window.location.origin}/learn/certificates`,
  });
  return `https://www.linkedin.com/profile/add?${p.toString()}`;
}

/*
 * Learner-facing achievement view: a certificate is earned once every published
 * course in a domain is completed (the PDF's certification milestone). This is
 * separate from the admin Certificate Generator portal; issuing an actual PDF can
 * later hand off to that generator. Earned/locked state comes from /api/learn/me.
 */
export default function LearnCertificates() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [earned, setEarned] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyLearning().then((m) => {
      if (m && !m.error) { setDomains(m.domains || []); setEarned(m.certificates_earned || 0); }
    }).finally(() => setLoading(false));
  }, []);

  return (
    <div className="learn-page">
      <header className="learn-heading">
        <div>
          <span className="learn-eyebrow">Achievements</span>
          <h1>Certificates</h1>
          <p>Earn a domain certificate by completing every course in that pillar. Finish all five to complete onboarding.</p>
        </div>
        <div className="learn-heading-actions">
          <span className="learn-badge" style={{ padding: '8px 14px' }}>{earned} of {domains.length || 5} earned</span>
        </div>
      </header>

      {loading ? (
        <div className="learn-state"><Award size={36} /><strong>Loading certificates</strong></div>
      ) : (
        <div className="learn-grid">
          {domains.map((d) => {
            const pct = d.courses_total ? Math.round((d.courses_done / d.courses_total) * 100) : 0;
            return (
              <div className="learn-panel" key={d.slug} style={{ padding: 22 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span className="learn-metric-icon" style={{ background: d.earned ? 'color-mix(in srgb, var(--tertiary) 16%, transparent)' : 'var(--secondary-container)', color: d.earned ? 'var(--tertiary)' : 'var(--on-secondary-container)' }}>
                    {d.earned ? <Award size={21} /> : <Lock size={19} />}
                  </span>
                  <span className={`learn-status ${d.earned ? 'is-done' : 'is-locked'}`}>{d.earned ? 'Earned' : 'Locked'}</span>
                </div>
                <h3 style={{ fontFamily: "'Hanken Grotesk', 'Inter', sans-serif", fontSize: 17, marginBottom: 4 }}>{d.name} Certificate</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 14 }}>
                  {d.earned ? 'All courses complete. Certificate available.' : `Complete all ${d.courses_total || 0} courses to unlock.`}
                </p>
                <div className="learn-progress-row"><span>{d.courses_done}/{d.courses_total} courses</span><b>{pct}%</b></div>
                <div className="learn-progress"><i style={{ width: `${pct}%` }} /></div>
                {d.earned ? (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button type="button" className="learn-primary-button" style={{ flex: 1 }} onClick={() => navigate('/certificates/generated')}>
                      <Download size={16} /> Download
                    </button>
                    <a className="learn-ghost-button" style={{ justifyContent: 'center' }} href={linkedInUrl(d.name)} target="_blank" rel="noreferrer" title="Add to your LinkedIn profile">
                      <LinkedInIcon /> Add to LinkedIn
                    </a>
                  </div>
                ) : (
                  <button type="button" className="learn-ghost-button" style={{ marginTop: 16, width: '100%', justifyContent: 'center' }} onClick={() => navigate('/learn/courses')}>
                    Continue this pillar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
