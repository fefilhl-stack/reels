// Entry for the desktop build: the same page, rendered in the browser
// without the Next.js runtime, so it can be opened straight from disk.
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import './fonts.css';
import Page from '../app/page';

createRoot(document.getElementById('root')!).render(<Page />);
