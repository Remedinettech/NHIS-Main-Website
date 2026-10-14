import { LinkButton } from '../components/common/Button';
import { PageHeader } from '../components/common/PageHeader';
import { ROUTES } from '../config/routes';
import { useLanguage } from '../context/LanguageContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFoundPage() {
  const { t } = useLanguage();
  useDocumentTitle(t('common.notFoundTitle'));
  return (
    <div className="page container">
      <PageHeader title={t('common.notFoundTitle')} intro={t('common.notFoundBody')} />
      <LinkButton to={ROUTES.home}>{t('common.goHome')}</LinkButton>
    </div>
  );
}
