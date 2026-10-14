import { LinkButton } from '../components/common/Button';
import { PageHeader } from '../components/common/PageHeader';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function NotFoundPage({ what = 'page' }: { what?: string }) {
  useDocumentTitle('Not found');
  return (
    <div className="page">
      <PageHeader title={`This ${what} was not found`} intro="The address does not match anything in the administration workspace." />
      <LinkButton to="/dashboard">Back to the dashboard</LinkButton>
    </div>
  );
}
