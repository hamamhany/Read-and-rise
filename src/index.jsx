import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './effects.css';
import Root from './App.jsx';
import { initPerfMode } from './utils/perf';

// ⚡ يحدد الوضع (كامل / خفيف) حسب قوة الجهاز قبل أول رسم
initPerfMode();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);