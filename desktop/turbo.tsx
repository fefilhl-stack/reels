// Entry for the desktop build of the ТУРБО page (see desktop/main.tsx).
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import './fonts.css';
import './fonts-turbo.css';
import Page from '../app/(turbo)/turbo/page';

createRoot(document.getElementById('root')!).render(<Page />);
