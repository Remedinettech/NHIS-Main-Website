import { Link } from 'react-router-dom';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { Icon, type IconName } from '../../components/common/Icon';
import { PageHeader } from '../../components/common/PageHeader';
import { ErrorState, LoadingState } from '../../components/common/StateViews';
import { TableWrap } from '../../components/common/TableWrap';
import { StatCard } from '../../components/dashboard/StatCard';
import '../../components/dashboard/dashboard.css';
import { CATEGORY_LABELS } from '../../config/app';
import { useDashboardData } from '../../hooks/useContent';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { NAV_ITEMS } from '../../config/navigation';
import { formatNumber } from '../../utils/format';
import { documentsByCategory } from '../../utils/documentStats';

interface QuickLink { to: string; label: string; icon: IconName; galleryOnly?: boolean }

const QUICK_LINKS: readonly QuickLink[] = NAV_ITEMS.filter((item) => !['/dashboard', '/users', '/activity'].includes(item.to));

export default function DashboardPage() {
  useDocumentTitle('Overview');
  const { data, error, loading, reload } = useDashboardData();

  return (
    <div className="page">
      <PageHeader title="Overview" intro="An overview of the content managed for the scheme website." />
      {loading && <LoadingState label="Loading dashboard…" rows={3} />}
      {error && !data && <ErrorState error={error} onRetry={reload} />}
      {data && (() => {
        const { stats, documents, directories, site, gallery } = data;
        const categories = stats.documentsByCategory ?? documentsByCategory(documents.data);
        const unavailable = categories.reduce((sum, c) => sum + c.unavailable, 0);
        const directoryRows = stats.contactDirectories ?? directories.data.map((d) => ({ id: d.id, rows: d.total }));
        const labelFor = (id: string) => directories.data.find((d) => d.id === id)?.label.en ?? id;
        const announcements = stats.announcements ?? site.data.announcements.length;
        const galleryItems = stats.galleryItems ?? gallery.total;
        return (
          <>
            <section aria-labelledby="totals-h">
              <h2 id="totals-h" className="visually-hidden">Totals</h2>
              <ul className="stat-grid">
                <StatCard label="Hospitals" value={stats.hospitals} icon="hospital" to="/hospitals" />
                <StatCard label="Contact rows" value={stats.contacts} icon="phone" to="/contacts" hint={`${directoryRows.length} directories`} />
                <StatCard label="Documents" value={stats.documents} icon="file" to="/documents" hint={unavailable > 0 ? `${formatNumber(unavailable)} unavailable` : 'All available'} />
                <StatCard label="Announcements" value={announcements} icon="megaphone" to="/announcements" />
                {galleryItems > 0 && <StatCard label="Gallery items" value={galleryItems} icon="image" to="/gallery" />}
              </ul>
            </section>

            <div className="two-col">
              <Card title="Documents by category">
                <TableWrap label="Documents by category">
                  <table className="data-table">
                    <thead><tr><th scope="col">Category</th><th scope="col" className="num">Total</th><th scope="col" className="num">Unavailable</th></tr></thead>
                    <tbody>
                      {categories.map((c) => (
                        <tr key={c.category}>
                          <th scope="row"><Link to={`/documents?category=${c.category}`}>{CATEGORY_LABELS[c.category]}</Link></th>
                          <td className="num">{c.total}</td>
                          <td className="num">{c.unavailable > 0 ? <Badge tone="danger">{c.unavailable}</Badge> : '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </Card>
              <Card title="Contact directories">
                <TableWrap label="Contact directories">
                  <table className="data-table">
                    <thead><tr><th scope="col">Directory</th><th scope="col" className="num">Rows</th></tr></thead>
                    <tbody>
                      {directoryRows.map((d) => (
                        <tr key={d.id}>
                          <th scope="row"><Link to={`/contacts?directory=${d.id}`}>{labelFor(d.id)}</Link></th>
                          <td className="num">{formatNumber(d.rows)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              </Card>
            </div>

            <Card title="Go to">
              <ul className="quick-links">
                {QUICK_LINKS.filter((link) => !link.galleryOnly || galleryItems > 0).map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="quick-link">
                      <Icon name={link.icon} />
                      <span>{link.label}</span>
                      <Icon name="chevronRight" size={18} className="quick-link__arrow" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        );
      })()}
    </div>
  );
}
