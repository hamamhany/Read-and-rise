import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import ExamManagerModal from '../components/panels/ExamManagerModal';
import ExamTakingModal from '../components/panels/ExamTakingModal';
import ExamResultsModal from '../components/panels/ExamResultsModal';
import ExamAnswersDetailModal from '../components/panels/ExamAnswersDetailModal';

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-950 text-gray-400">
    <div className="text-lg">جاري التحميل...</div>
  </div>
);

const NotFound = ({ onBack }) => (
  <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-400 gap-4">
    <div className="text-lg">لم يتم العثور على البيانات</div>
    <button onClick={onBack} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg">
      رجوع
    </button>
  </div>
);

export const ExamCreatePage = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [classes, setClasses] = useState(null);

  useEffect(() => {
    getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.id)))
      .then(snap => setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setClasses([]));
  }, [user.id]);

  const handleBack = () => navigate(location.state?.back || '/');

  if (classes === null) return <Loading />;

  return (
    <ExamManagerModal
      isOpen={true}
      onClose={handleBack}
      classes={classes}
      teacherId={user.id}
      exam={null}
    />
  );
};

export const ExamEditPage = ({ user }) => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [exam, setExam] = useState(null);
  const [classes, setClasses] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const examSnap = await getDoc(doc(db, 'exams', examId));
        if (!examSnap.exists()) { setNotFound(true); return; }
        setExam({ id: examSnap.id, ...examSnap.data() });
        const classesSnap = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.id)));
        setClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch { setNotFound(true); }
    };
    fetchData();
  }, [examId, user.id]);

  const handleBack = () => navigate(location.state?.back || '/');

  if (notFound) return <NotFound onBack={handleBack} />;
  if (!exam || classes === null) return <Loading />;

  return (
    <ExamManagerModal
      isOpen={true}
      onClose={handleBack}
      classes={classes}
      teacherId={user.id}
      exam={exam}
    />
  );
};

export const ExamTakePage = ({ user }) => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [exam, setExam] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const snap = await getDoc(doc(db, 'exams', examId));
        if (!snap.exists()) { setNotFound(true); return; }
        setExam({ id: snap.id, ...snap.data() });
      } catch { setNotFound(true); }
    };
    fetchExam();
  }, [examId]);

  const handleBack = () => navigate(location.state?.back || '/');

  if (notFound) return <NotFound onBack={handleBack} />;
  if (!exam) return <Loading />;
  if (exam.status !== 'published') return <NotFound onBack={handleBack} />;

  return (
    <ExamTakingModal
      exam={exam}
      student={user}
      onClose={handleBack}
    />
  );
};

export const ExamResultsPage = ({ user }) => {
  const { examId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [exam, setExam] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchExam = async () => {
      try {
        const snap = await getDoc(doc(db, 'exams', examId));
        if (!snap.exists()) { setNotFound(true); return; }
        setExam({ id: snap.id, ...snap.data() });
      } catch { setNotFound(true); }
    };
    fetchExam();
  }, [examId]);

  const handleBack = () => navigate(location.state?.back || '/');

  if (notFound) return <NotFound onBack={handleBack} />;
  if (!exam) return <Loading />;

  return (
    <ExamResultsModal
      isOpen={true}
      exam={exam}
      onClose={handleBack}
      onEdit={(e) => navigate(`/exams/${e.id}/edit`, { state: { back: `/exams/${e.id}/results` } })}
      onDelete={() => navigate('/')}
    />
  );
};

export const ExamAnswersPage = ({ user }) => {
  const { examId, resultId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [exam, setExam] = useState(null);
  const [result, setResult] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [examSnap, resultSnap] = await Promise.all([
          getDoc(doc(db, 'exams', examId)),
          getDoc(doc(db, 'examResults', resultId))
        ]);
        if (!examSnap.exists() || !resultSnap.exists()) { setNotFound(true); return; }
        setExam({ id: examSnap.id, ...examSnap.data() });
        setResult({ id: resultSnap.id, ...resultSnap.data() });
      } catch { setNotFound(true); }
    };
    fetchData();
  }, [examId, resultId]);

  const handleBack = () => navigate(location.state?.back || '/');

  if (notFound) return <NotFound onBack={handleBack} />;
  if (!exam || !result) return <Loading />;

  if (user.role === 'student' && result.studentId !== user.id) {
    return <Navigate to="/" replace />;
  }

  return (
    <ExamAnswersDetailModal
      isOpen={true}
      onClose={handleBack}
      result={result}
      exam={exam}
      viewerMode={user.role === 'student' ? 'student' : 'teacher'}
    />
  );
};