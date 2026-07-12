import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Check, Play, Lock, ArrowRight, ArrowLeft, Clock, Star, FileText, HelpCircle } from 'lucide-react';
import { getCourse, getLessons, markLessonProgress, getQuiz, submitQuiz } from '../../apiClient';
import './Learn.css';

/*
 * Lessons come in three kinds and each is non-skippable in its own way:
 *   - video      : YouTube IFrame Player API. No seeking past unwatched footage,
 *                  "Mark complete" unlocks only at the end of the video.
 *   - quiz       : mandatory. Graded server-side; the module unlocks only on a
 *                  pass (>= pass mark). Correct answers never reach the browser.
 *   - assignment : practical task, marked complete when submitted/acknowledged.
 * Later lessons stay locked until the current one is complete, so the whole
 * course must be taken in order (the PDF's mandatory, milestone-based model).
 */
const WATCH_THRESHOLD = 0.97;

let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytReady;
}

export default function CoursePlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('overview');
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [watched, setWatched] = useState(false);
  const [pctWatched, setPctWatched] = useState(0);
  const [quiz, setQuiz] = useState(null);          // { pass_mark, questions }
  const [answers, setAnswers] = useState({});       // { questionId: choiceIndex }
  const [result, setResult] = useState(null);       // { score, passed, pass_mark }
  const [toast, setToast] = useState('');

  const mountRef = useRef(null);
  const playerRef = useRef(null);
  const pollRef = useRef(null);
  const maxWatchedRef = useRef(0);
  const freeSeekRef = useRef(false);

  const lesson = lessons[active];
  const isQuiz = lesson?.kind === 'quiz';
  const isVideo = !isQuiz && !!lesson?.video_id;
  const show = (m) => { setToast(m); window.setTimeout(() => setToast(''), 2600); };

  const frontier = useMemo(() => {
    const i = lessons.findIndex((l) => !l.completed);
    return i < 0 ? lessons.length - 1 : i;
  }, [lessons]);

  useEffect(() => {
    let alive = true;
    Promise.all([getCourse(id), getLessons(id)]).then(([c, ls]) => {
      if (!alive) return;
      setCourse(c && !c.error ? c : null);
      const arr = Array.isArray(ls) ? ls : [];
      setLessons(arr);
      const first = arr.findIndex((l) => !l.completed);
      setActive(first < 0 ? 0 : first);
    });
    return () => { alive = false; };
  }, [id]);

  // reset per-lesson state, load the right surface (video player or quiz)
  useEffect(() => {
    if (!lesson) return;
    const done = !!lesson.completed;
    setWatched(done); setPctWatched(done ? 100 : 0);
    setResult(null); setAnswers({}); setQuiz(null);
    freeSeekRef.current = done; maxWatchedRef.current = 0;

    if (lesson.kind === 'quiz') { getQuiz(lesson.id).then((q) => setQuiz(q || { questions: [] })); return; }
    if (!lesson.video_id || !mountRef.current) return;

    let killed = false;
    loadYT().then((YT) => {
      if (killed) return;
      if (playerRef.current) { try { playerRef.current.destroy(); } catch { /* noop */ } }
      playerRef.current = new YT.Player(mountRef.current, {
        videoId: lesson.video_id,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e) => {
            window.clearInterval(pollRef.current);
            if (e.data === YT.PlayerState.ENDED) { setWatched(true); setPctWatched(100); return; }
            if (e.data === YT.PlayerState.PLAYING) pollRef.current = window.setInterval(() => tick(e.target), 1000);
          },
        },
      });
    });
    return () => { killed = true; window.clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id]);

  const tick = (player) => {
    const t = player.getCurrentTime() || 0;
    const dur = lesson?.duration_seconds || player.getDuration() || 0;
    if (!freeSeekRef.current && t > maxWatchedRef.current + 2) { player.seekTo(maxWatchedRef.current, true); show('Please watch the video in order'); return; }
    maxWatchedRef.current = Math.max(maxWatchedRef.current, t);
    if (dur) { setPctWatched(Math.min(100, Math.round((maxWatchedRef.current / dur) * 100))); if (maxWatchedRef.current >= dur * WATCH_THRESHOLD) { setWatched(true); setPctWatched(100); } }
  };

  const submitTheQuiz = () => {
    if (quiz.questions.some((q) => answers[q.id] === undefined)) { show('Answer every question first'); return; }
    submitQuiz(lesson.id, answers).then((r) => {
      setResult(r);
      if (r.passed) { setLessons((ls) => ls.map((l, i) => (i === active ? { ...l, completed: true } : l))); show(`Passed with ${r.score}%`); }
      else show(`Scored ${r.score}%. ${r.pass_mark}% needed to pass`);
    });
  };

  const canContinue = lesson?.completed || (isQuiz ? result?.passed : isVideo ? watched : true);

  const completeAndAdvance = () => {
    if (!lesson || !canContinue) return;
    if (!isQuiz) markLessonProgress(lesson.id, Math.round(maxWatchedRef.current), true); // quiz already recorded server-side
    const wasLast = active >= lessons.length - 1;
    setLessons((ls) => ls.map((l, i) => (i === active ? { ...l, completed: true } : l)));
    if (!wasLast) { setActive(active + 1); setTab('overview'); show('Lesson completed'); }
    else show('Course complete');
  };

  const openLesson = (i) => {
    if (i > frontier) { show('Finish the current lesson to unlock this one'); return; }
    setActive(i); setTab('overview');
  };
  const addNote = () => { if (!noteText.trim()) return; setNotes((n) => [...n, { at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), tx: noteText.trim() }]); setNoteText(''); };

  const done = lessons.filter((l) => l.completed).length;
  const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
  const resources = useMemo(() => course?.resources || [], [course]);

  if (!course) return <div className="learn-page"><div className="learn-state"><Play size={34} /><strong>Loading course</strong></div></div>;

  return (
    <div className="learn-page">
      {toast && <div className="learn-toast">{toast}</div>}
      <button type="button" className="learn-text-button" onClick={() => navigate('/learn/courses')}><ArrowLeft size={15} /> Back to courses</button>

      <div className="learn-player-grid">
        <div>
          {/* ---- surface: quiz OR video OR assignment ---- */}
          {isQuiz ? (
            <div className="learn-panel learn-quiz">
              <div className="learn-quiz-head"><span className="learn-metric-icon"><HelpCircle size={20} /></span><div><h2>{lesson.title}</h2><p>Mandatory quiz. Score {quiz?.pass_mark || 80}% or higher to complete this module.</p></div></div>
              {!quiz ? <p style={{ color: 'var(--text-muted)' }}>Loading questions...</p>
                : !quiz.questions.length ? <p style={{ color: 'var(--text-muted)' }}>No questions have been added to this quiz yet.</p>
                : quiz.questions.map((q, qi) => (
                  <div className="learn-q" key={q.id}>
                    <h4>{qi + 1}. {q.prompt}</h4>
                    <div className="learn-choices">
                      {q.choices.map((ch, ci) => {
                        const chosen = answers[q.id] === ci;
                        const graded = result && lesson.completed;
                        return (
                          <button type="button" key={ci} disabled={!!result?.passed}
                            className={`learn-choice ${chosen ? 'is-chosen' : ''} ${graded && chosen ? 'is-graded' : ''}`}
                            onClick={() => setAnswers((a) => ({ ...a, [q.id]: ci }))}>
                            <span className="learn-choice-dot">{chosen ? <Check size={12} /> : String.fromCharCode(65 + ci)}</span>{ch}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              {quiz?.questions?.length ? (
                <div className="learn-quiz-foot">
                  {result && <span className={`learn-status ${result.passed ? 'is-done' : 'is-now'}`}>{result.passed ? `Passed ${result.score}%` : `Scored ${result.score}%, need ${result.pass_mark}%`}</span>}
                  {!result?.passed && <button type="button" className="learn-primary-button" onClick={submitTheQuiz}>{result ? 'Try again' : 'Submit quiz'}</button>}
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="learn-video">
                {isVideo ? <div ref={mountRef} /> : <div style={{ display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,.6)', textAlign: 'center', padding: 20 }}>{lesson?.kind === 'assignment' ? 'Practical assignment. Complete the task, then mark it done.' : 'No video for this lesson'}</div>}
                {isVideo && <span className="learn-yt-badge">Streaming via YouTube</span>}
              </div>
              {isVideo && !lesson?.completed && (
                <div className="learn-watchgate">
                  <div className="learn-progress" style={{ flex: 1 }}><i style={{ width: `${pctWatched}%` }} /></div>
                  <span className="learn-watchgate-label">{watched ? 'Watched, you can continue' : `Watch to unlock: ${pctWatched}%`}</span>
                </div>
              )}
            </>
          )}

          <div className="learn-lesson-head">
            <div style={{ flex: 1, minWidth: 240 }}>
              <span className="learn-badge">{(course.domain_name || 'Course').toUpperCase()}</span>
              <h1 style={{ marginTop: 8 }}>{lesson?.title || course.title}</h1>
              <div className="learn-lesson-meta">
                <span><Clock size={15} /> {lesson?.duration || (isQuiz ? `${quiz?.questions?.length || 0} questions` : '--')}</span>
                {course.rating ? <span><Star size={15} fill="currentColor" /> {course.rating}</span> : null}
                <span>{course.instructor}</span>
              </div>
            </div>
            <div className="learn-lesson-actions">
              <button type="button" className="learn-primary-button" disabled={!canContinue} onClick={completeAndAdvance} title={canContinue ? '' : 'Complete this lesson to continue'}>
                {canContinue ? null : <Lock size={15} />}
                Mark complete {active < lessons.length - 1 ? 'and next' : ''} <ArrowRight size={16} />
              </button>
            </div>
          </div>

          <div className="learn-tabs">
            <button type="button" className={`learn-tab ${tab === 'overview' ? 'is-active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
            <button type="button" className={`learn-tab ${tab === 'resources' ? 'is-active' : ''}`} onClick={() => setTab('resources')}>Resources</button>
            <button type="button" className={`learn-tab ${tab === 'notes' ? 'is-active' : ''}`} onClick={() => setTab('notes')}>Notes ({notes.length})</button>
          </div>
          {tab === 'overview' && <div className="learn-tabpane"><p>{lesson?.description || course.description || 'No description provided for this lesson yet.'}</p></div>}
          {tab === 'resources' && (
            <div className="learn-tabpane">
              {resources.length ? resources.map((r, i) => (
                <div className="learn-resource" key={i}><span className="learn-resource-ic"><FileText size={20} /></span><div><h4>{r.title}</h4><p>{r.meta}</p></div><a className="learn-ghost-button" href={r.url} target="_blank" rel="noreferrer">Open</a></div>
              )) : <p style={{ color: 'var(--text-muted)' }}>SOPs and reference material for this course live in TIES Docs.</p>}
            </div>
          )}
          {tab === 'notes' && (
            <div className="learn-tabpane">
              <div className="learn-note-add"><input value={noteText} onChange={(e) => setNoteText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="Write a note for this lesson" /><button type="button" className="learn-primary-button" onClick={addNote}>Add</button></div>
              {notes.map((n, i) => <div className="learn-note" key={i}><span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 52 }}>{n.at}</span><span style={{ fontSize: 14 }}>{n.tx}</span></div>)}
            </div>
          )}
        </div>

        <div className="learn-panel learn-playlist">
          <div className="learn-playlist-head">
            <div className="row"><h3>{course.title}</h3><span className="cnt">{done}/{lessons.length}</span></div>
            <div className="learn-progress" style={{ marginTop: 12 }}><i style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="learn-playlist-scroll">
            {lessons.map((l, i) => {
              const locked = i > frontier;
              return (
                <button type="button" key={l.id} className={`learn-lesson-item ${i === active ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`} onClick={() => openLesson(i)}>
                  <span className={`learn-stt ${l.completed ? 'is-done' : locked ? 'is-locked' : i === active ? 'is-cur' : 'is-todo'}`}>
                    {l.completed ? <Check size={12} /> : locked ? <Lock size={11} /> : l.kind === 'quiz' ? <HelpCircle size={12} /> : i === active ? <Play size={10} fill="#fff" /> : i + 1}
                  </span>
                  <span style={{ minWidth: 0 }}><h5>{l.title}</h5><span className="learn-lm">{l.kind === 'quiz' ? 'Quiz' : l.kind === 'assignment' ? 'Assignment' : 'Video'} · {l.duration || '--'}</span></span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
