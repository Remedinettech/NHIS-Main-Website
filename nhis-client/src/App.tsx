import AppRoutes from './routes';
import { LanguageProvider } from './context/LanguageContext';
import { SiteContentProvider } from './context/SiteContentContext';

export default function App() {
  // The site content sits outside the language provider: t() looks up the administrator's text overrides in it.
  return (
    <SiteContentProvider>
      <LanguageProvider>
        <AppRoutes />
      </LanguageProvider>
    </SiteContentProvider>
  );
}
