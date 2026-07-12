import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Users, Clock, ClipboardCheck } from 'lucide-react';

/* inline empty circle (no lucide dependency) */
const EmptyDot = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flex: 'none', marginTop: 1, opacity: 0.4 }} aria-hidden="true"><circle cx="12" cy="12" r="9" /></svg>
);
import { getMyLearning } from '../../apiClient';
import './Learn.css';

/* The standardized one-month cross-functional program, straight from the
   Capstone Advisory PDF: four progressive weeks + the five learning pillars +
   the weekly time commitment. Overall completion is real (from /api/learn/me). */
const WEEKS = [
  { wk: 'Week 01', t: 'Orientation', items: ['Organization overview and mission', 'Culture and values immersion', 'Tools and systems training', 'Documentation review', 'Mentor introductions', 'Expectation setting'] },
  { wk: 'Week 02', t: 'Workshops', items: ['Cross-functional workshops', 'All five pillar introductions', 'Hands-on assignments', 'Mentor-led sessions', 'Peer learning groups', 'Skill assessments'] },
  { wk: 'Week 03', t: 'Collaboration', items: ['Cross-functional team project', 'Apply all five pillar skills', 'Peer feedback sessions', 'Iterative improvement', 'Progress evaluations', 'Mentor check-ins'] },
  { wk: 'Week 04', t: 'Capstone', items: ['Capstone project delivery', 'Final presentation', 'Comprehensive evaluation', 'Certification', 'Specialization assignment', 'Feedback collection'] },
];
const PILLARS = [
  { n: 'Content Strategy', d: 'Brand identity, storytelling, content and copywriting, editorial workflow, research.' },
  { n: 'Media Marketing', d: 'Digital marketing, growth strategies, campaign planning, analytics, SEO, engagement.' },
  { n: 'Technology', d: 'Product lifecycle, development workflow, version control, collaboration tools, docs.' },
  { n: 'Graphic Design', d: 'Design principles, branding, typography, colour theory, Canva and Figma.' },
  { n: 'Social Media', d: 'Scheduling, community management, content calendars, platform strategy, metrics.' },
];
const COMMITMENT = [
  { icon: Users, t: 'Mentors', v: '2-3 hrs / week', d: 'Structured mentoring, feedback, and progress check-ins.' },
  { icon: Clock, t: 'Learning', v: '8-10 hrs / week', d: 'Workshops, self-paced modules, and peer learning.' },
  { icon: ClipboardCheck, t: 'Assignments', v: '4-6 hrs / week', d: 'Hands-on projects applying learned skills to real scenarios.' },
];

export default function LearnProgram() {
  const navigate = useNavigate();
  const [me, setMe] = useState({ completion: 0 });
  useEffect(() => { getMyLearning().then((m) => m && !m.error && setMe(m)); }, []);
  const completion = me.completion || 0;

  return (
    <div className="learn-page">
      <header className="learn-heading">
        <div>
          <span className="learn-eyebrow">Standardized one-month onboarding</span>
          <h1>Program</h1>
          <p>A cross-functional program where every member builds a foundation across all five domains before specializing.</p>
        </div>
        <div className="learn-heading-actions">
          <button type="button" className="learn-primary-button" onClick={() => navigate('/learn/courses')}>Go to courses</button>
        </div>
      </header>

      <div className="learn-panel">
        <div className="learn-panel-heading">
          <div><h2>Onboarding completion</h2><p>Target is 100% across all published modules</p></div>
          <strong style={{ fontFamily: "'Hanken Grotesk', sans-serif", fontSize: 28, color: 'var(--primary)' }}>{completion}%</strong>
        </div>
        <div className="learn-progress"><i style={{ width: `${completion}%` }} /></div>
      </div>

      <section>
        <div className="learn-panel-heading"><div><h2>Four-week progressive structure</h2><p>From orientation to independent contribution</p></div></div>
        <div className="learn-weeks">
          {WEEKS.map((w, i) => {
            const state = completion >= (i + 1) * 25 ? 'is-done' : completion >= i * 25 ? 'is-now' : '';
            return (
              <div className={`learn-week ${state}`} key={w.wk}>
                <div className="learn-wk">{w.wk}</div>
                <h3>{w.t}</h3>
                <ul style={{ listStyle: 'none', display: 'grid', gap: 6, margin: 0 }}>
                  {w.items.map((it) => (
                    <li key={it} style={{ display: 'flex', gap: 7, fontSize: 12, color: 'var(--text-muted)' }}>
                      {state === 'is-done' ? <CheckCircle2 size={14} style={{ color: 'var(--tertiary)', flex: 'none', marginTop: 1 }} /> : <EmptyDot />}
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="learn-panel-heading"><div><h2>Five integrated learning pillars</h2><p>Each with defined topics and practical assignments</p></div></div>
        <div className="learn-grid">
          {PILLARS.map((p, i) => (
            <div className="learn-panel" key={p.n} style={{ padding: 20 }}>
              <div className="learn-eyebrow">{String(i + 1).padStart(2, '0')}</div>
              <h3 style={{ fontFamily: "'Hanken Grotesk', 'Inter', sans-serif", fontSize: 16, margin: '4px 0 6px' }}>{p.n}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.5 }}>{p.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="learn-panel-heading"><div><h2>Weekly time commitment</h2><p>Designed to fit within existing capacity</p></div></div>
        <div className="learn-metric-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          {COMMITMENT.map((c) => (
            <article className="learn-metric-card" key={c.t}>
              <div className="learn-metric-topline"><span className="learn-metric-icon"><c.icon size={21} strokeWidth={1.9} /></span></div>
              <p>{c.t}</p>
              <strong style={{ fontSize: 24 }}>{c.v}</strong>
              <p style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{c.d}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
