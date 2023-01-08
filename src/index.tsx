import * as React from 'react';
import App from './App';
import "./styles.scss";
import { createRoot } from 'react-dom/client';
const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
