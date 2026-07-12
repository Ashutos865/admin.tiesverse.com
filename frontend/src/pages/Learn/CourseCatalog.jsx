import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Star, BookOpen } from 'lucide-react';
import { getDomains, getCourses } from '../../apiClient';
import './Learn.css';

/* Shared course card. Mirrors the admin .event-card structure so it matches
   the rest of the panel. Also imported by LearnDashboard. */
export function CourseCard({ c, onOpen }) {
  return (
    <button type="button" className="learn-course-card" onClick={() => onOpen(c)}>
      <div className="learn-course-cover">
        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" />}
        <span className="learn-play"><Play size={18} fill="currentColor" /></span>
        {c.domain_name && <span className="learn-cover-badge">{c.domain_name}</span>}
        {c.duration && <span className="learn-cover-dur">{c.duration}</span>}
      </div>
      <div className="learn-course-body">
        <h2>{c.title}</h2>
        <div className="learn-course-inst">{c.instructor || 'TIES Mentor'}</div>
        {c.progress > 0 ? (
          <div style={{ marginTop: 'auto' }}>
            <div className="learn-progress-row"><span>In progress</span><b>{c.progress}%</b></div>
            <div className="learn-progress"><i style={{ width: `${c.progress}%` }} /></div>
          </div>
        ) : (
          <div className="learn-course-footer">
            {c.rating ? <span className="learn-course-rating"><Star size={13} fill="currentColor" /> {c.rating}</span> : <span className="learn-course-rating">New</span>}
            <span className="learn-course-lessons">{c.lesson_count || 0} lessons</span>
          </div>
        )}
      </div>
    </button>
  );
}

export default function CourseCatalog() {
  const navigate = useNavigate();
  const [domains, setDomains] = useState([]);
  const [courses, setCourses] = useState([]);
  const [dom, setDom] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDomains().then((d) => setDomains(Array.isArray(d) ? d : []));
    getCourses().then((c) => setCourses(Array.isArray(c) ? c : [])).finally(() => setLoading(false));
  }, []);

  const open = (c) => navigate(`/learn/courses/${c.id}`);
  const list = courses.filter((c) => dom === 'all' || c.domain === dom);

  return (
    <div className="learn-page">
      <header className="learn-heading">
        <div>
          <span className="learn-eyebrow">The five pillars</span>
          <h1>Course Catalog</h1>
          <p>Every member builds a shared foundation across all five domains before specializing.</p>
        </div>
      </header>

      <div className="learn-domains">
        <button type="button" className={`learn-domain-chip ${dom === 'all' ? 'is-active' : ''}`} onClick={() => setDom('all')}>All courses</button>
        {domains.map((d) => (
          <button type="button" key={d.id} className={`learn-domain-chip ${dom === d.id ? 'is-active' : ''}`} onClick={() => setDom(d.id)}>{d.name}</button>
        ))}
      </div>

      {loading ? (
        <div className="learn-state"><BookOpen size={36} /><strong>Loading courses</strong></div>
      ) : list.length ? (
        <div className="learn-grid">
          {list.map((c) => <CourseCard key={c.id} c={c} onOpen={open} />)}
        </div>
      ) : (
        <div className="learn-state">
          <BookOpen size={36} />
          <strong>No courses in this domain yet</strong>
          <span>Check back soon or pick another domain.</span>
        </div>
      )}
    </div>
  );
}
