import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, BookOpen, LayoutGrid, Award, CheckCircle2, RefreshCw } from 'lucide-react';
import { getDomains, getCourses, getMyLearning } from '../../apiClient';
import { CourseCard } from './CourseCatalog';
import './Learn.css';

function MetricCard({ icon: Icon, label, value, helper }) {
  return (
    <article className="learn-metric-card">
      <div className="learn-metric-topline">
        <span className="learn-metric-icon"><Icon size={21} strokeWidth={1.9} /></span>
        <span className="learn-metric-helper">{helper}</span>
      </div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}

export default function LearnDashboard() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [courses, setCourses] = useState([]);
  const [me, setMe] = useState({ courses: [], modules_done: 0, name: '' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [d, c, m] = await Promise.all([getDomains(), getCourses(), getMyLearning()]);
    setDomains(Array.isArray(d) ? d : []);
    setCourses(Array.isArray(c) ? c : []);
    setMe(m && !m.error ? m : { courses: [], modules_done: 0, name: '' });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (c) => navigate(`/learn/courses/${c.id}`);
  const dash = loading ? '--' : undefined;
  const completion = me.completion || 0;
  const suggested = courses.filter((c) => !me.courses.some((mc) => mc.id === c.id)).slice(0, 3);

  return (
    <div className="learn-page">
      <header className="learn-heading">
        <div>
          <span className="learn-eyebrow">Learn Portal overview</span>
          <h1>Dashboard</h1>
          <p>Cross-functional learning across the five domains. Pick up where you left off or browse the catalog.</p>
        </div>
        <div className="learn-heading-actions">
          <button type="button" className="learn-primary-button" onClick={load} disabled={loading}>
            <RefreshCw size={17} className={loading ? 'learn-spin' : ''} /> {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="learn-metric-grid" aria-label="Learning statistics">
        <MetricCard icon={CheckCircle2} label="Onboarding completion" value={dash ?? `${completion}%`} helper="Target 100%" />
        <MetricCard icon={BookOpen} label="Published courses" value={dash ?? courses.length} helper="Live" />
        <MetricCard icon={LayoutGrid} label="My enrollments" value={dash ?? me.courses.length} helper="Active" />
        <MetricCard icon={Award} label="Certificates earned" value={dash ?? (me.certificates_earned || 0)} helper={`of ${domains.length || 5}`} />
      </section>

      <div className="learn-panel">
        <div className="learn-panel-heading">
          <div><h2>Program progress</h2><p>Standardized one-month cross-functional onboarding</p></div>
          <button type="button" className="learn-text-button" onClick={() => navigate('/learn/program')}>View program <ArrowUpRight size={15} /></button>
        </div>
        <div className="learn-progress"><i style={{ width: `${completion}%` }} /></div>
        <div className="learn-progress-row" style={{ marginTop: 8, marginBottom: 0 }}><span>Overall completion</span><b>{completion}%</b></div>
      </div>

      <section className="learn-two-col">
        <div className="learn-panel">
          <div className="learn-panel-heading">
            <div>
              <h2>Continue learning</h2>
              <p>Courses you are enrolled in</p>
            </div>
            <button type="button" className="learn-text-button" onClick={() => navigate('/learn/courses')}>Browse all <ArrowUpRight size={15} /></button>
          </div>
          {me.courses.length ? (
            <div className="learn-grid">
              {me.courses.map((c) => <CourseCard key={c.id} c={c} onOpen={open} />)}
            </div>
          ) : (
            <div className="learn-state">
              <BookOpen size={34} />
              <strong>No enrollments yet</strong>
              <span>Browse the catalog and open a course to get started.</span>
            </div>
          )}
        </div>

        <aside className="learn-focus-card">
          <span className="learn-eyebrow">Course catalog</span>
          <h2>Learn across every domain.</h2>
          <p>Content, Media Marketing, Technology, Graphic Design, and Social Media. Build a shared foundation before you specialize.</p>
          <button type="button" onClick={() => navigate('/learn/courses')}>Browse courses <ArrowUpRight size={16} /></button>
        </aside>
      </section>

      {suggested.length > 0 && (
        <section>
          <div className="learn-panel-heading">
            <div><h2>Suggested for you</h2><p>Popular courses you are not enrolled in yet</p></div>
          </div>
          <div className="learn-grid">
            {suggested.map((c) => <CourseCard key={c.id} c={c} onOpen={open} />)}
          </div>
        </section>
      )}
    </div>
  );
}
