// SPDX-License-Identifier: GPL-3.0-only
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';

createRoot(document.getElementById('root')!).render(<App />);
